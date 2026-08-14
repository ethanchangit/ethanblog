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
  <ol class="relative m-0 list-none p-0">
    {#each items as item, i (i)}
      <li
        data-tl-item={i}
        class="relative flex gap-4 py-4 transition-all duration-700"
        style={animated && !visible[i] ? 'opacity: 0; transform: translateY(16px)' : ''}
      >
        <div class="ui-meta w-8 shrink-0 pt-0.5 tabular-nums">
          {item.icon ?? String(i + 1).padStart(2, '0')}
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
