<script lang="ts">
  import { onMount } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { reducedMotion } from '@/lib/motion';

  interface Stat {
    value: number;
    label: string;
    prefix?: string;
    suffix?: string;
    decimals?: number;
  }

  interface Props {
    stats: Stat[];
    caption?: string;
  }

  const { stats, caption }: Props = $props();

  let root = $state<HTMLElement | null>(null);
  // SSR 与降级时直接显示终值；hydrate 后从 0 数到终值
  const tweens = stats.map((s) => new Tween(s.value, { duration: 1400, easing: cubicOut }));

  onMount(() => {
    if (reducedMotion() || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          tweens.forEach((t, i) => {
            t.set(0, { duration: 0 });
            t.target = stats[i].value;
          });
          io.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    io.observe(root);
    return () => io.disconnect();
  });
</script>

<figure class="media-frame not-prose" bind:this={root}>
  <dl
    class="grid gap-px overflow-hidden bg-surface-800"
    style="grid-template-columns: repeat({Math.min(stats.length, 4)}, minmax(0, 1fr))"
  >
    {#each stats as s, i (i)}
      <div class="bg-surface-900 p-5 text-center">
        <dd class="font-mono text-3xl font-semibold text-ink-100">
          {s.prefix ?? ''}{tweens[i].current.toFixed(s.decimals ?? 0)}<span class="text-accent-400">{s.suffix ?? ''}</span>
        </dd>
        <dt class="mt-1 text-sm text-ink-500">{s.label}</dt>
      </div>
    {/each}
  </dl>
  {#if caption}
    <figcaption class="media-caption">{caption}</figcaption>
  {/if}
</figure>
