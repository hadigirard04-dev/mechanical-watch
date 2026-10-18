// 总装与编排：把外观件、机芯装配成完整腕表，并给出每个零件的爆炸运动学
//
// 每个零件都登记在 parts 里：home（基准变换）+ explode（方向/距离/旋转/延迟/时长）。
// 爆炸进度 E ∈ [0,1] 由滚动时间轴驱动；每件独立插值，因此是逐件分离而不是整体缩放。

import * as THREE from 'three';
import { buildCase, buildDial, buildHands, buildCaseback, buildStrap } from './parts.js';
import { buildMovement } from './movement.js';
import { Z, MOVEMENT } from './dimensions.js';
import { TRAIN } from './train.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const smoothstep = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** 包一层爆炸用的父节点，内层对象保留自己的功能变换（自转 / 生长 / 呼吸）。
 *  注意：只继承位置与旋转（作为爆炸的枢轴），不继承缩放——缩放属于功能变换，
 *  例如指针的“浮现生长”就写在缩放上，若被父节点冻结为 0 将永远不可见。 */
function wrapIn(obj) {
  const parent = obj.parent;
  const w = new THREE.Group();
  w.name = `${obj.name || 'part'}-explode`;
  parent.add(w);
  w.position.copy(obj.position);
  w.quaternion.copy(obj.quaternion);
  obj.position.set(0, 0, 0);
  obj.quaternion.identity();
  w.add(obj);
  return w;
}

export function buildWatch(M, textures) {
  const root = new THREE.Group();
  root.name = 'watch';

  const caseParts = buildCase(M);
  const dialParts = buildDial(M, textures);
  const handParts = buildHands(M);
  const casebackParts = buildCaseback(M, textures);
  const strapParts = buildStrap(M);
  const movement = buildMovement(M, textures);

  // 机芯绕 Y 轴翻转 180°：局部 +Z（桥板/摆轮）朝向世界 −Z（底盖侧），与真表一致
  movement.group.rotation.y = Math.PI;
  movement.group.position.z = Z.movementOriginZ;

  root.add(caseParts.group, dialParts.group, handParts.group, strapParts.group, casebackParts.group, movement.group);

  const refs = { ...caseParts.refs, ...dialParts.refs, ...handParts.refs, ...casebackParts.refs, ...strapParts.refs, ...movement.refs };
  refs.movement = movement.group;
  refs.movementRefs = movement.refs;

  // 需要独立功能变换（自转/摆动/呼吸）的零件加一层父节点
  const mov = movement.refs;
  const wheelWraps = {};
  for (const [id, entry] of Object.entries(mov.wheels)) {
    wheelWraps[id] = { wheel: wrapIn(entry.wheel), pinion: entry.pinion ? wrapIn(entry.pinion) : null, entry };
  }
  const escapeWrap = wrapIn(mov.escape.mesh);
  const palletWrap = wrapIn(mov.pallet.group);
  const balanceWrap = wrapIn(mov.balance.group);
  const bandWrap = wrapIn(mov.barrel.band);
  const handWraps = {
    hour: wrapIn(handParts.refs.hour),
    minute: wrapIn(handParts.refs.minute),
    second: wrapIn(handParts.refs.second),
    cap: wrapIn(handParts.refs.cap),
  };

  const P = (id, label, object, layer, explode) => ({
    id,
    label,
    object,
    layer,
    home: { pos: object.position.clone(), quat: object.quaternion.clone(), scale: object.scale.clone() },
    explode: {
      dir: V3(...(explode.dir || [0, 0, 0])).normalize(),
      dist: explode.dist ?? 0,
      rot: V3(...(explode.rot || [0, 0, 0])),
      delay: explode.delay ?? 0,
      dur: explode.dur ?? 0.55,
    },
  });

  const parts = [];
  const add = (...a) => parts.push(P(...a));

  // ---- 正面件（世界 +Z 方向分离）----
  // ---- 正面件（世界 +Z 方向分离，带横向扇形展开，避免在机芯特写时挡镜头）----
  add('crystal', '蓝宝石表镜', refs.crystal, 'front', { dir: [0.32, 0.22, 1], dist: 7.2, delay: 0.0, dur: 0.6 });
  add('bezel', '表圈', refs.bezel, 'front', { dir: [0.52, 0.34, 1], dist: 6.2, rot: [0, 0, 0.12], delay: 0.04, dur: 0.6 });
  add('dialGroup', '盘面', dialParts.group, 'front', { dir: [0.78, 0.52, 1], dist: 5.4, rot: [0.16, 0.22, 0.06], delay: 0.2, dur: 0.6 });
  add('handHour', '时针', handWraps.hour, 'front', { dir: [0.55, 0.34, 1], dist: 4.6, rot: [0, 0, 0.4], delay: 0.34, dur: 0.5 });
  add('handMinute', '分针', handWraps.minute, 'front', { dir: [0.62, 0.38, 1], dist: 4.3, rot: [0, 0, -0.34], delay: 0.38, dur: 0.5 });
  add('handSecond', '秒针', handWraps.second, 'front', { dir: [0.7, 0.42, 1], dist: 4.0, rot: [0, 0, 0.55], delay: 0.42, dur: 0.5 });
  add('handCap', '指针中心帽', handWraps.cap, 'front', { dir: [0.75, 0.45, 1], dist: 3.8, delay: 0.46, dur: 0.5 });

  // ---- 中框与附件 ----
  add('caseband', '表壳中框', refs.caseband, 'case', { dir: [0, -0.5, -1], dist: 2.9, rot: [0.12, 0, 0.08], delay: 0.48, dur: 0.65 });
  add('casebandBrush', '中框拉丝带', refs.casebandBrush, 'case', { dir: [0, -0.5, -1], dist: 2.9, rot: [0.12, 0, 0.08], delay: 0.48, dur: 0.65 });
  add('crown', '表冠', refs.crown, 'case', { dir: [1, 0, 0.25], dist: 4.0, rot: [0, 0.5, 0], delay: 0.52, dur: 0.6 });
  add('gasket', '防水圈', refs.gasket, 'case', { dir: [0, 0, -1], dist: 3.6, delay: 0.58, dur: 0.55 });
  refs.lugs.children.forEach((lug, i) => {
    const sx = lug.position.x > 0 ? 1 : -1;
    const sy = i < 2 ? 1 : -1;
    add(`lug${i}`, `表耳 ${i + 1}`, lug, 'case', {
      dir: [sx * 0.55, sy * 0.9, -0.4],
      dist: 4.4,
      rot: [sy * 0.2, 0, sx * 0.18],
      delay: 0.56 + i * 0.015,
      dur: 0.6,
    });
  });
  add('strapUpper', '表带（上）', refs.upper, 'case', { dir: [0, 1, -0.35], dist: 6.5, rot: [0.32, 0, 0], delay: 0.62, dur: 0.7 });
  add('strapLower', '表带（下）', refs.lower, 'case', { dir: [0, -1, -0.35], dist: 6.5, rot: [-0.32, 0, 0], delay: 0.62, dur: 0.7 });

  // ---- 底盖（世界 −Z 方向分离）----
  // ---- 底盖（世界 −Z 方向分离，并横向让开，避免挡住机芯特写）----
  add('casebackGlass', '底盖蓝宝石', refs.glass, 'back', { dir: [-0.9, -0.6, -0.8], dist: 12.0, delay: 0.68, dur: 0.55 });
  add('caseback', '底盖', refs.plate, 'back', { dir: [-1, -0.55, -0.72], dist: 11.0, rot: [0, 0, -0.14], delay: 0.64, dur: 0.6 });

  // ---- 机芯（在机芯局部坐标系里分离，局部 +Z 指向底盖）----
  add('cock', '摆轮夹板', mov.bridges.balanceCock.group, 'movement', { dir: [0.05, 0.05, 1], dist: 4.6, rot: [0.12, 0.16, 0], delay: 0.02, dur: 0.55 });
  add('balance', '摆轮', balanceWrap, 'movement', { dir: [0.1, 0.08, 1], dist: 3.9, rot: [0.1, 0.34, 0.12], delay: 0.06, dur: 0.6 });
  add('hairspring', '游丝', mov.hairspring.mesh, 'movement', { dir: [-0.15, -0.1, 1], dist: 3.3, rot: [0, 0, -0.5], delay: 0.1, dur: 0.55 });
  add('bridgeTrain', '轮系夹板', mov.bridges.trainBridge.group, 'movement', { dir: [0.08, -0.05, 1], dist: 3.4, rot: [0.1, -0.1, 0.08], delay: 0.12, dur: 0.6 });
  add('bridgeBarrel', '条盒轮夹板', mov.bridges.barrelBridge.group, 'movement', { dir: [-0.1, 0.08, 1], dist: 3.1, rot: [-0.1, 0.12, -0.06], delay: 0.16, dur: 0.6 });
  add('balancePost', '摆夹板支柱', mov.balancePost, 'movement', { dir: [0, 0, 1], dist: 2.3, delay: 0.22, dur: 0.5 });
  add('click', '棘爪', mov.click.group, 'movement', { dir: [0.3, 0.7, 1], dist: 2.5, rot: [0, 0, 0.5], delay: 0.24, dur: 0.5 });
  add('escape', '擒纵轮', escapeWrap, 'movement', { dir: [0.25, 0.2, 1], dist: 3.2, rot: [0, 0, 0.9], delay: 0.26, dur: 0.55 });
  add('pallet', '擒纵叉', palletWrap, 'movement', { dir: [0.45, -0.35, 1], dist: 2.7, rot: [0, 0, 0.55], delay: 0.3, dur: 0.55 });
  add('ratchet', '棘轮', mov.barrel.ratchet, 'movement', { dir: [-0.2, 0.15, 1], dist: 3.0, rot: [0, 0, -0.7], delay: 0.3, dur: 0.5 });
  add('ratchetScrew', '棘轮螺钉', mov.barrel.ratchetScrew, 'movement', { dir: [0, 0, 1], dist: 3.6, rot: [0, 0, 1.2], delay: 0.28, dur: 0.5 });
  add('barrelLid', '条盒盖', mov.barrel.lid, 'movement', { dir: [0, 0, 1], dist: 2.4, delay: 0.34, dur: 0.5 });
  add('barrelSpring', '发条', mov.barrel.spring, 'movement', { dir: [0, 0, 1], dist: 1.7, rot: [0, 0, 0.2], delay: 0.38, dur: 0.5 });
  add('barrelBand', '条盒轮（齿带）', bandWrap, 'movement', { dir: [-0.25, 0.2, 1], dist: 2.1, rot: [0, 0, -0.5], delay: 0.4, dur: 0.55 });

  // 轮系：轮片与小齿轮分别分离，并沿各自径向散开
  const wheelIds = TRAIN.arbors.map((a) => a.id);
  wheelIds.forEach((id, i) => {
    const entry = wheelWraps[id].entry;
    const a = entry.arbor;
    const rad = Math.hypot(a.pos[0], a.pos[1]) || 1;
    const ux = a.pos[0] / rad;
    const uy = a.pos[1] / rad;
    const baseDelay = 0.44 + i * 0.03;
    add(`wheel-${id}`, `${a.label} 轮片`, wheelWraps[id].wheel, 'movement', {
      dir: [ux * 0.4, uy * 0.4, 1],
      dist: 2.3 + i * 0.28,
      rot: [0, 0, (i % 2 ? 1 : -1) * (0.5 + i * 0.12)],
      delay: baseDelay,
      dur: 0.55,
    });
    if (wheelWraps[id].pinion) {
      add(`pinion-${id}`, `${a.label} 小齿轮`, wheelWraps[id].pinion, 'movement', {
        dir: [ux * 0.55, uy * 0.55, 0.7],
        dist: 1.5 + i * 0.22,
        rot: [0, 0, (i % 2 ? -1 : 1) * (0.4 + i * 0.1)],
        delay: baseDelay + 0.06,
        dur: 0.5,
      });
    }
  });

  // 主夹板：向盘面一侧微微让开
  add('plate', '主夹板', mov.plateGroup, 'movement', { dir: [0, 0, -0.35], dist: 1.3, delay: 0.5, dur: 0.5 });

  return { root, refs, parts, movementRefs: mov, wheelWraps, handWraps, balanceWrap, palletWrap, escapeWrap, bandWrap };
}

/** 应用爆炸进度：E ∈ [0,1]，staggerScale 用于“聚合”阶段压缩错峰 */
export function applyExplode(watch, E, staggerScale = 1) {
  const tmpQ = new THREE.Quaternion();
  const euler = new THREE.Euler();
  for (const p of watch.parts) {
    const t = smoothstep(clamp01((E - p.explode.delay * staggerScale) / (p.explode.dur * Math.max(0.35, staggerScale))));
    p.object.position.set(
      p.home.pos.x + p.explode.dir.x * p.explode.dist * t,
      p.home.pos.y + p.explode.dir.y * p.explode.dist * t,
      p.home.pos.z + p.explode.dir.z * p.explode.dist * t
    );
    euler.set(p.explode.rot.x * t, p.explode.rot.y * t, p.explode.rot.z * t);
    tmpQ.setFromEuler(euler);
    p.object.quaternion.copy(p.home.quat).multiply(tmpQ);
  }
}

/** 盘面细节浮现进度（0→1）：扫掠 + 时标 + 指针 */
export function applyReveal(watch, reveal) {
  if (watch.refs.dialReveal) watch.refs.dialReveal.value = reveal;
  watch.refs.updateIndices?.(reveal);
  watch.refs.setReveal?.(reveal);
}

/** 传动状态 → 各零件实际角度（零件自转，与爆炸位移互不干扰） */
export function applyTrain(watch, state) {
  const mov = watch.movementRefs;
  for (const [id, w] of Object.entries(watch.wheelWraps)) {
    const s = state.arbors[id];
    if (!s) continue;
    w.entry.wheel.rotation.z = s.delta;
    if (w.entry.pinion) w.entry.pinion.rotation.z = s.delta;
  }
  mov.balance.group.rotation.z = state.balance.angle;
  mov.pallet.group.rotation.z = state.pallet.rock;
  mov.hairspring.uniform.value = state.balance.breath;
}
