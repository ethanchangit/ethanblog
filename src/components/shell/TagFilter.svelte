<script lang="ts">
  import { onMount } from 'svelte';
  import { tagsPageHref } from '@/lib/routes';
  import { localeFromPath, localizeHref } from '@/lib/locale';

  function localeTagsHref(tag?: string | null): string {
    const locale = typeof location === 'undefined' ? 'en' : localeFromPath(location.pathname);
    return localizeHref(tagsPageHref({ tag }), locale);
  }

  function selectedTag(): string {
    if (typeof location === 'undefined') return '';
    return new URLSearchParams(location.search).get('tag')?.trim() ?? '';
  }

  function applySelection(root: HTMLElement) {
    const selected = selectedTag();

    root.querySelectorAll<HTMLAnchorElement>('a[data-tag-select]').forEach((a) => {
      const tag = a.dataset.tagSelect ?? '';
      const on = Boolean(selected) && tag === selected;
      a.setAttribute('href', localeTagsHref(on ? null : tag));
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });

    const results = root.querySelector<HTMLElement>('[data-doc-results]');

    if (!selected) {
      if (results) results.hidden = true;
      root.querySelectorAll<HTMLElement>('[data-doc-item]').forEach((el) => {
        el.hidden = true;
      });
      const docEmpty = root.querySelector<HTMLElement>('[data-doc-empty]');
      if (docEmpty) docEmpty.hidden = true;
      return;
    }

    if (results) results.hidden = false;

    let docVisible = 0;
    root.querySelectorAll<HTMLElement>('[data-doc-item]').forEach((el) => {
      const tags = (el.dataset.docTags ?? '').split('\n').filter(Boolean);
      const show = tags.includes(selected);
      el.hidden = !show;
      if (show) docVisible += 1;
    });
    const docEmpty = root.querySelector<HTMLElement>('[data-doc-empty]');
    if (docEmpty) docEmpty.hidden = docVisible > 0;
  }

  function sync() {
    if (typeof document === 'undefined') return;
    const root = document.querySelector<HTMLElement>('[data-tag-index]');
    if (!root) return;
    applySelection(root);
  }

  onMount(() => {
    const root = document.querySelector<HTMLElement>('[data-tag-index]');

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[data-tag-select]');
      if (!target || !root?.contains(target)) return;
      event.preventDefault();

      const currentTag = selectedTag();
      const next = target.dataset.tagSelect ?? '';
      if (!next || next === currentTag) {
        history.pushState(null, '', localeTagsHref(null));
      } else {
        history.pushState(null, '', localeTagsHref(next));
      }
      sync();
    };

    root?.addEventListener('click', onClick, true);
    window.addEventListener('popstate', sync);
    document.addEventListener('astro:page-load', sync);
    sync();

    return () => {
      root?.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', sync);
      document.removeEventListener('astro:page-load', sync);
    };
  });
</script>
