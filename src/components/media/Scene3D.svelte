<script lang="ts">
  import { onMount } from 'svelte';
  import { reducedMotion } from '@/lib/motion';
  import { scene3dRegistry, type Scene3DType } from '@/lib/scene3d/registry';

  interface Props {
    scene?: Scene3DType;
    caption?: string;
    height?: number;
  }

  const { scene = 'globe', caption, height = 320 }: Props = $props();

  let container = $state<HTMLDivElement | null>(null);
  let hydrated = $state(false);

  function token(name: string, fallback: string) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /** 设计 token 的 rgb() 可能是空格分隔，转为 three.js 可解析的格式 */
  function toThreeColor(css: string) {
    return css.replace(/rgb\((\d+)\s+(\d+)\s+(\d+)\)/, 'rgb($1, $2, $3)');
  }

  onMount(() => {
    hydrated = true;
    const mountEl = container;
    if (!mountEl) return;

    const reduce = reducedMotion();
    let disposed = false;
    let raf = 0;
    let instance: { animate?: (time: number) => void; dispose: () => void } | undefined;
    let renderer: import('three').WebGLRenderer | undefined;
    let onResize: (() => void) | undefined;

    (async () => {
      const THREE = await import('three');
      if (disposed) return;

      const colors = {
        accent: toThreeColor(token('--color-accent-400', 'rgb(34, 211, 238)')),
        primary: toThreeColor(token('--color-primary-500', 'rgb(59, 130, 246)')),
        surface: toThreeColor(token('--color-surface-950', 'rgb(25, 25, 25)')),
        ink: toThreeColor(token('--color-ink-400', 'rgb(148, 163, 184)')),
      };

      const w = mountEl.clientWidth;
      const h = height;
      const sceneObj = new THREE.Scene();
      sceneObj.background = new THREE.Color(colors.surface);

      const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      camera.position.z = 3.2;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      mountEl.appendChild(renderer.domElement);

      const factory = scene3dRegistry[scene] ?? scene3dRegistry.globe;
      instance = factory({ THREE, scene: sceneObj, colors, reducedMotion: reduce });

      const tick = (time: number) => {
        if (disposed) return;
        if (!reduce) instance?.animate?.(time);
        renderer!.render(sceneObj, camera);
        raf = requestAnimationFrame(tick);
      };

      if (reduce) {
        renderer.render(sceneObj, camera);
      } else {
        raf = requestAnimationFrame(tick);
      }

      onResize = () => {
        if (!mountEl || !renderer) return;
        const nw = mountEl.clientWidth;
        camera.aspect = nw / h;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, h, false);
      };
      window.addEventListener('resize', onResize);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (onResize) window.removeEventListener('resize', onResize);
      instance?.dispose();
      renderer?.dispose();
      if (renderer?.domElement.parentElement === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  });
</script>

<figure class="media-frame not-prose">
  <div bind:this={container} class="relative w-full overflow-hidden" style="height: {height}px">
    {#if !hydrated}
      <div class="flex h-full items-center justify-center font-mono text-xs text-ink-600">
        3D 场景将在 JavaScript 就绪后加载
      </div>
    {/if}
  </div>
  {#if caption}
    <figcaption class="media-caption">{caption}</figcaption>
  {/if}
</figure>
