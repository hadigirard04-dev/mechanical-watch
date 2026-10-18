// 齿轮几何：真·渐开线齿形（20° 压力角）+ 轮缘 / 轮辐 / 轮毂构建
//
// 单位统一为毫米（1 世界单位 = 1 mm），因此模数、齿数、中心距都是真实量级。
// 齿形公式（标准全齿高滚齿）：
//   分度圆 r_p = m·z/2      基圆 r_b = r_p·cos α      齿顶 r_a = r_p + m      齿根 r_f = r_p − 1.25m
//   半齿角 ψ(r) = ψ_p + inv(α_p) − inv(α_r)，ψ_p = π/(2z)，inv(α) = tan α − α
// 齿中线固定在局部角 0°，方便用解析式给出啮合相位（见 train.js）。

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gearMetrics, involute } from './kinematics.js';

const TAU = Math.PI * 2;

export { gearMetrics };

/** 外齿轮轮廓。bore > 0 时挖中心孔。 */
export function gearShape({ teeth, module: m, pressureAngle = 20, bore = 0, flankSamples = 4 }) {
  const { rBase, rAdd, rDed, halfAngle, invP } = gearMetrics({ teeth, module: m, pressureAngle });
  const rStart = Math.max(rDed, rBase);
  const psiMax = 0.9 * (Math.PI / teeth); // 根切/尖齿保护
  const psi = (r) => Math.min(psiMax, halfAngle + invP - involute(r, rBase));
  const psiTip = psi(rAdd);
  const step = TAU / teeth;
  const pts = [];
  const push = (r, a) => pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));

  for (let k = 0; k < teeth; k++) {
    const c = k * step;
    for (let j = 0; j < flankSamples; j++) {
      const r = rStart + (rAdd - rStart) * (j / flankSamples);
      push(r, c - psi(r));
    }
    for (let j = 0; j <= 2; j++) push(rAdd, c - psiTip + psiTip * j); // 齿顶弧
    for (let j = flankSamples; j >= 0; j--) {
      const r = rStart + (rAdd - rStart) * (j / flankSamples);
      push(r, c + psi(r));
    }
    if (rDed < rStart - 1e-6) push(rDed, c + step * 0.5); // 齿根下沉
  }

  const shape = new THREE.Shape(pts);
  if (bore > 0) shape.holes.push(circleShape(bore, 48));
  return shape;
}

export function circleShape(r, segments = 64) {
  return circleShapeAt(0, 0, r, segments);
}

/** 指定圆心的圆（用于宝石孔等） */
export function circleShapeAt(cx, cy, r, segments = 64) {
  const s = new THREE.Shape();
  s.moveTo(cx + r, cy);
  for (let i = 1; i <= segments; i++) {
    const a = (i / segments) * TAU;
    s.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return s;
}

export function ringShape(rOuter, rInner, segments = 64) {
  const s = circleShape(rOuter, segments);
  if (rInner > 0) s.holes.push(circleShape(rInner, Math.max(24, segments >> 1)));
  return s;
}

/** 挤压成体；ExtrudeGeometry 会生成两组材质：0 = 端面，1 = 侧壁 */
export function extrudeShape(shape, { depth = 1, bevel = 0.03, bevelSegments = 1, curveSegments = 48 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments,
    curveSegments,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2); // 以厚度中心为原点
  return g;
}

const nonIndexed = (g) => (g.index ? g.toNonIndexed() : g);

/** 轮子：轮缘（带齿）+ 轮辐 + 轮毂，合并为单个几何体 */
export function makeWheel({
  teeth,
  module: m,
  thickness = 0.34,
  pressureAngle = 20,
  spokes = 5,
  rimInner = null,
  hubRadius = 0.95,
  bore = 0.18,
}) {
  const { rAdd } = gearMetrics({ teeth, module: m, pressureAngle });
  const rInner = rimInner ?? Math.max(hubRadius + 0.45, rAdd - 0.95);
  const parts = [nonIndexed(extrudeShape(gearShape({ teeth, module: m, pressureAngle, bore: rInner }), { depth: thickness }))];
  const hubDepth = thickness * 1.5;
  parts.push(nonIndexed(extrudeShape(ringShape(hubRadius, bore), { depth: hubDepth })));
  const armLen = rInner - hubRadius * 0.7;
  const armWidth = Math.min(1.15, ((TAU * rInner) / spokes) * 0.44);
  for (let i = 0; i < spokes; i++) {
    const g = new THREE.BoxGeometry(armLen, armWidth, thickness * 0.9);
    g.translate(hubRadius * 0.6 + armLen / 2, 0, 0);
    g.rotateZ((i / spokes) * TAU + Math.PI / spokes);
    parts.push(nonIndexed(g));
  }
  const geometry = mergeGeometries(parts, false);
  geometry.computeBoundingSphere();
  return { geometry, metrics: gearMetrics({ teeth, module: m, pressureAngle }) };
}

/** 小齿轮（pinion）：齿体在啮合层，轮毂向主夹板侧延伸 */
export function makePinion({ leaves, module: m, thickness = 0.34, hubRadius = null, bore = 0.13, drop = 0.15, up = 0.09 }) {
  const metrics = gearMetrics({ teeth: leaves, module: m, pressureAngle: 20 });
  const rHub = hubRadius ?? metrics.rAdd + 0.26;
  const hub = extrudeShape(ringShape(rHub, bore), { depth: drop + up });
  hub.translate(0, 0, (up - drop) / 2);
  const parts = [
    nonIndexed(extrudeShape(gearShape({ teeth: leaves, module: m, pressureAngle: 20, bore }), { depth: thickness, bevel: 0.012 })),
    nonIndexed(hub),
  ];
  const geometry = mergeGeometries(parts, false);
  geometry.computeBoundingSphere();
  return { geometry, metrics };
}

/** 擒纵轮：以一齿 6 点的“棒状齿”近似 club-tooth，外形与轮系齿轮明显区分 */
export function makeEscapeWheel({ teeth = 20, radius = 1.55, thickness = 0.22, bore = 0.12 }) {
  const rRoot = radius * 0.74;
  const pts = [];
  const push = (r, a) => pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  const step = TAU / teeth;
  for (let k = 0; k < teeth; k++) {
    const c = k * step;
    push(rRoot, c - step * 0.42); // 齿后根弧起点
    push(radius * 0.9, c - step * 0.2); // 背面缓坡
    push(radius, c - step * 0.06); // 齿顶（锁面）
    push(radius, c + step * 0.12); // club 平顶
    push(radius * 0.79, c + step * 0.17); // 冲面陡降
    push(rRoot, c + step * 0.34); // 齿间根弧
  }
  const shape = new THREE.Shape(pts);
  shape.holes.push(circleShape(bore, 24));
  const parts = [nonIndexed(extrudeShape(shape, { depth: thickness, bevel: 0.012 }))];
  parts.push(nonIndexed(extrudeShape(ringShape(0.42, bore), { depth: thickness * 2.4 })));
  const geometry = mergeGeometries(parts, false);
  geometry.computeBoundingSphere();
  return { geometry };
}

/** 人字 / 直纹装饰：把一个纹理按世界尺寸映射到挤压体的端面上 */
export function capUV(texture, size, center = [0, 0]) {
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1 / size, 1 / size);
  texture.offset.set(0.5 - center[0] / size, 0.5 - center[1] / size);
  return texture;
}

export const GEAR_TAU = TAU;
