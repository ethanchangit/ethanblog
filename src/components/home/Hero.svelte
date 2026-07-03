<script lang="ts">
  import { onMount } from 'svelte';
  import { vizRegistry } from '@/lib/viz/registry';
  import { reducedMotion } from '@/lib/motion';

  interface Props {
    name: string;
    roles: string[];
    bio: string;
  }

  const { name, roles, bio }: Props = $props();

  const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01·_/';
  let display = $state(roles[0]);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let wrap = $state<HTMLDivElement | null>(null);

  function drawBg() {
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vizRegistry.network(ctx, w, h, { count: Math.round(w / 22), link: 110 });
  }

  /** 解码效果：乱码逐渐坍缩成目标文字 */
  function decodeTo(target: string, done: () => void) {
    let frame = 0;
    const totalFrames = 24;
    const timer = setInterval(() => {
      frame++;
      const settled = Math.floor((frame / totalFrames) * target.length);
      display =
        target.slice(0, settled) +
        Array.from({ length: target.length - settled }, () =>
          CHARS.charAt(Math.floor(Math.random() * CHARS.length))
        ).join('');
      if (frame >= totalFrames) {
        display = target;
        clearInterval(timer);
        done();
      }
    }, 40);
    return timer;
  }

  onMount(() => {
    drawBg();
    const ro = new ResizeObserver(() => drawBg());
    if (wrap) ro.observe(wrap);

    let timer: ReturnType<typeof setInterval> | undefined;
    let cycle: ReturnType<typeof setTimeout> | undefined;
    if (!reducedMotion()) {
      let i = 0;
      const next = () => {
        cycle = setTimeout(() => {
          i = (i + 1) % roles.length;
          timer = decodeTo(roles[i], next);
        }, 2600);
      };
      timer = decodeTo(roles[0], next);
    }
    return () => {
      ro.disconnect();
      if (timer) clearInterval(timer);
      if (cycle) clearTimeout(cycle);
    };
  });
</script>

<div bind:this={wrap} class="relative overflow-hidden">
  <canvas bind:this={canvas} class="absolute inset-0 opacity-25" aria-hidden="true"></canvas>
  <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface-950"></div>

  <div class="relative mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-6 sm:pt-36">
    <p class="mb-3 font-mono text-sm text-accent-400">你好，我是</p>
    <h1 class="text-5xl font-semibold tracking-tight text-ink-50 sm:text-6xl">{name}</h1>
    <p class="mt-4 h-7 font-mono text-lg text-primary-300" aria-live="off">
      {display}<span class="animate-pulse text-accent-400">▌</span>
    </p>
    <p class="mt-6 max-w-xl text-lg leading-relaxed text-ink-400">{bio}</p>
    <div class="mt-10 flex flex-wrap gap-3">
      <a
        href="/stories/how-this-site-works"
        class="rounded-md bg-primary-600 px-5 py-2.5 text-sm font-medium text-ink-50 shadow-lg transition-all hover:bg-primary-500 hover:shadow-primary-900/40"
      >
        这个网站不是博客 →
      </a>
      <a
        href="/projects"
        class="rounded-md border border-surface-700 px-5 py-2.5 text-sm font-medium text-ink-200 transition-colors hover:border-surface-600 hover:bg-surface-900"
      >
        看看我做的软件
      </a>
    </div>
  </div>
</div>
