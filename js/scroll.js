// 滚动模型：把 DOM 章节映射为归一化幕位置 A∈[0,6]，并提供阻尼平滑与章节文案的淡入淡出

export function createScroll({ sections, reducedMotion = false }) {
  let bounds = [];
  let maxScroll = 1;

  const measure = () => {
    const vh = window.innerHeight;
    bounds = Array.from(sections).map((el) => {
      const start = el.offsetTop;
      const len = el.offsetHeight;
      return { el, start, end: start + len, span: Math.max(1, len - vh) };
    });
    maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
  };

  let A = 0; // 平滑后的幕位置
  let targetA = 0;
  let rawProgress = 0;

  const targetAFor = (y) => {
    const vh = window.innerHeight;
    const center = y + vh * 0.5;
    for (let i = 0; i < bounds.length; i++) {
      const b = bounds[i];
      if (center < b.end || i === bounds.length - 1) {
        const p = (y - b.start) / b.span;
        return i + Math.min(1, Math.max(0, p));
      }
    }
    return bounds.length - 1;
  };

  const update = (dt) => {
    const y = window.scrollY || window.pageYOffset;
    targetA = targetAFor(y);
    rawProgress = Math.min(1, Math.max(0, y / maxScroll));
    // 阻尼：低通跟随，滚动停止后仍以指数收敛
    const tau = reducedMotion ? 0.05 : 0.16;
    const k = 1 - Math.exp(-dt / tau);
    A += (targetA - A) * k;
    if (Math.abs(targetA - A) < 1e-4) A = targetA;

    for (let i = 0; i < bounds.length; i++) {
      const b = bounds[i];
      const p = (y - b.start) / b.span;
      const inView = p > -0.35 && p < 1.35;
      let fade = Math.min(1, Math.max(0, Math.min(p / 0.16, (1 - p) / 0.16)));
      // 第一幕：页面一打开就要能读到文案，不能等滚动才从全黑里浮出来
      if (i === 0 && p < 0.72) fade = Math.max(fade, 0.92);
      b.el.style.setProperty('--copy-opacity', inView ? fade.toFixed(3) : '0');
      b.el.style.setProperty('--copy-shift', `${((1 - fade) * 18).toFixed(1)}px`);
      b.el.classList.toggle('is-active', p >= 0 && p <= 1);
    }
    return A;
  };

  const actLocal = (i) => {
    const y = window.scrollY || window.pageYOffset;
    const b = bounds[i];
    if (!b) return 0;
    return Math.min(1, Math.max(0, (y - b.start) / b.span));
  };

  const scrollToAct = (i, { smooth = true } = {}) => {
    const b = bounds[Math.min(bounds.length - 1, Math.max(0, i))];
    if (!b) return;
    window.scrollTo({ top: b.start + 2, behavior: smooth ? 'smooth' : 'auto' });
  };

  /** 幕位置 A → 像素位置（截图与调试用） */
  const scrollYForA = (A) => {
    const a = Math.min(bounds.length - 0.001, Math.max(0, A));
    const i = Math.min(bounds.length - 1, Math.floor(a));
    const b = bounds[i];
    return b.start + (a - i) * b.span;
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => {});

  return {
    measure,
    update,
    actLocal,
    scrollToAct,
    scrollToTop,
    scrollYForA,
    get A() {
      return A;
    },
    get targetA() {
      return targetA;
    },
    get progress() {
      return rawProgress;
    },
    get act() {
      return Math.min(bounds.length - 1, Math.floor(A + 0.0001));
    },
    get count() {
      return bounds.length;
    },
  };
}
