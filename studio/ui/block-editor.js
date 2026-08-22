import {
  atQueryAtCaret,
  classifyBlock,
  clearBlockFormat,
  detectMarkdownShortcut,
  docRefMarkup,
  formatBlock,
  hasBlockFormat,
  joinBlocks,
  matchPages,
  mergeBlockMarkdown,
  renderBlockHtml,
  splitBlocks,
} from '../blocks.mjs';

function pageOf(page) {
  return `${page.collection}/${page.id}`;
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

function inlineNodesToMarkdown(node) {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.nodeValue ?? '').replace(/\u00A0/g, ' ').replace(/[\u200B\uFEFF]/g, '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return '\n';
  const inner = [...node.childNodes].map(inlineNodesToMarkdown).join('');
  if (tag === 'strong' || tag === 'b') return inner ? `**${inner}**` : '';
  if (tag === 'em' || tag === 'i') return inner ? `*${inner}*` : '';
  if (tag === 'code') return inner ? `\`${inner}\`` : '';
  if (tag === 'a') {
    const href = node.getAttribute('href') || '';
    return `[${inner}](${href})`;
  }
  return inner;
}

function stripMarks(value) {
  return String(value ?? '').replace(/\u00A0/g, ' ').replace(/[\u200B\uFEFF]/g, '');
}

function visibleText(el) {
  return stripMarks(el?.innerText ?? '').replace(/\n+$/, '');
}

function isImeEvent(event, composing) {
  return Boolean(
    composing
    || event.isComposing
    || event.keyCode === 229
    || event.which === 229
    || event.key === 'Process'
  );
}

function editableToMarkdown(el) {
  if (!(el instanceof HTMLElement)) return '';
  const kind = el.dataset.kind || 'p';
  const level = Number(el.dataset.level || 2);
  if (kind === 'opaque' || kind === 'fence' || kind === 'hr') {
    return visibleText(el);
  }
  if (kind === 'ul' || kind === 'ol') {
    const items = [...el.querySelectorAll('li')].map((item) => inlineNodesToMarkdown(item).replace(/\n+/g, ' ').trim());
    return formatBlock(kind, items.join('\n'));
  }
  const text = inlineNodesToMarkdown(el).replace(/^\n+|\n+$/g, '');
  return formatBlock(kind, text, { level });
}

function caretOffsetIn(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !el) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer) && range.startContainer !== el) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().replace(/[\u200B\uFEFF]/g, '').length;
}

function isCollapsed() {
  const sel = window.getSelection();
  return Boolean(sel && sel.isCollapsed);
}

function setCaretOffset(el, offset) {
  if (!(el instanceof Node)) return;
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode();
  while (node) {
    const len = node.data.length;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function mountBlockEditor(host, options) {
  const {
    value,
    onChange,
    pages = [],
    currentOf = '',
    canCreateChild = false,
    pane = 'series',
    onEnsureImport,
    onCreate,
  } = options;

  let blocks = splitBlocks(value);
  let focused = -1;
  let composing = false;
  let mention = null;
  let mentionIndex = 0;
  let destroyed = false;
  let ignoreBlur = false;
  let ignoreBlurUntil = 0;

  function holdBlur(ms = 250) {
    ignoreBlur = true;
    ignoreBlurUntil = Date.now() + ms;
    const release = () => {
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('mouseup', release, true);
      window.setTimeout(() => {
        if (Date.now() < ignoreBlurUntil) return;
        ignoreBlur = false;
      }, 0);
    };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('mouseup', release, true);
    window.setTimeout(release, ms);
  }

  host.replaceChildren();
  host.classList.add('studio-editor');

  function emit() {
    onChange?.(joinBlocks(blocks));
  }

  function previewAt(index) {
    return host.querySelector(`[data-block-index="${index}"] .studio-block__preview`);
  }

  function focusedEl() {
    return previewAt(focused);
  }

  function commitFocused() {
    const el = focusedEl();
    if (!(el instanceof HTMLElement) || focused < 0) return;
    if (el.getAttribute('contenteditable') !== 'true') return;
    blocks[focused] = editableToMarkdown(el);
  }

  function mentionItems() {
    const query = mention?.query ?? '';
    const available = pages.filter((page) => pageOf(page) !== currentOf);
    const matched = matchPages(available, query).slice(0, 24);
    const items = matched.map((page) => ({
      type: 'doc',
      of: pageOf(page),
      title: page.title,
      path: pageOf(page),
    }));
    const title = query.trim();
    if (title) {
      if (canCreateChild) {
        items.push({ type: 'create-child', title, label: `新建子页面「${title}」` });
      }
      items.push({ type: 'create-article', title, label: `新建文章「${title}」` });
    }
    return items;
  }

  function placePicker(picker, el) {
    const hostBox = host.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const top = box.bottom - hostBox.top + host.scrollTop + 6;
    const left = Math.max(40, box.left - hostBox.left);
    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;
  }

  function closeMention({ keepAt = true } = {}) {
    if (!mention || focused < 0) {
      mention = null;
      return;
    }
    const start = mention.start;
    const end = start + 1 + mention.query.length;
    const source = blocks[focused];
    blocks[focused] = keepAt
      ? `${source.slice(0, start)}@${source.slice(end)}`
      : `${source.slice(0, start)}${source.slice(end)}`;
    emit();
    mention = null;
    mentionIndex = 0;
    host.querySelector('[data-testid="studio-at-picker"]')?.remove();
    paintBlock(focused);
    const el = focusedEl();
    if (el) setCaretOffset(el, keepAt ? start + 1 : start);
  }

  function dismissMention() {
    closeMention({ keepAt: true });
    paintPicker();
  }

  function paintPicker() {
    host.querySelector('[data-testid="studio-at-picker"]')?.remove();
    if (!mention || focused < 0) return;
    const el = focusedEl();
    if (!(el instanceof HTMLElement)) return;
    const items = mentionItems();
    if (mentionIndex >= items.length) mentionIndex = Math.max(0, items.length - 1);
    const picker = document.createElement('div');
    picker.className = 'studio-at-picker';
    picker.setAttribute('data-testid', 'studio-at-picker');
    picker.setAttribute('role', 'listbox');
    picker.setAttribute('aria-label', '插入页面');
    const hint = document.createElement('p');
    hint.className = 'studio-at-picker__hint ui-meta';
    hint.textContent = mention.query ? '匹配页面，或新建' : '选择要插入的页面';
    picker.append(hint);
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'ui-meta';
      empty.textContent = '没有匹配的页面';
      picker.append(empty);
    }
    items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'studio-at-item';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', index === mentionIndex ? 'true' : 'false');
      if (item.type === 'doc') {
        button.innerHTML = `<span class="studio-at-item__title">${escapeText(item.title)}</span><span class="studio-at-item__meta ui-meta">${escapeText(item.path)}</span>`;
      } else {
        button.innerHTML = `<span class="studio-at-item__title">${escapeText(item.label)}</span><span class="studio-at-item__meta ui-meta">${item.type === 'create-child' ? '当前页的子 MDX' : '新的草稿文章'}</span>`;
      }
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void applyMention(item);
      });
      picker.append(button);
    });
    host.append(picker);
    placePicker(picker, el);
  }

  function insertMarkupAt(index, offset, markup) {
    const source = blocks[index] ?? '';
    const before = source.slice(0, offset).replace(/\s+$/, '');
    const after = source.slice(offset).replace(/^\s+/, '');
    const next = [];
    if (before) next.push(before);
    next.push(markup);
    if (after) next.push(after);
    if (!next.length) next.push('');
    blocks.splice(index, 1, ...next);
    mention = null;
    mentionIndex = 0;
    const nextFocus = after ? index + (before ? 2 : 1) : index;
    onEnsureImport?.();
    emit();
    paint();
    activate(after ? nextFocus : index, { caret: after ? 0 : null });
  }

  function replaceMentionWith(markup) {
    if (!mention || focused < 0) return;
    const start = mention.start;
    const end = start + 1 + mention.query.length;
    const source = blocks[focused];
    blocks[focused] = `${source.slice(0, start)}${source.slice(end)}`;
    insertMarkupAt(focused, start, markup);
  }

  async function applyMention(item) {
    if (!item) return;
    if (item.type === 'doc') {
      replaceMentionWith(docRefMarkup(item.of, pane));
      return;
    }
    if (!mention || focused < 0) return;
    const start = mention.start;
    const source = blocks[focused];
    const end = start + 1 + mention.query.length;
    blocks[focused] = `${source.slice(0, start)}${source.slice(end)}`;
    mention = null;
    mentionIndex = 0;
    emit();
    host.querySelector('[data-testid="studio-at-picker"]')?.remove();
    paintBlock(focused);
    if (!onCreate) return;
    const created = await onCreate({
      kind: item.type === 'create-child' ? 'child' : 'article',
      title: item.title,
    });
    if (!created || created.reloaded || destroyed) return;
    if (focused < 0) focused = Math.max(0, blocks.length - 1);
    insertMarkupAt(focused, start, docRefMarkup(created.of, pane));
  }

  function decoratePreview(preview, index) {
    const kind = classifyBlock(blocks[index]);
    preview.className = 'studio-block__preview prose-site';
    preview.innerHTML = renderBlockHtml(blocks[index]);
    preview.dataset.kind = kind.type;
    if (kind.level) preview.dataset.level = String(kind.level);
    else delete preview.dataset.level;
    preview.setAttribute('aria-label', '编辑这一段');
    preview.spellcheck = true;
    if (index === focused) {
      preview.contentEditable = 'true';
      preview.dataset.blockSource = '';
    } else {
      preview.removeAttribute('contenteditable');
      delete preview.dataset.blockSource;
    }
  }

  function paintBlock(index) {
    const preview = previewAt(index);
    if (!(preview instanceof HTMLElement)) return;
    decoratePreview(preview, index);
  }

  function paint() {
    const items = [];
    blocks.forEach((block, index) => {
      const row = document.createElement('div');
      row.className = 'studio-block';
      row.dataset.blockIndex = String(index);
      const mark = document.createElement('span');
      mark.className = 'studio-block__mark ui-meta';
      mark.textContent = String(index + 1);
      mark.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div');
      body.className = 'studio-block__body';
      const preview = document.createElement('div');
      decoratePreview(preview, index);
      body.append(preview);
      row.append(mark, body);
      items.push(row);
    });
    host.replaceChildren(...items);
    paintPicker();
  }

  function ensureStableCaret(el) {
    const leaf = el.querySelector('p, h1, h2, h3, h4, h5, h6, li, pre, code') || el;
    const onlyBr = leaf.childNodes.length === 1 && leaf.firstChild?.nodeName === 'BR';
    if (leaf.childNodes.length === 0 || onlyBr) {
      leaf.replaceChildren(document.createTextNode('\u200B'));
    }
  }

  function activate(index, { caret, focus = true } = {}) {
    if (index < 0 || index >= blocks.length) return;
    holdBlur();
    if (focused >= 0 && focused !== index) {
      const prev = previewAt(focused);
      if (prev instanceof HTMLElement) {
        prev.removeAttribute('contenteditable');
        delete prev.dataset.blockSource;
      }
    }
    focused = index;
    const el = previewAt(index);
    if (!(el instanceof HTMLElement)) return;
    el.contentEditable = 'true';
    el.dataset.blockSource = '';
    ensureStableCaret(el);
    if (focus) el.focus({ preventScroll: true });
    if (caret != null) setCaretOffset(el, caret);
  }

  function collapseFocus() {
    if (focused < 0) return;
    commitFocused();
    emit();
    focused = -1;
    mention = null;
    blocks = splitBlocks(joinBlocks(blocks));
    if (!blocks.length) blocks = [''];
    paint();
  }

  function applyKind(type, text, extra = {}) {
    if (focused < 0) return;
    blocks[focused] = formatBlock(type, text, extra);
    emit();
    paintBlock(focused);
    const el = focusedEl();
    if (el) {
      el.focus({ preventScroll: true });
      setCaretOffset(el, String(text ?? '').length);
    }
  }

  function maybeShortcut(el) {
    if (!(el instanceof HTMLElement) || focused < 0) return false;
    if ((el.dataset.kind || 'p') !== 'p') return false;
    const found = detectMarkdownShortcut(visibleText(el));
    if (!found) return false;
    applyKind(found.type, found.text, { level: found.level });
    return true;
  }

  function checkMention(el) {
    const found = atQueryAtCaret(visibleText(el), caretOffsetIn(el));
    if (found) {
      mention = found;
      mentionIndex = 0;
      paintPicker();
    } else if (mention) {
      mention = null;
      host.querySelector('[data-testid="studio-at-picker"]')?.remove();
    }
  }

  function onInput(event) {
    if (isImeEvent(event, composing) || event.inputType === 'insertCompositionText') return;
    const el = event.target instanceof Element ? event.target.closest('.studio-block__preview') : null;
    if (!(el instanceof HTMLElement) || el.getAttribute('contenteditable') !== 'true' || focused < 0) return;
    if (maybeShortcut(el)) return;
    blocks[focused] = editableToMarkdown(el);
    emit();
    checkMention(el);
  }

  function afterComposition(event) {
    composing = false;
    const el = event.target instanceof Element ? event.target.closest('.studio-block__preview') : null;
    if (!(el instanceof HTMLElement) || focused < 0) return;
    if (maybeShortcut(el)) return;
    blocks[focused] = editableToMarkdown(el);
    emit();
    checkMention(el);
  }

  function currentListItem(el) {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return null;
    const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement;
    return node?.closest('li') ?? el.querySelector('li');
  }

  function onKey(event) {
    if (isImeEvent(event, composing)) return;
    const el = event.target instanceof Element ? event.target.closest('.studio-block__preview') : null;
    if (!(el instanceof HTMLElement) || el.getAttribute('contenteditable') !== 'true' || focused < 0) return;

    if (mention) {
      const items = mentionItems();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        mentionIndex = items.length ? (mentionIndex + 1) % items.length : 0;
        paintPicker();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        mentionIndex = items.length ? (mentionIndex - 1 + items.length) % items.length : 0;
        paintPicker();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        void applyMention(items[mentionIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissMention();
        return;
      }
    }

    const kind = classifyBlock(blocks[focused]);
    const atStart = isCollapsed() && caretOffsetIn(el) === 0;
    const atEnd = isCollapsed() && caretOffsetIn(el) >= visibleText(el).length;

    if (!event.shiftKey && event.key === 'ArrowLeft' && atStart && focused > 0) {
      event.preventDefault();
      commitFocused();
      emit();
      activate(focused - 1, { caret: classifyBlock(blocks[focused - 1]).text.length });
      return;
    }
    if (!event.shiftKey && event.key === 'ArrowRight' && atEnd && focused < blocks.length - 1) {
      event.preventDefault();
      commitFocused();
      emit();
      activate(focused + 1, { caret: 0 });
      return;
    }
    if (event.key === 'ArrowUp' && atStart && focused > 0) {
      event.preventDefault();
      commitFocused();
      emit();
      activate(focused - 1, { caret: classifyBlock(blocks[focused - 1]).text.length });
      return;
    }
    if (event.key === 'ArrowDown' && atEnd && focused < blocks.length - 1) {
      event.preventDefault();
      commitFocused();
      emit();
      activate(focused + 1, { caret: 0 });
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      if (kind.type === 'fence' || kind.type === 'opaque') return;
      if (kind.type === 'ul' || kind.type === 'ol') {
        const li = currentListItem(el);
        const emptyItem = !li || !stripMarks(li.textContent ?? '').trim();
        if (emptyItem) {
          event.preventDefault();
          commitFocused();
          const remaining = classifyBlock(blocks[focused]).text.split('\n').filter((line) => line.trim());
          if (remaining.length) blocks[focused] = formatBlock(kind.type, remaining.join('\n'));
          else blocks[focused] = '';
          blocks.splice(focused + 1, 0, '');
          emit();
          paint();
          activate(focused + 1, { caret: 0 });
        }
        return;
      }
      event.preventDefault();
      commitFocused();
      const current = classifyBlock(blocks[focused]);
      const offset = Math.min(caretOffsetIn(el), current.text.length);
      const before = current.text.slice(0, offset);
      const after = current.text.slice(offset);
      blocks[focused] = formatBlock(current.type, before, { level: current.level });
      blocks.splice(focused + 1, 0, after);
      emit();
      paint();
      activate(focused + 1, { caret: 0 });
      return;
    }

    if (event.key === 'Delete' && atEnd && focused < blocks.length - 1) {
      event.preventDefault();
      commitFocused();
      const caret = classifyBlock(blocks[focused]).text.length;
      blocks[focused] = mergeBlockMarkdown(blocks[focused], blocks[focused + 1]);
      blocks.splice(focused + 1, 1);
      emit();
      paint();
      activate(focused, { caret });
      return;
    }

    if (event.key === 'Backspace' && atStart) {
      event.preventDefault();
      commitFocused();
      if (hasBlockFormat(blocks[focused])) {
        blocks[focused] = clearBlockFormat(blocks[focused]);
        emit();
        paintBlock(focused);
        focusedEl()?.focus({ preventScroll: true });
        setCaretOffset(focusedEl(), 0);
        return;
      }
      if (focused === 0) {
        if (!classifyBlock(blocks[0]).text.trim()) {
          blocks[0] = '';
          emit();
          paintBlock(0);
        }
        return;
      }
      const prevLen = classifyBlock(blocks[focused - 1]).text.length;
      blocks[focused - 1] = mergeBlockMarkdown(blocks[focused - 1], blocks[focused]);
      blocks.splice(focused, 1);
      emit();
      paint();
      activate(focused - 1, { caret: prevLen });
    }
  }

  function onFocusOut() {
    requestAnimationFrame(() => {
      if (destroyed || ignoreBlur || Date.now() < ignoreBlurUntil) return;
      if (mention) return;
      if (host.contains(document.activeElement)) return;
      collapseFocus();
    });
  }

  host.addEventListener('input', onInput);
  host.addEventListener('keydown', onKey);
  host.addEventListener('focusout', onFocusOut);
  host.addEventListener('compositionstart', () => { composing = true; });
  host.addEventListener('compositionend', afterComposition);

  host.addEventListener('pointerdown', (event) => {
    if (destroyed) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-testid="studio-at-picker"]')) {
      event.preventDefault();
      return;
    }
    const link = target.closest('a');
    if (link && host.contains(link)) event.preventDefault();
    const row = target.closest('[data-block-index]');
    if (row) {
      const index = Number(row.dataset.blockIndex);
      if (index === focused) return;
      commitFocused();
      emit();
      mention = null;
      host.querySelector('[data-testid="studio-at-picker"]')?.remove();
      activate(index, { focus: false });
      return;
    }
    if (target === host) {
      if (blocks[blocks.length - 1] !== '') {
        commitFocused();
        blocks.push('');
        emit();
        paint();
      }
      mention = null;
      activate(blocks.length - 1, { caret: 0 });
    }
  });

  const onDocPointer = (event) => {
    if (!(event.target instanceof Node) || host.contains(event.target)) return;
    if (mention) dismissMention();
  };
  document.addEventListener('pointerdown', onDocPointer);

  paint();

  return {
    destroy() {
      destroyed = true;
      commitFocused();
      document.removeEventListener('pointerdown', onDocPointer);
    },
  };
}
