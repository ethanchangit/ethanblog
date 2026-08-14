<script lang="ts">
  import { onMount } from 'svelte';
  import { reducedMotion } from '@/lib/motion';

  interface Props {
    /** 演示包地址：public/demos/<name>/index.html 或外部 URL */
    src: string;
    title: string;
    height?: string;
    sandbox?: string;
    /** click = 点击后加载（默认）；visible = 滚动到可视区自动加载 */
    loading?: 'click' | 'visible';
    /** 未加载态的预览图（视频先行、点击升级：Potluck 页面模式） */
    poster?: string;
    /** 未加载态的循环预览视频；reduced-motion 或未注水时退回 poster 图 */
    posterVideo?: string;
    posterAlt?: string;
    caption?: string;
  }

  const {
    src,
    title,
    height = '420px',
    sandbox = 'allow-scripts',
    loading = 'click',
    poster,
    posterVideo,
    posterAlt,
    caption,
  }: Props = $props();

  let root = $state<HTMLElement | null>(null);
  let loaded = $state(false);
  let hydrated = $state(false);
  let reduceMotion = $state(false);
  let reloadKey = $state(0);

  onMount(() => {
    hydrated = true;
    reduceMotion = reducedMotion();
    if (loading === 'visible' && root) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            loaded = true;
            io.disconnect();
          }
        },
        { rootMargin: '100px' }
      );
      io.observe(root);
      return () => io.disconnect();
    }
  });
</script>

<figure class="media-frame not-prose" bind:this={root}>
  <div class="flex items-center justify-between py-2">
    <p class="font-mono text-xs text-ink-400">{title}</p>
    <div class="flex items-center gap-3 font-mono text-xs">
      {#if loaded}
        <button
          class="text-ink-500 transition-colors hover:text-ink-200"
          onclick={() => (reloadKey += 1)}
        >
          ↻ 重载
        </button>
      {/if}
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        class="text-ink-500 transition-colors hover:text-ink-200"
      >
        全屏 ↗
      </a>
    </div>
  </div>

  <div class="relative" style="height: {height}">
    {#if loaded}
      {#key reloadKey}
        <iframe {src} {title} {sandbox} class="absolute inset-0 h-full w-full border-0" loading="lazy"
        ></iframe>
      {/key}
    {:else}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-4">
        {#if hydrated && posterVideo && !reduceMotion}
          <video
            src={posterVideo}
            {poster}
            muted
            loop
            playsinline
            autoplay
            preload="metadata"
            aria-hidden="true"
            class="absolute inset-0 h-full w-full object-cover"
          ></video>
        {:else if poster}
          <img
            src={poster}
            alt={posterAlt ?? title}
            loading="lazy"
            class="absolute inset-0 h-full w-full object-cover"
          />
        {/if}
        {#if hydrated}
          <button
            onclick={() => (loaded = true)}
            class="relative text-sm font-medium text-ink-100 underline decoration-ink-500 underline-offset-4 transition-colors hover:decoration-ink-300"
          >
            ▶ 启动演示
          </button>
          <p class="relative font-mono text-xs text-ink-600">演示将在页面内沙箱中运行</p>
        {:else}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            class="relative text-sm font-medium text-ink-100 underline decoration-ink-500 underline-offset-4"
          >
            在新窗口打开演示 ↗
          </a>
        {/if}
      </div>
    {/if}
  </div>
  {#if caption}
    <figcaption class="media-caption">{caption}</figcaption>
  {/if}
</figure>
