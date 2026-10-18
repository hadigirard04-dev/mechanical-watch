// 纯 2D 几何工具：凸包、圆集合外形、凸多边形相交判定（用于桥板外形与碰撞校验）

export function hull2D(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** 一组圆（[x,y,r]）的并集外形，用采样点凸包近似 */
export function circleHullPolygon(circles, samples = 28) {
  const pts = [];
  for (const [x, y, r] of circles) {
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
  }
  return hull2D(pts);
}

/** 两个凸多边形是否相交（分离轴定理，两者轴集合都要测） */
export function convexOverlap(polyA, polyB) {
  const axisTest = (poly) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const nx = -(b[1] - a[1]);
      const ny = b[0] - a[0];
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const p of polyA) {
        const d = p[0] * nx + p[1] * ny;
        if (d < minA) minA = d;
        if (d > maxA) maxA = d;
      }
      for (const p of polyB) {
        const d = p[0] * nx + p[1] * ny;
        if (d < minB) minB = d;
        if (d > maxB) maxB = d;
      }
      if (maxA < minB || maxB < minA) return false;
    }
    return true;
  };
  return axisTest(polyA) && axisTest(polyB);
}

export const polygonMaxRadius = (poly) => poly.reduce((m, p) => Math.max(m, Math.hypot(p[0], p[1])), 0);
