<script lang="ts">
  import { onMount } from 'svelte';
  import { reducedMotion } from '@/lib/motion';
  import { readLang, subscribeLang, t, type Lang } from '@/lib/i18n';

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
  let lang = $state<Lang>('zh-CN');

  onMount(() => {
    hydrated = true;
    reduceMotion = reducedMotion();
    lang = readLang();
    const unsub = subscribeLang((next) => {
      lang = next;
    });
    let io: IntersectionObserver | undefined;
    if (loading === 'visible' && root) {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            loaded = true;
            io?.disconnect();
          }
        },
        { rootMargin: '100px' }
      );
      io.observe(root);
    }
    return () => {
      unsub();
      io?.disconnect();
    };
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
          {t(lang, 'demoReload')}
        </button>
      {/if}
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        class="text-ink-500 transition-colors hover:text-ink-200"
      >
        {t(lang, 'demoFullscreen')}
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
            {t(lang, 'demoStart')}
          </button>
          <p class="relative font-mono text-xs text-ink-600">{t(lang, 'demoSandbox')}</p>
        {:else}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            class="relative text-sm font-medium text-ink-100 underline decoration-ink-500 underline-offset-4"
          >
            {t(lang, 'demoNewWindow')}
          </a>
        {/if}
      </div>
    {/if}
  </div>
  {#if caption}
    <figcaption class="media-caption">{caption}</figcaption>
  {/if}
</figure>
