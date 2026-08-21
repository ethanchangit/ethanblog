<script lang="ts">
  import { vizRegistry } from '@/lib/viz/registry';
  import { t } from '@/lib/i18n';

  interface Control {
    key: string;
    label: string;
    min: number;
    max: number;
    step?: number;
    initial: number;
    unit?: string;
  }

  interface Props {
    /* 单参数快捷用法 */
    label?: string;
    min?: number;
    max?: number;
    step?: number;
    initial?: number;
    unit?: string;
    paramKey?: string;
    /* 多参数用法：提供 controls 时忽略上面的快捷 props */
    controls?: Control[];
    viz?: string;
    height?: number;
    caption?: string;
  }

  const {
    label = '参数',
    min = 0,
    max = 100,
    step = 1,
    initial = 50,
    unit = '',
    paramKey = 'count',
    controls,
    viz = 'network',
    height = 280,
    caption,
  }: Props = $props();

  const items: Control[] = controls ?? [
    { key: paramKey, label, min, max, step, initial, unit },
  ];

  const values = $state<Record<string, number>>(
    Object.fromEntries(items.map((c) => [c.key, c.initial]))
  );

  let canvas = $state<HTMLCanvasElement | null>(null);
  let box = $state<HTMLDivElement | null>(null);

  function draw() {
    if (!canvas || !box) return;
    const dpr = window.devicePixelRatio || 1;
    const w = box.clientWidth;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    (vizRegistry[viz] ?? vizRegistry.network)(ctx, w, h, { ...values });
  }

  $effect(() => {
    // 依赖 values 的所有键，值变化即重绘
    for (const c of items) void values[c.key];
    draw();
  });

  $effect(() => {
    if (!box) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(box);
    return () => ro.disconnect();
  });
</script>

<figure class="media-frame not-prose">
  <div class="grid md:grid-cols-[220px_1fr] md:gap-8">
    <div class="flex flex-col justify-center gap-5 py-2">
      {#each items as c (c.key)}
        <label class="block">
          <span class="mb-2 flex items-baseline justify-between text-sm">
            <span class="text-ink-300">{c.label}</span>
            <span class="ui-meta text-ink-300">{values[c.key]}{c.unit ?? ''}</span>
          </span>
          <input
            type="range"
            min={c.min}
            max={c.max}
            step={c.step ?? 1}
            bind:value={values[c.key]}
            aria-label={c.label}
            class="param-range w-full"
          />
        </label>
      {/each}
      <p class="text-[11px] text-ink-600">
        <span class="i18n-zh" aria-hidden="true">{t('zh-CN', 'paramHint')}</span><span class="i18n-en">{t('en', 'paramHint')}</span>
      </p>
    </div>
    <div bind:this={box} class="relative" style="height: {height}px">
      <canvas bind:this={canvas} class="absolute inset-0"></canvas>
    </div>
  </div>
  {#if caption}
    <figcaption class="media-caption">{caption}</figcaption>
  {/if}
</figure>

<style>
  .param-range {
    appearance: none;
    height: 2px;
    background: var(--color-ink-600);
    outline-offset: 4px;
  }
  .param-range::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    background: var(--color-ink-200);
    cursor: grab;
  }
  .param-range::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: var(--color-ink-200);
    border: none;
    cursor: grab;
  }
</style>
