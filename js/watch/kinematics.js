// 渐开线齿轮的纯数学部分（不依赖 three，可被 Node 脚本直接引用做校验）

const DEG = Math.PI / 180;

/** 渐开线函数：半径 r 处的展开角 */
export function involute(r, rBase) {
  const k = Math.max(1 + 1e-6, r / rBase);
  return Math.sqrt(k * k - 1) - Math.acos(1 / k);
}

export function gearMetrics({ teeth, module: m, pressureAngle = 20 }) {
  const rPitch = (m * teeth) / 2;
  const rBase = rPitch * Math.cos(pressureAngle * DEG);
  return {
    teeth,
    module: m,
    rPitch,
    rBase,
    rAdd: rPitch + m,
    rDed: rPitch - 1.25 * m,
    halfAngle: Math.PI / (2 * teeth),
    invP: involute(rPitch, rBase),
  };
}

/** 啮合中心距：两齿轮模数相同时 = m(z1+z2)/2 */
export function centerDistance(m, teethA, teethB) {
  return (m * (teethA + teethB)) / 2;
}

/**
 * 啮合相位：齿中线固定在局部角 0°。
 * A 的齿指向 B，B 的齿槽指向 A，于是齿轮角 φ = rot0 ± θ·(zA/zB)。
 */
export function meshPhase(posA, posB, teethA, teethB) {
  const phiAB = Math.atan2(posB[1] - posA[1], posB[0] - posA[0]);
  const phiBA = phiAB + Math.PI;
  return { phiAB, rotA: phiAB, rotB: phiBA - Math.PI / teethB };
}
