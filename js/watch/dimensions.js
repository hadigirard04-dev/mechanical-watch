// 尺寸与层高：全部以毫米为单位，1 世界单位 = 1 mm
// 世界 Z 约定：+Z 为正面（表镜/盘面方向），−Z 为背面（底盖方向）

export const CASE = {
  radius: 20.0, // 表壳外径 40 mm
  bezelOuter: 20.0,
  bezelInner: 16.2,
  crystalR: 16.2, // 蓝宝石表镜直径 32.4 mm
  crystalT: 0.9,
  dialR: 15.8,
  dialT: 0.5,
  movementR: 14.3, // 机芯直径 28.6 mm
  lugToLug: 46.0,
  strapWidth: 20.0,
  crownR: 2.35,
  crownOuter: 23.6,
  crownZ: -5.0,
  caseHeight: 10.15,
};

export const Z = {
  crystal: [-1.50, -0.60],
  bezel: [-1.85, -0.45],
  handSecond: -2.30,
  handMinute: -2.45,
  handHour: -2.60,
  dial: [-3.30, -2.80],
  caseband: [-9.90, -0.35],
  caseback: [-10.60, -9.80],
  casebackGlass: [-9.95, -9.80],
  ground: -26.0,
  // 机芯整体：局部 z=0（主夹板朝向盘面的一侧）位于世界 z = -3.5，
  // 且整体绕 Y 轴翻转 180°，于是“桥板与摆轮朝向底盖”——与真表一致。
  movementOriginZ: -3.50,
};

// 机芯局部坐标（+Z 由主夹板指向桥板；经 ±Z 翻转后朝向世界 −Z）
// 层高按真表比例压缩：主夹板 0.8 → 条盒鼓 0.85~2.45 → 轮系 4 层 → 桥板 → 摆轮 → 摆夹板
export const MOVEMENT = {
  levels: { A: 1.40, B: 2.65, C: 2.95, D: 3.25, E: 3.55 }, // A 条盒齿/二番小齿轮 … E 擒纵轮/擒纵叉
  plate: [0.0, 0.80],
  wheelT: 0.18,
  wheelZ: 0.09, // 轮片上下各 0.09
  pinionDrop: 0.15, // 小齿轮体向下延伸（细轴另计，不参与平面校验）
  pinionUp: 0.09,
  drum: [0.85, 2.45],
  drumR: 5.85,
  ratchetZ: 2.59,
  bridges: [3.70, 4.40],
  balanceRim: 4.80,
  balanceRimH: 0.60,
  balanceRimOuter: 4.50,
  balanceRimInner: 3.78,
  hairspringZ: 5.15,
  cock: [5.30, 5.95],
  staff: [3.40, 5.45],
  jewelR: 0.34,
};

/** 机芯局部 z → 世界 z */
export const localToWorldZ = (zLocal) => Z.movementOriginZ - zLocal;
