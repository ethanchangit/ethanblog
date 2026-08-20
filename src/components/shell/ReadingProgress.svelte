<script lang="ts">
  import { fetchUser } from '@/lib/user';

  interface Props {
    slug: string;
  }

  let { slug }: Props = $props();

  let loggedIn = $state(false);
  let restored = $state(false);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function scrollRoot(): { top: number; max: number; node: Element | Window } {
    const pane = document.querySelector('[data-reading-pane]');
    if (pane) {
      return { top: pane.scrollTop, max: pane.scrollHeight - pane.clientHeight, node: pane };
    }
    const doc = document.documentElement;
    return {
      top: doc.scrollTop || document.body.scrollTop,
      max: doc.scrollHeight - doc.clientHeight,
      node: window,
    };
  }

  function scrollPercent(): number {
    const { top, max } = scrollRoot();
    if (max <= 0) return 100;
    return (top / max) * 100;
  }

  function restoreScroll(percent: number) {
    const { max, node } = scrollRoot();
    const top = (percent / 100) * max;
    if (node === window) {
      window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'instant' });
    } else {
      (node as Element).scrollTo({ top, behavior: reducedMotion ? 'auto' : 'instant' });
    }
  }

  $effect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function init() {
      const user = await fetchUser();
      if (cancelled) return;
      loggedIn = user != null;
      if (!user || restored) return;

      try {
        const res = await fetch(`/api/progress?slug=${encodeURIComponent(slug)}`, {
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { percent: number | null };
        if (data.percent != null && data.percent > 1) {
          requestAnimationFrame(() => {
            if (!cancelled) {
              restoreScroll(data.percent!);
              restored = true;
            }
          });
        }
      } catch {
        /* offline or unauthenticated — keep local scroll */
      }
    }

    init();

    function onScroll() {
      if (!loggedIn || cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const percent = scrollPercent();
        try {
          await fetch('/api/progress', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storySlug: slug, percent }),
          });
        } catch {
          /* best-effort sync */
        }
      }, 800);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    document.querySelector('[data-reading-pane]')?.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      document.querySelector('[data-reading-pane]')?.removeEventListener('scroll', onScroll);
    };
  });
</script>

<!-- Progress sync is side-effect only; the visual bar lives in Doc.astro -->
