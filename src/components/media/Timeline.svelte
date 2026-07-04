<script lang="ts">
  import { onMount } from 'svelte';
  import { reducedMotion } from '@/lib/motion';

  interface Item {
    date: string;
    title: string;
    body?: string;
    icon?: string;
  }

  interface Props {
    items: Item[];
    caption?: string;
  }

  const { items, caption }: Props = $props();

  let root = $state<HTMLElement | null>(null);
  let animated = $state(false);
  let visible = $state<boolean[]>(items.map(() => false));

  onMount(() => {
    if (reducedMotion() || !root) return;
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
      { threshold: 0.4 }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  });
</script>

<figure class="media-frame not-prose" bind:this={root}>
  <ol class="relative m-0 list-none p-6 pl-2">
    <div class="absolute inset-y-6 left-[27px] w-px bg-surface-700" aria-hidden="true"></div>
    {#each items as item, i (i)}
      <li
        data-tl-item={i}
        class="relative flex gap-4 py-4 pl-4 transition-all duration-700"
        style={animated && !visible[i] ? 'opacity: 0; transform: translateY(16px)' : ''}
      >
        <div
          class="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-surface-700 bg-surface-900 text-sm"
        >
          {item.icon ?? '·'}
        </div>
        <div>
          <p class="ui-meta">{item.date}</p>
          <h4 class="mt-0.5 font-semibold text-ink-100">{item.title}</h4>
          {#if item.body}
            <p class="mt-1 text-sm leading-relaxed text-ink-400">{item.body}</p>
          {/if}
        </div>
      </li>
    {/each}
  </ol>
  {#if caption}
    <figcaption class="media-caption">{caption}</figcaption>
  {/if}
</figure>
