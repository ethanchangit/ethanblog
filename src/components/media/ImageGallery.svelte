<script lang="ts">
  import { onMount } from 'svelte';
  import { reducedMotion } from '@/lib/motion';

  interface ImageItem {
    src: string;
    alt: string;
    caption?: string;
  }

  interface Props {
    images: ImageItem[];
    columns?: 1 | 2 | 3;
    caption?: string;
  }

  const { images, columns = 2, caption }: Props = $props();

  let hydrated = $state(false);
  let lightboxOpen = $state(false);
  let lightboxIndex = $state(0);

  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  }[columns];

  function openLightbox(index: number) {
    if (!hydrated) return;
    lightboxIndex = index;
    lightboxOpen = true;
  }

  function closeLightbox() {
    lightboxOpen = false;
  }

  function prev() {
    lightboxIndex = (lightboxIndex - 1 + images.length) % images.length;
  }

  function next() {
    lightboxIndex = (lightboxIndex + 1) % images.length;
  }

  function onKeydown(e: KeyboardEvent) {
    if (!lightboxOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    }
  }

  onMount(() => {
    hydrated = true;
  });
</script>

<svelte:window onkeydown={onKeydown} />

<figure class="media-frame not-prose">
  <div class="grid gap-2 p-2 {gridClass}">
    {#each images as img, i}
      {#if hydrated}
        <button
          type="button"
          class="group relative overflow-hidden text-left transition-opacity hover:opacity-90"
          onclick={() => openLightbox(i)}
          aria-label={`查看大图：${img.alt}`}
        >
          <img
            src={img.src}
            alt={img.alt}
            loading="lazy"
            class="block aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
          {#if img.caption}
            <span class="mt-2 block text-xs text-ink-500">
              {img.caption}
            </span>
          {/if}
        </button>
      {:else}
        <!-- 无 JS 降级：静态图片网格，点击在新窗口打开 -->
        <a
          href={img.src}
          target="_blank"
          rel="noopener noreferrer"
          class="block overflow-hidden"
        >
          <img
            src={img.src}
            alt={img.alt}
            loading="lazy"
            class="block aspect-[4/3] w-full object-cover"
          />
          {#if img.caption}
            <span class="block px-3 py-2 text-xs text-ink-500">{img.caption}</span>
          {/if}
        </a>
      {/if}
    {/each}
  </div>
  {#if caption}
    <figcaption class="media-caption">{caption}</figcaption>
  {/if}
</figure>

{#if lightboxOpen && hydrated}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-surface-950 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="图片灯箱"
    onclick={(e) => e.target === e.currentTarget && closeLightbox()}
    onkeydown={(e) => e.key === 'Escape' && closeLightbox()}
    tabindex="-1"
  >
    <button
      type="button"
      class="absolute right-4 top-4 font-mono text-xs text-ink-300 transition-colors hover:text-ink-100"
      onclick={closeLightbox}
      aria-label="关闭灯箱"
    >
      Esc ✕
    </button>

    {#if images.length > 1}
      <button
        type="button"
        class="absolute left-3 top-1/2 -translate-y-1/2 px-3 py-2 text-sm text-ink-300 transition-colors hover:text-ink-100 sm:left-6"
        onclick={prev}
        aria-label="上一张"
      >
        ‹
      </button>
      <button
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-2 text-sm text-ink-300 transition-colors hover:text-ink-100 sm:right-6"
        onclick={next}
        aria-label="下一张"
      >
        ›
      </button>
    {/if}

    <figure class="max-h-[85vh] max-w-4xl">
      <img
        src={images[lightboxIndex].src}
        alt={images[lightboxIndex].alt}
        class="max-h-[75vh] w-full object-contain"
        class:transition-opacity={!reducedMotion()}
        class:duration-200={!reducedMotion()}
      />
      {#if images[lightboxIndex].caption}
        <figcaption class="mt-3 text-center text-sm text-ink-400">
          {images[lightboxIndex].caption}
        </figcaption>
      {/if}
      {#if images.length > 1}
        <p class="mt-2 text-center font-mono text-xs text-ink-600">
          {lightboxIndex + 1} / {images.length}
        </p>
      {/if}
    </figure>
  </div>
{/if}
