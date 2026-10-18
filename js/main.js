// AURELIS AU-07 · 主程序：渲染器 / 质量分级 / 六幕时间轴 / 交互 / 传动驱动
//
// 画面全部实时生成：没有视频、没有贴图序列、没有整图缩放；爆炸视图中每个零件独立插值。

import * as THREE from 'three';
import { createTextures, createMaterials } from './watch/materials.js';
import { buildWatch, applyExplode, applyReveal, applyTrain } from './watch/build-watch.js';
import { createEnvironment } from './env.js';
import { createPostFX, QUALITY } from './postfx.js';
import { createScroll } from './scroll.js';
import { ACTS, sampleTimeline } from './timeline.js';
import { sampleTrain, DISPLAY_MODES, TRAIN, CALIBRE } from './watch/train.js';

const params = new URLSearchParams(location.search);
const debugEnabled = params.has('debug');
const forcedQuality = params.get('quality');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('stage');
const loader = document.getElementById('loader');
const loaderFill = document.getElementById('loader-fill');
const loaderText = document.getElementById('loader-text');
const fallback = document.getElementById('fallback');

const state = {
  t: 0,
  elapsed: 0,
  timeOverride: null,
  tempo: 'showcase',
  spin: 0,
  spinVel: 0,
  dragging: false,
  lastPointer: null,
  quality: null,
  fps: 0,
  frames: 0,
  fpsTimer: 0,
  degraded: false,
};

function fail(msg) {
  loader?.classList.add('is-done');
  fallback.hidden = false;
  if (msg) fallback.querySelector('p').textContent = msg;
}

// ---------- WebGL 能力检查 ----------
const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
if (!gl) {
  fail('本页需要 WebGL2：当前浏览器或显卡驱动未提供。');
  throw new Error('WebGL2 unavailable');
}

// ---------- 渲染器 ----------
const isMobile = window.matchMedia('(max-width: 900px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let quality = QUALITY[forcedQuality] || (isMobile ? QUALITY.medium : QUALITY.high);
state.quality = quality;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dprCap));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06070a);

const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.5, 900);
camera.position.set(0, 20, 260);

// ---------- 分步装配（让载入条动起来） ----------
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const setLoad = async (p, text) => {
  loaderFill.style.width = `${Math.round(p * 100)}%`;
  if (text) loaderText.textContent = text;
  await nextFrame();
};

let textures;
let M;
let watch;
let env;
let postfx;
let scroll;
let trainTime = 0;

async function boot() {
  await setLoad(0.08, '生成材质与纹理…');
  textures = createTextures(renderer);
  M = createMaterials(textures, quality);
  await setLoad(0.28, '装配机芯与表壳…');
  watch = buildWatch(M, textures);
  scene.add(watch.root);
  await setLoad(0.58, '布置影棚灯光…');
  env = createEnvironment(renderer, scene, quality);
  env.setPixelRatio(renderer.getPixelRatio());
  await setLoad(0.78, '编译后期管线…');
  postfx = createPostFX(renderer, scene, camera, quality);
  postfx.setSize(window.innerWidth, window.innerHeight);
  await setLoad(0.9, '校准滚动时间轴…');
  scroll = createScroll({ sections: document.querySelectorAll('.act'), reducedMotion });
  buildRail();
  buildReadout();
  bindUI();
  updateTempoLabel();
  await setLoad(1, '就绪');
  loader.classList.add('is-done');
  applyFrame(0, 0, true);
  renderer.compile?.(scene, camera);
  window.__watch.ready = true;
}

// ---------- 章节导航 ----------
const railList = document.getElementById('rail-list');
function buildRail() {
  railList.innerHTML = '';
  ACTS.forEach((act, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-current', i === 0 ? 'true' : 'false');
    btn.innerHTML = `<span class="rail__num">${String(i + 1).padStart(2, '0')}</span><span class="rail__label">${act.cn}</span>`;
    btn.addEventListener('click', () => scroll.scrollToAct(i));
    li.appendChild(btn);
    railList.appendChild(li);
  });
  const specCount = document.getElementById('spec-part-count');
  if (specCount) specCount.textContent = `${watch.parts.length} 件（独立控制）`;
}

// ---------- 机芯读数 ----------
const readout = document.getElementById('readout');
const readoutBody = document.getElementById('readout-body');
const readoutNote = document.getElementById('readout-note');
const tempoBtn = document.getElementById('tempo-btn');

function buildReadout() {
  const s = sampleTrain(0, state.tempo);
  readoutBody.innerHTML = s.rows
    .map(
      (r) => `<tr data-id="${r.id}"><td>${r.label}</td><td>${r.teeth}${r.leaves ? ` / ${r.leaves}` : ''}</td><td>${r.trueRate}</td><td>${r.displayRate}</td><td>${r.dirText}</td></tr>`
    )
    .join('');
  const b = document.createElement('tr');
  b.className = 'is-highlight';
  b.innerHTML = `<td>摆轮 / 擒纵叉</td><td>—</td><td>${CALIBRE.beatHz} Hz</td><td>${s.balance.displayHz} Hz</td><td>往复</td>`;
  readoutBody.appendChild(b);
  readoutNote.textContent = `${s.mode.note}。擒纵轮与擒纵小齿轮同轴，按拍跳齿；表针始终按真值走时。`;
  readout.setAttribute('aria-hidden', 'false');
}

function updateTempoLabel() {
  const mode = DISPLAY_MODES[state.tempo];
  tempoBtn.textContent = state.tempo === 'real' ? '切换展示倍速 ×60' : '切换真实节拍 ×1';
  tempoBtn.setAttribute('aria-pressed', state.tempo === 'real' ? 'true' : 'false');
  const spec = document.getElementById('spec-tempo');
  if (spec) spec.textContent = state.tempo === 'real' ? '真值 ×1' : '×60（可切换真值）';
  readoutNote.textContent = `${mode.note}。擒纵轮与擒纵小齿轮同轴，按拍跳齿；表针始终按真值走时。`;
}

// ---------- 交互 ----------
function bindUI() {
  document.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', () => {
      const a = el.dataset.action;
      if (a === 'movement') scroll.scrollToAct(3);
      else if (a === 'restart') scroll.scrollToTop();
      else if (a === 'tempo') {
        state.tempo = state.tempo === 'showcase' ? 'real' : 'showcase';
        updateTempoLabel();
        buildReadout();
      }
    });
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    state.dragging = true;
    state.lastPointer = { x: e.clientX, y: e.clientY, moved: 0 };
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.dragging || !state.lastPointer) return;
    const dx = e.clientX - state.lastPointer.x;
    state.lastPointer.x = e.clientX;
    state.lastPointer.moved += Math.abs(dx);
    state.spinVel += dx * 0.0016;
    canvas.style.cursor = 'grabbing';
  });
  const endDrag = () => {
    if (state.dragging) {
      state.dragging = false;
      canvas.style.cursor = 'grab';
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', endDrag);
  canvas.style.cursor = 'grab';

  window.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
      debugEl.hidden = !debugEl.hidden;
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      scroll.scrollToAct(Math.min(ACTS.length - 1, scroll.act + 1));
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      scroll.scrollToAct(Math.max(0, scroll.act - 1));
    } else if (e.key === 'Home') {
      scroll.scrollToTop();
    } else if (e.key === ' ') {
      e.preventDefault();
      scroll.scrollToAct(Math.min(ACTS.length - 1, scroll.act + 1));
    }
  });

  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => {
    lastFrameTime = performance.now() / 1000;
  });
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  postfx?.setSize(w, h);
  env?.setPixelRatio(renderer.getPixelRatio());
  scroll?.measure();
}

// ---------- 每帧 ----------
let lastFrameTime = performance.now() / 1000;
const tmpTarget = new THREE.Vector3();
const hint = document.getElementById('scroll-hint');
const progressValue = document.getElementById('progress-value');
const debugEl = document.createElement('div');
debugEl.className = 'debug';
debugEl.hidden = !debugEnabled;
document.body.appendChild(debugEl);

let railAct = -1;
let firstScrollSeen = false;

function applyFrame(dt, now, first) {
  const A = scroll.A;
  const tl = sampleTimeline(A);

  // 相机：极坐标轨道 + 竖屏自适应退后 + 轻微手持抖动
  tmpTarget.set(tl.target.x, tl.target.y, tl.target.z);
  // 竖屏时水平视角更窄，按宽高比把相机沿视线方向后退，避免主体被裁切
  const fit = camera.aspect < 1.6 ? Math.min(2.2, 1.6 / camera.aspect) : 1;
  camera.position.copy(tl.camPos).sub(tmpTarget).multiplyScalar(fit).add(tmpTarget);
  camera.fov += (tl.fov - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
  const shake = reducedMotion ? 0 : tl.radius * 0.0026 * fit;
  if (shake > 0) {
    const t = now;
    camera.position.x += (Math.sin(t * 0.31) * 0.6 + Math.sin(t * 0.73 + 1.2) * 0.4) * shake;
    camera.position.y += (Math.cos(t * 0.27 + 0.7) * 0.6 + Math.cos(t * 0.61 + 2.1) * 0.4) * shake;
    camera.position.z += Math.sin(t * 0.19 + 3.1) * 0.5 * shake;
  }
  camera.lookAt(tmpTarget);

  // 腕表姿态：时间轴姿态 + 缓慢自转（可被拖拽覆盖）
  const idle = reducedMotion || state.timeOverride !== null ? 0 : Math.sin(now * 0.11) * 0.06;
  watch.root.rotation.y = tl.rotY + idle + state.spin;
  watch.root.rotation.x = tl.rotX;
  watch.root.position.y = Math.sin(now * 0.23) * 0.16 * (reducedMotion ? 0 : 1);

  // 爆炸 / 浮现
  applyExplode(watch, tl.explode, tl.stagger);
  applyReveal(watch, tl.reveal);

  // 灯光与后期
  env.setIntensity(tl.light);
  postfx.setBloom(tl.bloom);
  postfx.grade.uniforms.uGrain.value = tl.grain;
  postfx.grade.uniforms.uVignette.value = tl.vignette;
  postfx.grade.uniforms.uFade.value = tl.fade;

  // 传动：表针始终按真值走时；机芯按显示模式采样
  const tTrue = state.timeOverride ?? state.elapsed;
  const state_ = sampleTrain(trainTime, state.tempo);
  applyTrain(watch, state_);

  // 表针（10:10:35 起，秒针真实扫秒）
  const base = 10 * 3600 + 10 * 60 + 35 + tTrue;
  const hours = (base / 3600) % 12;
  const minutes = (base / 60) % 60;
  const seconds = base % 60;
  watch.refs.hour.rotation.z = Math.PI / 2 - (hours / 12) * Math.PI * 2;
  watch.refs.minute.rotation.z = Math.PI / 2 - (minutes / 60) * Math.PI * 2;
  watch.refs.second.rotation.z = Math.PI / 2 - (seconds / 60) * Math.PI * 2;

  env.update(now);
  postfx.update(now);
  postfx.composer.render();
  const info = renderer.info.render;
  state.lastInfo = { calls: info.calls, triangles: info.triangles };

  // UI 同步
  if (scroll.act !== railAct) {
    railAct = scroll.act;
    Array.from(railList.children).forEach((li, i) => {
      li.querySelector('button').setAttribute('aria-current', i === railAct ? 'true' : 'false');
    });
  }
  readout.classList.toggle('is-visible', scroll.act === 3);
  progressValue.textContent = String(Math.round(scroll.progress * 100)).padStart(2, '0');
  if (!firstScrollSeen && scroll.progress > 0.01) {
    firstScrollSeen = true;
    hint.classList.add('is-hidden');
  }
}

function tick() {
  const t = performance.now() / 1000;
  const dt = Math.min(0.05, t - lastFrameTime);
  lastFrameTime = t;
  if (!watch || !scroll || !postfx) return;
  if (!document.hidden) {
    state.elapsed += dt;
    trainTime += dt;
    // 拖拽惯性 + 回弹
    if (!state.dragging) {
      state.spinVel *= Math.exp(-dt / 0.55);
      state.spin += state.spinVel * dt * 60 * 0.016;
      state.spin *= Math.exp(-dt / 1.6);
    }
    scroll.update(dt);
    applyFrame(dt, state.elapsed, false);
    measureFps(dt);
    renderer.info.reset();
  }
}

function measureFps(dt) {
  state.frames++;
  state.fpsTimer += dt;
  if (state.fpsTimer >= 1) {
    state.fps = state.frames / state.fpsTimer;
    state.frames = 0;
    state.fpsTimer = 0;
    if (!state.degraded && state.fps < 42 && quality !== QUALITY.low && !forcedQuality) degrade();
    if (debugEnabled || !debugEl.hidden) {
      const info = state.lastInfo ?? { calls: 0, triangles: 0 };
      debugEl.textContent =
        `fps ${state.fps.toFixed(1)}  dpr ${renderer.getPixelRatio().toFixed(2)}  ${quality.key}\n` +
        `calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(1)}k  progs ${renderer.info.programs?.length ?? '-'}\n` +
        `A ${scroll.A.toFixed(3)}  E ${sampleTimeline(scroll.A).explode.toFixed(3)}  act ${scroll.act + 1}/6  tempo ${state.tempo}`;
    }
  }
}

/** 帧率不足时降级：像素比 → 泛光 → 尘埃 → 阴影贴图 */
function degrade() {
  state.degraded = true;
  renderer.setPixelRatio(1);
  postfx.setSize(window.innerWidth, window.innerHeight);
  if (postfx.bloom) postfx.composer.removePass(postfx.bloom);
  env.dust.geometry.setDrawRange(0, Math.floor(env.dust.geometry.attributes.position.count * 0.45));
  if (env.key.shadow.map) {
    env.key.shadow.map.dispose();
    env.key.shadow.map = null;
  }
  env.key.shadow.mapSize.set(1024, 1024);
  quality = QUALITY.low;
  state.quality = quality;
  onResize();
}

// ---------- 对外接口（调试与截图自动化） ----------
window.__watch = {
  ready: false,
  get A() {
    return scroll?.A ?? 0;
  },
  get act() {
    return scroll?.act ?? 0;
  },
  setProgress(A) {
    if (!scroll) return 0;
    const y = scroll.scrollYForA(A);
    window.scrollTo({ top: y, behavior: 'auto' });
    // 截图用：直接对齐，跳过阻尼
    for (let i = 0; i < 40; i++) scroll.update(1);
    return scroll.A;
  },
  setTime(t) {
    state.timeOverride = t;
    trainTime = t;
  },
  releaseTime() {
    state.timeOverride = null;
  },
  setTempo(mode) {
    state.tempo = mode;
    updateTempoLabel();
    buildReadout();
  },
  freeze(f) {
    if (f) {
      state.timeOverride = state.timeOverride ?? state.elapsed;
    } else {
      state.timeOverride = null;
    }
  },
  stats() {
    const info = state.lastInfo ?? { calls: 0, triangles: 0 };
    return {
      fps: state.fps,
      dpr: renderer.getPixelRatio(),
      quality: quality.key,
      calls: info.calls,
      triangles: info.triangles,
      programs: renderer.info.programs?.length ?? 0,
      A: scroll?.A ?? 0,
      explode: sampleTimeline(scroll?.A ?? 0).explode,
      tempo: state.tempo,
      parts: watch?.parts.length ?? 0,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
    };
  },
  parts: () => watch.parts.map((p) => ({ id: p.id, label: p.label, layer: p.layer, dist: p.explode.dist, delay: p.explode.delay })),
  // 调试用：报告指针与相机的实时状态（不改动场景）
  debugHands: () => {
    const r = watch.refs;
    r.hour.updateWorldMatrix(true, false);
    return {
      hour: { rotZ: +r.hour.rotation.z.toFixed(3), scale: +r.hour.scale.x.toFixed(3) },
      minute: { rotZ: +r.minute.rotation.z.toFixed(3), scale: +r.minute.scale.x.toFixed(3) },
      second: { rotZ: +r.second.rotation.z.toFixed(3), scale: +r.second.scale.x.toFixed(3) },
      hourWorld: new THREE.Vector3().setFromMatrixPosition(r.hour.matrixWorld).toArray().map((x) => +x.toFixed(2)),
      camera: { pos: camera.position.toArray().map((x) => +x.toFixed(1)), fov: +camera.fov.toFixed(2) },
    };
  },
  // 传动自检：读取各轮当前角度，用于验证"持续旋转 + 齿数比 + 旋向交替"
  wheelAngles: () => {
    const out = {};
    for (const [id, w] of Object.entries(watch.wheelWraps)) {
      out[id] = {
        wheel: +w.entry.wheel.rotation.z.toFixed(6),
        pinion: w.entry.pinion ? +w.entry.pinion.rotation.z.toFixed(6) : null,
      };
    }
    out.balance = +watch.movementRefs.balance.group.rotation.z.toFixed(6);
    out.pallet = +watch.movementRefs.pallet.group.rotation.z.toFixed(6);
    out.hairspringBreath = +watch.movementRefs.hairspring.uniform.value.toFixed(6);
    out.barrelBand = +watch.movementRefs.barrel.band.rotation.z.toFixed(6);
    return out;
  },
  debugDump: () => {
    const r = watch.refs;
    const chain = (o) => {
      const names = [];
      let p = o;
      while (p) {
        names.push(`${p.type}${p.name ? `:${p.name}` : ''}`);
        p = p.parent;
      }
      return names.join(' < ');
    };
    const dump = (name, o) => {
      if (!o) return { name, missing: true };
      o.updateWorldMatrix(true, false);
      const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      const s = new THREE.Vector3();
      o.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      let geo = null;
      if (o.geometry) {
        o.geometry.computeBoundingBox();
        o.geometry.computeBoundingSphere();
        const bb = o.geometry.boundingBox;
        const bs = o.geometry.boundingSphere;
        geo = {
          count: o.geometry.attributes.position?.count ?? 0,
          min: bb.min.toArray().map((v) => +v.toFixed(2)),
          max: bb.max.toArray().map((v) => +v.toFixed(2)),
          sphere: { c: bs.center.toArray().map((v) => +v.toFixed(2)), r: +bs.radius.toFixed(3) },
          mat: o.material?.type ?? (Array.isArray(o.material) ? 'array' : null),
          layers: o.layers.mask,
        };
      }
      return { name, visible: o.visible, worldPos: p.toArray().map((v) => +v.toFixed(2)), worldScale: s.toArray().map((v) => +v.toFixed(3)), geo, chain: chain(o) };
    };
    return {
      hour: dump('hour', r.hour),
      minute: dump('minute', r.minute),
      second: dump('second', r.second),
      dial: dump('dial', r.dial),
      indices: dump('indices', r.indices),
      reveal: r.dialReveal?.value,
    };
  },
  train: () => ({ calibre: CALIBRE, arbors: TRAIN.arbors.map((a) => ({ id: a.id, teeth: a.wheel.teeth, leaves: a.pinion?.leaves ?? null, pos: a.pos, rate: a.rate, dir: a.dir })) }),
};

boot().catch((err) => {
  console.error(err);
  fail(`启动失败：${err.message}`);
});

renderer.setAnimationLoop(tick);
