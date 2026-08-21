<script lang="ts">
  import { onMount } from 'svelte';
  import { pagePath } from '@/lib/locale';
  import { reducedMotion } from '@/lib/motion';
  import BiText from '@/components/shell/BiText.svelte';

  interface Item {
    date?: string;
    dateEn?: string;
    title: string;
    titleEn?: string;
    body?: string;
    bodyEn?: string;
    icon?: string;
    /** 有值时整行渲染为 SSR `<a>`，无 JS 也可点。 */
    href?: string;
  }

  interface Props {
    items: Item[];
    caption?: string;
    captionEn?: string;
    currentHref?: string;
  }

  const { items, caption, captionEn, currentHref }: Props = $props();

  let root = $state<HTMLElement | null>(null);
  let animated = $state(false);
  let visible = $state<boolean[]>(items.map(() => false));
  let current = $state(currentHref);

  function pathOf(href: string | undefined): string {
    if (!href) return '';
    try {
      return pagePath(new URL(href, location.origin).pathname);
    } catch {
      return pagePath(href);
    }
  }

  function syncCurrent() {
    current = pagePath(location.pathname);
  }

  onMount(() => {
    syncCurrent();
    document.addEventListener('astro:page-load', syncCurrent);

    if (reducedMotion() || !root) {
      return () => document.removeEventListener('astro:page-load', syncCurrent);
    }
    animated = true;
    const nodes = Array.from(root.querySelectorAll('[data-tl-item]'));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.tlItem);
            visible[idx] = true;
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.4 },
    );
    nodes.forEach((n) => io.observe(n));
    return () => {
      document.removeEventListener('astro:page-load', syncCurrent);
      io.disconnect();
    };
  });
</script>

{#snippet row(item: Item, i: number)}
  <div
    class="flex w-12 shrink-0 items-center justify-center text-2xl leading-none text-ink-500 tabular-nums {item.href
      ? 'transition-colors group-hover:text-ink-300'
      : ''}"
  >
    {item.icon ?? String(i + 1).padStart(2, '0')}
  </div>
  <div>
    <h4
      class="font-semibold text-ink-100 {item.href
        ? 'underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-ink-500 group-aria-[current=page]:decoration-ink-500'
        : ''}"
    >
      <BiText zh={item.title} en={item.titleEn} />
    </h4>
    {#if item.body}
      <p
        class="mt-1 text-sm leading-relaxed text-ink-400 {item.href
          ? 'transition-colors group-hover:text-ink-300'
          : ''}"
      >
        <BiText zh={item.body} en={item.bodyEn} />
      </p>
    {/if}
  </div>
{/snippet}

<figure class="media-frame not-prose" bind:this={root}>
  <ol class="relative m-0 list-none p-0">
    {#each items as item, i (i)}
      <li
        data-tl-item={i}
        class="relative py-4 transition-all duration-700"
        style={animated && !visible[i] ? 'opacity: 0; transform: translateY(16px)' : ''}
      >
        {#if item.href}
          <a
            href={item.href}
            aria-current={pathOf(item.href) === current ? 'page' : undefined}
            class="group flex items-center gap-4 text-inherit no-underline"
          >
            {@render row(item, i)}
          </a>
        {:else}
          <div class="flex items-center gap-4">
            {@render row(item, i)}
          </div>
        {/if}
      </li>
    {/each}
  </ol>
  {#if caption}
    <figcaption class="media-caption"><BiText zh={caption} en={captionEn} /></figcaption>
  {/if}
</figure>
