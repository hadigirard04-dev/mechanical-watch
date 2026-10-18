// 外观件几何：表壳、表圈、表镜、盘面、指针、底盖、表冠、表耳、表带
// 全部为程序化几何（无外部模型），每件独立成对象以便爆炸视图单独控制。

import * as THREE from 'three';
import { extrudeShape, circleShape, circleShapeAt } from './gears.js';
import { CASE, Z } from './dimensions.js';

const TAU = Math.PI * 2;
const V2 = (x, y) => new THREE.Vector2(x, y);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** 轴置换矩阵：局部 (x,y,z) → 世界 (z,x,y)，用于把平面轮廓“竖起来” */
const permute = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);

function lathe(profile, segments = 192) {
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => V2(r, z)), segments);
  g.rotateX(Math.PI / 2); // 统一把旋转轴从 Y 转到 Z
  return g;
}

/** 沿 3D 路径扫掠一个截面（用于表带），同时生成 UV（u 沿路径、v 沿截面周长，单位 mm） */
function sweep(points, section, { scales = null, uvScale = 44 } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const n = points.length;
  const m = section.length;
  const rings = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const t = V3(
      (points[Math.min(n - 1, i + 1)].x - points[Math.max(0, i - 1)].x) || 0,
      (points[Math.min(n - 1, i + 1)].y - points[Math.max(0, i - 1)].y) || 0,
      (points[Math.min(n - 1, i + 1)].z - points[Math.max(0, i - 1)].z) || 0
    ).normalize();
    const xAxis = V3(1, 0, 0);
    const nrm = new THREE.Vector3().crossVectors(xAxis, t).normalize();
    const s = scales ? scales[i] : 1;
    rings.push(section.map(([sx, sy]) => p.clone().addScaledVector(xAxis, sx * s).addScaledVector(nrm, sy * s)));
  }
  // 路径累积长度与截面周长（用于 UV）
  const pathU = [0];
  for (let i = 1; i < n; i++) pathU.push(pathU[i - 1] + points[i].distanceTo(points[i - 1]) / uvScale);
  const secV = [0];
  for (let j = 1; j <= m; j++) {
    const a = section[(j - 1) % m];
    const b = section[j % m];
    secV.push(secV[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]) / uvScale);
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const v = rings[i][j];
      positions.push(v.x, v.y, v.z);
      uvs.push(pathU[i], secV[j]);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      const a = i * m + j;
      const b = i * m + j2;
      const c = (i + 1) * m + j2;
      const d = (i + 1) * m + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  // 两端封盖
  const capStart = positions.length / 3;
  for (let j = 0; j < m; j++) {
    const v = rings[0][j];
    positions.push(v.x, v.y, v.z);
    uvs.push(0, secV[j]);
  }
  const capEnd = positions.length / 3;
  for (let j = 0; j < m; j++) {
    const v = rings[n - 1][j];
    positions.push(v.x, v.y, v.z);
    uvs.push(pathU[n - 1], secV[j]);
  }
  for (let j = 1; j < m - 1; j++) {
    indices.push(capStart, capStart + j + 1, capStart + j);
    indices.push(capEnd, capEnd + j, capEnd + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function roundedRectSection(w, t, r = 0.5, seg = 3) {
  const pts = [];
  const corners = [
    [w / 2 - r, t / 2 - r, 0],
    [-(w / 2 - r), t / 2 - r, Math.PI / 2],
    [-(w / 2 - r), -(t / 2 - r), Math.PI],
    [w / 2 - r, -(t / 2 - r), Math.PI * 1.5],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

export function buildCase(M) {
  const refs = {};
  const group = new THREE.Group();
  group.name = 'case';

  // 表壳中框：闭合剖面旋转体（外壁抛光 + 中段拉丝带）
  const profile = [
    [15.20, -9.50],
    [16.90, -9.50],
    [19.20, -9.78],
    [19.90, -9.40],
    [20.00, -8.00],
    [20.00, -4.00],
    [19.95, -2.60],
    [19.50, -1.98],
    [18.60, -1.86],
    [16.35, -1.86],
    [16.30, -2.10],
    [16.30, -3.28],
    [15.35, -3.46],
    [15.20, -3.60],
    [15.20, -9.50],
  ];
  const band = new THREE.Mesh(lathe(profile, 256), M.steel);
  band.material.side = THREE.DoubleSide;
  group.add(band);
  refs.caseband = band;

  const brush = new THREE.Mesh(
    lathe(
      [
        [20.012, -7.60],
        [20.012, -4.40],
      ],
      256
    ),
    M.steelBrushed
  );
  brush.material.side = THREE.DoubleSide;
  group.add(brush);
  refs.casebandBrush = brush;

  // 表圈
  const bezel = new THREE.Mesh(
    lathe(
      [
        [16.22, -1.62],
        [19.42, -1.62],
        [19.98, -1.30],
        [19.98, -0.72],
        [19.30, -0.46],
        [16.34, -0.52],
        [16.22, -0.62],
        [16.22, -1.62],
      ],
      256
    ),
    M.steel
  );
  bezel.material.side = THREE.DoubleSide;
  group.add(bezel);
  refs.bezel = bezel;

  // 蓝宝石表镜（微凸）
  const crystal = new THREE.Mesh(
    lathe(
      [
        [16.20, Z.crystal[0]],
        [16.20, -1.14],
        [15.86, -0.74],
        [13.60, -0.64],
        [6.80, -0.60],
        [0.00, -0.585],
      ],
      128
    ),
    M.sapphire
  );
  group.add(crystal);
  refs.crystal = crystal;

  // 表冠（滚花）+ 柄轴 + 表冠管
  const crown = new THREE.Group();
  crown.position.set(20.2, 0, CASE.crownZ);
  const crownBody = new THREE.Mesh(
    lathe(
      [
        [1.05, 0],
        [2.35, 0.24],
        [2.35, 1.9],
        [2.05, 2.3],
        [1.0, 2.4],
      ],
      64
    ),
    M.steel
  );
  crownBody.rotation.y = Math.PI / 2; // 让旋转轴朝 +X
  const knurl = new THREE.Mesh(new THREE.CylinderGeometry(2.42, 2.42, 1.5, 22, 1), M.steelSatin);
  knurl.rotation.z = Math.PI / 2;
  knurl.position.x = 0.95;
  const tube = new THREE.Mesh(
    lathe(
      [
        [1.35, 0],
        [1.35, 1.3],
        [1.62, 1.45],
        [1.62, 0],
      ],
      40
    ),
    M.steel
  );
  tube.rotation.y = -Math.PI / 2; // 伸进表壳
  tube.position.x = 0.05;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 4.0, 16, 1), M.steelSatin);
  stem.rotation.z = Math.PI / 2;
  stem.position.x = -1.7;
  crown.add(crownBody, knurl, tube, stem);
  group.add(crown);
  refs.crown = crown;

  // 表耳（4 只，含抛光倒角）
  const lugs = new THREE.Group();
  const lugShape = new THREE.Shape([
    V2(18.20, -3.10),
    V2(20.60, -3.35),
    V2(22.85, -4.05),
    V2(23.70, -5.30),
    V2(23.10, -6.45),
    V2(21.20, -7.25),
    V2(18.20, -7.60),
  ]);
  const lugGeoUp = extrudeShape(lugShape, { depth: 4.2, bevel: 0.34, bevelSegments: 2, curveSegments: 24 });
  lugGeoUp.applyMatrix4(permute); // 局部 x → 世界 Y，局部 y → 世界 Z，挤压方向 → 世界 X
  const lugGeoDown = lugGeoUp.clone();
  lugGeoDown.rotateZ(Math.PI); // 6 点方向（镜像到 −Y）
  for (const geo of [lugGeoUp, lugGeoDown]) {
    for (const sx of [1, -1]) {
      const lug = new THREE.Mesh(geo, [M.steelSatin, M.steelLug ?? M.steelBrushed]);
      lug.position.x = sx * 7.75;
      lugs.add(lug);
    }
  }
  group.add(lugs);
  refs.lugs = lugs;

  // 防水圈
  const gasket = new THREE.Mesh(lathe([[15.85, -9.46], [16.22, -9.46], [16.22, -9.20], [15.85, -9.20], [15.85, -9.46]], 128), M.gasket);
  gasket.material.side = THREE.DoubleSide;
  group.add(gasket);
  refs.gasket = gasket;

  return { group, refs };
}

export function buildDial(M, textures) {
  const refs = {};
  const group = new THREE.Group();
  group.name = 'dial';

  // 盘面浮现：沿 12 点起顺时针的角度扫掠（顶点着色器带出物体空间坐标）
  const revealUniform = { value: 0 };
  M.dialFace.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = revealUniform;
    shader.vertexShader = `varying vec3 vObjPos;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vObjPos = position;'
    );
    shader.fragmentShader = `uniform float uReveal;\nvarying vec3 vObjPos;\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float dAng = atan( vObjPos.x, -vObjPos.z );
       float dA = mod( dAng / 6.2831853 + 1.0, 1.0 );
       float edge = uReveal * 1.18 - 0.18;
       float mask = smoothstep( edge - 0.06, edge + 0.02, dA );
       mask = mix( 1.0, mask, step( 0.001, uReveal ) );
       float rim = exp( -pow( ( dA - edge ) / 0.035, 2.0 ) ) * ( 1.0 - step( 1.0, uReveal ) );
       diffuseColor.rgb *= mask;
       diffuseColor.rgb += vec3( 1.0, 0.86, 0.6 ) * rim * 0.5;`
    );
  };
  refs.dialReveal = revealUniform;

  const dial = new THREE.Mesh(
    new THREE.CylinderGeometry(CASE.dialR, CASE.dialR, Z.dial[1] - Z.dial[0], 160, 1),
    [M.dialBack, M.dialFace, M.dialBack]
  );
  dial.position.z = (Z.dial[0] + Z.dial[1]) / 2;
  dial.rotation.x = Math.PI / 2; // 圆柱轴转到 Z，端面朝向表镜
  textures.dial.flipY = false; // 使画布上方对应 12 点
  textures.dial.needsUpdate = true;
  group.add(dial);
  refs.dial = dial;

  // 12 枚立体时标（InstancedMesh，可做逐枚浮现）
  const idxShape = new THREE.Shape([
    V2(-1.55, -0.25),
    V2(1.66, -0.32),
    V2(1.92, 0.0),
    V2(1.66, 0.32),
    V2(-1.55, 0.25),
  ]);
  const idxGeo = extrudeShape(idxShape, { depth: 0.38, bevel: 0.06, bevelSegments: 2, curveSegments: 16 });
  const indices = new THREE.InstancedMesh(idxGeo, M.gold, 12);
  indices.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(indices);
  refs.indices = indices;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  refs.updateIndices = (reveal) => {
    for (let h = 0; h < 12; h++) {
      // 12 点优先浮现，随后顺时针依次出现
      const order = h === 0 ? 0 : 12 - h;
      const local = THREE.MathUtils.clamp((reveal - order * 0.045) / 0.5, 0, 1);
      const s = local * local * (3 - 2 * local);
      const angle = Math.PI / 2 - (h / 12) * TAU;
      pos.set(Math.cos(angle) * 12.42, Math.sin(angle) * 12.42, Z.dial[1] + 0.19 + (1 - s) * -0.42);
      q.setFromAxisAngle(V3(0, 0, 1), angle);
      scl.set(s * (h === 0 ? 1.42 : 1), 0.25 + 0.75 * s, s);
      m4.compose(pos, q, scl);
      indices.setMatrixAt(h, m4);
    }
    indices.instanceMatrix.needsUpdate = true;
  };
  refs.updateIndices(0);

  return { group, refs };
}

export function buildHands(M) {
  const refs = {};
  const group = new THREE.Group();
  group.name = 'hands';
  const mk = (pts, mat, depth) => new THREE.Mesh(extrudeShape(new THREE.Shape(pts.map(([x, y]) => V2(x, y))), { depth, bevel: 0.03, bevelSegments: 1, curveSegments: 12 }), mat);

  const hour = mk(
    [
      [-2.10, -0.50],
      [-0.30, -0.66],
      [6.40, -0.36],
      [9.40, 0.0],
      [6.40, 0.36],
      [-0.30, 0.66],
      [-2.10, 0.50],
    ],
    M.gold,
    0.17
  );
  hour.position.z = Z.handHour;
  const minute = mk(
    [
      [-1.60, -0.44],
      [0.10, -0.54],
      [8.60, -0.26],
      [12.60, 0.0],
      [8.60, 0.26],
      [0.10, 0.54],
      [-1.60, 0.44],
    ],
    M.gold,
    0.17
  );
  minute.position.z = Z.handMinute;
  const second = mk(
    [
      [-3.10, -0.26],
      [-2.30, -0.32],
      [0.20, -0.12],
      [13.10, -0.055],
      [13.90, 0.0],
      [13.10, 0.055],
      [0.20, 0.12],
      [-2.30, 0.32],
      [-3.10, 0.26],
    ],
    M.bluedSteel,
    0.13
  );
  second.position.z = Z.handSecond;
  const cap = new THREE.Mesh(lathe([[0.0, 0], [0.86, 0.06], [0.78, 0.34], [0.0, 0.42]], 40), M.gold);
  cap.position.z = Z.handSecond - 0.06;

  group.add(hour, minute, second, cap);
  refs.hour = hour;
  refs.minute = minute;
  refs.second = second;
  refs.cap = cap;
  // 指针基准朝向：+X 形状 → 12 点方向
  refs.setReveal = (r) => {
    const e = (o) => THREE.MathUtils.clamp((r - o) / 0.42, 0, 1);
    const s = (t) => t * t * (3 - 2 * t);
    hour.scale.set(s(e(0.06)), s(e(0.06)), 1);
    minute.scale.set(s(e(0.16)), s(e(0.16)), 1);
    second.scale.set(s(e(0.26)), s(e(0.26)), 1);
    cap.scale.setScalar(0.001 + 0.999 * s(e(0.2)));
  };
  refs.setReveal(0);
  return { group, refs };
}

export function buildCaseback(M, textures) {
  const refs = {};
  const group = new THREE.Group();
  group.name = 'caseback';

  const outer = circleShape(CASE.radius, 128);
  outer.holes.push(circleShapeAt(0, 0, 15.55, 96));
  const plate = new THREE.Mesh(
    extrudeShape(outer, { depth: Z.caseback[1] - Z.caseback[0], bevel: 0.12, bevelSegments: 2, curveSegments: 128 }),
    M.casebackPlate
  );
  plate.position.z = (Z.caseback[0] + Z.caseback[1]) / 2;
  group.add(plate);
  refs.plate = plate;

  const glass = new THREE.Mesh(new THREE.CylinderGeometry(15.55, 15.55, 0.16, 96, 1), M.sapphire);
  glass.rotation.x = Math.PI / 2;
  glass.position.z = Z.casebackGlass[1] - 0.08;
  group.add(glass);
  refs.glass = glass;
  return { group, refs };
}

export function buildStrap(M) {
  const refs = {};
  const group = new THREE.Group();
  group.name = 'strap';
  const section = roundedRectSection(CASE.strapWidth, 3.4, 1.0, 4);
  const mk = (sign) => {
    const pts = [];
    const path = [
      [20.8, -5.3],
      [23.2, -5.9],
      [26.6, -8.0],
      [30.2, -11.2],
      [33.0, -15.2],
      [34.6, -19.4],
      [35.2, -23.8],
      [35.2, -27.8],
    ];
    const scales = [];
    for (let i = 0; i < 46; i++) {
      const t = i / 45;
      const seg = t * (path.length - 1);
      const i0 = Math.min(path.length - 2, Math.floor(seg));
      const f = seg - i0;
      const y = path[i0][0] + (path[i0 + 1][0] - path[i0][0]) * f;
      const z = path[i0][1] + (path[i0 + 1][1] - path[i0][1]) * f;
      pts.push(V3(0, sign * y, z));
      scales.push(1 - 0.11 * t);
    }
    const g = sweep(pts, section, { scales });
    const mesh = new THREE.Mesh(g, M.leather);
    return mesh;
  };
  refs.upper = mk(1);
  refs.lower = mk(-1);
  group.add(refs.upper, refs.lower);
  return { group, refs };
}
