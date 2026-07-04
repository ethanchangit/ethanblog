<script lang="ts">
  import { onMount } from 'svelte';
  import { vizRegistry } from '@/lib/viz/registry';
  import { reducedMotion } from '@/lib/motion';

  interface Scene {
    title: string;
    text: string;
    viz?: string;
    params?: Record<string, number>;
  }

  interface Props {
    scenes: Scene[];
    /** 每个场景占用的滚动距离（vh） */
    perScene?: number;
    progressBar?: boolean;
    caption?: string;
  }

  const { scenes, perScene = 120, progressBar = true, caption }: Props = $props();

  let progress = $state(0);
  let active = $state(0);
  let animated = $state(false); // hydrate 且允许动效后才切换为滚动剧场模式
  let container = $state<HTMLElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let stage = $state<HTMLDivElement | null>(null);

  function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  function draw() {
    if (!canvas || !stage) return;
    const dpr = window.devicePixelRatio || 1;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 场景间参数插值：滚动经过场景边界时可视化平滑过渡
    const exact = progress * (scenes.length - 1);
    const i = Math.min(scenes.length - 1, Math.floor(exact));
    const next = Math.min(scenes.length - 1, i + 1);
    const t = exact - i;
    const a = scenes[i];
    const b = scenes[next];
    const viz = t < 0.5 ? (a.viz ?? 'network') : (b.viz ?? 'network');
    const keys = new Set([...Object.keys(a.params ?? {}), ...Object.keys(b.params ?? {})]);
    const params: Record<string, number> = {};
    for (const k of keys) {
      params[k] = lerp(a.params?.[k] ?? 0, b.params?.[k] ?? 0, t);
    }
    (vizRegistry[viz] ?? vizRegistry.network)(ctx, w, h, params);
  }

  onMount(() => {
    if (reducedMotion()) {
      // 降级：静态分节展示，无滚动剧场
      return;
    }

    let trigger: globalThis.ScrollTrigger | undefined;
    let disposed = false;

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (disposed || !container) return;
      gsap.registerPlugin(ScrollTrigger);
      animated = true;

      trigger = ScrollTrigger.create({
        trigger: container,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          progress = self.progress;
          active = Math.min(scenes.length - 1, Math.round(self.progress * (scenes.length - 1)));
          draw();
        },
      });
      draw();
    })();

    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => {
      disposed = true;
      trigger?.kill();
      window.removeEventListener('resize', onResize);
    };
  });
</script>

<section
  bind:this={container}
  class="media-frame not-prose"
  style={animated ? `height: ${scenes.length * perScene}vh; margin-block: 2rem;` : ''}
>
  {#if animated}
    <div class="sticky top-0 flex h-screen flex-col">
      <div bind:this={stage} class="relative flex-1">
        <canvas bind:this={canvas} class="absolute inset-0"></canvas>
        <div class="relative z-10 flex h-full items-end p-6 sm:items-center sm:p-12">
          {#each scenes as s, i (i)}
            <div
              class="absolute max-w-md rounded-xl border border-surface-800 bg-surface-950 p-5 transition-all duration-500"
              style="opacity: {active === i ? 1 : 0}; transform: translateY({active === i
                ? 0
                : 12}px); pointer-events: {active === i ? 'auto' : 'none'}"
              aria-hidden={active !== i}
            >
              <p class="ui-meta mb-1">
                {String(i + 1).padStart(2, '0')} / {String(scenes.length).padStart(2, '0')}
              </p>
              <h3 class="mb-2 text-lg font-semibold text-ink-100">{s.title}</h3>
              <p class="text-sm leading-relaxed text-ink-400">{s.text}</p>
            </div>
          {/each}
        </div>
      </div>
      {#if progressBar}
        <div class="h-0.5 bg-surface-800">
          <div
            class="h-full bg-ink-500"
            style="width: {progress * 100}%"
          ></div>
        </div>
      {/if}
    </div>
  {:else}
    <!-- 注水前 / 关闭动效时的降级：全部场景静态平铺，内容一字不少 -->
    <div class="divide-y divide-surface-800">
      {#each scenes as s, i (i)}
        <div class="p-6">
          <p class="ui-meta mb-1">
            {String(i + 1).padStart(2, '0')} / {String(scenes.length).padStart(2, '0')}
          </p>
          <h3 class="mb-2 text-lg font-semibold text-ink-100">{s.title}</h3>
          <p class="text-sm leading-relaxed text-ink-400">{s.text}</p>
        </div>
      {/each}
    </div>
  {/if}
  {#if caption}
    <figcaption class="media-caption">{caption}</figcaption>
  {/if}
</section>
