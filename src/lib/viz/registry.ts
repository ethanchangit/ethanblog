/**
 * 可视化绘制注册表。
 * ParamSlider / ScrollScene 等组件通过 key 选择绘制函数；
 * 新增可视化时在这里注册，无需改动组件本身。
 *
 * 颜色一律从 CSS 设计 token 读取（--color-*），不在此处写死色值。
 */

export type DrawFn = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  params: Record<string, number>
) => void;

function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const colors = () => ({
  primary: token('--color-primary-400', 'rgb(96 165 250)'),
  accent: token('--color-accent-400', 'rgb(34 211 238)'),
  dim: token('--color-ink-600', 'rgb(71 85 105)'),
});

/** 确定性伪随机 —— 同样的种子永远画出同样的图，避免重绘闪变。 */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 知识网络：节点 + 距离阈值内连线。params: count(节点数), link(连线距离) */
const network: DrawFn = (ctx, w, h, params) => {
  const { primary, accent, dim } = colors();
  const count = Math.round(params.count ?? 60);
  const link = params.link ?? 90;
  const rand = mulberry32(42);
  const pts = Array.from({ length: count }, () => ({
    x: rand() * w,
    y: rand() * h,
  }));

  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const d = Math.hypot(dx, dy);
      if (d < link) {
        ctx.globalAlpha = (1 - d / link) * 0.5;
        ctx.strokeStyle = dim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[j].x, pts[j].y);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
  pts.forEach((p, i) => {
    ctx.fillStyle = i % 7 === 0 ? accent : primary;
    ctx.beginPath();
    ctx.arc(p.x, p.y, i % 7 === 0 ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
  });
};

/** 柱状图：params: bars(柱数), growth(增长率 0-100) */
const bars: DrawFn = (ctx, w, h, params) => {
  const { primary, accent } = colors();
  const n = Math.round(params.bars ?? 12);
  const growth = (params.growth ?? 50) / 100;
  const rand = mulberry32(7);
  const gap = 6;
  const bw = (w - gap * (n + 1)) / n;

  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const base = 0.15 + rand() * 0.25;
    const val = Math.min(1, base * Math.pow(1 + growth, i / 2));
    const bh = val * (h - 20);
    const x = gap + i * (bw + gap);
    ctx.fillStyle = i === n - 1 ? accent : primary;
    ctx.globalAlpha = 0.4 + val * 0.6;
    ctx.beginPath();
    ctx.roundRect(x, h - bh, bw, bh, 3);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

/** 波形曲线：params: freq(频率), amp(振幅 px) */
const curve: DrawFn = (ctx, w, h, params) => {
  const { primary, accent } = colors();
  const freq = params.freq ?? 2;
  const amp = params.amp ?? h * 0.25;
  const mid = h / 2;

  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, primary);
  grad.addColorStop(1, accent);

  ctx.strokeStyle = grad;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let x = 0; x <= w; x++) {
    const y = mid + Math.sin((x / w) * Math.PI * 2 * freq) * amp * Math.sin((x / w) * Math.PI);
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 1;
  for (const mult of [0.6, 0.3]) {
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      const y =
        mid + Math.sin((x / w) * Math.PI * 2 * freq) * amp * mult * Math.sin((x / w) * Math.PI);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

export const vizRegistry: Record<string, DrawFn> = { network, bars, curve };
export type VizKey = keyof typeof vizRegistry | (string & {});
