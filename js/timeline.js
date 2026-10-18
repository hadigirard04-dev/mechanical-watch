// 时间轴：把归一化滚动位置 A∈[0,6]（六幕）映射为镜头、腕表姿态、爆炸进度、浮现进度与后期参数

import * as THREE from 'three';

export const ACTS = [
  { id: 0, key: 'emergence', cn: '初现', en: 'EMERGENCE', note: '腕表自暗处浮现，镜头缓缓推进，盘面细节依次点亮' },
  { id: 1, key: 'orbit', cn: '巡礼', en: 'ORBIT', note: '平滑的三维旋转，逐一展示壳、圈、耳与表冠的角度' },
  { id: 2, key: 'explode', cn: '分解', en: 'EXPLOSION', note: '表镜、表圈、盘面、指针、中框、机芯依次分离' },
  { id: 3, key: 'movement', cn: '机芯', en: 'CALIBRE', note: '轮系持续运转：齿数比与旋向为真值' },
  { id: 4, key: 'assemble', cn: '聚合', en: 'REASSEMBLY', note: '零件重新聚合，恢复完整腕表' },
  { id: 5, key: 'hero', cn: '铭牌', en: 'SIGNATURE', note: '镜头拉远，腕表悬浮于画面中央' },
];

const DEG = Math.PI / 180;

/** 关键帧轨道：Catmull-Rom 式三次插值（支持标量与三维向量），输出可裁剪到 [min,max] */
class Track {
  constructor(keys, { min = -Infinity, max = Infinity } = {}) {
    this.keys = keys.slice().sort((a, b) => a[0] - b[0]);
    this.min = min;
    this.max = max;
  }
  at(A) {
    const k = this.keys;
    if (A <= k[0][0]) return this.clamp(k[0][1]);
    if (A >= k[k.length - 1][0]) return this.clamp(k[k.length - 1][1]);
    let i = 0;
    while (i < k.length - 2 && A > k[i + 1][0]) i++;
    const [a0, v0] = k[i];
    const [a1, v1] = k[i + 1];
    const t = (A - a0) / (a1 - a0);
    const vm1 = i > 0 ? k[i - 1][1] : v0;
    const v2 = i + 2 < k.length ? k[i + 2][1] : v1;
    const h = hermite(v0, v1, vm1, v2, t);
    return this.clamp(h);
  }
  clamp(v) {
    if (typeof v === 'number') return Math.min(this.max, Math.max(this.min, v));
    return v.map((x) => Math.min(this.max, Math.max(this.min, x)));
  }
}

function hermite(v0, v1, vm1, v2, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const isVec = Array.isArray(v0);
  const g = (a, b) => (isVec ? a.map((x, i) => x + (b[i] - x) * 0.5) : a + (b - a) * 0.5);
  const m0 = isVec ? v0.map((x, i) => (v1[i] - vm1[i]) * 0.5) : (v1 - vm1) * 0.5;
  const m1 = isVec ? v1.map((x, i) => (v2[i] - v0[i]) * 0.5) : (v2 - v0) * 0.5;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  if (isVec) return v0.map((x, i) => h00 * x + h10 * m0[i] + h01 * v1[i] + h11 * m1[i]);
  return h00 * v0 + h10 * m0 + h01 * v1 + h11 * m1;
}

/** 摄影机在极坐标上绕腕表运动：方位角(自 +Z 向 +X)、仰角、半径 */
const AZ = new Track([
  [0.0, -6],
  [0.5, -3],
  [1.0, 2],
  [1.5, 20],
  [2.0, 44],
  [2.5, 92],
  [3.0, 142],
  [3.5, 158],
  [3.8, 168],
  [4.2, 186],
  [4.6, 214],
  [5.0, 248],
  [5.4, 300],
  [5.8, 352],
  [6.0, 348],
]);
const EL = new Track([
  [0.0, 7],
  [0.5, 8],
  [1.0, 9],
  [1.6, 5],
  [2.2, -2],
  [2.8, -8],
  [3.3, -10],
  [3.7, -7],
  [4.1, -2],
  [4.6, 4],
  [5.1, 7],
  [5.6, 5],
  [6.0, 3],
]);
const RADIUS = new Track([
  [0.0, 268],
  [0.35, 190],
  [0.8, 158],
  [1.3, 152],
  [1.8, 168],
  [2.2, 192],
  [2.6, 200],
  [3.0, 186],
  [3.35, 140],
  [3.6, 104],
  [3.85, 96],
  [4.05, 106],
  [4.3, 128],
  [4.7, 140],
  [5.1, 154],
  [5.5, 176],
  [6.0, 196],
]);
const FOV = new Track([
  [0.0, 25],
  [0.5, 27],
  [1.2, 29],
  [2.2, 30],
  [2.9, 30],
  [3.3, 27],
  [3.6, 24],
  [3.9, 24],
  [4.3, 27],
  [5.0, 29],
  [5.6, 30],
  [6.0, 30],
]);
const TARGET_Z = new Track([
  [0.0, -2],
  [2.4, -3],
  [3.0, -5.6],
  [3.5, -6.6],
  [3.9, -6.4],
  [4.2, -4.6],
  [4.6, -2.6],
  [5.2, -1.8],
  [6.0, -1.4],
]);
/** 第 4 幕把镜头目标向右偏，使机芯落在画面左侧、避开右侧读数面板 */
const TARGET_X = new Track([
  [0.0, 0],
  [2.6, 0],
  [3.2, 1.6],
  [3.9, 2.4],
  [4.3, 1.0],
  [4.7, 0],
  [6.0, 0],
]);
const TARGET_Y = new Track([
  [0.0, 0],
  [2.0, 0.3],
  [3.2, -0.4],
  [3.8, -0.6],
  [4.4, 0],
  [5.0, 0],
  [5.4, -4.0],
  [5.8, -12.0],
  [6.0, -18.0],
]);
/** 腕表自身姿态：小幅自转 + 分解阶段前倾，便于看清层与层之间的分离 */
const ROT_Y = new Track([
  [0.0, -0.42],
  [0.6, -0.1],
  [1.2, 0.26],
  [2.0, -0.16],
  [2.6, 0.06],
  [3.2, 0.14],
  [4.0, -0.06],
  [4.8, 0.22],
  [5.6, 0.1],
  [6.0, 0.04],
]);
const ROT_X = new Track([
  [0.0, 0],
  [1.9, 0],
  [2.4, 0.5],
  [3.4, 0.62],
  [4.0, 0.4],
  [4.6, 0],
  [6.0, 0],
]);
const EXPLODE = new Track(
  [
    [0.0, 0],
    [1.95, 0],
    [2.2, 0.22],
    [2.6, 0.62],
    [3.0, 1],
    [4.25, 1],
    [4.5, 0.72],
    [4.85, 0.1],
    [5.1, 0],
    [6.0, 0],
  ],
  { min: 0, max: 1 }
);
const STAGGER = new Track([
  [0.0, 1],
  [4.25, 1],
  [4.9, 0.42],
  [6.0, 0.42],
]);
const REVEAL = new Track(
  [
    [0.0, 0],
    [0.12, 0.04],
    [0.34, 0.42],
    [0.62, 0.86],
    [0.95, 1],
    [6.0, 1],
  ],
  { min: 0, max: 1 }
);
const FADE = new Track(
  [
    [0.0, 0.72],
    [0.12, 0.4],
    [0.32, 0.08],
    [0.5, 0],
    [6.0, 0],
  ],
  { min: 0, max: 1 }
);
const LIGHT = new Track(
  [
    [0.0, 0.34],
    [0.25, 0.58],
    [0.6, 0.9],
    [1.0, 1],
    [6.0, 1],
  ],
  { min: 0, max: 1.2 }
);
const BLOOM = new Track([
  [0.0, 0.2],
  [0.6, 0.34],
  [2.4, 0.44],
  [3.6, 0.5],
  [4.8, 0.4],
  [6.0, 0.34],
]);
const GRAIN = new Track([
  [0.0, 0.075],
  [0.6, 0.05],
  [2.4, 0.052],
  [3.6, 0.044],
  [5.0, 0.036],
  [6.0, 0.03],
]);
const VIGNETTE = new Track([
  [0.0, 0.78],
  [1.0, 0.62],
  [3.6, 0.58],
  [6.0, 0.66],
]);

export function sampleTimeline(A) {
  const az = AZ.at(A) * DEG;
  const el = EL.at(A) * DEG;
  const r = RADIUS.at(A);
  const camPos = new THREE.Vector3(Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r, Math.cos(az) * Math.cos(el) * r);
  const target = new THREE.Vector3(TARGET_X.at(A), TARGET_Y.at(A), TARGET_Z.at(A));
  return {
    act: Math.min(ACTS.length - 1, Math.floor(A)),
    actLocal: A - Math.floor(A),
    camPos,
    target,
    fov: FOV.at(A),
    rotY: ROT_Y.at(A),
    rotX: ROT_X.at(A),
    explode: EXPLODE.at(A),
    stagger: STAGGER.at(A),
    reveal: REVEAL.at(A),
    fade: FADE.at(A),
    light: LIGHT.at(A),
    bloom: BLOOM.at(A),
    grain: GRAIN.at(A),
    vignette: VIGNETTE.at(A),
    azimuth: az,
    elevation: el,
    radius: r,
  };
}
