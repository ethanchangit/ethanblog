<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { reducedMotion } from '@/lib/motion';
  import { externalMention, mentionCatalogPath, type MentionPreviewEntry } from '@/lib/mention-preview';

  interface Props {
    entries: MentionPreviewEntry[];
    lang?: 'zh-CN' | 'en';
  }

  let { entries, lang = 'zh-CN' }: Props = $props();

  const SHOW_MS = 300;
  const HIDE_MS = 300;
  const HOLD_MS = 450;
  const SUPPRESS = 'data-mention-preview-suppress';

  let byHref = new Map<string, MentionPreviewEntry>();
  let panel = $state<HTMLElement | null>(null);
  let root = $state<HTMLElement | null>(null);
  let current = $state<MentionPreviewEntry | null>(null);
  let open = $state(false);
  let shown = $state(false);
  let motion = $state(false);

  let anchor: HTMLAnchorElement | null = null;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressTimer: ReturnType<typeof setTimeout> | undefined;
  let showGen = 0;
  let hideGen = 0;
  let showToken = 0;
  let touchPreview = false;
  let holdLink: HTMLAnchorElement | null = null;
  let holdX = 0;
  let holdY = 0;

  $effect(() => {
    byHref = new Map(entries.map((entry) => [entry.href, entry]));
  });

  function entryFor(link: HTMLAnchorElement): MentionPreviewEntry | undefined {
    let url: URL;
    try {
      url = new URL(link.href, location.href);
    } catch {
      return;
    }
    if (url.origin !== location.origin) return;
    const path = mentionCatalogPath(url.pathname);
    if (!path) return;
    return byHref.get(path);
  }

  function externalFor(link: HTMLAnchorElement): MentionPreviewEntry | undefined {
    const external = externalMention(link.href, link.textContent ?? '', location.href);
    if (!external) return;
    return {
      href: external.url,
      title: external.title,
      summary: '',
      paragraphs: [],
      meta: '',
      url: external.url,
    };
  }

  function previewFor(link: HTMLAnchorElement): MentionPreviewEntry | undefined {
    return entryFor(link) ?? externalFor(link);
  }

  function mentionFrom(target: EventTarget | null): HTMLAnchorElement | null {
    if (!(target instanceof Element)) return null;
    const link = target.closest('a');
    if (!(link instanceof HTMLAnchorElement)) return null;
    // 导航、左侧索引、右侧目录和页脚不是正文 mention。
    // 目录链接是页内锚点，解析后路径仍是当前文章，会误对上这篇自己的预览。
    // 右侧栏里的正文链接仍可预览，点击交给阅读栏自己处理。
    // 外链用同一张卡片，但这些区域里的外链也不预览。
    if (link.closest('[data-mention-preview], [data-reading-index], nav.toc, .site-nav, .site-footer')) return null;
    if (!previewFor(link)) return null;
    return link;
  }

  function clearShow() {
    showGen += 1;
    if (showTimer) clearTimeout(showTimer);
  }

  function clearHide() {
    hideGen += 1;
    if (hideTimer) clearTimeout(hideTimer);
  }

  function hideNow() {
    showToken += 1;
    clearShow();
    clearHide();
    anchor?.removeAttribute('aria-describedby');
    anchor = null;
    current = null;
    shown = false;
    open = false;
    touchPreview = false;
  }

  function yieldMeta() {
    if (!panel) return;
    const meta = panel.querySelector('.mention-preview-meta');
    if (!(meta instanceof HTMLElement)) return;
    meta.hidden = false;
    const card = panel.getBoundingClientRect();
    if (card.height < 1) return;
    const box = meta.getBoundingClientRect();
    if (box.bottom > card.bottom - 0.5) meta.hidden = true;
  }

  function movePanel(link: HTMLAnchorElement) {
    if (!panel) return;
    const margin = 8;
    const gap = 8;
    panel.style.maxHeight = '';
    const width = panel.offsetWidth;
    const natural = panel.offsetHeight;
    const rect = link.getBoundingClientRect();
    const spaceBelow = Math.max(0, window.innerHeight - margin - rect.bottom - gap);
    const spaceAbove = Math.max(0, rect.top - gap - margin);
    const below = spaceBelow >= natural || spaceBelow >= spaceAbove;
    const available = Math.floor(below ? spaceBelow : spaceAbove);
    if (available < natural) panel.style.maxHeight = `${Math.max(available, 0)}px`;
    const height = panel.offsetHeight;
    let top = below ? rect.bottom + gap : rect.top - gap - height;
    if (top < margin) top = margin;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - margin - height);
    let left = rect.left;
    if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - margin - width);
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
    yieldMeta();
  }

  async function showNow(link: HTMLAnchorElement) {
    const entry = previewFor(link);
    if (!entry) return;
    const token = ++showToken;
    clearHide();
    if (anchor && anchor !== link) anchor.removeAttribute('aria-describedby');
    anchor = link;
    current = entry;
    open = true;
    await tick();
    if (token !== showToken) return;
    movePanel(link);
    link.setAttribute('aria-describedby', 'mention-preview');
    if (reducedMotion()) shown = true;
    else requestAnimationFrame(() => {
      if (token === showToken && anchor === link) shown = true;
    });
  }

  function scheduleShow(link: HTMLAnchorElement) {
    if (link === anchor && open) {
      clearHide();
      return;
    }
    clearHide();
    const gen = ++showGen;
    if (showTimer) clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      if (gen !== showGen) return;
      void showNow(link);
    }, SHOW_MS);
  }

  function scheduleHide() {
    clearShow();
    const gen = ++hideGen;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (gen !== hideGen) return;
      hideNow();
    }, HIDE_MS);
  }

  function insidePreview(node: EventTarget | null): boolean {
    return node instanceof Node && !!panel?.contains(node);
  }

  function onOver(event: PointerEvent) {
    if (touchPreview || event.pointerType === 'touch') return;
    if (insidePreview(event.target)) {
      clearHide();
      return;
    }
    const link = mentionFrom(event.target);
    if (!link) return;
    const from = event.relatedTarget;
    if (from instanceof Node && link.contains(from)) return;
    scheduleShow(link);
  }

  function onOut(event: PointerEvent) {
    if (touchPreview || event.pointerType === 'touch') return;
    const link = mentionFrom(event.target);
    const fromPreview = insidePreview(event.target);
    if (!link && !fromPreview) return;
    const to = event.relatedTarget;
    if (to instanceof Node && (insidePreview(to) || (anchor && anchor.contains(to)) || (link && link.contains(to)))) return;
    scheduleHide();
  }

  function onFocusIn(event: FocusEvent) {
    const link = mentionFrom(event.target);
    if (!link) return;
    touchPreview = false;
    scheduleShow(link);
  }

  function onFocusOut(event: FocusEvent) {
    if (!anchor) return;
    const next = event.relatedTarget;
    if (next instanceof Node && (insidePreview(next) || anchor.contains(next))) return;
    scheduleHide();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault();
    event.stopPropagation();
    const back = anchor;
    hideNow();
    back?.focus();
  }

  function onPointerDown(event: PointerEvent) {
    const link = mentionFrom(event.target);
    if (open && !link && !insidePreview(event.target)) hideNow();
    if (event.pointerType !== 'touch' || !link) return;
    holdLink = link;
    holdX = event.clientX;
    holdY = event.clientY;
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      if (holdLink !== link) return;
      touchPreview = true;
      link.setAttribute(SUPPRESS, '');
      if (suppressTimer) clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => link.removeAttribute(SUPPRESS), 700);
      void showNow(link);
    }, HOLD_MS);
  }

  function onPointerMove(event: PointerEvent) {
    if (!holdTimer) return;
    if (Math.abs(event.clientX - holdX) > 10 || Math.abs(event.clientY - holdY) > 10) {
      clearTimeout(holdTimer);
      holdTimer = undefined;
      holdLink = null;
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = undefined;
    if (event.pointerType !== 'touch') holdLink = null;
  }

  function onContextMenu(event: Event) {
    if (!touchPreview) return;
    event.preventDefault();
  }

  function onClick(event: MouseEvent) {
    const link = mentionFrom(event.target);
    if (!link?.hasAttribute(SUPPRESS)) return;
    link.removeAttribute(SUPPRESS);
    if (suppressTimer) clearTimeout(suppressTimer);
    event.preventDefault();
    event.stopPropagation();
  }

  function onReflow() {
    if (open && anchor) movePanel(anchor);
  }

  onMount(() => {
    if (document.querySelector('[data-preview-body]')) return;
    motion = !reducedMotion();
    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onReduce = () => {
      motion = !reduceMq.matches;
    };
    reduceMq.addEventListener('change', onReduce);
    root?.setAttribute('data-mention-preview-ready', '');
    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    return () => {
      hideNow();
      if (holdTimer) clearTimeout(holdTimer);
      if (suppressTimer) clearTimeout(suppressTimer);
      reduceMq.removeEventListener('change', onReduce);
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerUp, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  });
</script>

<div bind:this={root} class="mention-preview-root" data-mention-preview-root>
  <div
    bind:this={panel}
    id="mention-preview"
    class="mention-preview"
    class:mention-preview--motion={motion}
    class:is-open={shown}
    data-mention-preview
    data-open={open ? '' : undefined}
    role="tooltip"
    lang={lang === 'en' ? 'en' : 'zh-CN'}
    hidden={!open}
  >
    {#if current}
      <p class="mention-preview-title">{current.title}</p>
      {#if current.url}
        <p class="mention-preview-url">{current.url}</p>
      {:else}
        {#if current.summary}
          <p class="mention-preview-summary article-dek-text">{current.summary}</p>
        {/if}
        {#if current.paragraphs.length}
          <div class="mention-preview-body prose-site">
            {#each current.paragraphs as paragraph}
              <p>{paragraph}</p>
            {/each}
          </div>
        {/if}
        {#if current.meta}
          <p class="mention-preview-meta">{current.meta}</p>
        {/if}
      {/if}
    {/if}
  </div>
</div>
