// 传动与布局自检：node scripts/check-train.mjs
// 完整报告写入 docs/train-check.txt（UTF-8），stdout 只输出计数，避免 PowerShell 中文乱码
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTrain, TRAIN, CALIBRE, sampleTrain, planeParts, formatRate } from '../js/watch/train.js';
import { MOVEMENT } from '../js/watch/dimensions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const L = [];
const line = (s = '') => L.push(s);

line(`# AURELIS ${CALIBRE.name} 传动自检`);
line(`生成时间：${new Date().toISOString()}`);
line(`机芯：${CALIBRE.brand} ${CALIBRE.name} · ${CALIBRE.type} · ${CALIBRE.beatHz} Hz（${CALIBRE.vph} 次/小时）· ${CALIBRE.jewels} 颗宝石轴承 · ${CALIBRE.powerReserveHours} 小时动力储存`);
line('');
line('## 检查项');
const checks = validateTrain();
for (const c of checks) line(`- [${c.ok ? 'PASS' : 'FAIL'}] ${c.label} — ${c.detail}`);
line('');

line('## 轴系布局（机芯局部坐标，mm）');
line('| 轴 | 轮齿数 | 小齿轮叶片 | 位置 x | 位置 y | 层 | 转速(真值) | 旋向(自桥板侧) |');
line('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const a of TRAIN.arbors) {
  line(
    `| ${a.label} | ${a.wheel.teeth}${a.wheel.escape ? '（擒纵轮）' : ''} | ${a.pinion ? a.pinion.leaves : '—'} | ${a.pos[0].toFixed(3)} | ${a.pos[1].toFixed(3)} | ${a.levelWheel} | ${formatRate(a.rateAbs)} | ${a.dir > 0 ? '逆时针' : '顺时针'} |`
  );
}
line(`| 摆轮 | — | — | ${TRAIN.balance.pos[0].toFixed(3)} | ${TRAIN.balance.pos[1].toFixed(3)} | 摆轮层 z=${MOVEMENT.balanceRim} | ${CALIBRE.beatHz} Hz | 往复 ±${TRAIN.balance.amplitudeDeg}° |`);
line(`| 擒纵叉 | — | — | ${TRAIN.pallet.pos[0].toFixed(3)} | ${TRAIN.pallet.pos[1].toFixed(3)} | z=${MOVEMENT.levels.D} | 每拍换向 | 往复 ±${TRAIN.pallet.rockDeg}° |`);
line('');

line('## 传动比推导');
let rate = CALIBRE.barrelRateRevPerHour;
let dir = 1;
line(`- 发条盒：给定 ${rate} 转/小时（${CALIBRE.barrelTurns} 转 ÷ ${CALIBRE.powerReserveHours} 小时）`);
for (let i = 1; i < TRAIN.arbors.length; i++) {
  const prev = TRAIN.arbors[i - 1];
  const a = TRAIN.arbors[i];
  rate = (rate * prev.wheel.teeth) / a.pinion.leaves;
  dir = -dir;
  line(`- ${a.label}：${prev.wheel.teeth} ÷ ${a.pinion.leaves} = ${(prev.wheel.teeth / a.pinion.leaves).toFixed(4)} 倍 → ${rate} 转/小时，${dir > 0 ? '逆时针' : '顺时针'}`);
}
line('');

line('## 两档显示节拍');
for (const key of ['showcase', 'real']) {
  const s = sampleTrain(12.5, key);
  line(`### ${s.mode.label}（${s.mode.note}）`);
  line('| 部件 | 齿数 | 实际转速 | 显示转速 | 旋向 |');
  line('| --- | --- | --- | --- | --- |');
  for (const r of s.rows) line(`| ${r.label} | ${r.teeth} | ${r.trueRate} | ${r.displayRate} | ${r.dirText} |`);
  line(`| 摆轮 | — | ${s.balance.trueHz} Hz | ${s.balance.displayHz} Hz | 往复 |`);
  line('');
}

line('## 零件清单（平面碰撞校验范围）');
line('| 零件 | 半径 mm | Z 区间 | 类型 |');
line('| --- | --- | --- | --- |');
for (const p of planeParts()) {
  line(`| ${p.id} | ${p.r.toFixed(2)} | ${p.z[0].toFixed(2)} ~ ${p.z[1].toFixed(2)} | ${p.kind} |`);
}

mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'train-check.txt'), L.join('\n'), 'utf8');

const failed = checks.filter((c) => !c.ok);
console.log(`checks=${checks.length} pass=${checks.length - failed.length} fail=${failed.length}`);
console.log(`report=docs/train-check.txt`);
if (failed.length) {
  for (const f of failed) console.log(`FAIL: ${f.label}`);
  process.exit(1);
}
