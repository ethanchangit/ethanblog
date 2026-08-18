<script lang="ts">
  import { onMount } from 'svelte';
  import { readLang, subscribeLang, t, type Lang } from '@/lib/i18n';

  interface Props {
    src: string;
    title: string;
    /** 预计算的波形峰值（0-1），由 scripts/audio-peaks.mjs 生成；缺省时显示简单进度条 */
    peaks?: number[];
    caption?: string;
  }

  const { src, title, peaks, caption }: Props = $props();

  let audio = $state<HTMLAudioElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let wrap = $state<HTMLDivElement | null>(null);
  let hydrated = $state(false);
  let playing = $state(false);
  let progress = $state(0); // 0-1
  let duration = $state(0);
  let lang = $state<Lang>('zh-CN');

  function fmt(s: number) {
    if (!isFinite(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  function token(name: string, fallback: string) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function draw() {
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = 64;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const played = token('--color-accent-400', 'rgb(34 211 238)');
    const rest = token('--color-surface-700', 'rgb(62 66 71)');

    if (peaks && peaks.length > 0) {
      const n = peaks.length;
      const bw = Math.max(1.5, w / n - 1.5);
      for (let i = 0; i < n; i++) {
        const x = (i / n) * w;
        const bh = Math.max(3, peaks[i] * (h - 8));
        ctx.fillStyle = i / n <= progress ? played : rest;
        ctx.beginPath();
        ctx.roundRect(x, (h - bh) / 2, bw, bh, 1.5);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = rest;
      ctx.fillRect(0, h / 2 - 2, w, 4);
      ctx.fillStyle = played;
      ctx.fillRect(0, h / 2 - 2, w * progress, 4);
    }
  }

  function toggle() {
    if (!audio) return;
    playing ? audio.pause() : audio.play();
  }

  function seek(e: MouseEvent) {
    if (!audio || !wrap || !duration) return;
    const rect = wrap.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  }

  onMount(() => {
    hydrated = true;
    lang = readLang();
    const unsub = subscribeLang((next) => {
      lang = next;
    });
    const ro = new ResizeObserver(() => draw());
    if (wrap) ro.observe(wrap);
    return () => {
      unsub();
      ro.disconnect();
    };
  });

  $effect(() => {
    void progress;
    if (hydrated) draw();
  });
</script>

<figure class="media-frame not-prose">
  <div class="flex items-center gap-4 p-4">
    {#if hydrated}
      <button
        onclick={toggle}
        aria-label={playing ? t(lang, 'audioPause') : t(lang, 'audioPlay')}
        class="flex h-11 w-11 shrink-0 items-center justify-center text-ink-100 transition-colors hover:text-ink-50"
      >
        {#if playing}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <rect x="2" y="1" width="3.5" height="12" rx="1" />
            <rect x="8.5" y="1" width="3.5" height="12" rx="1" />
          </svg>
        {:else}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <path d="M3 1.5v11a1 1 0 0 0 1.54.84l8-5.5a1 1 0 0 0 0-1.68l-8-5.5A1 1 0 0 0 3 1.5z" />
          </svg>
        {/if}
      </button>
      <div class="min-w-0 flex-1">
        <div class="mb-1 flex items-baseline justify-between gap-3">
          <p class="truncate text-sm font-medium text-ink-200">{title}</p>
          <p class="font-mono text-xs text-ink-500">
            {fmt(progress * duration)} / {fmt(duration)}
          </p>
        </div>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div bind:this={wrap} class="cursor-pointer" onclick={seek} title={t(lang, 'audioSeek')}>
          <canvas bind:this={canvas}></canvas>
        </div>
      </div>
    {/if}
    <!-- 注水前的降级：原生播放器，永远可用 -->
    <audio
      bind:this={audio}
      {src}
      preload="metadata"
      controls={!hydrated}
      class:hidden={hydrated}
      class="w-full"
      onplay={() => (playing = true)}
      onpause={() => (playing = false)}
      onended={() => {
        playing = false;
        progress = 0;
      }}
      ontimeupdate={() => {
        if (audio && duration) progress = audio.currentTime / duration;
      }}
      onloadedmetadata={() => {
        if (audio) duration = audio.duration;
      }}
    ></audio>
  </div>
  {#if caption}
    <figcaption class="media-caption">{caption}</figcaption>
  {/if}
</figure>
