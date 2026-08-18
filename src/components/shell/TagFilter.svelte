<script lang="ts">
  import { onMount } from 'svelte';
  import { ALL_GROUP } from '@/data/tag-groups';
  import { tagsPageHref } from '@/lib/routes';

  function selectedTag(): string {
    if (typeof location === 'undefined') return '';
    return new URLSearchParams(location.search).get('tag')?.trim() ?? '';
  }

  function selectedGroup(root: HTMLElement): string {
    if (typeof location === 'undefined') return ALL_GROUP;
    const raw = new URLSearchParams(location.search).get('group')?.trim() || ALL_GROUP;
    if (raw === ALL_GROUP) return ALL_GROUP;
    return root.querySelector(`[data-tag-group-select="${CSS.escape(raw)}"]`) ? raw : ALL_GROUP;
  }

  function applyVisibility(root: HTMLElement) {
    const group = selectedGroup(root);
    const tag = selectedTag();

    root.querySelectorAll<HTMLAnchorElement>('a[data-tag-group-select]').forEach((a) => {
      const slug = a.dataset.tagGroupSelect ?? ALL_GROUP;
      const on = slug === group;
      a.setAttribute('href', tagsPageHref({
        group: slug,
        tag: slug === ALL_GROUP ? null : tag || null,
      }));
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });

    let tagVisible = 0;
    root.querySelectorAll<HTMLElement>('[data-tag-item]').forEach((el) => {
      const show = group === ALL_GROUP || el.dataset.tagGroup === group;
      el.hidden = !show;
      if (show) tagVisible += 1;
    });
    const tagEmpty = root.querySelector<HTMLElement>('[data-tag-empty]');
    if (tagEmpty) tagEmpty.hidden = tagVisible > 0;
  }

  function applySelection(root: HTMLElement) {
    const selected = selectedTag();
    const group = selectedGroup(root);

    root.querySelectorAll<HTMLAnchorElement>('a[data-tag-select]').forEach((a) => {
      const tag = a.dataset.tagSelect ?? '';
      const on = Boolean(selected) && tag === selected;
      a.setAttribute('href', tagsPageHref({ group, tag: on ? null : tag }));
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
    applyVisibility(root);
    applySelection(root);
  }

  onMount(() => {
    const root = document.querySelector<HTMLElement>('[data-tag-index]');

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>(
        'a[data-tag-group-select], a[data-tag-select]',
      );
      if (!target || !root?.contains(target)) return;
      event.preventDefault();

      const group = selectedGroup(root);
      const currentTag = selectedTag();

      if (target.hasAttribute('data-tag-group-select')) {
        const nextGroup = target.dataset.tagGroupSelect ?? ALL_GROUP;
        const keepTag = nextGroup !== ALL_GROUP && currentTag ? currentTag : null;
        history.pushState(null, '', tagsPageHref({ group: nextGroup, tag: keepTag }));
        sync();
        return;
      }

      const next = target.dataset.tagSelect ?? '';
      if (!next || next === currentTag) {
        history.pushState(null, '', tagsPageHref({ group }));
      } else {
        history.pushState(null, '', tagsPageHref({ group, tag: next }));
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
