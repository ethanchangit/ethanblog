<script lang="ts">
  interface Img {
    src: string;
    alt: string;
  }

  interface Props {
    before: Img;
    after: Img;
    initial?: number; // 0-100
    labels?: [string, string];
    caption?: string;
  }

  const { before, after, initial = 50, labels = ['之前', '之后'], caption }: Props = $props();

  let pos = $state(initial);
  let container = $state<HTMLDivElement | null>(null);
  let dragging = $state(false);

  function setFromClientX(clientX: number) {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    pos = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
  }

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  }
  function onPointerMove(e: PointerEvent) {
    if (dragging) setFromClientX(e.clientX);
  }
  function onPointerUp() {
    dragging = false;
  }
</script>

<figure class="media-frame not-prose">
  <div
    bind:this={container}
    class="relative select-none overflow-hidden"
    class:cursor-grabbing={dragging}
    class:cursor-grab={!dragging}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    style="touch-action: pan-y"
  >
    <img src={before.src} alt={before.alt} class="block w-full" draggable="false" />
    <div class="absolute inset-0" style="clip-path: inset(0 0 0 {pos}%)">
      <img src={after.src} alt={after.alt} class="block h-full w-full object-cover" draggable="false" />
    </div>

    <!-- 分割线与手柄（视觉） -->
    <div class="pointer-events-none absolute inset-y-0" style="left: {pos}%">
      <div class="absolute inset-y-0 -ml-px w-0.5 bg-accent-400/90 shadow-[0_0_10px_rgba(34,211,238,0.6)]"></div>
      <div
        class="absolute top-1/2 -ml-4 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-accent-400 bg-surface-950/90 font-mono text-[10px] text-accent-300"
      >
        ⇔
      </div>
    </div>

    <span class="absolute left-3 top-3 rounded bg-surface-950/80 px-2 py-0.5 font-mono text-xs text-ink-300">{labels[0]}</span>
    <span class="absolute right-3 top-3 rounded bg-surface-950/80 px-2 py-0.5 font-mono text-xs text-accent-300">{labels[1]}</span>

    <!-- 键盘可访问性：真正的控制器是这个视觉隐藏的 range -->
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      bind:value={pos}
      aria-label={`${labels[0]} 与 ${labels[1]} 对比`}
      class="absolute inset-x-0 bottom-0 h-6 w-full cursor-ew-resize opacity-0 focus-visible:opacity-100"
    />
  </div>
  {#if caption}
    <figcaption class="media-caption">{caption}</figcaption>
  {/if}
</figure>
