<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    /** 演示包地址：public/demos/<name>/index.html 或外部 URL */
    src: string;
    title: string;
    height?: string;
    sandbox?: string;
    /** click = 点击后加载（默认）；visible = 滚动到可视区自动加载 */
    loading?: 'click' | 'visible';
    caption?: string;
  }

  const {
    src,
    title,
    height = '420px',
    sandbox = 'allow-scripts',
    loading = 'click',
    caption,
  }: Props = $props();

  let root = $state<HTMLElement | null>(null);
  let loaded = $state(false);
  let hydrated = $state(false);
  let reloadKey = $state(0);

  onMount(() => {
    hydrated = true;
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
  <div class="flex items-center justify-between border-b border-surface-800 bg-surface-950/60 px-4 py-2.5">
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
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-surface-900 to-surface-950">
        {#if hydrated}
          <button
            onclick={() => (loaded = true)}
            class="rounded-md bg-primary-600 px-5 py-2.5 text-sm font-medium text-ink-50 shadow-lg transition-all hover:bg-primary-500 hover:shadow-primary-900/40"
          >
            ▶ 启动演示
          </button>
          <p class="font-mono text-xs text-ink-600">软件将在页面内沙箱中运行</p>
        {:else}
          <!-- 无 JS 降级：直接给出新窗口链接 -->
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-md bg-primary-600 px-5 py-2.5 text-sm font-medium text-ink-50"
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
