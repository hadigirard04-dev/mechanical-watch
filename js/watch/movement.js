// 机芯几何：主夹板、桥板、轮系、擒纵系统、条盒、宝石轴承与螺钉
// 每个可动零件都是独立 Object3D，拥有自己的基准变换，便于爆炸视图中独立控制。

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeWheel, makePinion, makeEscapeWheel, extrudeShape, circleShapeAt } from './gears.js';
import { MOVEMENT } from './dimensions.js';
import { TRAIN } from './train.js';

const TAU = Math.PI * 2;
const V2 = (x, y) => new THREE.Vector2(x, y);
/** 圆柱默认轴为 Y，统一转到 Z 轴 */
const cylZ = (geo) => geo.rotateX(Math.PI / 2);

/** 旋转体：profile 为 [半径, z] 数组；LatheGeometry 默认绕 Y，统一转到 Z 轴 */
function lathe(profile, segments = 192) {
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => V2(r, z)), segments);
  g.rotateX(Math.PI / 2);
  return g;
}

/** 凸包轮廓 → THREE.Shape（整体平移 -offset，宝石孔同步平移） */
function hullShape(poly, holes = [], offset = [0, 0]) {
  const s = new THREE.Shape(poly.map(([x, y]) => V2(x - offset[0], y - offset[1])));
  for (const [x, y, r] of holes) s.holes.push(circleShapeAt(x - offset[0], y - offset[1], r, 28));
  return s;
}

/** 螺钉：头（带一字槽贴图）+ 杆 */
function makeScrew(M, { r = 0.52, headH = 0.17, shaftH = 0.5, shaftR = 0.2 } = {}) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(cylZ(new THREE.CylinderGeometry(r, r * 0.97, headH, 28, 1)), [M.bluedSteel, M.screwHead, M.bluedSteel]);
  head.position.z = headH / 2;
  const shaft = new THREE.Mesh(cylZ(new THREE.CylinderGeometry(shaftR, shaftR * 0.9, shaftH, 12, 1)), M.bluedSteel);
  shaft.position.z = -shaftH / 2;
  g.add(head, shaft);
  return g;
}

/** 宝石轴承：红宝石 + 金色宝石座（chaton） */
function makeJewel(M, { r = 0.34, chaton = true, h = 0.16 } = {}) {
  const g = new THREE.Group();
  const stone = new THREE.Mesh(cylZ(new THREE.CylinderGeometry(r, r * 0.8, h, 24, 1)), M.ruby);
  g.add(stone);
  if (chaton) {
    const ring = new THREE.Mesh(lathe([[r + 0.03, 0], [r + 0.26, 0.02], [r + 0.26, 0.13], [r + 0.05, 0.16]], 48), M.gold);
    g.add(ring);
  }
  return g;
}

/** 一组宝石轴承（合并为 2 个网格，减少 draw call；宝石不参与独立爆炸） */
function jewelSet(M, positions, { r = 0.34, chaton = true, h = 0.16 } = {}) {
  const g = new THREE.Group();
  const stones = [];
  const chatons = [];
  for (const [x, y, z] of positions) {
    const s = cylZ(new THREE.CylinderGeometry(r, r * 0.8, h, 24, 1));
    s.translate(x, y, z);
    stones.push(s.toNonIndexed());
    if (chaton) {
      const c = lathe([[r + 0.03, 0], [r + 0.26, 0.02], [r + 0.26, 0.13], [r + 0.05, 0.16]], 48);
      c.translate(x, y, z);
      chatons.push(c.toNonIndexed());
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(stones, false), M.ruby));
  if (chatons.length) g.add(new THREE.Mesh(mergeGeometries(chatons, false), M.gold));
  return g;
}

/** 阿基米德螺线（发条 / 游丝） */
function spiralCurve({ r0, r1, turns, z = 0, phase = 0 }) {
  const pts = [];
  const steps = turns * 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = phase + t * turns * TAU;
    const r = r0 + (r1 - r0) * t;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function buildMovement(M, textures) {
  const refs = {};
  const root = new THREE.Group();
  root.name = 'movement';
  const L = MOVEMENT.levels;

  // ---- 主夹板 ----
  textures.perlage.repeat.set(4, 4);
  const plateGroup = new THREE.Group();
  root.add(plateGroup);
  const plate = new THREE.Mesh(
    cylZ(new THREE.CylinderGeometry(TRAIN.plateR, TRAIN.plateR, MOVEMENT.plate[1] - MOVEMENT.plate[0], 128, 1)),
    [M.steelSatin, M.rhodium, M.steelSatin]
  );
  plate.position.z = (MOVEMENT.plate[0] + MOVEMENT.plate[1]) / 2;
  plateGroup.add(plate);
  refs.plate = plate;
  refs.plateGroup = plateGroup;

  // ---- 轮系：每根轴 = 轮片 + 小齿轮 + 细轴 ----
  refs.wheels = {};
  const wheelGroup = new THREE.Group();
  root.add(wheelGroup);
  for (const a of TRAIN.arbors) {
    const g = new THREE.Group();
    g.position.set(a.pos[0], a.pos[1], 0);
    const entry = { group: g, arbor: a };

    const wg = makeWheel({
      teeth: a.wheel.teeth,
      module: a.wheel.module ?? 0.13,
      thickness: MOVEMENT.wheelT,
      spokes: a.wheel.teeth >= 60 ? 5 : 4,
    });
    const wheel = new THREE.Mesh(wg.geometry, a.wheel.teeth >= 60 ? M.goldSatin : M.steel);
    wheel.position.z = a.wheelZ;
    wheel.rotation.z = a.wheelPhase;
    g.add(wheel);
    entry.wheel = wheel;

    if (a.pinion) {
      const pg = makePinion({
        leaves: a.pinion.leaves,
        module: a.pinion.module,
        thickness: MOVEMENT.wheelT + 0.06,
        drop: MOVEMENT.pinionDrop,
        up: MOVEMENT.pinionUp,
      });
      const pinion = new THREE.Mesh(pg.geometry, M.steel);
      pinion.position.z = a.pinionZ;
      pinion.rotation.z = a.pinionPhase;
      g.add(pinion);
      entry.pinion = pinion;
    }

    // 细轴：从主夹板顶面到桥板底面（很细，不参与平面校验）
    const staff = new THREE.Mesh(
      cylZ(new THREE.CylinderGeometry(0.085, 0.085, MOVEMENT.bridges[0] - MOVEMENT.plate[1], 8, 1)),
      M.steel
    );
    staff.position.z = (MOVEMENT.plate[1] + MOVEMENT.bridges[0]) / 2;
    g.add(staff);
    entry.staff = staff;

    wheelGroup.add(g);
    refs.wheels[a.id] = entry;
  }

  // ---- 条盒：齿带 + 鼓壁 + 发条 + 盖 + 棘轮 ----
  const barrel = TRAIN.barrel;
  const barrelGroup = new THREE.Group();
  barrelGroup.position.set(barrel.pos[0], barrel.pos[1], 0);
  root.add(barrelGroup);
  const bandG = makeWheel({
    teeth: barrel.wheel.teeth,
    module: barrel.wheel.module,
    thickness: MOVEMENT.wheelT,
    spokes: 0,
    rimInner: 5.55,
    hubRadius: 1.1,
  });
  const band = new THREE.Mesh(bandG.geometry, M.steel);
  band.position.z = L.A;
  band.rotation.z = barrel.wheelPhase;
  barrelGroup.add(band);

  const drumWall = new THREE.Mesh(
    lathe(
      [
        [MOVEMENT.drumR - 0.14, MOVEMENT.drum[0]],
        [MOVEMENT.drumR - 0.03, MOVEMENT.drum[0] + 0.07],
        [MOVEMENT.drumR - 0.03, MOVEMENT.drum[1]],
        [MOVEMENT.drumR - 0.14, MOVEMENT.drum[1]],
        [MOVEMENT.drumR - 0.14, MOVEMENT.drum[0] + 0.07],
        [MOVEMENT.drumR - 0.14, MOVEMENT.drum[0]],
      ],
      128
    ),
    M.steelSatin
  );
  drumWall.material.side = THREE.DoubleSide;
  barrelGroup.add(drumWall);

  const spring = new THREE.Mesh(
    new THREE.ExtrudeGeometry(new THREE.Shape([V2(-0.05, -0.3), V2(0.05, -0.3), V2(0.05, 0.3), V2(-0.05, 0.3)]), {
      extrudePath: spiralCurve({ r0: 2.2, r1: 5.5, turns: 9, z: (MOVEMENT.drum[0] + MOVEMENT.drum[1]) / 2 }),
      steps: 420,
      bevelEnabled: false,
      curveSegments: 2,
    }),
    M.bluedSteel
  );
  barrelGroup.add(spring);

  const lid = new THREE.Mesh(
    lathe(
      [
        [1.05, 0],
        [MOVEMENT.drumR - 0.15, 0],
        [MOVEMENT.drumR - 0.15, 0.1],
        [1.05, 0.1],
      ],
      128
    ),
    M.steelSatin
  );
  lid.position.z = MOVEMENT.drum[1];
  barrelGroup.add(lid);

  const ratchetG = makeWheel({ teeth: 25, module: 0.13, thickness: 0.2, spokes: 3, rimInner: 0.95, hubRadius: 0.62 });
  const ratchet = new THREE.Mesh(ratchetG.geometry, M.bluedSteel);
  ratchet.position.z = MOVEMENT.ratchetZ;
  barrelGroup.add(ratchet);
  const ratchetScrew = makeScrew(M, { r: 0.62, headH: 0.18, shaftH: 0.3 });
  ratchetScrew.position.z = MOVEMENT.ratchetZ + 0.1;
  barrelGroup.add(ratchetScrew);
  refs.barrel = { group: barrelGroup, band, drumWall, spring, lid, ratchet, ratchetScrew };

  // ---- 棘爪（click）：叉形杠杆 + 弹簧 ----
  const clickGroup = new THREE.Group();
  clickGroup.position.set(TRAIN.click.pos[0], TRAIN.click.pos[1], 0);
  const clickShape = new THREE.Shape([
    V2(-0.9, -0.34),
    V2(0.55, -0.42),
    V2(1.55, -0.16),
    V2(1.7, 0.1),
    V2(1.5, 0.2),
    V2(0.6, 0.06),
    V2(-0.85, 0.42),
  ]);
  const clickBody = new THREE.Mesh(extrudeShape(clickShape, { depth: 0.16, bevel: 0.02 }), M.steelSatin);
  clickBody.position.z = MOVEMENT.ratchetZ;
  clickBody.rotation.z =
    Math.atan2(barrel.pos[1] - TRAIN.click.pos[1], barrel.pos[0] - TRAIN.click.pos[0]) + Math.PI * 0.72;
  clickGroup.add(clickBody);
  const clickSpring = new THREE.Mesh(
    new THREE.TubeGeometry(spiralCurve({ r0: 0.5, r1: 1.5, turns: 1.1, z: MOVEMENT.ratchetZ, phase: 2.4 }), 40, 0.06, 6),
    M.bluedSteel
  );
  clickGroup.add(clickSpring);
  const clickScrew = makeScrew(M, { r: 0.5, headH: 0.16, shaftH: 0.3 });
  clickScrew.position.z = MOVEMENT.ratchetZ + 0.1;
  clickGroup.add(clickScrew);
  root.add(clickGroup);
  refs.click = { group: clickGroup, body: clickBody, spring: clickSpring };

  // ---- 桥板（凸包外形 + 宝石孔 + 铭文）----
  refs.bridges = {};
  for (const b of TRAIN.bridges) {
    const isCock = b.id === 'balanceCock';
    const z0 = isCock ? MOVEMENT.cock[0] : MOVEMENT.bridges[0];
    const z1 = isCock ? MOVEMENT.cock[1] : MOVEMENT.bridges[1];
    const bg = new THREE.Group();
    root.add(bg);
    const holes = [];
    for (const a of TRAIN.arbors) {
      if (Math.hypot(a.pos[0] - b.center[0], a.pos[1] - b.center[1]) < b.r + 1.2) {
        holes.push([a.pos[0], a.pos[1], MOVEMENT.jewelR + 0.02]);
      }
    }
    if (isCock) holes.push([TRAIN.balance.pos[0], TRAIN.balance.pos[1], MOVEMENT.jewelR]);

    // 以包围盒中心为原点，便于铭文贴图定位
    const box = new THREE.Box2();
    for (const p of b.poly) box.expandByPoint(V2(p[0], p[1]));
    const cx = (box.min.x + box.max.x) / 2;
    const cy = (box.min.y + box.max.y) / 2;
    const shape = hullShape(b.poly, holes, [cx, cy]);
    const geo = extrudeShape(shape, { depth: z1 - z0, bevel: 0.06, bevelSegments: 2, curveSegments: 40 });
    const capMat = M.bridgeCap[0].clone();
    if (b.id === 'trainBridge') {
      capMat.bumpMap = textures.bridgeEngraving;
      capMat.bumpScale = 0.012;
    }
    const mesh = new THREE.Mesh(geo, [capMat, M.bridgeCap[1]]);
    mesh.position.set(cx, cy, (z0 + z1) / 2);
    bg.add(mesh);

    // 宝石 + 螺钉
    const jewels = [];
    if (holes.length) {
      const set = jewelSet(
        M,
        holes.map(([hx, hy]) => [hx, hy, z1 - 0.06]),
        { r: MOVEMENT.jewelR }
      );
      bg.add(set);
      jewels.push(set);
    }
    const screws = [];
    b.anchors.slice(1).forEach(([fx, fy], i) => {
      const s = makeScrew(M, { r: 0.58, headH: 0.2, shaftH: 0.9 });
      s.position.set(fx, fy, z1 + 0.1);
      s.rotation.z = i * 1.7;
      bg.add(s);
      screws.push(s);
    });
    refs.bridges[b.id] = { group: bg, mesh, jewels, screws, z0, z1, center: [cx, cy], label: b.label };
  }

  // 摆夹板支柱
  const post = new THREE.Mesh(
    cylZ(new THREE.CylinderGeometry(TRAIN.post.r, TRAIN.post.r, MOVEMENT.cock[0] - MOVEMENT.plate[1], 16, 1)),
    M.steelSatin
  );
  post.position.set(TRAIN.post.pos[0], TRAIN.post.pos[1], (MOVEMENT.plate[1] + MOVEMENT.cock[0]) / 2);
  root.add(post);
  refs.balancePost = post;

  // ---- 擒纵轮 ----
  const esc = TRAIN.escape;
  const escG = makeEscapeWheel({ teeth: esc.wheel.teeth, radius: esc.wheel.radius, thickness: MOVEMENT.wheelT });
  const escapeWheel = new THREE.Mesh(escG.geometry, M.steel);
  escapeWheel.position.set(esc.pos[0], esc.pos[1], L.E);
  escapeWheel.rotation.z = esc.wheelPhase;
  root.add(escapeWheel);
  refs.escape = { mesh: escapeWheel };
  const escStaff = new THREE.Mesh(
    cylZ(new THREE.CylinderGeometry(0.08, 0.08, MOVEMENT.bridges[0] - MOVEMENT.plate[1], 8, 1)),
    M.steel
  );
  escStaff.position.set(esc.pos[0], esc.pos[1], (MOVEMENT.plate[1] + MOVEMENT.bridges[0]) / 2);
  root.add(escStaff);
  refs.escape.staff = escStaff;

  // ---- 擒纵叉 ----
  const forkGroup = new THREE.Group();
  forkGroup.position.set(TRAIN.pallet.pos[0], TRAIN.pallet.pos[1], L.E);
  forkGroup.rotation.z = TRAIN.pallet.forkBearing;
  const forkShape = new THREE.Shape([
    V2(-0.62, 0.0),
    V2(-0.78, 0.42),
    V2(-0.72, 0.95),
    V2(-0.3, 1.0),
    V2(0.12, 0.62),
    V2(0.55, 0.5),
    V2(1.5, 0.42),
    V2(1.72, 0.2),
    V2(1.72, -0.2),
    V2(1.5, -0.42),
    V2(0.55, -0.5),
    V2(0.12, -0.62),
    V2(-0.3, -1.0),
    V2(-0.72, -0.95),
    V2(-0.78, -0.42),
  ]);
  const forkBody = new THREE.Mesh(extrudeShape(forkShape, { depth: MOVEMENT.wheelT, bevel: 0.02 }), M.steel);
  forkGroup.add(forkBody);
  const forkHub = new THREE.Mesh(cylZ(new THREE.CylinderGeometry(0.32, 0.32, MOVEMENT.wheelT + 0.1, 20, 1)), M.steelSatin);
  forkGroup.add(forkHub);
  const palletJewels = [];
  for (const sgn of [1, -1]) {
    const pj = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, MOVEMENT.wheelT + 0.02), M.ruby);
    pj.position.set(-0.79, sgn * 0.81, 0);
    pj.rotation.z = sgn * 0.5;
    forkGroup.add(pj);
    palletJewels.push(pj);
  }
  root.add(forkGroup);
  refs.pallet = { group: forkGroup, body: forkBody, hub: forkHub, jewels: palletJewels };

  // ---- 摆轮 ----
  const balGroup = new THREE.Group();
  balGroup.position.set(TRAIN.balance.pos[0], TRAIN.balance.pos[1], 0);
  root.add(balGroup);
  const rim = new THREE.Mesh(
    lathe(
      [
        [MOVEMENT.balanceRimInner, MOVEMENT.balanceRim - MOVEMENT.balanceRimH / 2],
        [MOVEMENT.balanceRimOuter, MOVEMENT.balanceRim - MOVEMENT.balanceRimH / 2],
        [MOVEMENT.balanceRimOuter, MOVEMENT.balanceRim + MOVEMENT.balanceRimH / 2],
        [MOVEMENT.balanceRimInner, MOVEMENT.balanceRim + MOVEMENT.balanceRimH / 2],
        [MOVEMENT.balanceRimInner, MOVEMENT.balanceRim - MOVEMENT.balanceRimH / 2],
      ],
      160
    ),
    M.gold
  );
  rim.material.side = THREE.DoubleSide;
  balGroup.add(rim);

  const armGeos = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.BoxGeometry(MOVEMENT.balanceRimInner + 0.1, 0.62, MOVEMENT.balanceRimH * 0.75);
    g.translate((MOVEMENT.balanceRimInner + 0.1) / 2, 0, 0);
    g.rotateZ((i / 2) * Math.PI);
    armGeos.push(g.toNonIndexed());
  }
  const hub = new THREE.Mesh(cylZ(new THREE.CylinderGeometry(0.62, 0.62, MOVEMENT.balanceRimH, 24, 1)), M.goldSatin);
  hub.position.z = MOVEMENT.balanceRim;
  const arms = new THREE.Mesh(mergeGeometries(armGeos, false), M.gold);
  arms.position.z = MOVEMENT.balanceRim;
  balGroup.add(hub, arms);

  // 8 颗配重螺钉
  const weightGeos = [];
  for (let i = 0; i < 8; i++) {
    const g = cylZ(new THREE.CylinderGeometry(0.26, 0.26, 0.5, 14, 1));
    g.translate(MOVEMENT.balanceRimOuter + 0.06, 0, MOVEMENT.balanceRim);
    g.rotateZ((i / 8) * TAU);
    weightGeos.push(g.toNonIndexed());
  }
  const weights = new THREE.Mesh(mergeGeometries(weightGeos, false), M.goldSatin);
  balGroup.add(weights);

  // 摆轴 + 圆盘 + 冲击宝石
  const staff = new THREE.Mesh(
    cylZ(new THREE.CylinderGeometry(0.085, 0.085, MOVEMENT.staff[1] - MOVEMENT.staff[0], 10, 1)),
    M.steel
  );
  staff.position.z = (MOVEMENT.staff[0] + MOVEMENT.staff[1]) / 2;
  const roller = new THREE.Mesh(cylZ(new THREE.CylinderGeometry(0.52, 0.52, 0.12, 20, 1)), M.steelSatin);
  roller.position.z = L.E;
  const impulse = new THREE.Mesh(cylZ(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 10, 1)), M.ruby);
  impulse.position.set(0.92, 0, L.E + 0.02);
  balGroup.add(staff, roller, impulse);
  refs.balance = { group: balGroup, rim, arms, hub, weights, staff, roller, impulse };

  // ---- 游丝（呼吸由顶点着色器完成）----
  const hairMat = M.steel.clone();
  hairMat.metalness = 1;
  hairMat.roughness = 0.28;
  const breathUniform = { value: 0 };
  hairMat.onBeforeCompile = (shader) => {
    shader.uniforms.uBreath = breathUniform;
    shader.uniforms.uR0 = { value: 0.42 };
    shader.uniforms.uR1 = { value: 2.62 };
    shader.vertexShader = `uniform float uBreath;\nuniform float uR0;\nuniform float uR1;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `vec3 transformed = vec3( position );
       float hR = length( transformed.xy );
       float hT = clamp( ( hR - uR0 ) / ( uR1 - uR0 ), 0.0, 1.0 );
       transformed.xy *= ( 1.0 + uBreath * hT * hT );`
    );
  };
  const hairspring = new THREE.Mesh(
    new THREE.TubeGeometry(spiralCurve({ r0: 0.42, r1: 2.62, turns: 7.5, z: MOVEMENT.hairspringZ }), 620, 0.045, 6),
    hairMat
  );
  root.add(hairspring);
  refs.hairspring = { mesh: hairspring, uniform: breathUniform };

  const collet = new THREE.Mesh(cylZ(new THREE.CylinderGeometry(0.3, 0.34, 0.22, 18, 1)), M.goldSatin);
  collet.position.z = MOVEMENT.hairspringZ;
  balGroup.add(collet);
  const stud = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.3), M.goldSatin);
  stud.position.set(-2.55, 0, MOVEMENT.hairspringZ);
  balGroup.add(stud);

  // ---- 主夹板上的宝石轴承 ----
  const plateJewels = [];
  if (TRAIN.arbors.length) {
    const set = jewelSet(
      M,
      TRAIN.arbors.map((a) => [a.pos[0], a.pos[1], MOVEMENT.plate[1] + 0.02]),
      { r: MOVEMENT.jewelR, chaton: false }
    );
    plateGroup.add(set);
    plateJewels.push(set);
  }
  refs.plateJewels = plateJewels;

  return { group: root, refs };
}
