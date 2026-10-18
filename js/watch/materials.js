// 材质与程序化贴图：金属、蓝钢、红宝石、蓝宝石镜面、皮革，以及盘面/机芯装饰纹理
// 所有贴图都在浏览器里用 canvas 现画，页面运行时不请求任何外部资源。

import * as THREE from 'three';

export const PALETTE = {
  bg: 0x06070a,
  steel: 0xc6cad1,
  steelDark: 0x8b9099,
  gold: 0xd8b25e,
  roseGold: 0xd8a179,
  blue: 0x1d3a68,
  ruby: 0x9d1030,
  dial: 0x171a1f,
  leather: 0x2b1c14,
  accent: 0xe8b64c,
};

function canvas2d(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, x: c.getContext('2d') };
}

function tex(canvas, { srgb = false, wrap = THREE.ClampToEdgeWrapping, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = wrap;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/** 沿圆弧排字 */
function arcText(ctx, text, cx, cy, radius, { size = 26, font = 'Georgia, serif', color = '#fff', center = -Math.PI / 2, tracking = 2 } = {}) {
  ctx.save();
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width + tracking);
  const total = widths.reduce((a, b) => a + b, 0);
  let a = center - total / radius / 2;
  for (let i = 0; i < chars.length; i++) {
    a += widths[i] / 2 / radius;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    a += widths[i] / 2 / radius;
  }
  ctx.restore();
}

/** 放射状拉丝（日内瓦风格的太阳纹）：用作粗糙度贴图 */
function rayBrushTexture(size = 1024, { rings = 6, streakCount = 900, base = 0.34, vari = 0.05 } = {}) {
  const { c, x } = canvas2d(size);
  const r = size / 2;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, size, size);
  const g = x.createRadialGradient(r, r, r * 0.1, r, r, r);
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const v = Math.round(255 * (base + vari * Math.sin(t * Math.PI * 1.2)));
    g.addColorStop(t, `rgb(${v},${v},${v})`);
  }
  x.fillStyle = g;
  x.beginPath();
  x.arc(r, r, r, 0, Math.PI * 2);
  x.fill();
  x.save();
  x.translate(r, r);
  for (let i = 0; i < streakCount; i++) {
    const a = (i / streakCount) * Math.PI * 2;
    const r0 = r * (0.06 + Math.random() * 0.09);
    const r1 = r * (0.9 + Math.random() * 0.1);
    const v = 200 + Math.round(Math.random() * 55);
    x.strokeStyle = `rgba(${v},${v},${v},0.5)`;
    x.lineWidth = (r / 400) * (0.6 + Math.random() * 1.4);
    x.beginPath();
    x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    x.stroke();
  }
  x.restore();
  return c;
}

/** 珠圆纹（perlage）：机芯主夹板 */
function perlageTexture(tile = 512, dots = 7) {
  const { c, x } = canvas2d(tile);
  x.fillStyle = '#4a4a4a';
  x.fillRect(0, 0, tile, tile);
  const step = tile / dots;
  for (let gy = -1; gy <= dots; gy++) {
    for (let gx = -1; gx <= dots; gx++) {
      const cx = gx * step + step * 0.5 + (gy % 2 ? step * 0.5 : 0);
      const cy = gy * step + step * 0.5;
      const r = step * 0.52;
      const g = x.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.05, cx, cy, r);
      g.addColorStop(0, `rgba(150,150,150,0.85)`);
      g.addColorStop(0.65, 'rgba(110,110,110,0.55)');
      g.addColorStop(1, 'rgba(70,70,70,0.0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, cy, r, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = 'rgba(40,40,40,0.5)';
      x.lineWidth = 1.2;
      x.beginPath();
      x.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
      x.stroke();
    }
  }
  return c;
}

/** 日内瓦纹（直线波纹）：桥板端面 */
function genevaTexture(w = 512, h = 512, period = 64) {
  const { c, x } = canvas2d(w, h);
  x.fillStyle = '#606060';
  x.fillRect(0, 0, w, h);
  const g = x.createLinearGradient(0, 0, period, 0);
  g.addColorStop(0, '#3a3a3a');
  g.addColorStop(0.5, '#b4b4b4');
  g.addColorStop(1, '#3a3a3a');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // 细划痕
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * h;
    x.strokeStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(w, y + (Math.random() - 0.5) * 3);
    x.stroke();
  }
  return c;
}

/** 蓝钢螺钉头部：色图 + 粗糙度图 */
function screwTexture(size = 256) {
  const color = canvas2d(size);
  const rough = canvas2d(size);
  const r = size / 2;
  const g = color.x.createRadialGradient(r * 0.7, r * 0.65, r * 0.1, r, r, r);
  g.addColorStop(0, '#4d6ea8');
  g.addColorStop(0.5, '#22406f');
  g.addColorStop(1, '#0f2038');
  color.x.fillStyle = g;
  color.x.fillRect(0, 0, size, size);
  rough.x.fillStyle = '#303030';
  rough.x.fillRect(0, 0, size, size);
  const rg = rough.x.createRadialGradient(r * 0.7, r * 0.65, r * 0.1, r, r, r);
  rg.addColorStop(0, '#4a4a4a');
  rg.addColorStop(1, '#1e1e1e');
  rough.x.fillStyle = rg;
  rough.x.fillRect(0, 0, size, size);
  // 一字槽（45°）
  for (const ctx of [color.x, rough.x]) {
    ctx.save();
    ctx.translate(r, r);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = ctx === color.x ? '#050810' : '#0c0c0c';
    ctx.fillRect(-r * 0.92, -size * 0.045, size * 0.92 * 2, size * 0.09);
    ctx.restore();
  }
  return { color: color.c, rough: rough.c };
}

/** 盘面：太阳纹底 + 印刷分钟轨道 + 品牌文字 */
function dialTexture({ px = 2048, world = 31.6, accent = '#d9b364' } = {}) {
  const { c, x } = canvas2d(px);
  const r = px / 2;
  const P = (mm) => (mm / world) * px;
  x.fillStyle = '#262b35';
  x.fillRect(0, 0, px, px);
  // 太阳纹：以中心为原点的放射拉丝
  x.save();
  x.translate(r, r);
  for (let i = 0; i < 2600; i++) {
    const a = (i / 2600) * Math.PI * 2;
    const r0 = P(1.6);
    const r1 = P(15.9);
    const alpha = 0.025 + Math.random() * 0.1;
    x.strokeStyle = i % 2 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 1.1})`;
    x.lineWidth = P(0.05) * (0.5 + Math.random());
    x.beginPath();
    x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    x.stroke();
  }
  x.restore();
  // 边缘加深（盘面外圈台阶阴影）
  const vg = x.createRadialGradient(r, r, P(6), r, r, r);
  vg.addColorStop(0, 'rgba(255,255,255,0.05)');
  vg.addColorStop(0.62, 'rgba(0,0,0,0)');
  vg.addColorStop(0.9, 'rgba(0,0,0,0.42)');
  vg.addColorStop(1, 'rgba(0,0,0,0.72)');
  x.fillStyle = vg;
  x.fillRect(0, 0, px, px);
  // 印刷分钟轨道
  x.save();
  x.translate(r, r);
  for (let i = 0; i < 300; i++) {
    const a = (i / 300) * Math.PI * 2 - Math.PI / 2;
    const major = i % 25 === 0;
    const mid = i % 5 === 0;
    const len = major ? P(1.15) : mid ? P(0.72) : P(0.36);
    const w = major ? P(0.16) : mid ? P(0.11) : P(0.07);
    const r1 = P(15.05);
    const r0 = r1 - len;
    x.strokeStyle = major ? '#efe9df' : mid ? 'rgba(232,228,218,0.82)' : 'rgba(226,222,212,0.6)';
    x.lineWidth = w;
    x.beginPath();
    x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    x.stroke();
  }
  x.restore();
  // 文字
  x.save();
  x.textAlign = 'center';
  x.fillStyle = '#e9e3d8';
  x.font = `600 ${P(1.5)}px Georgia, "Times New Roman", serif`;
  x.textBaseline = 'middle';
  x.fillText('AURELIS', r, r - P(6.1));
  x.fillStyle = accent;
  x.font = `${P(0.78)}px "Segoe UI", Arial, sans-serif`;
  x.fillText('G E N È V E', r, r - P(4.55));
  x.fillStyle = 'rgba(226,220,208,0.78)';
  x.font = `${P(0.74)}px "Segoe UI", Arial, sans-serif`;
  x.fillText('CAL. AU-07  ·  MANUAL', r, r + P(4.5));
  x.fillText('28 800 A/H  ·  27 JEWELS', r, r + P(5.7));
  x.fillStyle = 'rgba(226,220,208,0.5)';
  x.font = `${P(0.62)}px "Segoe UI", Arial, sans-serif`;
  x.fillText('42 H', r, r + P(7.6));
  x.restore();
  return c;
}

/** 皮革（鳄鱼纹近似）：抖动网格单元 */
function leatherTexture(size = 768, cells = 11) {
  const { c, x } = canvas2d(size);
  x.fillStyle = '#241610';
  x.fillRect(0, 0, size, size);
  const pts = [];
  const step = size / cells;
  for (let gy = 0; gy <= cells; gy++) {
    const row = [];
    for (let gx = 0; gx <= cells; gx++) {
      row.push({
        x: gx * step + (Math.random() - 0.5) * step * 0.42,
        y: gy * step + (Math.random() - 0.5) * step * 0.42,
      });
    }
    pts.push(row);
  }
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const a = pts[gy][gx];
      const b = pts[gy][gx + 1];
      const d = pts[gy + 1][gx];
      const e = pts[gy + 1][gx + 1];
      const cx = (a.x + b.x + d.x + e.x) / 4;
      const cy = (a.y + b.y + d.y + e.y) / 4;
      x.beginPath();
      x.moveTo(a.x, a.y);
      x.lineTo(b.x + (Math.random() - 0.5) * 4, b.y);
      x.lineTo(e.x, e.y);
      x.lineTo(d.x, d.y + (Math.random() - 0.5) * 4);
      x.closePath();
      const g = x.createRadialGradient(cx - step * 0.2, cy - step * 0.25, step * 0.06, cx, cy, step * 0.72);
      g.addColorStop(0, '#4a3021');
      g.addColorStop(0.7, '#301f16');
      g.addColorStop(1, '#180f0a');
      x.fillStyle = g;
      x.fill();
      x.strokeStyle = 'rgba(10,6,4,0.85)';
      x.lineWidth = 2.4;
      x.stroke();
    }
  }
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(255,235,210,${Math.random() * 0.03})`;
    x.fillRect(Math.random() * size, Math.random() * size, 1.6, 1.6);
  }
  return c;
}

/** 机芯夹板铭文（端面 UV 为局部毫米坐标，用 capUV 映射） */
function movementEngravingTexture({ px = 1024, world = 8, mode = 'bridge' } = {}) {
  const { c, x } = canvas2d(px);
  const r = px / 2;
  const P = (mm) => (mm / world) * px;
  x.clearRect(0, 0, px, px);
  x.fillStyle = 'rgba(0,0,0,0)';
  x.fillRect(0, 0, px, px);
  if (mode === 'caseback') {
    x.strokeStyle = 'rgba(255,255,255,0.75)';
    x.lineWidth = P(0.09);
    x.beginPath();
    x.arc(r, r, P(world * 0.42), 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    x.arc(r, r, P(world * 0.395), 0, Math.PI * 2);
    x.stroke();
    arcText(x, 'AURELIS  ·  GENÈVE', r, r, P(world * 0.335), { size: P(0.5), tracking: P(0.12) });
    arcText(x, 'CAL. AU-07 · 27 JEWELS · 42H', r, r, P(world * 0.335), {
      size: P(0.44),
      tracking: P(0.1),
      center: Math.PI / 2,
    });
  } else {
    // 画布中心 ↔ 局部 (0,0)，配合 centeredUV 使用
    x.save();
    x.fillStyle = 'rgba(255,255,255,0.8)';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `${P(0.3)}px "Segoe UI", Arial, sans-serif`;
    x.fillText('AURELIS · AU-07', r, r - P(0.2));
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.font = `${P(0.22)}px "Segoe UI", Arial, sans-serif`;
    x.fillText('27 JEWELS', r, r + P(0.3));
    x.restore();
  }
  return c;
}

/** 端面 UV 归一化：返回贴图，使其在尺寸 world(mm) 的方形上居中 */
function centeredUV(texture, world) {
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1 / world, 1 / world);
  texture.offset.set(0.5, 0.5);
  return texture;
}

export function createTextures(renderer) {
  const aniso = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 4);
  const screw = screwTexture();
  const dial = dialTexture();
  const leather = leatherTexture();
  const perlage = perlageTexture();
  const geneva = genevaTexture();
  const ray = rayBrushTexture();
  const cb = movementEngravingTexture({ mode: 'caseback', world: 44 });
  const engBridge = movementEngravingTexture({ mode: 'bridge', world: 8 });
  return {
    dial: tex(dial, { srgb: true, aniso }),
    dialRay: tex(rayBrushTexture(1024, { base: 0.26, vari: 0.04 }), { aniso }),
    perlage: tex(perlage, { wrap: THREE.RepeatWrapping, aniso }),
    geneva: tex(geneva, { wrap: THREE.RepeatWrapping, aniso }),
    ray: tex(ray, { aniso }),
    raySoft: tex(rayBrushTexture(512, { base: 0.42, vari: 0.05, streakCount: 420 }), { aniso }),
    screwColor: tex(screw.color, { srgb: true, aniso }),
    screwRough: tex(screw.rough, { aniso }),
    leather: tex(leather, { srgb: true, wrap: THREE.RepeatWrapping, aniso }),
    caseback: centeredUV(tex(cb, { aniso }), 44),
    bridgeEngraving: centeredUV(tex(engBridge, { aniso }), 8),
    _raw: { rayBrushTexture, perlageTexture, dialTexture },
    centeredUV,
  };
}

export function createMaterials(textures, quality) {
  const physical = quality?.transmission !== false;
  const M = {};
  const mk = (params) => new THREE.MeshPhysicalMaterial(params);

  M.steel = mk({ color: PALETTE.steel, metalness: 1, roughness: 0.135, envMapIntensity: 1.25, clearcoat: 0.25, clearcoatRoughness: 0.12 });
  M.steelSatin = mk({
    color: 0xb2b6bd,
    metalness: 1,
    roughness: 0.4,
    roughnessMap: textures.raySoft,
    envMapIntensity: 0.85,
  });
  M.steelBrushed = mk({
    color: 0xb6bac1,
    metalness: 1,
    roughness: 0.38,
    roughnessMap: textures.ray,
    envMapIntensity: 0.9,
  });
  M.rhodium = mk({
    color: 0xc3c7cd,
    metalness: 1,
    roughness: 0.36,
    roughnessMap: textures.perlage,
    envMapIntensity: 0.85,
  });
  M.bridge = mk({
    color: 0xbfc3ca,
    metalness: 1,
    roughness: 0.33,
    roughnessMap: textures.geneva,
    envMapIntensity: 0.95,
  });
  M.bridgeWall = mk({ color: 0xcfd3da, metalness: 1, roughness: 0.2, envMapIntensity: 1.05 });
  M.gold = mk({ color: PALETTE.gold, metalness: 1, roughness: 0.24, envMapIntensity: 1.25, clearcoat: 0.2 });
  M.goldSatin = mk({ color: 0xd6ae5c, metalness: 1, roughness: 0.36, envMapIntensity: 1.1 });
  M.roseGold = mk({ color: PALETTE.roseGold, metalness: 1, roughness: 0.24, envMapIntensity: 1.2 });
  M.bluedSteel = mk({
    color: PALETTE.blue,
    metalness: 0.95,
    roughness: 0.16,
    envMapIntensity: 1.6,
  });
  M.screw = mk({
    color: 0x6d8dc0,
    metalness: 0.95,
    roughness: 0.2,
    envMapIntensity: 1.6,
  });
  M.screwHead = mk({
    color: 0xffffff,
    metalness: 0.95,
    roughness: 0.14,
    map: textures.screwColor,
    roughnessMap: textures.screwRough,
    envMapIntensity: 1.7,
  });
  M.ruby = mk({
    color: 0x7e0f28,
    metalness: 0.05,
    roughness: 0.08,
    emissive: 0x53000f,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.92,
    envMapIntensity: 1.6,
    clearcoat: 1,
  });
  M.dialFace = mk({
    color: 0xffffff,
    map: textures.dial,
    roughnessMap: textures.dialRay,
    metalness: 0.6,
    roughness: 0.36,
    clearcoat: 0.9,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.15,
  });
  M.dialBack = mk({ color: 0x14161a, metalness: 0.3, roughness: 0.5 });
  M.leather = mk({
    color: 0xffffff,
    map: textures.leather,
    metalness: 0.02,
    roughness: 0.78,
    sheen: 0.22,
    sheenColor: new THREE.Color(0x6b5138),
    sheenRoughness: 0.7,
  });
  M.steelLug = mk({
    color: 0xa9aeb6,
    metalness: 1,
    roughness: 0.46,
    roughnessMap: textures.raySoft,
    envMapIntensity: 0.7,
  });
  M.leatherBack = mk({ color: 0x2a1a12, metalness: 0, roughness: 0.85 });
  M.gasket = mk({ color: 0x101114, metalness: 0.1, roughness: 0.85 });
  M.casebackPlate = [mk({
    color: 0xb9bdc4,
    metalness: 1,
    roughness: 0.38,
    roughnessMap: textures.caseback,
    bumpMap: textures.caseback,
    bumpScale: 0.004,
    envMapIntensity: 0.9,
  }), M.steelSatin];
  M.bridgeCap = [
    mk({
      color: 0xc0c4cb,
      metalness: 1,
      roughness: 0.32,
      roughnessMap: textures.geneva,
      envMapIntensity: 1.0,
    }),
    M.bridgeWall,
  ];
  if (physical) {
    M.sapphire = mk({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.02,
      transmission: 1,
      thickness: 0.65,
      ior: 1.77,
      transparent: true,
      envMapIntensity: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0,
      specularIntensity: 1,
    });
  } else {
    M.sapphire = mk({ color: 0xdfe9f2, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.14, envMapIntensity: 2.6, clearcoat: 1 });
  }
  M.sapphire.side = THREE.DoubleSide;
  M.lume = mk({ color: 0xdff4ff, metalness: 0.2, roughness: 0.35, emissive: 0x8fd8ff, emissiveIntensity: 0.28 });
  M.glow = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  return M;
}
