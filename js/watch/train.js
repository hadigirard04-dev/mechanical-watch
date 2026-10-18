// 机芯与传动：齿数、中心距、旋向、转速全部由齿数推导；本文件不依赖 three，可被 Node 直接校验。
//
// 传动链（自桥板侧看，旋向逐级交替）：
//   发条盒 88 → 二番车小齿轮 11（二番车 64）→ 三番车小齿轮 8（三番车 60）
//   → 四番车小齿轮 8（四番车 60，即秒轮）→ 擒纵小齿轮 5（擒纵轮 20 齿）
// 4 Hz = 8 次/秒 = 28 800 次/小时；擒纵轮 720 转/小时 × 20 齿 × 2 = 28 800 ✓

import { gearMetrics, centerDistance, meshPhase } from './kinematics.js';
import { MOVEMENT } from './dimensions.js';
import { circleHullPolygon, convexOverlap, polygonMaxRadius } from './hull.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export const CALIBRE = {
  brand: 'AURELIS',
  name: 'AU-07',
  type: '手动上链',
  beatHz: 4,
  vph: 28800,
  jewels: 27,
  powerReserveHours: 42,
  barrelTurns: 5.25,
  barrelRateRevPerHour: 1 / 8, // 5.25 转 ÷ 42 小时 = 1/8 转/小时，与动力储存自洽
};

const CHAIN = [
  {
    id: 'barrel',
    label: '发条盒',
    en: 'Barrel',
    wheel: { teeth: 88, module: 0.13 },
    pinion: null,
    levelWheel: 'A',
    from: null,
    bearing: 152,
  },
  {
    id: 'center',
    label: '二番车（中心轮）',
    en: 'Centre wheel',
    wheel: { teeth: 64, module: 0.13 },
    pinion: { leaves: 11, module: 0.13 },
    levelWheel: 'B',
    levelPinion: 'A',
    from: 'barrel',
    bearing: -28,
  },
  {
    id: 'third',
    label: '三番车',
    en: 'Third wheel',
    wheel: { teeth: 60, module: 0.13 },
    pinion: { leaves: 8, module: 0.13 },
    levelWheel: 'C',
    levelPinion: 'B',
    from: 'center',
    bearing: -60,
  },
  {
    id: 'fourth',
    label: '四番车（秒轮）',
    en: 'Fourth wheel',
    wheel: { teeth: 60, module: 0.14 },
    pinion: { leaves: 8, module: 0.14 },
    levelWheel: 'D',
    levelPinion: 'C',
    from: 'third',
    bearing: -35,
  },
  {
    id: 'escape',
    label: '擒纵轮',
    en: 'Escape wheel',
    wheel: { teeth: 20, radius: 1.55, escape: true },
    pinion: { leaves: 5, module: 0.14 },
    levelWheel: 'E',
    levelPinion: 'D',
    from: 'fourth',
    bearing: 105,
  },
];

export const ESCAPEMENT = {
  balance: { id: 'balance', label: '摆轮', en: 'Balance', bearingFromEscape: -104, distance: 4.4, amplitudeDeg: 270 },
  pallet: { id: 'pallet', label: '擒纵叉', en: 'Pallet fork', bearingFromEscape: -104, distance: 2.2, rockDeg: 4.6 },
  escapeTeeth: 20,
};

const CLICK = { pivot: [-2.75, 5.05], tip: [0, 0], radius: 1.15 };

function buildTrain() {
  const byId = {};
  const arbors = [];

  // 1) 位置：中心距由模数与齿数决定，方向由 bearing 给出
  for (const item of CHAIN) {
    const a = { ...item, pos: [0, 0], wheelPhase: 0, pinionPhase: 0 };
    if (item.from) {
      const prev = byId[item.from];
      const d = centerDistance(item.pinion.module, prev.wheel.teeth, item.pinion.leaves);
      const b = item.bearing * DEG;
      a.pos = [prev.pos[0] + Math.cos(b) * d, prev.pos[1] + Math.sin(b) * d];
      a.meshDistance = d;
      a.meshParent = prev.id;
    }
    byId[a.id] = a;
    arbors.push(a);
  }
  // 2) 把二番车平移到原点（与表盘中心对齐）
  const c = byId.center;
  const dx = c.pos[0];
  const dy = c.pos[1];
  for (const a of arbors) a.pos = [a.pos[0] - dx, a.pos[1] - dy];

  // 3) 啮合相位
  for (let i = 1; i < arbors.length; i++) {
    const prev = arbors[i - 1];
    const a = arbors[i];
    const ph = meshPhase(prev.pos, a.pos, prev.wheel.teeth, a.pinion.leaves);
    prev.wheelPhase = ph.rotA;
    a.pinionPhase = ph.rotB;
  }

  // 4) 转速与旋向：逐级交替，数值由齿数比推导
  let rate = CALIBRE.barrelRateRevPerHour;
  let dir = 1;
  arbors.forEach((a, i) => {
    if (i > 0) {
      rate = (rate * arbors[i - 1].wheel.teeth) / a.pinion.leaves;
      dir = -dir;
    }
    a.rateAbs = rate; // 转/小时（无符号）
    a.dir = dir; // +1 = 逆时针（自桥板侧看）
    a.rate = rate * dir;
  });

  // 5) 半径（含齿顶）
  for (const a of arbors) {
    if (a.wheel.escape) {
      a.wheelOuterR = a.wheel.radius;
    } else {
      a.wheelMetrics = gearMetrics({ teeth: a.wheel.teeth, module: a.wheel.module });
      a.wheelOuterR = a.wheelMetrics.rAdd;
    }
    a.pinionMetrics = a.pinion ? gearMetrics({ teeth: a.pinion.leaves, module: a.pinion.module }) : null;
    a.pinionOuterR = a.pinionMetrics ? a.pinionMetrics.rAdd : 0;
    a.wheelZ = MOVEMENT.levels[a.levelWheel];
    a.pinionZ = MOVEMENT.levels[a.levelPinion];
  }

  // 6) 擒纵系统
  const esc = byId.escape;
  const b0 = ESCAPEMENT.balance.bearingFromEscape * DEG;
  const balancePos = [
    esc.pos[0] + Math.cos(b0) * ESCAPEMENT.balance.distance,
    esc.pos[1] + Math.sin(b0) * ESCAPEMENT.balance.distance,
  ];
  const palletPos = [
    esc.pos[0] + Math.cos(b0) * ESCAPEMENT.pallet.distance,
    esc.pos[1] + Math.sin(b0) * ESCAPEMENT.pallet.distance,
  ];
  const forkBearing = Math.atan2(balancePos[1] - palletPos[1], balancePos[0] - palletPos[0]);
  // 擒纵轮初相位：让一个齿正对擒纵叉方向
  esc.wheelPhase = Math.atan2(palletPos[1] - esc.pos[1], palletPos[0] - esc.pos[0]) + Math.PI / esc.wheel.teeth;

  // 7) 桥板外形锚点（圆集合凸包），同时用于碰撞校验
  const barrelPos = byId.barrel.pos;
  const bridges = [
    {
      id: 'barrelBridge',
      label: '条盒轮夹板',
      anchors: [
        [barrelPos[0], barrelPos[1], 2.45],
        [CLICK.pivot[0], CLICK.pivot[1], 1.05],
        [-10.55, 1.7, 1.45],
        [-7.9, 7.05, 1.35],
      ],
    },
    {
      id: 'trainBridge',
      label: '轮系夹板',
      anchors: [
        [byId.center.pos[0], byId.center.pos[1], 1.5],
        [byId.third.pos[0], byId.third.pos[1], 1.85],
        [byId.fourth.pos[0], byId.fourth.pos[1], 1.85],
        [esc.pos[0], esc.pos[1], 1.45],
      ],
    },
    {
      id: 'balanceCock',
      label: '摆轮夹板',
      anchors: [
        [balancePos[0], balancePos[1], 2.25],
        [7.35, -0.95, 1.55],
      ],
    },
  ];
  for (const b of bridges) {
    b.poly = circleHullPolygon(b.anchors, 30);
    b.center = b.anchors[0].slice(0, 2);
    b.r = Math.max(...b.anchors.map((a) => Math.hypot(a[0] - b.center[0], a[1] - b.center[1]) + a[2]));
  }

  // 8) 摆轮夹板支柱（从主夹板顶面伸到夹板）
  const post = { pos: [7.35, -0.95], r: 0.42, z: [MOVEMENT.plate[1], MOVEMENT.cock[0]] };

  return {
    arbors,
    byId,
    barrel: byId.barrel,
    center: byId.center,
    third: byId.third,
    fourth: byId.fourth,
    escape: esc,
    balance: { ...ESCAPEMENT.balance, pos: balancePos },
    pallet: { ...ESCAPEMENT.pallet, pos: palletPos, forkBearing },
    click: { ...CLICK, pos: CLICK.pivot },
    bridges,
    post,
    plateR: 14.3,
  };
}

export const TRAIN = buildTrain();

/** 参与平面碰撞校验的零件（凸多边形 + z 区间） */
export function planeParts() {
  const parts = [];
  const circle = (id, pos, r, z, kind, extra = {}) => ({
    id,
    pos,
    r,
    z,
    kind,
    poly: circleHullPolygon([[pos[0], pos[1], r]], 32),
    ...extra,
  });

  for (const a of TRAIN.arbors) {
    parts.push(
      circle(
        `${a.id}:wheel`,
        a.pos,
        a.wheelOuterR,
        [a.wheelZ - MOVEMENT.wheelZ, a.wheelZ + MOVEMENT.wheelZ],
        'wheel',
        { arbor: a.id, mesh: a.meshParent ? [`${a.meshParent}:wheel`] : [] }
      )
    );
    if (!a.pinion) continue;
    parts.push(
      circle(
        `${a.id}:pinion`,
        a.pos,
        a.pinionOuterR,
        [a.pinionZ - MOVEMENT.pinionDrop, a.pinionZ + MOVEMENT.pinionUp],
        'pinion',
        { arbor: a.id, mesh: a.meshParent ? [`${a.meshParent}:wheel`] : [] }
      )
    );
  }  // 条盒鼓壁：齿带之上的一段（齿带本身即 barrel:wheel，与二番小齿轮啮合）
  parts.push(
    circle('barrel:drumWall', TRAIN.barrel.pos, MOVEMENT.drumR, [MOVEMENT.levels.A + MOVEMENT.wheelZ + 0.06, MOVEMENT.drum[1]], 'drum', { arbor: 'barrel' })
  );
  parts.push(
    circle('barrel:ratchet', TRAIN.barrel.pos, 1.76, [MOVEMENT.ratchetZ - 0.07, MOVEMENT.ratchetZ + 0.07], 'ratchet', {
      arbor: 'barrel',
      contact: ['click'],
    })
  );
  parts.push(
    circle('click', TRAIN.click.pos, TRAIN.click.radius, [MOVEMENT.ratchetZ - 0.07, MOVEMENT.ratchetZ + 0.07], 'click', {
      contact: ['barrel:ratchet'],
    })
  );
  parts.push(
    circle(
      'balance',
      TRAIN.balance.pos,
      MOVEMENT.balanceRimOuter,
      [MOVEMENT.balanceRim - MOVEMENT.balanceRimH / 2, MOVEMENT.balanceRim + MOVEMENT.balanceRimH / 2],
      'balance'
    )
  );
  parts.push(
    circle('pallet', TRAIN.pallet.pos, 1.25, [MOVEMENT.levels.E - MOVEMENT.wheelZ, MOVEMENT.levels.E + MOVEMENT.wheelZ], 'pallet', {
      contact: ['escape:wheel'],
    })
  );
  parts.push(
    circle('balancePost', TRAIN.post.pos, TRAIN.post.r, [MOVEMENT.plate[1], MOVEMENT.cock[0] + 0.05], 'post', {
      contact: ['bridge:balanceCock'],
    })
  );
  for (const b of TRAIN.bridges) {
    const z = b.id === 'balanceCock' ? MOVEMENT.cock : MOVEMENT.bridges;
    parts.push({ id: `bridge:${b.id}`, pos: b.center, r: b.r, z, kind: 'bridge', poly: b.poly });
  }
  return parts;
}

function zOverlap(a, b) {
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  return { overlap: hi - lo, gap: lo - hi };
}

/** 传动与布局自检：返回检查项列表 */
export function validateTrain() {
  const out = [];
  const A = TRAIN.arbors;
  const push = (ok, label, detail) => out.push({ ok: !!ok, label, detail });

  // 1) 啮合中心距 = 模数 ×（齿数 + 齿数）/ 2
  let maxErr = 0;
  for (let i = 1; i < A.length; i++) {
    const d = Math.hypot(A[i].pos[0] - A[i - 1].pos[0], A[i].pos[1] - A[i - 1].pos[1]);
    maxErr = Math.max(maxErr, Math.abs(d - A[i].meshDistance));
  }
  push(maxErr < 1e-9, '啮合中心距与模数齿数一致', `最大误差 ${maxErr.toExponential(2)} mm`);

  // 2) 二番车 1 转/小时、四番车 1 转/分钟
  const cRate = A.find((a) => a.id === 'center').rateAbs;
  const fRate = A.find((a) => a.id === 'fourth').rateAbs;
  push(Math.abs(cRate - 1) < 1e-12, '二番车 = 1 转/小时', `${cRate.toFixed(6)} 转/小时`);
  push(Math.abs(fRate - 60) < 1e-9, '四番车 = 1 转/分钟（秒轮）', `${fRate.toFixed(3)} 转/小时 = 1 转/分钟`);

  // 3) 擒纵轮速率 × 齿数 × 2 = 28 800 次/小时
  const eRate = A.find((a) => a.id === 'escape').rateAbs;
  const vph = eRate * ESCAPEMENT.escapeTeeth * 2;
  push(Math.abs(vph - CALIBRE.vph) < 1e-6, '擒纵轮速率 × 齿数 × 2 = 28 800 次/小时', `${eRate} 转/小时 × 20 齿 × 2 = ${vph}`);

  // 4) 动力储存自洽
  const hours = CALIBRE.barrelTurns / CALIBRE.barrelRateRevPerHour;
  push(Math.abs(hours - CALIBRE.powerReserveHours) < 1e-9, '发条盒 5.25 转 = 42 小时动力储存', `${hours} 小时`);

  // 5) 旋向逐级交替
  let alt = true;
  for (let i = 1; i < A.length; i++) if (A[i].dir === A[i - 1].dir) alt = false;
  push(alt, '旋向逐级交替（相邻啮合齿轮反向）', A.map((a) => `${a.id}:${a.dir > 0 ? '↺' : '↻'}`).join(' '));

  // 6) 平面/Z 冲突：不啮合、不同轴的零件若平面重叠则必须 Z 分离
  const parts = planeParts();
  const problems = [];
  let checkedPairs = 0;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const p = parts[i];
      const q = parts[j];
      if (p.arbor && p.arbor === q.arbor) continue;
      if ((p.mesh || []).includes(q.id) || (q.mesh || []).includes(p.id)) continue;
      if ((p.contact || []).includes(q.id) || (q.contact || []).includes(p.id)) continue;
      checkedPairs++;
      if (!convexOverlap(p.poly, q.poly)) continue;
      const z = zOverlap(p.z, q.z);
      if (z.overlap > -0.03) problems.push(`${p.id} × ${q.id}（平面重叠，Z 间隙 ${(-z.overlap).toFixed(2)} mm）`);
    }
  }
  push(problems.length === 0, `同层零件无冲突（检查 ${checkedPairs} 对）`, problems.length ? problems.join('；') : '全部满足“平面重叠则 Z 分离”');

  // 7) 所有零件在机芯半径内
  const outside = parts
    .filter((p) => polygonMaxRadius(p.poly) > TRAIN.plateR - 0.05)
    .map((p) => `${p.id}(${polygonMaxRadius(p.poly).toFixed(2)} > ${TRAIN.plateR})`);
  push(outside.length === 0, `全部零件在机芯半径 ${TRAIN.plateR} mm 内`, outside.length ? outside.join('；') : '通过');

  return out;
}

export const DISPLAY_MODES = {
  showcase: {
    key: 'showcase',
    label: '展示倍速 ×60',
    wheelMag: 60,
    escapeRevPerSec: 2, // 限频：避免采样混叠
    oscHz: 1.1, // 摆轮/擒纵叉显示频率（真实 4 Hz）
    note: '便于观察：轮系 ×60；擒纵为限频显示',
  },
  real: {
    key: 'real',
    label: '真实节拍 ×1',
    wheelMag: 1,
    escapeRevPerSec: null, // 用真值
    oscHz: CALIBRE.beatHz,
    note: '真值：摆轮 4 Hz（每秒 8 次），四番车 1 转/分钟',
  },
};

/** 平滑阶跃：一拍之内快速前进后保持（擒纵轮的“跳齿”手感） */
function stepEase(f) {
  const t = Math.min(1, Math.max(0, f / 0.34));
  return t * t * (3 - 2 * t);
}

/** 采样某一时刻的传动状态。t 单位为秒。
 *  返回的是各零件相对初始相位的“增量角”，初始啮合相位保存在零件自身基准变换里。 */
export function sampleTrain(t, modeKey = 'showcase') {
  const mode = DISPLAY_MODES[modeKey] ?? DISPLAY_MODES.showcase;
  const arbors = {};
  const rows = [];

  for (const a of TRAIN.arbors) {
    // 注意：a.rate 带符号，这里必须用 rateAbs，方向只乘一次（否则所有轮子会同向旋转）
    const revPerSec = (a.rateAbs / 3600) * mode.wheelMag;
    let delta;
    if (a.id === 'escape') {
      // 擒纵轮与擒纵小齿轮同轴：整根轴按拍跳齿。
      // 20 齿 + 两个叉瓦 = 每转 40 拍，因此每拍前进 1/(2·齿数) 转。
      const dRevPerSec = mode.escapeRevPerSec ?? revPerSec;
      const beatsPerSec = dRevPerSec * a.wheel.teeth * 2;
      const beats = beatsPerSec * t;
      const k = Math.floor(beats);
      const frac = beats - k;
      delta = a.dir * ((k + stepEase(frac)) / (a.wheel.teeth * 2)) * TAU;
    } else {
      delta = a.dir * revPerSec * TAU * t;
    }
    arbors[a.id] = { delta, revPerSec };
    rows.push({
      id: a.id,
      label: a.label,
      teeth: a.wheel.teeth,
      leaves: a.pinion ? a.pinion.leaves : null,
      dir: a.dir,
      dirText: a.dir > 0 ? '逆时针 ↺' : '顺时针 ↻',
      trueRate: formatRate(a.rateAbs, 'hour'),
      displayRate: formatRate(revPerSec * 3600, 'hour'),
      displayMag: mode.wheelMag,
    });
  }

  // 摆轮 / 擒纵叉
  const f = mode.oscHz;
  const phase = TAU * f * t;
  return {
    mode,
    arbors,
    escape: arbors.escape,
    balance: {
      angle: ESCAPEMENT.balance.amplitudeDeg * DEG * Math.sin(phase),
      amplitudeDeg: ESCAPEMENT.balance.amplitudeDeg,
      breath: 0.09 * Math.sin(phase),
      displayHz: f,
      trueHz: CALIBRE.beatHz,
    },
    pallet: { rock: ESCAPEMENT.pallet.rockDeg * DEG * Math.cos(phase) },
    rows,
  };
}

/** 转速格式化 */
export function formatRate(rate, unit = 'hour') {
  if (!rate) return '静止';
  const perHour = rate;
  if (perHour >= 3600) return `${(perHour / 3600).toFixed(2)} 转/秒`;
  if (perHour >= 60) {
    const perMin = perHour / 60;
    return `${perMin % 1 === 0 ? perMin : perMin.toFixed(2)} 转/分钟`;
  }
  if (perHour >= 1) return `${perHour % 1 === 0 ? perHour : perHour.toFixed(2)} 转/小时`;
  const period = 1 / perHour;
  return `1 转/${period % 1 === 0 ? period : period.toFixed(1)} 小时`;
}
