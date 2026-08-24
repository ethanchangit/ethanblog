import {
  applyFormatCommand,
  atQueryAtCaret,
  blockPlainText,
  classifyBlock,
  clearBlockFormat,
  detectMarkdownShortcut,
  docRefMarkup,
  formatBlock,
  hasBlockFormat,
  hrefForOf,
  inlineMentionMarkup,
  joinBlocks,
  mergeBlockMarkdown,
  parseDocEmbed,
  renderBlockHtml,
  slashQueryAtCaret,
  splitBlocks,
  wikiQueryAtCaret,
} from '../blocks.mjs';
import {
  overlayCopy,
  pageOverlayItems,
  pageTitle,
  paintOverlayPicker,
  slashOverlayItems,
  triggerLength,
} from './overlay.js';

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
    lang = 'zh',
    onEnsureImport,
    onCreate,
    onOpenEmbed,
  } = options;

  let blocks = splitBlocks(value);
  let focused = -1;
  let composing = false;
  let overlay = null;
  let overlayIndex = 0;
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

  function overlayItems() {
    if (!overlay) return [];
    if (overlay.type === 'slash') return slashOverlayItems(overlay.query, lang);
    return pageOverlayItems({
      pages,
      currentOf,
      query: overlay.query,
      canCreateChild,
      lang,
    });
  }

  function placePicker(picker, el) {
    const hostBox = host.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const top = box.bottom - hostBox.top + host.scrollTop + 6;
    const left = Math.max(40, box.left - hostBox.left);
    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;
  }

  function removePicker() {
    host.querySelector('[data-testid="studio-at-picker"]')?.remove();
  }

  function stripOverlayTrigger(plain, keepTrigger) {
    if (!overlay) return plain;
    const len = triggerLength(overlay.type);
    const start = overlay.start;
    const end = start + len + overlay.query.length;
    const trigger = overlay.type === 'wiki' ? '[[' : overlay.type === 'slash' ? '/' : '@';
    return keepTrigger
      ? `${plain.slice(0, start)}${trigger}${plain.slice(end)}`
      : `${plain.slice(0, start)}${plain.slice(end)}`;
  }

  function writePlain(plain, caret) {
    if (focused < 0) return;
    const kind = classifyBlock(blocks[focused]);
    const type = kind.type === 'opaque' || kind.type === 'hr' ? 'p' : kind.type;
    blocks[focused] = type === 'p' || type === 'fence' ? (type === 'fence' ? formatBlock('fence', plain) : plain) : formatBlock(type, plain, { level: kind.level });
    overlay = null;
    overlayIndex = 0;
    emit();
    paintBlock(focused);
    const el = focusedEl();
    if (el) {
      el.focus({ preventScroll: true });
      if (caret != null) setCaretOffset(el, caret);
    }
  }

  function closeOverlay({ keepTrigger = true } = {}) {
    if (!overlay || focused < 0) {
      overlay = null;
      overlayIndex = 0;
      removePicker();
      return;
    }
    const kind = classifyBlock(blocks[focused]);
    if (kind.type === 'opaque' || kind.type === 'fence') {
      overlay = null;
      overlayIndex = 0;
      removePicker();
      return;
    }
    const plain = blockPlainText(blocks[focused]);
    const len = triggerLength(overlay.type);
    const caret = keepTrigger ? overlay.start + len : overlay.start;
    writePlain(stripOverlayTrigger(plain, keepTrigger), caret);
  }

  function paintPicker() {
    removePicker();
    if (!overlay || focused < 0) return;
    const el = focusedEl();
    if (!(el instanceof HTMLElement)) return;
    const items = overlayItems();
    if (overlayIndex >= items.length) overlayIndex = Math.max(0, items.length - 1);
    const copy = overlayCopy(lang);
    const type = overlay.type;
    paintOverlayPicker(host, {
      items,
      selected: overlayIndex,
      label: type === 'slash' ? copy.slashLabel : type === 'wiki' ? copy.wikiLabel : copy.atLabel,
      hint: type === 'slash' ? copy.slashHint : (overlay.query ? copy.pageHint : copy.pagePick),
      empty: type === 'slash' ? copy.slashEmpty : copy.pageEmpty,
      pickerType: type,
      anchor: el,
      place: placePicker,
      lang,
      onPick: (item) => applyOverlay(item),
    });
  }

  function insertBlockAt(index, offsetPlain, markup) {
    const kind = classifyBlock(blocks[index] ?? '');
    const plain = blockPlainText(blocks[index] ?? '');
    const beforeText = plain.slice(0, offsetPlain).replace(/\s+$/, '');
    const afterText = plain.slice(offsetPlain).replace(/^\s+/, '');
    const type = kind.type === 'opaque' || kind.type === 'fence' || kind.type === 'hr' ? 'p' : kind.type;
    const next = [];
    if (beforeText) next.push(type === 'p' ? beforeText : formatBlock(type, beforeText, { level: kind.level }));
    next.push(markup);
    if (afterText) next.push(afterText);
    if (!next.length) next.push('');
    blocks.splice(index, 1, ...next);
    overlay = null;
    overlayIndex = 0;
    onEnsureImport?.();
    emit();
    paint();
    const nextFocus = afterText ? index + (beforeText ? 2 : 1) : index + (beforeText ? 1 : 0);
    activate(Math.min(nextFocus, blocks.length - 1), { caret: afterText ? 0 : null });
  }

  async function applyOverlay(item) {
    if (!item || !overlay || focused < 0) return;
    commitFocused();
    if (overlay.type === 'slash') {
      const remaining = stripOverlayTrigger(blockPlainText(blocks[focused]), false).replace(/^\s+/, '');
      overlay = null;
      overlayIndex = 0;
      blocks[focused] = applyFormatCommand(remaining, item);
      emit();
      paintBlock(focused);
      const el = focusedEl();
      if (el) {
        el.focus({ preventScroll: true });
        setCaretOffset(el, blockPlainText(blocks[focused]).length);
      }
      removePicker();
      return;
    }
    const start = overlay.start;
    if (overlay.type === 'at') {
      if (item.type === 'doc') {
        const insert = inlineMentionMarkup(item.of, item.title);
        const plain = blockPlainText(blocks[focused]);
        const next = `${plain.slice(0, start)}${insert}${plain.slice(start + triggerLength('at') + overlay.query.length)}`;
        writePlain(next, start + insert.length);
        return;
      }
      writePlain(stripOverlayTrigger(blockPlainText(blocks[focused]), false), start);
      if (!onCreate) return;
      const created = await onCreate({
        kind: item.type === 'create-child' ? 'child' : 'article',
        title: item.title,
      });
      if (!created || created.reloaded || destroyed) return;
      if (focused < 0) focused = Math.max(0, blocks.length - 1);
      const markup = inlineMentionMarkup(created.of, item.title);
      const current = blockPlainText(blocks[focused]);
      writePlain(`${current.slice(0, start)}${markup}${current.slice(start)}`, start + markup.length);
      return;
    }
    if (item.type === 'doc') {
      const plain = blockPlainText(blocks[focused]);
      const cleared = `${plain.slice(0, start)}${plain.slice(start + triggerLength('wiki') + overlay.query.length)}`;
      const kind = classifyBlock(blocks[focused]);
      const type = kind.type === 'opaque' || kind.type === 'fence' || kind.type === 'hr' ? 'p' : kind.type;
      blocks[focused] = type === 'p' ? cleared : formatBlock(type, cleared, { level: kind.level });
      overlay = null;
      insertBlockAt(focused, Math.min(start, blockPlainText(blocks[focused]).length), docRefMarkup(item.of, 'embed'));
      return;
    }
    writePlain(stripOverlayTrigger(blockPlainText(blocks[focused]), false), start);
    if (!onCreate) return;
    const created = await onCreate({
      kind: item.type === 'create-child' ? 'child' : 'article',
      title: item.title,
    });
    if (!created || created.reloaded || destroyed) return;
    if (focused < 0) focused = Math.max(0, blocks.length - 1);
    insertBlockAt(focused, start, docRefMarkup(created.of, 'embed'));
  }

  function decoratePreview(preview, index) {
    const embed = parseDocEmbed(blocks[index]);
    const kind = classifyBlock(blocks[index]);
    preview.className = 'studio-block__preview prose-site';
    preview.setAttribute('aria-label', '编辑这一段');
    preview.spellcheck = true;
    if (embed) {
      const page = pages.find((item) => pageOf(item) === embed.of);
      const title = pageTitle(page, lang) || embed.of;
      const href = page?.href || hrefForOf(embed.of);
      preview.dataset.kind = 'embed';
      delete preview.dataset.level;
      preview.innerHTML = `<button type="button" class="studio-embed" data-embed-of="${escapeText(embed.of)}" data-embed-href="${escapeText(href)}" data-testid="studio-embed"><span class="studio-embed__title">${escapeText(title)}</span><span class="studio-embed__meta ui-meta">${escapeText(embed.of)}</span></button>`;
      preview.contentEditable = 'false';
      preview.removeAttribute('contenteditable');
      delete preview.dataset.blockSource;
      return;
    }
    preview.innerHTML = renderBlockHtml(blocks[index]);
    preview.dataset.kind = kind.type;
    if (kind.level) preview.dataset.level = String(kind.level);
    else delete preview.dataset.level;
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
    if (parseDocEmbed(blocks[index])) {
      el.contentEditable = 'false';
      el.removeAttribute('contenteditable');
      return;
    }
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
    overlay = null;
    overlayIndex = 0;
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

  function checkOverlay(el) {
    const kind = classifyBlock(blocks[focused] ?? '');
    if (kind.type === 'opaque' && parseDocEmbed(blocks[focused])) {
      overlay = null;
      overlayIndex = 0;
      removePicker();
      return;
    }
    const text = visibleText(el);
    const caret = caretOffsetIn(el);
    const wiki = wikiQueryAtCaret(text, caret);
    const at = atQueryAtCaret(text, caret);
    const slash = kind.type === 'fence' ? null : slashQueryAtCaret(text, caret);
    if (wiki) overlay = { type: 'wiki', ...wiki };
    else if (at) overlay = { type: 'at', ...at };
    else if (slash) overlay = { type: 'slash', ...slash };
    else overlay = null;
    overlayIndex = 0;
    if (overlay) paintPicker();
    else removePicker();
  }

  function onInput(event) {
    if (isImeEvent(event, composing) || event.inputType === 'insertCompositionText') return;
    const el = event.target instanceof Element ? event.target.closest('.studio-block__preview') : null;
    if (!(el instanceof HTMLElement) || el.getAttribute('contenteditable') !== 'true' || focused < 0) return;
    if (maybeShortcut(el)) return;
    blocks[focused] = editableToMarkdown(el);
    emit();
    checkOverlay(el);
  }

  function afterComposition(event) {
    composing = false;
    const el = event.target instanceof Element ? event.target.closest('.studio-block__preview') : null;
    if (!(el instanceof HTMLElement) || focused < 0) return;
    if (maybeShortcut(el)) return;
    blocks[focused] = editableToMarkdown(el);
    emit();
    checkOverlay(el);
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

    if (overlay) {
      const items = overlayItems();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        overlayIndex = items.length ? (overlayIndex + 1) % items.length : 0;
        paintPicker();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        overlayIndex = items.length ? (overlayIndex - 1 + items.length) % items.length : 0;
        paintPicker();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        void applyOverlay(items[overlayIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeOverlay({ keepTrigger: true });
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
      if (overlay) return;
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
    const embedBtn = target.closest('[data-embed-of]');
    if (embedBtn && host.contains(embedBtn)) {
      event.preventDefault();
      const of = embedBtn.getAttribute('data-embed-of');
      const href = embedBtn.getAttribute('data-embed-href') || hrefForOf(of);
      const title = embedBtn.querySelector('.studio-embed__title')?.textContent || of;
      onOpenEmbed?.({ of, href, title });
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
      overlay = null;
      overlayIndex = 0;
      removePicker();
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
      overlay = null;
      overlayIndex = 0;
      activate(blocks.length - 1, { caret: 0 });
    }
  });

  const onDocPointer = (event) => {
    if (!(event.target instanceof Node) || host.contains(event.target)) return;
    if (overlay) closeOverlay({ keepTrigger: true });
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

export function mountCompareEditors(host, options) {
  const {
    zh,
    en,
    onChangeZh,
    onChangeEn,
    pages = [],
    currentOf = '',
    canCreateChild = false,
    pane = 'series',
    lang = 'zh',
    onEnsureImport,
    onCreate,
    onOpenEmbed,
  } = options;

  let zhBlocks = splitBlocks(zh);
  let enBlocks = splitBlocks(en);
  let focused = null;
  let composing = false;
  let overlay = null;
  let overlayIndex = 0;
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
  host.classList.add('studio-compare');

  function blocksOf(side) {
    return side === 'en' ? enBlocks : zhBlocks;
  }

  function emit(side) {
    if (side === 'en') onChangeEn?.(joinBlocks(enBlocks));
    else onChangeZh?.(joinBlocks(zhBlocks));
  }

  function emitBoth() {
    onChangeZh?.(joinBlocks(zhBlocks));
    onChangeEn?.(joinBlocks(enBlocks));
  }

  function alignLength() {
    const n = Math.max(zhBlocks.length, enBlocks.length, 1);
    while (zhBlocks.length < n) zhBlocks.push('');
    while (enBlocks.length < n) enBlocks.push('');
  }

  function previewAt(side, index) {
    return host.querySelector(`[data-block-side="${side}"][data-block-index="${index}"] .studio-block__preview`);
  }

  function focusedEl() {
    if (!focused) return null;
    return previewAt(focused.side, focused.index);
  }

  function commitFocused() {
    const el = focusedEl();
    if (!(el instanceof HTMLElement) || !focused) return;
    if (el.getAttribute('contenteditable') !== 'true') return;
    blocksOf(focused.side)[focused.index] = editableToMarkdown(el);
  }

  function overlayItems() {
    if (!overlay) return [];
    if (overlay.type === 'slash') return slashOverlayItems(overlay.query, lang);
    return pageOverlayItems({
      pages,
      currentOf,
      query: overlay.query,
      canCreateChild,
      lang,
    });
  }

  function placePicker(picker, el) {
    const hostBox = host.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    picker.style.left = `${Math.max(0, box.left - hostBox.left)}px`;
    picker.style.top = `${box.bottom - hostBox.top + host.scrollTop + 6}px`;
  }

  function removePicker() {
    host.querySelector('[data-testid="studio-at-picker"]')?.remove();
  }

  function stripOverlayTrigger(plain, keepTrigger) {
    if (!overlay) return plain;
    const len = triggerLength(overlay.type);
    const start = overlay.start;
    const end = start + len + overlay.query.length;
    const trigger = overlay.type === 'wiki' ? '[[' : overlay.type === 'slash' ? '/' : '@';
    return keepTrigger
      ? `${plain.slice(0, start)}${trigger}${plain.slice(end)}`
      : `${plain.slice(0, start)}${plain.slice(end)}`;
  }

  function writePlain(plain, caret) {
    if (!focused) return;
    const { side, index } = focused;
    const kind = classifyBlock(blocksOf(side)[index]);
    const type = kind.type === 'opaque' || kind.type === 'hr' ? 'p' : kind.type;
    blocksOf(side)[index] = type === 'p' || type === 'fence'
      ? (type === 'fence' ? formatBlock('fence', plain) : plain)
      : formatBlock(type, plain, { level: kind.level });
    overlay = null;
    overlayIndex = 0;
    emit(side);
    paintBlock(side, index);
    const el = focusedEl();
    if (el) {
      el.focus({ preventScroll: true });
      if (caret != null) setCaretOffset(el, caret);
    }
  }

  function closeOverlay({ keepTrigger = true } = {}) {
    if (!overlay || !focused) {
      overlay = null;
      overlayIndex = 0;
      removePicker();
      return;
    }
    const { side, index } = focused;
    const kind = classifyBlock(blocksOf(side)[index]);
    if (kind.type === 'opaque' || kind.type === 'fence') {
      overlay = null;
      overlayIndex = 0;
      removePicker();
      return;
    }
    const plain = blockPlainText(blocksOf(side)[index]);
    const len = triggerLength(overlay.type);
    const caret = keepTrigger ? overlay.start + len : overlay.start;
    writePlain(stripOverlayTrigger(plain, keepTrigger), caret);
  }

  function paintPicker() {
    removePicker();
    const el = focusedEl();
    if (!overlay || !(el instanceof HTMLElement)) return;
    const items = overlayItems();
    if (overlayIndex >= items.length) overlayIndex = Math.max(0, items.length - 1);
    const copy = overlayCopy(lang);
    const type = overlay.type;
    paintOverlayPicker(host, {
      items,
      selected: overlayIndex,
      label: type === 'slash' ? copy.slashLabel : type === 'wiki' ? copy.wikiLabel : copy.atLabel,
      hint: type === 'slash' ? copy.slashHint : (overlay.query ? copy.pageHint : copy.pagePick),
      empty: type === 'slash' ? copy.slashEmpty : copy.pageEmpty,
      pickerType: type,
      anchor: el,
      place: placePicker,
      lang,
      onPick: (item) => applyOverlay(item),
    });
  }

  function insertBlockAt(side, index, offsetPlain, markup) {
    const kind = classifyBlock(blocksOf(side)[index] ?? '');
    const plain = blockPlainText(blocksOf(side)[index] ?? '');
    const beforeText = plain.slice(0, offsetPlain).replace(/\s+$/, '');
    const afterText = plain.slice(offsetPlain).replace(/^\s+/, '');
    const type = kind.type === 'opaque' || kind.type === 'fence' || kind.type === 'hr' ? 'p' : kind.type;
    const next = [];
    if (beforeText) next.push(type === 'p' ? beforeText : formatBlock(type, beforeText, { level: kind.level }));
    next.push(markup);
    if (afterText) next.push(afterText);
    if (!next.length) next.push('');
    const other = next.map((block) => (block === markup ? markup : ''));
    if (side === 'zh') {
      zhBlocks.splice(index, 1, ...next);
      enBlocks.splice(index, 1, ...other);
    } else {
      enBlocks.splice(index, 1, ...next);
      zhBlocks.splice(index, 1, ...other);
    }
    overlay = null;
    overlayIndex = 0;
    onEnsureImport?.();
    emitBoth();
    paint();
    const nextFocus = afterText ? index + (beforeText ? 2 : 1) : index + (beforeText ? 1 : 0);
    activate(side, Math.min(nextFocus, blocksOf(side).length - 1), { caret: afterText ? 0 : null });
  }

  async function applyOverlay(item) {
    if (!item || !overlay || !focused) return;
    commitFocused();
    const { side, index } = focused;
    if (overlay.type === 'slash') {
      const remaining = stripOverlayTrigger(blockPlainText(blocksOf(side)[index]), false).replace(/^\s+/, '');
      overlay = null;
      overlayIndex = 0;
      blocksOf(side)[index] = applyFormatCommand(remaining, item);
      emit(side);
      paintBlock(side, index);
      const el = focusedEl();
      if (el) {
        el.focus({ preventScroll: true });
        setCaretOffset(el, blockPlainText(blocksOf(side)[index]).length);
      }
      removePicker();
      return;
    }
    const start = overlay.start;
    if (overlay.type === 'at') {
      if (item.type === 'doc') {
        const insert = inlineMentionMarkup(item.of, item.title);
        const plain = blockPlainText(blocksOf(side)[index]);
        const next = `${plain.slice(0, start)}${insert}${plain.slice(start + triggerLength('at') + overlay.query.length)}`;
        writePlain(next, start + insert.length);
        return;
      }
      writePlain(stripOverlayTrigger(blockPlainText(blocksOf(side)[index]), false), start);
      if (!onCreate) return;
      const created = await onCreate({
        kind: item.type === 'create-child' ? 'child' : 'article',
        title: item.title,
      });
      if (!created || created.reloaded || destroyed) return;
      const markup = inlineMentionMarkup(created.of, item.title);
      const current = blockPlainText(blocksOf(side)[index]);
      writePlain(`${current.slice(0, start)}${markup}${current.slice(start)}`, start + markup.length);
      return;
    }
    if (item.type === 'doc') {
      const plain = blockPlainText(blocksOf(side)[index]);
      const cleared = `${plain.slice(0, start)}${plain.slice(start + triggerLength('wiki') + overlay.query.length)}`;
      const kind = classifyBlock(blocksOf(side)[index]);
      const type = kind.type === 'opaque' || kind.type === 'fence' || kind.type === 'hr' ? 'p' : kind.type;
      blocksOf(side)[index] = type === 'p' ? cleared : formatBlock(type, cleared, { level: kind.level });
      overlay = null;
      insertBlockAt(side, index, Math.min(start, blockPlainText(blocksOf(side)[index]).length), docRefMarkup(item.of, 'embed'));
      return;
    }
    writePlain(stripOverlayTrigger(blockPlainText(blocksOf(side)[index]), false), start);
    if (!onCreate) return;
    const created = await onCreate({
      kind: item.type === 'create-child' ? 'child' : 'article',
      title: item.title,
    });
    if (!created || created.reloaded || destroyed) return;
    insertBlockAt(side, index, start, docRefMarkup(created.of, 'embed'));
  }

  function decoratePreview(preview, side, index) {
    const block = blocksOf(side)[index] ?? '';
    const embed = parseDocEmbed(block);
    const kind = classifyBlock(block);
    preview.className = 'studio-block__preview prose-site';
    preview.setAttribute('aria-label', side === 'en' ? '编辑这段英文' : '编辑这段中文');
    preview.spellcheck = true;
    if (embed) {
      const page = pages.find((item) => pageOf(item) === embed.of);
      const title = pageTitle(page, lang) || embed.of;
      const href = page?.href || hrefForOf(embed.of);
      preview.dataset.kind = 'embed';
      delete preview.dataset.level;
      preview.innerHTML = `<button type="button" class="studio-embed" data-embed-of="${escapeText(embed.of)}" data-embed-href="${escapeText(href)}" data-testid="studio-embed"><span class="studio-embed__title">${escapeText(title)}</span><span class="studio-embed__meta ui-meta">${escapeText(embed.of)}</span></button>`;
      preview.contentEditable = 'false';
      preview.removeAttribute('contenteditable');
      delete preview.dataset.blockSource;
      return;
    }
    preview.innerHTML = renderBlockHtml(block);
    preview.dataset.kind = kind.type;
    if (kind.level) preview.dataset.level = String(kind.level);
    else delete preview.dataset.level;
    const active = focused && focused.side === side && focused.index === index;
    if (active) {
      preview.contentEditable = 'true';
      preview.dataset.blockSource = '';
    } else {
      preview.removeAttribute('contenteditable');
      delete preview.dataset.blockSource;
    }
  }

  function paintBlock(side, index) {
    const preview = previewAt(side, index);
    if (!(preview instanceof HTMLElement)) return;
    decoratePreview(preview, side, index);
  }

  function makeBlock(side, index) {
    const row = document.createElement('div');
    row.className = 'studio-block';
    row.dataset.blockIndex = String(index);
    row.dataset.blockSide = side;
    const mark = document.createElement('span');
    mark.className = 'studio-block__mark ui-meta';
    mark.textContent = String(index + 1);
    mark.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    body.className = 'studio-block__body';
    const preview = document.createElement('div');
    decoratePreview(preview, side, index);
    body.append(preview);
    row.append(mark, body);
    return row;
  }

  function paint() {
    alignLength();
    const items = zhBlocks.map((_, index) => {
      const pair = document.createElement('div');
      pair.className = 'studio-compare-pair';
      pair.dataset.pairIndex = String(index);
      pair.append(makeBlock('zh', index), makeBlock('en', index));
      return pair;
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

  function activate(side, index, { caret, focus = true } = {}) {
    alignLength();
    if (index < 0 || index >= blocksOf(side).length) return;
    holdBlur();
    if (focused && (focused.side !== side || focused.index !== index)) {
      const prev = previewAt(focused.side, focused.index);
      if (prev instanceof HTMLElement) {
        prev.removeAttribute('contenteditable');
        delete prev.dataset.blockSource;
      }
    }
    focused = { side, index };
    const el = previewAt(side, index);
    if (!(el instanceof HTMLElement)) return;
    if (parseDocEmbed(blocksOf(side)[index])) {
      el.contentEditable = 'false';
      el.removeAttribute('contenteditable');
      return;
    }
    el.contentEditable = 'true';
    el.dataset.blockSource = '';
    ensureStableCaret(el);
    if (focus) el.focus({ preventScroll: true });
    if (caret != null) setCaretOffset(el, caret);
  }

  function collapseFocus() {
    if (!focused) return;
    commitFocused();
    emit(focused.side);
    focused = null;
    overlay = null;
    overlayIndex = 0;
    zhBlocks = splitBlocks(joinBlocks(zhBlocks));
    enBlocks = splitBlocks(joinBlocks(enBlocks));
    alignLength();
    paint();
  }

  function applyKind(type, text, extra = {}) {
    if (!focused) return;
    blocksOf(focused.side)[focused.index] = formatBlock(type, text, extra);
    emit(focused.side);
    paintBlock(focused.side, focused.index);
    const el = focusedEl();
    if (el) {
      el.focus({ preventScroll: true });
      setCaretOffset(el, String(text ?? '').length);
    }
  }

  function maybeShortcut(el) {
    if (!(el instanceof HTMLElement) || !focused) return false;
    if ((el.dataset.kind || 'p') !== 'p') return false;
    const found = detectMarkdownShortcut(visibleText(el));
    if (!found) return false;
    applyKind(found.type, found.text, { level: found.level });
    return true;
  }

  function checkOverlay(el) {
    if (!focused) return;
    const source = blocksOf(focused.side)[focused.index] ?? '';
    const kind = classifyBlock(source);
    if (kind.type === 'opaque' && parseDocEmbed(source)) {
      overlay = null;
      overlayIndex = 0;
      removePicker();
      return;
    }
    const text = visibleText(el);
    const caret = caretOffsetIn(el);
    const wiki = wikiQueryAtCaret(text, caret);
    const at = atQueryAtCaret(text, caret);
    const slash = kind.type === 'fence' ? null : slashQueryAtCaret(text, caret);
    if (wiki) overlay = { type: 'wiki', ...wiki };
    else if (at) overlay = { type: 'at', ...at };
    else if (slash) overlay = { type: 'slash', ...slash };
    else overlay = null;
    overlayIndex = 0;
    if (overlay) paintPicker();
    else removePicker();
  }

  function onInput(event) {
    if (isImeEvent(event, composing) || event.inputType === 'insertCompositionText') return;
    const el = event.target instanceof Element ? event.target.closest('.studio-block__preview') : null;
    if (!(el instanceof HTMLElement) || el.getAttribute('contenteditable') !== 'true' || !focused) return;
    if (maybeShortcut(el)) return;
    blocksOf(focused.side)[focused.index] = editableToMarkdown(el);
    emit(focused.side);
    checkOverlay(el);
  }

  function afterComposition(event) {
    composing = false;
    const el = event.target instanceof Element ? event.target.closest('.studio-block__preview') : null;
    if (!(el instanceof HTMLElement) || !focused) return;
    if (maybeShortcut(el)) return;
    blocksOf(focused.side)[focused.index] = editableToMarkdown(el);
    emit(focused.side);
    checkOverlay(el);
  }

  function currentListItem(el) {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return null;
    const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement;
    return node?.closest('li') ?? el.querySelector('li');
  }

  function insertPairAfter(index) {
    zhBlocks.splice(index + 1, 0, '');
    enBlocks.splice(index + 1, 0, '');
  }

  function removePair(index) {
    zhBlocks.splice(index, 1);
    enBlocks.splice(index, 1);
    if (!zhBlocks.length) zhBlocks = [''];
    if (!enBlocks.length) enBlocks = [''];
    alignLength();
  }

  function onKey(event) {
    if (isImeEvent(event, composing)) return;
    const el = event.target instanceof Element ? event.target.closest('.studio-block__preview') : null;
    if (!(el instanceof HTMLElement) || el.getAttribute('contenteditable') !== 'true' || !focused) return;
    const { side, index } = focused;
    const blocks = blocksOf(side);

    if (overlay) {
      const items = overlayItems();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        overlayIndex = items.length ? (overlayIndex + 1) % items.length : 0;
        paintPicker();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        overlayIndex = items.length ? (overlayIndex - 1 + items.length) % items.length : 0;
        paintPicker();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        void applyOverlay(items[overlayIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeOverlay({ keepTrigger: true });
        return;
      }
    }

    const kind = classifyBlock(blocks[index]);
    const atStart = isCollapsed() && caretOffsetIn(el) === 0;
    const atEnd = isCollapsed() && caretOffsetIn(el) >= visibleText(el).length;

    if (!event.shiftKey && event.key === 'ArrowLeft' && atStart && index > 0) {
      event.preventDefault();
      commitFocused();
      emit(side);
      activate(side, index - 1, { caret: classifyBlock(blocks[index - 1]).text.length });
      return;
    }
    if (!event.shiftKey && event.key === 'ArrowRight' && atEnd && index < blocks.length - 1) {
      event.preventDefault();
      commitFocused();
      emit(side);
      activate(side, index + 1, { caret: 0 });
      return;
    }
    if (event.key === 'ArrowUp' && atStart && index > 0) {
      event.preventDefault();
      commitFocused();
      emit(side);
      activate(side, index - 1, { caret: classifyBlock(blocks[index - 1]).text.length });
      return;
    }
    if (event.key === 'ArrowDown' && atEnd && index < blocks.length - 1) {
      event.preventDefault();
      commitFocused();
      emit(side);
      activate(side, index + 1, { caret: 0 });
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
          const remaining = classifyBlock(blocks[index]).text.split('\n').filter((line) => line.trim());
          blocks[index] = remaining.length ? formatBlock(kind.type, remaining.join('\n')) : '';
          insertPairAfter(index);
          emitBoth();
          paint();
          activate(side, index + 1, { caret: 0 });
        }
        return;
      }
      event.preventDefault();
      commitFocused();
      const current = classifyBlock(blocks[index]);
      const offset = Math.min(caretOffsetIn(el), current.text.length);
      const before = current.text.slice(0, offset);
      const after = current.text.slice(offset);
      blocks[index] = formatBlock(current.type, before, { level: current.level });
      insertPairAfter(index);
      blocks[index + 1] = after;
      emitBoth();
      paint();
      activate(side, index + 1, { caret: 0 });
      return;
    }

    if (event.key === 'Delete' && atEnd && index < blocks.length - 1) {
      event.preventDefault();
      commitFocused();
      const caret = classifyBlock(blocks[index]).text.length;
      blocks[index] = mergeBlockMarkdown(blocks[index], blocks[index + 1]);
      removePair(index + 1);
      emitBoth();
      paint();
      activate(side, index, { caret });
      return;
    }

    if (event.key === 'Backspace' && atStart) {
      event.preventDefault();
      commitFocused();
      if (hasBlockFormat(blocks[index])) {
        blocks[index] = clearBlockFormat(blocks[index]);
        emit(side);
        paintBlock(side, index);
        focusedEl()?.focus({ preventScroll: true });
        setCaretOffset(focusedEl(), 0);
        return;
      }
      if (index === 0) {
        if (!classifyBlock(blocks[0]).text.trim()) {
          blocks[0] = '';
          emit(side);
          paintBlock(side, 0);
        }
        return;
      }
      const prevLen = classifyBlock(blocks[index - 1]).text.length;
      blocks[index - 1] = mergeBlockMarkdown(blocks[index - 1], blocks[index]);
      removePair(index);
      emitBoth();
      paint();
      activate(side, index - 1, { caret: prevLen });
    }
  }

  function onFocusOut() {
    requestAnimationFrame(() => {
      if (destroyed || ignoreBlur || Date.now() < ignoreBlurUntil) return;
      if (overlay) return;
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
    const embedBtn = target.closest('[data-embed-of]');
    if (embedBtn && host.contains(embedBtn)) {
      event.preventDefault();
      const of = embedBtn.getAttribute('data-embed-of');
      const href = embedBtn.getAttribute('data-embed-href') || hrefForOf(of);
      const title = embedBtn.querySelector('.studio-embed__title')?.textContent || of;
      onOpenEmbed?.({ of, href, title });
      return;
    }
    const link = target.closest('a');
    if (link && host.contains(link)) event.preventDefault();
    const row = target.closest('[data-block-side][data-block-index]');
    if (row instanceof HTMLElement) {
      const index = Number(row.dataset.blockIndex);
      const side = row.dataset.blockSide === 'en' ? 'en' : 'zh';
      if (focused && focused.side === side && focused.index === index) return;
      commitFocused();
      if (focused) emit(focused.side);
      overlay = null;
      overlayIndex = 0;
      removePicker();
      activate(side, index, { focus: false });
    }
  });

  const onDocPointer = (event) => {
    if (!(event.target instanceof Node) || host.contains(event.target)) return;
    if (overlay) closeOverlay({ keepTrigger: true });
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
