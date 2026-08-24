import { filterSlashCommands, hrefForOf, matchPages } from '../blocks.mjs';

export function overlayCopy(lang) {
  const en = lang === 'en';
  return {
    slashLabel: en ? 'Change format' : '更改格式',
    slashHint: en ? 'Type to filter formats' : '输入以筛选格式',
    slashEmpty: en ? 'No matching format' : '没有匹配的格式',
    atLabel: en ? 'Mention a page' : '提及页面',
    wikiLabel: en ? 'Embed a page' : '嵌入页面',
    pageHint: en ? 'Match a page, or create' : '匹配页面，或新建',
    pagePick: en ? 'Choose a page' : '选择要插入的页面',
    pageEmpty: en ? 'No matching page' : '没有匹配的页面',
    childMeta: en ? 'Child MDX of this page' : '当前页的子 MDX',
    articleMeta: en ? 'New draft article' : '新的草稿文章',
    childLabel: (title) => (en ? `New child “${title}”` : `新建子页面「${title}」`),
    articleLabel: (title) => (en ? `New article “${title}”` : `新建文章「${title}」`),
  };
}

export function pageTitle(page, lang) {
  if (lang === 'en' && page?.titleEn) return page.titleEn;
  return page?.title || page?.id || '';
}

export function pageOf(page) {
  return `${page.collection}/${page.id}`;
}

export function pageOverlayItems({ pages, currentOf, query, canCreateChild, lang }) {
  const copy = overlayCopy(lang);
  const available = (pages ?? []).filter((page) => pageOf(page) !== currentOf);
  const matched = matchPages(available, query).slice(0, 24);
  const items = matched.map((page) => ({
    type: 'doc',
    of: pageOf(page),
    title: pageTitle(page, lang),
    path: pageOf(page),
    href: page.href || hrefForOf(pageOf(page)),
  }));
  const title = String(query ?? '').trim();
  if (title) {
    if (canCreateChild) {
      items.push({ type: 'create-child', title, label: copy.childLabel(title) });
    }
    items.push({ type: 'create-article', title, label: copy.articleLabel(title) });
  }
  return items;
}

export function slashOverlayItems(query, lang) {
  return filterSlashCommands(query, lang).map((cmd) => ({ type: 'slash', ...cmd }));
}

export function triggerLength(type) {
  return type === 'wiki' ? 2 : 1;
}

export function paintOverlayPicker(host, {
  items,
  selected,
  label,
  hint,
  empty,
  onPick,
  place,
  anchor,
  pickerType,
  lang = 'zh',
}) {
  host.querySelector('[data-testid="studio-at-picker"]')?.remove();
  if (!anchor) return;
  const picker = document.createElement('div');
  picker.className = 'studio-at-picker';
  picker.setAttribute('data-testid', 'studio-at-picker');
  picker.setAttribute('data-picker', pickerType || 'at');
  picker.setAttribute('role', 'listbox');
  picker.setAttribute('aria-label', label);
  const hintEl = document.createElement('p');
  hintEl.className = 'studio-at-picker__hint ui-meta';
  hintEl.textContent = hint;
  picker.append(hintEl);
  if (!items.length) {
    const emptyEl = document.createElement('p');
    emptyEl.className = 'ui-meta';
    emptyEl.textContent = empty;
    picker.append(emptyEl);
  }
  items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'studio-at-item';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', index === selected ? 'true' : 'false');
    if (item.type === 'slash') {
      button.innerHTML = `<span class="studio-at-item__title">${escapeText(item.label)}</span><span class="studio-at-item__meta ui-meta">${escapeText(item.hint)}</span>`;
    } else if (item.type === 'doc') {
      button.innerHTML = `<span class="studio-at-item__title">${escapeText(item.title)}</span><span class="studio-at-item__meta ui-meta">${escapeText(item.path)}</span>`;
    } else {
      const copy = overlayCopy(lang);
      const meta = item.type === 'create-child' ? copy.childMeta : copy.articleMeta;
      button.innerHTML = `<span class="studio-at-item__title">${escapeText(item.label)}</span><span class="studio-at-item__meta ui-meta">${escapeText(meta)}</span>`;
    }
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void onPick(item);
    });
    picker.append(button);
  });
  host.append(picker);
  place(picker, anchor);
  picker.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}
