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
  <!-- 设备边框：像一个运行中的小软件 -->
  <div class="flex items-center justify-between border-b border-surface-800 bg-surface-950 px-4 py-2.5">
    <div class="flex items-center gap-3">
      <span class="flex gap-1.5" aria-hidden="true">
        <span class="h-2.5 w-2.5 rounded-full bg-surface-700"></span>
        <span class="h-2.5 w-2.5 rounded-full bg-surface-700"></span>
        <span class="h-2.5 w-2.5 rounded-full bg-accent-600/70"></span>
      </span>
      <p class="font-mono text-xs text-ink-400">{title}</p>
    </div>
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
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface-950">
        <!-- poster 档：内容丰富的预览打底，注水后可升级为循环视频 -->
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
        {#if poster || posterVideo}
          <div class="absolute inset-0 bg-gradient-to-t from-surface-950/80 via-surface-950/30 to-transparent" aria-hidden="true"></div>
        {/if}
        {#if hydrated}
          <button
            onclick={() => (loaded = true)}
            class="relative rounded-md bg-primary-600 px-5 py-2.5 text-sm font-medium text-ink-50 shadow-lg transition-all hover:bg-primary-500 hover:shadow-primary-900/40"
          >
            ▶ 启动演示
          </button>
          <p class="relative font-mono text-xs text-ink-600">软件将在页面内沙箱中运行</p>
        {:else}
          <!-- 无 JS 降级：直接给出新窗口链接 -->
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            class="relative rounded-md bg-primary-600 px-5 py-2.5 text-sm font-medium text-ink-50"
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
