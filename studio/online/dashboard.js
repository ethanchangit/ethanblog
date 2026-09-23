import './dashboard.css';
import { paragraphs, paragraphDiff, renderedProse, tagDiff, onlyTagsChanged } from './review-content.mjs';
import { formatDate as siteDate } from '../../src/lib/format.ts';

const root = document.querySelector('#studio');
document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const stages = { merging: '正在合并', queued: '等待部署', building: '正在检查和部署', verifying: '正在确认线上版本', deployed: '已上线', failed: '发布失败' };
let docs = [], items = [], selected, git, connected = false, loading = false, pulled = false, localPreview = false, localOpen = false, booted = false, mode = 'preview', template, timer;
let pageSet = null, pageChoice = null, pageKeepDraft = new Set(), pageOrderDraft = [];
let pageChoiceSaveTimer = 0;
let focusedGroup = 'new';
let clearMoveLines = () => {};
let statusText = '', statusError = false;
function el(tag, text, attrs = {}) { const n = document.createElement(tag); if (text != null) n.textContent = text; for (const [k,v] of Object.entries(attrs)) n.setAttribute(k, v); return n; }
function link(text, href) { return el('a', text, { href, ...(href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }); }
function button(text, action, attrs = {}) {
  const b = el('button', text, { type: 'button', ...attrs });
  // A button painted while another action is in flight must stay disabled until that action finishes.
  // Otherwise a click can land on it and be dropped by the loading guard.
  if (loading) b.disabled = true;
  b.addEventListener('click', () => void run(action));
  return b;
}
function pageIsLocal() {
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}
async function api(path, data) {
  const response = await fetch(`/dashboard/api${path}`, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  let result;
  try { result = await response.json(); }
  catch {
    const message = response.status === 401 ? (pageIsLocal() ? '本地后台请求被拒绝，请刷新后重试。' : '登录已过期，请重新输入后台密码。')
      : response.redirected ? '后台请求被跳转到了其他页面，请刷新后重试。'
      : !response.ok ? `后台暂时无法完成请求（${response.status}），请稍后重新拉取。`
      : '后台返回了无法读取的数据，请刷新后重试。';
    throw Object.assign(new Error(message), { status: response.status });
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('后台返回了无法读取的数据，请刷新后重试。');
  if (!response.ok) throw Object.assign(new Error(result.error || '操作未完成，请重试。'), { status: response.status });
  return result;
}
function friendlyError(message) {
  const text = String(message || '');
  if (/^Failed to fetch$/i.test(text) || /NetworkError/i.test(text) || /Load failed/i.test(text)) {
    return '无法连接后台，请检查本机服务后重试。';
  }
  return text;
}
function emptyPreviewCopy() {
  if (!pulled) return '拉取后，在这里预览文章实际发布的排版。';
  if (items.length) return '选择一条更新，查看正文和跟随资料。';
  return '这一版没有等待审核的文章。';
}
function noticeNode(text, error) {
  return el('p', text, {
    id: 'notice',
    class: error ? 'status' : (selected ? 'status' : 'preview-empty muted status'),
    role: error ? 'alert' : 'status',
  });
}
function notice(text, error = false) {
  const display = error ? friendlyError(text) : text;
  statusText = display; statusError = error;
  const dialogStatus = document.querySelector('dialog[open] .status');
  if (dialogStatus) { dialogStatus.textContent = display; dialogStatus.setAttribute('role', error ? 'alert' : 'status'); return; }
  const node = document.querySelector('#notice');
  if (node) { node.textContent = display; node.className = error ? 'status' : (selected ? 'status' : 'preview-empty muted status'); node.setAttribute('role', error ? 'alert' : 'status'); return; }
  const pane = document.querySelector('#review-preview');
  if (pane) {
    if (!selected) { pane.replaceChildren(noticeNode(display || emptyPreviewCopy(), error)); return; }
    if (selected.item?.error) {
      if (error) pane.replaceChildren(el('p', display, { role: 'alert' }));
      return;
    }
    pane.prepend(noticeNode(display, error));
    return;
  }
  if (!pageIsLocal() || !root) return;
  root.replaceChildren(noticeNode(display, error));
}
async function connectHeptabase() {
  notice('正在打开 Heptabase 授权…');
  const { url } = await api('/heptabase/connect', {});
  location.assign(url);
}
async function run(action) {
  if (loading) return; loading = true;
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await action(); } catch (error) {
    if (error.status === 401 && !pageIsLocal()) { closeDialog(); showLogin(booted ? error.message : ''); }
    else notice(error.message, true);
  } finally { loading = false; document.querySelectorAll('button').forEach(b => b.disabled = false); }
}
function showLogin(message = '') {
  if (pageIsLocal()) { localOpen = true; notice(message || '本地后台请求被拒绝，请刷新后重试。', true); return; }
  clearTimeout(timer); clearMoveLines(); root.replaceChildren(); items = []; selected = null; pulled = false;
  statusText = ''; statusError = false; focusedGroup = 'new';
  const form = el('form', null, { class: 'login' });
  const password = el('input', null, { id: 'password', type: 'password', autocomplete: 'current-password', required: '', minlength: '12', maxlength: '256' });
  form.append(el('h1', 'Ethan 的发布后台'), el('p', '在 Heptabase 写作，在这里审查和发布。', { class: 'muted' }), el('label', '后台密码', { for: 'password' }), password, el('button', '进入发布后台', { type: 'submit' }), el('p', message, { id: 'notice', class: 'status', role: message ? 'alert' : 'status' }));
  form.addEventListener('submit', event => { event.preventDefault(); booted = true; void run(async () => { await api('/login', { password: password.value }); const session = await api('/session'); localPreview = session.localPreview; localOpen = pageIsLocal() || session.localOpen === true; password.value = ''; await refresh(); }); });
  root.append(form); password.focus();
}
function closeDialog() { document.querySelector('dialog')?.close(); document.querySelector('dialog')?.remove(); }
function dialog(title) {
  closeDialog(); const d = el('dialog', null, { 'aria-label': title }), h = el('header');
  h.append(el('h2', title), button('关闭', async () => closeDialog())); d.append(h, el('p', '', { class: 'status', role: 'status' }));
  document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal(); return d;
}
async function refresh() {
  clearTimeout(timer);
  let failed = '';
  const previousConnected = connected;
  const settled = await Promise.allSettled([api('/git'), api('/docs'), api('/heptabase/status')]);
  const [gitResult, docsResult, statusResult] = settled;
  if (settled.some(result => result.status === 'rejected' && result.reason?.status === 401)) {
    throw settled.find(result => result.status === 'rejected' && result.reason?.status === 401).reason;
  }
  if (gitResult.status === 'fulfilled') git = gitResult.value;
  else {
    git = git && pulled ? git : { draftCount: 0, files: [], removals: [] };
    if (!pulled) failed = gitResult.reason?.message || failed;
  }
  if (docsResult.status === 'fulfilled') docs = [...docsResult.value.articles, ...docsResult.value.projects];
  else {
    if (!pulled) docs = [];
    if (!pulled) failed = failed || docsResult.reason?.message;
  }
  if (statusResult.status === 'fulfilled') connected = statusResult.value.connected;
  else {
    connected = pulled ? previousConnected || connected : false;
    if (!pulled) failed = failed || statusResult.reason?.message;
  }
  clearMoveLines(); root.replaceChildren();
  const header = el('header'), actions = el('div', null, { class: 'actions' });
  actions.append(button('切换明暗', async () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    // Diff reads parent CSS variables; only the article iframe needs a rebuild.
    if (pulled && selected && mode === 'preview' && !selected.item?.error) await showSelection();
  }), link('查看博客 ↗', 'https://ethanchang.io'));
  if (!localOpen) actions.append(button('退出', async () => { await api('/logout', {}); showLogin(); }));
  header.append(el('h1', 'Audit', { class: 'brand' }), actions);
  root.append(header);
  if (localPreview) root.append(el('p', '本地样式预览 · 示例内容，所有操作均不影响 Heptabase、GitHub 或线上网站。', { class: 'muted group-caption' }));
  if (!pulled) {
    const stage = el('section', null, { class: 'empty-stage', id: 'review-preview', 'aria-label': '卡片预览' });
    stage.append(button('拉取最新更新 ↗', pullUpdates, { class: 'pull-button', 'aria-label': '拉取最新更新' }));
    if (!connected) {
      stage.append(button('连接 Heptabase ↗', connectHeptabase, { class: 'connect-button', 'aria-label': '连接 Heptabase' }));
      stage.append(el('p', '首次拉取时，需要连接你的 Heptabase。', { class: 'muted' }));
    }
    const message = failed || statusText || emptyPreviewCopy();
    stage.append(noticeNode(failed ? friendlyError(failed) : message, Boolean(failed) || statusError));
    root.append(stage);
    root.append(el('section', null, { id: 'release', 'aria-label': '发布进度' }));
    try { await renderRelease(); } catch { /* release is optional before pull */ }
    if (failed) { statusText = friendlyError(failed); statusError = true; }
    return;
  }
  const intro = el('section', null, { class: 'intro' });
  intro.append(button('拉取最新更新 ↗', pullUpdates, { class: 'pull-button', 'aria-label': '拉取最新更新' }));
  root.append(intro);
  const layout = el('div', null, { class: 'review-layout' });
  layout.append(el('aside', null, { id: 'review-list', 'aria-label': '本次审核清单' }), el('section', null, { id: 'review-preview', 'aria-label': '卡片预览' }));
  root.append(layout);
  root.append(el('section', null, { id: 'release', 'aria-label': '发布进度' }));
  root.append(el('section', null, { id: 'page-nav', 'aria-label': '站点页面导航' }));
  renderList();
  await showSelection();
  try { await renderRelease(); } catch { /* release is optional after a completed pull */ }
  renderPageChoice(document.querySelector('#page-nav'));
}
async function pullUpdates() {
  if (!connected) { await connectHeptabase(); return; }
  notice('正在拉取更新…');
  let payload, guard = 0;
  do {
    payload = await api('/heptabase/cards');
    if (payload.partial) notice(`正在读取卡片 ${payload.scanned} / ${payload.total}…`);
  } while (payload.partial && ++guard < 40);
  if (payload.partial) throw new Error('拉取没有完成，请稍后重新拉取。');
  const { cards, removals = [], pageSet: pages = null } = payload, next = [];
  pageSet = pages; pageChoice = pages?.choice || null; pageKeepDraft = new Set(pageChoice?.keep || (pages?.choiceRequired ? [] : pages?.order || [])); pageOrderDraft = [...(pageChoice?.order || pages?.order || [])];
  for (const card of cards) {
    const input = { cardLink: card.cardLink, preparePublish: true, reviewOnly: true, ...(card.linked[0] || {}) };
    try { next.push({ card, input, plan: await api('/heptabase/preview', input), decision: '' }); }
    catch (error) { if (error.status === 401) throw error; next.push({ card, input, error: error.message, decision: '' }); }
  }
  for (const removed of removals) {
    const card = { ...removed, id: removed.cardLink.split('/').pop() }, input = { collection: removed.collection, id: removed.id, cardLink: removed.cardLink };
    try { const plan = await api('/heptabase/removal-preview', input); next.push({ card, input, plan, removal: true, capped: removed.reason === 'capped', decision: plan.approved ? 'remove' : '' }); }
    catch (error) { if (error.status === 401) throw error; next.push({ card, input, removal: true, error: error.message, decision: '' }); }
  }
  items = next; pulled = true; selected = items[0] ? { item: items[0], id: items[0].card.id } : null;
  focusedGroup = selected ? itemGroup(selected.item) : 'new';
  statusText = cards.length || removals.length ? `已拉取 ${cards.length} 篇更新${removals.length ? `，另有 ${removals.length} 篇待删除` : ''}。选择一条更新，检查正文和跟随资料。` : '没有等待审核或删除的更新。';
  statusError = false;
  await refresh();
  notice(statusText);
}
const selection = item => ({ ...item.input, sourceHash: item.plan.sourceHash, documentHash: item.plan.documentHash, planHash: item.plan.planHash });
const rootChange = item => item.plan?.changes.find(c => c.id === item.card.id);
const title = item => rootChange(item)?.title || item.card.title;
function itemGroup(item) {
  if (item.removal) return 'removed';
  return rootChange(item)?.previouslyPublished ? 'edited' : 'new';
}
function reviewGroups() {
  const active = items.filter(item => !item.removal);
  return {
    new: active.filter(item => !rootChange(item)?.previouslyPublished),
    edited: active.filter(item => Boolean(rootChange(item)?.previouslyPublished)),
    removed: items.filter(item => item.removal),
  };
}
function itemMeta(item, deleting, edited) {
  if (item.decision === 'remove') return '已确认删除，待发布';
  if (item.decision === 'skip') return '本次暂不删除';
  if (item.decision === 'approve') return 'article · 已通过，待发布';
  if (item.decision === 'reject') return 'article · 已拒绝，已回写 Block';
  if (item.error) return '读取失败，尚未审核';
  if (deleting) return item.plan.reasonLabel;
  return `article · ${onlyTagsChanged(rootChange(item)) ? '仅标签更新' : edited ? '编辑更新' : '首次发布'}`;
}
function renderList() {
  const list = document.querySelector('#review-list'); if (!list) return; list.replaceChildren();
  if (!pulled) return;
  const by = reviewGroups();
  const kinds = ['new', 'edited', 'removed'];
  if (!kinds.includes(focusedGroup)) focusedGroup = 'new';
  if (items.some(i => i.decision)) {
    list.append(el('p', `待审 ${items.filter(i => !i.decision).length} · 通过 ${items.filter(i => i.decision === 'approve').length} · 拒绝 ${items.filter(i => i.decision === 'reject').length}${by.removed.length ? ` · 确认删除 ${by.removed.filter(i => i.decision === 'remove').length} · 暂不删除 ${by.removed.filter(i => i.decision === 'skip').length}` : ''}`, { class: 'muted group-caption' }));
  }
  const tabs = el('div', null, { class: 'review-groups', role: 'tablist', 'aria-label': '审核分组' });
  const labels = { new: 'New articles', edited: 'Edited articles', removed: 'Deleted articles' };
  for (const kind of kinds) {
    tabs.append(button(`${labels[kind]} · ${by[kind].length}`, async () => {
      focusedGroup = kind;
      const first = by[kind][0];
      selected = first ? { item: first, id: first.card.id } : null;
      renderList();
      await showSelection();
    }, {
      class: 'review-group-tab',
      role: 'tab',
      'aria-selected': String(focusedGroup === kind),
      'data-review-group': kind,
    }));
  }
  list.append(tabs);
  const row = el('div', null, { class: 'review-items', 'data-review-group': focusedGroup, role: 'tabpanel' });
  const group = by[focusedGroup];
  const deleting = focusedGroup === 'removed';
  const edited = focusedGroup === 'edited';
  if (!group.length) row.append(el('p', '这一组没有待审文章。', { class: 'muted empty-group' }));
  for (const item of group) {
    const card = el('div', null, { class: 'review-item' });
    const active = selected?.item === item;
    card.append(button(title(item), async () => {
      focusedGroup = itemGroup(item);
      selected = { item, id: item.card.id };
      renderList();
      await showSelection();
    }, { class: 'card-select', 'aria-pressed': String(Boolean(active && selected.id === item.card.id)) }));
    const decisions = el('div', null, { class: 'decisions' });
    if (!item.decision && item.plan) {
      decisions.append(
        button('✓', () => deleting ? confirmRemoval(item) : confirmDecision(item, 'approve'), { 'aria-label': `${deleting ? '删除' : '通过'}「${title(item)}」`, title: deleting ? '审查删除这篇博客' : '通过这篇博客' }),
        button('×', async () => {
          if (!deleting) return confirmDecision(item, 'reject');
          item.decision = 'skip'; renderList(); await showSelection(); notice('本次暂不删除，线上页面不变；下次拉取会再次提醒。');
        }, { 'aria-label': `${deleting ? '暂不删除' : '拒绝'}「${title(item)}」`, title: deleting ? '本次暂不删除' : '拒绝这篇博客' }),
      );
    }
    card.append(decisions, el('small', itemMeta(item, deleting, edited), { class: 'item-meta' }));
    const change = rootChange(item);
    if (change && !deleting) {
      const { added, removed } = tagDiff(change.beforeProperties.tags, change.afterProperties.tags);
      if (added.length || removed.length) card.append(el('small', `标签：新增 ${added.length} · 移除 ${removed.length}`, { class: 'item-meta' }));
    }
    const references = item.plan?.changes.filter(c => c.id !== item.card.id) || [];
    if (references.length) {
      const ul = el('ul', null, { class: 'references' });
      for (const refCard of references) {
        const ref = el('li');
        ref.append(
          button(refCard.title, async () => { focusedGroup = itemGroup(item); selected = { item, id: refCard.id }; renderList(); await showSelection(); }, { class: 'card-select', 'aria-pressed': String(Boolean(active && selected.id === refCard.id)) }),
          el('small', `${refCard.mainArticle ? 'article · 需单独审核' : 'page'} · ${refCard.kind}`, { class: 'item-meta' }),
        );
        ul.append(ref);
      }
      card.append(ul);
    }
    row.append(card);
  }
  list.append(row);
}
function syncPageOrder(id, checked) {
  if (checked) { pageKeepDraft.add(id); if (!pageOrderDraft.includes(id)) pageOrderDraft.push(id); }
  else { pageKeepDraft.delete(id); pageOrderDraft = pageOrderDraft.filter(item => item !== id); }
}
function queuePageChoiceSave() {
  clearTimeout(pageChoiceSaveTimer);
  pageChoiceSaveTimer = setTimeout(() => { void run(async () => { await applyPageChoice(); }); }, 350);
}
function clearPageInsertMarkers(list) {
  list.querySelectorAll('.insert-before, .insert-after').forEach(node => {
    node.classList.remove('insert-before', 'insert-after');
  });
}
function markPageInsert(list, target, before) {
  clearPageInsertMarkers(list);
  if (target) target.classList.add(before ? 'insert-before' : 'insert-after');
}
function bindPageOrderDrag(list) {
  let dragging = null;
  for (const li of list.querySelectorAll('li[data-page-id]')) {
    const handle = li.querySelector('.page-drag');
    if (!handle) continue;
    handle.addEventListener('dragstart', event => {
      dragging = li;
      li.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', li.dataset.pageId);
    });
    handle.addEventListener('dragend', () => {
      li.classList.remove('is-dragging');
      clearPageInsertMarkers(list);
      dragging = null;
    });
    li.addEventListener('dragover', event => {
      if (!dragging || dragging === li) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const from = pageOrderDraft.indexOf(dragging.dataset.pageId);
      const to = pageOrderDraft.indexOf(li.dataset.pageId);
      markPageInsert(list, li, from > to);
    });
    li.addEventListener('dragleave', event => {
      if (event.relatedTarget && li.contains(event.relatedTarget)) return;
      li.classList.remove('insert-before', 'insert-after');
    });
    li.addEventListener('drop', event => {
      event.preventDefault();
      clearPageInsertMarkers(list);
      if (!dragging || dragging === li) return;
      const from = pageOrderDraft.indexOf(dragging.dataset.pageId);
      const to = pageOrderDraft.indexOf(li.dataset.pageId);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...pageOrderDraft];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      pageOrderDraft = next;
      clearTimeout(pageChoiceSaveTimer);
      void run(async () => { await applyPageChoice(); });
    });
  }
}
function renderPageChoice(host) {
  if (!host) return;
  host.replaceChildren();
  if (!pageSet?.cards?.length) return;
  const section = el('section', null, { class: 'review-group page-choice', 'data-review-group': 'pages' });
  section.append(el('h2', '站点页面'));
  if (pageSet.choiceRequired) section.append(el('p', `站点页面最多显示 4 页。现在有 ${pageSet.cards.length} 张 Page 卡片，请选择留下哪几页。未勾选的不会悄悄去掉：已经在网站上的，要等你确认发布后才撤下；还没上线的，这次不会发布。项目、博客和 Reference 没有上限。勾选之后，拖动手柄排列导航顺序，放开即保存。`, { class: 'muted group-caption' }));
  else section.append(el('p', '这几页都会留在导航上。拖动手柄排列顺序，放开后下次发布时导航按这个顺序显示。', { class: 'muted group-caption' }));
  if (pageSet.choiceRequired) {
    const field = el('fieldset');
    field.append(el('legend', '留下哪几页'));
    for (const card of pageSet.cards) {
      const box = el('input', null, { type: 'checkbox', id: `keep-${card.id}`, value: card.id });
      box.checked = pageKeepDraft.has(card.id);
      box.addEventListener('change', () => {
        syncPageOrder(card.id, box.checked);
        if (pageKeepDraft.size > 4) {
          syncPageOrder(card.id, false);
          box.checked = false;
          notice('站点页面最多留下 4 页。', true);
          return;
        }
        renderPageChoice(document.querySelector('#page-nav'));
        queuePageChoiceSave();
      });
      const label = el('label', null, { for: `keep-${card.id}` });
      label.append(box, document.createTextNode(`${card.title}${card.onSite ? ' · 已在网站上' : ' · 尚未上线'}`));
      field.append(label);
    }
    section.append(field);
  }
  const order = el('ol', null, { class: 'page-order', 'aria-label': '导航顺序' });
  if (!pageOrderDraft.length) order.append(el('li', pageSet.choiceRequired ? '先勾选要留下的页面。' : '没有可排列的站点页。', { class: 'muted' }));
  pageOrderDraft.forEach(id => {
    const card = pageSet.cards.find(item => item.id === id); if (!card) return;
    const li = el('li', null, { 'data-page-id': id });
    const handle = el('button', '⠿', { type: 'button', class: 'page-drag', draggable: 'true', 'aria-label': `拖动「${card.title}」调整顺序`, title: '拖动调整顺序' });
    const titleNode = el('span', card.title, { class: 'page-title' });
    li.append(handle, titleNode);
    order.append(li);
  });
  bindPageOrderDrag(order);
  section.append(order);
  host.append(section);
}
async function applyPageChoice() {
  const keep = pageSet.choiceRequired ? [...pageKeepDraft] : pageSet.cards.map(card => card.id);
  const order = pageOrderDraft.filter(id => keep.includes(id));
  for (const id of keep) if (!order.includes(id)) order.push(id);
  if (keep.length > 4) throw new Error('站点页面最多留下 4 页。');
  const result = await api('/heptabase/page-choice', { keep, order });
  pageChoice = { keep: result.keep, order: result.order };
  pageKeepDraft = new Set(result.keep);
  pageOrderDraft = [...result.order];
  items = items.filter(item => !item.capped);
  for (const removed of result.removals) {
    const card = { ...removed, id: removed.cardLink.split('/').pop() }, input = { collection: removed.collection, id: removed.id, cardLink: removed.cardLink };
    const plan = await api('/heptabase/removal-preview', input);
    items.push({ card, input, plan, removal: true, capped: true, decision: plan.approved ? 'remove' : '' });
  }
  renderList(); await showSelection();
  renderPageChoice(document.querySelector('#page-nav'));
  try { git = await api('/git'); await renderRelease(); } catch { /* release is optional after page-choice save */ }
  const names = result.order.map(id => pageSet.cards.find(card => card.id === id)?.title).filter(Boolean).join('、');
  notice(pageSet.choiceRequired ? `已记下留下的 ${result.keep.length} 页。导航顺序：${names}。未选中且已在网站上的页面进入待删除，网站还没变。` : `已记下导航顺序：${names}。网站要等这次提交发布后才改。`);
}
async function showSelection() {
  clearMoveLines();
  const pane = document.querySelector('#review-preview'); if (!pane) return;
  if (!pulled) {
    const node = pane.querySelector('#notice');
    if (node && !loading) {
      if (!statusText) { node.textContent = emptyPreviewCopy(); node.className = 'preview-empty muted status'; node.setAttribute('role', 'status'); }
    }
    return;
  }
  pane.replaceChildren();
  pane.closest('.review-layout')?.setAttribute('data-mode', mode);
  if (!selected) {
    pane.append(noticeNode(statusText || emptyPreviewCopy(), statusError));
    return;
  }
  if (statusText) pane.append(noticeNode(statusText, statusError));
  const { item, id } = selected;
  if (item.error) {
    pane.replaceChildren(el('p', friendlyError(item.error), { role: 'alert' }));
    return;
  }
  const card = item.plan.changes.find(c => c.id === id), bar = el('div', null, { class: 'preview-bar' });
  const tabs = el('div', null, { class: 'actions', role: 'group', 'aria-label': '预览方式' });
  for (const [value, text] of [['preview', item.removal ? '现有页面' : '发布预览'], ['diff', '段落对比']]) tabs.append(button(text, async () => { mode = value; await showSelection(); }, { 'aria-pressed': String(mode === value) }));
  bar.append(tabs);
  if (!item.removal || item.plan.reason !== 'deleted') bar.append(link('在 Heptabase 打开 ↗', card.cardLink));
  const pageKind = card.afterProperties?.slot === 'project' ? 'project' : card.afterProperties?.heptabaseType === 'reference' ? 'reference · 不进文章列表' : 'article';
  pane.append(bar, el('p', `${card.mainArticle ? pageKind : 'page · 不进文章列表'} / ${card.title}`, { class: 'muted preview-caption' }));
  if (item.plan.pageNote) pane.append(el('p', item.plan.pageNote, { class: 'muted' }));
  if (item.removal) {
    pane.append(el('p', `${item.plan.reasonLabel}。下方是将被撤下的现有内容，不是准备重新发布的版本。`, { class: 'removal-notice' }));
    if (item.plan.blockers.length) pane.append(el('p', `仍被这些文章引用：${item.plan.blockers.map(b => b.title).join('、')}。先在 Heptabase 移除引用并审核更新，或先撤下引用它的文章，再重新拉取。`, { role: 'alert' }));
    if (item.plan.keptReferences.length) pane.append(el('p', `共享资料会保留：${item.plan.keptReferences.map(r => r.title).join('、')}。`, { class: 'muted' }));
  } else appendTagChanges(pane, card);
  const previewCards = item.removal ? item.plan.changes.map(c => ({ ...c, afterProperties: c.beforeProperties, afterContent: c.beforeContent })) : item.plan.changes;
  if (mode === 'preview') {
    const frame = el('iframe', null, { title: '网站发布样式预览', sandbox: 'allow-same-origin', class: 'article-preview', referrerpolicy: 'no-referrer' });
    frame.addEventListener('load', () => frame.contentDocument?.addEventListener('click', event => {
      const anchor = event.target.closest?.('a'); if (!anchor) return; event.preventDefault();
      const path = new URL(anchor.href).pathname, target = item.plan.changes.find(c => '/' + c.path.replace(/^src\/content\//, '').replace(/\.mdx$/, '') === path);
      if (target) void run(async () => { selected = { item, id: target.id }; renderList(); await showSelection(); });
      else notice('预览中不打开外部链接，以免未发布内容发送到其他网站。');
    }));
    frame.srcdoc = await previewHtml(previewCards.find(c => c.id === id), previewCards); pane.append(frame);
  } else await showDiff(pane, card, item.plan.changes);
}
async function confirmRemoval(item) {
  selected = { item, id: item.card.id }; renderList(); await showSelection();
  const d = dialog(`删除「${title(item)}」`);
  d.append(el('p', '确认后将这些页面加入待删除清单。通过 GitHub 发布后，正文、博客列表和全文搜索都会移除；不会删除或修改 Heptabase 里的其他卡片。历史版本仍可从 GitHub 恢复。'));
  const list = el('ul'); item.plan.changes.forEach(c => list.append(el('li', `${c.mainArticle ? 'article' : 'page'} · ${c.title}`))); d.append(list);
  if (item.plan.keptReferences.length) d.append(el('p', `仍有其他文章使用的 ${item.plan.keptReferences.length} 个引用资料页会保留。`));
  if (item.plan.blockers.length) { d.append(el('p', '仍有其他文章指向这些页面，请先处理右侧列出的引用，再重新拉取。', { role: 'alert' })); return; }
  const checkbox = el('input', null, { type: 'checkbox', id: 'removal-reviewed' }), label = el('label', null, { for: 'removal-reviewed' });
  label.append(checkbox, document.createTextNode('我确认将以上页面从网站删除。')); d.append(label, button('确认加入待删除', async () => {
    if (!checkbox.checked) throw new Error('请先确认要删除的页面。');
    await api('/heptabase/removal', { ...selection(item), confirmDelete: true });
    item.decision = 'remove'; closeDialog(); renderList(); await showSelection(); git = await api('/git'); await renderRelease(); notice('已加入待删除清单，网站尚未改变。');
  }));
}
function appendTagChanges(parent, card) {
  const { added, removed, unchanged } = tagDiff(card.beforeProperties.tags, card.afterProperties.tags);
  if (!added.length && !removed.length) return;
  const section = el('section', null, { class: 'tag-changes', 'aria-label': '标签变化' });
  section.append(el('h3', onlyTagsChanged(card) ? '仅标签更新' : '标签变化'));
  const rows = el('dl');
  for (const [label, symbol, tags, kind] of [['新增', '+', added, 'added'], ['移除', '−', removed, 'removed']]) {
    if (!tags.length) continue;
    const values = el('dd'), list = el('ul');
    tags.forEach(tag => { const li = el('li', null, { class: `tag-${kind}` }); li.append(document.createTextNode(`${symbol} `), el(kind === 'removed' ? 's' : 'span', tag)); list.append(li); });
    values.append(list); rows.append(el('dt', `${label} ${tags.length}`), values);
  }
  section.append(rows);
  if (unchanged.length) {
    const details = el('details'), list = el('ul');
    unchanged.forEach(tag => list.append(el('li', tag)));
    details.append(el('summary', `保留 ${unchanged.length} 个标签`), list); section.append(details);
  }
  if (!added.length && !unchanged.length) section.append(el('p', '更新后没有标签。', { class: 'muted' }));
  parent.append(section);
}
const formatDate = date => date ? siteDate(new Date(String(date).slice(0,10) + 'T12:00:00Z'), 'zh-CN') : '';
async function previewTemplate() {
  template ||= await (await fetch('/dashboard/preview.html', { cache: 'no-store' })).text();
  return new DOMParser().parseFromString(template, 'text/html');
}
function referenceHtml(path, cards, doc, version = 'afterProperties') {
  const card = cards.find(c => c.path === `src/content/${path}.mdx`), p = card?.[version];
  if (!p?.title) return el('p', `引用资料：${path}（此版本的资料未拉取）`, { class: 'muted' }).outerHTML;
  const fragment = doc.querySelector('#reference-template').content.cloneNode(true), a = fragment.querySelector('a');
  a.href = '/' + path; fragment.querySelector('h3').textContent = p.title; fragment.querySelector('p:not(.ui-meta)').textContent = p.description || ''; fragment.querySelector('.ui-meta').textContent = formatDate(p.date);
  fragment.querySelector('ul').replaceChildren(...(p.tags || []).slice(0, 3).map(t => el('li', t, { class: 'ui-tag' })));
  const nav = el('nav', null, { class: 'not-prose', 'data-doc-list': '', 'data-doc-embed': '' }), inner = el('div', null, { class: 'flex flex-col' }); inner.append(fragment); nav.append(inner); return nav.outerHTML;
}
/** Match src/styles/global.css theme tokens so srcdoc does not inherit a light :root sheet. */
function previewThemeStyle(theme) {
  const dark = theme === 'dark';
  const vars = dark
    ? '--theme-surface-950:rgb(25 25 25);--theme-surface-900:rgb(25 25 25);--theme-surface-800:rgb(38 38 38);--theme-surface-700:rgb(52 52 52);--theme-ink-50:rgb(248 250 252);--theme-ink-100:rgb(241 245 249);--theme-ink-200:rgb(226 232 240);--theme-ink-300:rgb(203 213 225);--theme-ink-400:rgb(148 163 184);--theme-ink-500:rgb(100 116 139);--theme-ink-600:rgb(71 85 105);--theme-accent-deletion:rgb(252 165 165);--theme-accent-insertion:rgb(134 239 172)'
    : '--theme-surface-950:rgb(255 255 255);--theme-surface-900:rgb(255 255 255);--theme-surface-800:rgb(240 240 240);--theme-surface-700:rgb(224 224 224);--theme-ink-50:rgb(255 255 255);--theme-ink-100:rgb(23 23 23);--theme-ink-200:rgb(38 38 38);--theme-ink-300:rgb(64 64 64);--theme-ink-400:rgb(115 115 115);--theme-ink-500:rgb(140 140 140);--theme-ink-600:rgb(163 163 163);--theme-accent-deletion:rgb(153 27 27);--theme-accent-insertion:rgb(22 101 52)';
  return `html{color-scheme:${theme}!important;${vars}}html,body{background-color:var(--color-surface-950)!important;color:var(--color-ink-300)!important}`;
}
function absolutizePreviewAssets(doc) {
  const origin = location.origin;
  for (const node of doc.querySelectorAll('link[href], script[src], img[src]')) {
    const attr = node.hasAttribute('href') ? 'href' : 'src';
    const value = node.getAttribute(attr);
    if (value?.startsWith('/')) node.setAttribute(attr, origin + value);
  }
  for (const style of doc.querySelectorAll('style')) {
    style.textContent = style.textContent.replace(/url\((['"]?)(\/[^)'"]+)\1\)/g, (_, q, path) => `url(${q}${origin}${path}${q})`);
  }
}
async function previewHtml(card, cards) {
  const doc = await previewTemplate(), p = card.afterProperties;
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  doc.documentElement.lang = 'zh-CN';
  doc.documentElement.dataset.theme = theme;
  doc.documentElement.dataset.lang = 'zh-CN';
  doc.querySelectorAll('script').forEach(n => n.remove());
  absolutizePreviewAssets(doc);
  const themeStyle = doc.createElement('style');
  themeStyle.textContent = previewThemeStyle(theme);
  doc.head.append(themeStyle);
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; script-src 'none'; form-action 'none'; base-uri 'none'";
  doc.head.insertBefore(csp, doc.head.firstChild);
  doc.querySelector('h1').textContent = p.title;
  const time = doc.querySelector('time'); time.textContent = formatDate(p.date); time.dateTime = String(p.date || '');
  const dek = doc.querySelector('.article-dek-text');
  if (dek) { if (p.description) dek.textContent = p.description; else dek.remove(); }
  const tags = doc.querySelector('.article-dek .ui-tag-list');
  if (tags) {
    tags.replaceChildren(...(p.tags || []).map(tag => {
      const li = doc.createElement('li');
      const a = doc.createElement('a');
      a.className = 'ui-tag-link';
      a.href = `/tags?tag=${encodeURIComponent(tag)}`;
      a.textContent = tag;
      li.append(a);
      return li;
    }));
  }
  doc.querySelector('[data-preview-body]').innerHTML = await renderedProse(card.afterContent, path => referenceHtml(path, cards, doc));
  doc.querySelector('#reference-template')?.remove();
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
async function showDiff(pane, card, cards) {
  const changes = paragraphDiff(card.beforeContent, card.afterContent), counts = { added: 0, removed: 0, modified: 0, moved: 0 };
  changes.filter(c => c.kind !== 'unchanged' && (!['moved', 'modified'].includes(c.kind) || c.after)).forEach(c => counts[c.kind]++);
  pane.append(el('p', Object.values(counts).some(Boolean) ? `新增 ${counts.added} 段 · 改写 ${counts.modified} 段 · 删除 ${counts.removed} 段 · 移动 ${counts.moved} 段` : onlyTagsChanged(card) ? '正文未修改，本次只更新标签。' : '正文未修改。', { class: 'diff-summary' }));
  pane.append(el('p', '按正文匹配 · 当前 Heptabase 连接未提供段落 ID，段落对应关系仅供审查。', { class: 'diff-basis muted' }));
  const props = el('dl', null, { class: 'property-changes' });
  for (const [key, name] of [['title', '标题'], ['description', '摘要'], ['date', '日期']]) {
    const text = p => Array.isArray(p[key]) ? p[key].join('、') : String(p[key] || '未设置');
    if (text(card.beforeProperties) !== text(card.afterProperties)) props.append(el('dt', name), el('dd', `${text(card.beforeProperties)} → ${text(card.afterProperties)}`));
  }
  if (props.children.length) pane.append(props);
  const legend = el('p', null, { class: 'diff-legend' });
  legend.append(el('span', '− 红色：原有内容', { class: 'diff-legend-removed' }), el('span', '+ 绿色：新内容', { class: 'diff-legend-added' }), document.createTextNode('未改动的段落完整保留。'));
  pane.append(legend);
  const doc = await previewTemplate(), comparison = el('div', null, { class: 'full-diff', 'aria-label': '全文段落对比' });
  const original = el('article', null, { class: 'diff-original', 'aria-label': '发布前的完整原文' });
  const revision = el('article', null, { class: 'diff-revision', 'aria-label': '这一版全文与修改标记' });
  for (const [column, label, version] of [[original, '原文 · 发布前', 'before'], [revision, '这一版 · 发布后', 'after']]) {
    const properties = card[`${version}Properties`], removed = version === 'before';
    column.append(el('p', label, { class: 'diff-column-label' }));
    if (properties.title) column.append(el('h2', properties.title, { class: 'diff-article-title' }));
    if (properties.date) column.append(el('p', formatDate(properties.date), { class: 'diff-article-date muted' }));
    if (properties.description) column.append(el('p', properties.description, { class: 'diff-article-description muted' }));
    const body = el('div', null, { class: removed ? 'diff-original-body' : 'diff-revision-body' });
    const definitions = paragraphs(card[`${version}Content`]).filter(p => p.type === 'definition').map(p => p.text).join('\n');
    for (const change of changes) {
      const content = change[version]; if (!content) continue;
      const unchanged = change.kind === 'unchanged';
      const block = el('div', null, { class: `paragraph-change ${change.kind}`, 'data-position': change[removed ? 'from' : 'to'] });
      const part = el('div', null, { class: unchanged ? 'diff-unchanged' : removed ? 'diff-removed' : 'diff-added' });
      if (change.kind === 'moved') {
        // This only pairs the two rendered positions, not a Heptabase block ID.
        block.dataset.move = `${change.from}-${change.to}`;
        const jump = el('button', removed ? `移至第 ${change.to} 段 ↗` : `从原第 ${change.from} 段移入 ↖`, {
          type: 'button', class: 'diff-move-label', 'aria-label': removed ? `查看移入后的第 ${change.to} 段` : `查看原来的第 ${change.from} 段`,
        });
        jump.addEventListener('click', () => {
          const other = comparison.querySelector(`${removed ? '.diff-revision' : '.diff-original'} [data-move="${block.dataset.move}"]`);
          other?.scrollIntoView({ block: 'center', behavior: 'instant' });
          other?.querySelector('button')?.focus({ preventScroll: true });
        });
        part.append(jump);
      }
      const prose = el(unchanged ? 'div' : removed ? 'del' : 'ins', null, { class: 'prose-site' });
      prose.innerHTML = await renderedProse(content, path => referenceHtml(path, cards, doc, `${version}Properties`), definitions);
      // Definitions have no visible Markdown output, but changing a link target
      // must still be visible to the reviewer.
      if (!prose.innerHTML.trim()) { if (unchanged) continue; prose.append(el('code', content)); }
      part.append(prose); block.append(part); body.append(block);
    }
    if (!card[`${version}Content`].trim()) body.append(el('p', removed ? '首次发布，还没有原文。' : card.beforeContent.trim() ? '这一版将移除全文。' : '正文为空。', { class: 'muted' }));
    column.append(body);
  }
  comparison.append(original, revision);
  comparison.addEventListener('click', event => {
    if (!event.target.closest?.('a')) return;
    event.preventDefault(); notice('对比中保留链接位置；查看引用资料请点击左侧对应条目，外部链接不会打开。');
  });
  pane.append(comparison);
  clearMoveLines = connectMovedBlocks(comparison);
}
function connectMovedBlocks(comparison) {
  const pairs = [...comparison.querySelectorAll('.diff-original [data-move]')].map(before => ({ before,
    after: comparison.querySelector(`.diff-revision [data-move="${before.dataset.move}"]`),
  })).filter(pair => pair.after);
  if (!pairs.length) return () => {};
  const svgNode = (tag, attrs) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const svg = svgNode('svg', { class: 'diff-move-lines', 'aria-hidden': 'true' });
  comparison.append(svg);
  let frame, active = true;
  const draw = () => {
    if (!active || !comparison.isConnected) return;
    svg.replaceChildren();
    const bounds = comparison.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    for (const { before, after } of pairs) {
      const old = before.getBoundingClientRect(), next = after.getBoundingClientRect();
      if (next.left <= old.right) continue; // Stacked columns use the position links instead.
      const x1 = old.right - bounds.left, y1 = old.top + old.height / 2 - bounds.top;
      const x2 = next.left - bounds.left, y2 = next.top + next.height / 2 - bounds.top;
      const middle = (x1 + x2) / 2;
      svg.append(svgNode('path', { class: 'diff-move-path', 'data-move': before.dataset.move,
        d: `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}` }));
      svg.append(svgNode('path', { class: 'diff-move-arrow', d: `M ${x2 - 5} ${y2 - 4} L ${x2} ${y2} L ${x2 - 5} ${y2 + 4}` }));
    }
  };
  const schedule = () => { cancelAnimationFrame(frame); if (active) frame = requestAnimationFrame(draw); };
  const observer = new ResizeObserver(schedule);
  observer.observe(comparison);
  comparison.querySelectorAll('article, .paragraph-change').forEach(node => observer.observe(node));
  document.fonts.ready.then(schedule); document.fonts.addEventListener('loadingdone', schedule);
  schedule();
  return () => { active = false; cancelAnimationFrame(frame); observer.disconnect(); document.fonts.removeEventListener('loadingdone', schedule); svg.remove(); };
}
async function confirmDecision(item, decision) {
  const approve = decision === 'approve';
  if (approve && item.plan.pageChoiceRequired && !pageChoice?.keep.includes(item.card.id)) throw new Error('站点页面最多显示 4 页。请先在审核清单里选择留下哪几页。');
  selected = { item, id: item.card.id }; renderList(); await showSelection();
  const d = dialog(`${approve ? '通过' : '拒绝'}「${title(item)}」`);
  d.append(el('p', approve ? `通过这篇博客，也表示你已确认它的 ${item.plan.changes.filter(c => !c.mainArticle).length} 个引用资料页可以公开。将回写 Published。卡片已有发布日期或创建时间时，沿用卡片上的时间，不另填今天。网站仍需下一步提交发布。` : '将回写 Block，不修改发布日期，也不会改动线上已有文章。'));
  if (approve && item.plan.pageNote) d.append(el('p', item.plan.pageNote));
  if (approve) appendTagChanges(d, rootChange(item));
  if (approve && item.plan.changes.some(c => !c.mainArticle && !c.referenceTagged)) {
    d.append(button('标记引用资料为 Reference', async () => {
      await api('/heptabase/mark-references', selection(item));
      item.plan = await api('/heptabase/preview', item.input);
      closeDialog();
      renderList();
      await showSelection();
      notice('引用已加入 #blog，Blog Type 为 Reference。请确认这些资料不含私人内容。');
    }));
  }
  let checkbox;
  if (approve) { checkbox = el('input', null, { type: 'checkbox', id: 'privacy-reviewed' }); const label = el('label', null, { for: 'privacy-reviewed' }); label.append(checkbox, document.createTextNode('我已检查这篇博客和所有引用，确认可以公开。')); d.append(label); }
  if (item.plan.conflict) d.append(el('p', 'GitHub 与 Heptabase 两边都有变化；通过后将采用已预览的 Heptabase 版本。', { role: 'alert' }));
  d.append(button(approve ? '确认通过并回写' : '确认拒绝并回写', async () => {
    if (approve && !checkbox.checked) throw new Error('请先确认这篇博客和所有引用都可以公开。');
    await api('/heptabase/decision', { ...selection(item), decision, confirmPublic: approve, resolveConflict: true });
    item.decision = decision; closeDialog(); renderList(); await showSelection(); git = await api('/git'); await renderRelease();
    notice(approve ? '已通过并回写 Published。只是审核通过，尚未上线。' : '已拒绝并回写 Block，线上旧文章保持不变。');
  }));
}
async function renderRelease() {
  const release = document.querySelector('#release'); if (!release) return;
  release.replaceChildren();
  release.append(el('h2', '审核之后，再发布。'));
  const deleteCount = git.files?.filter(f => f.code === 'D').length || 0;
  release.append(el('p', git.draftCount ? `${git.draftCount} 个页面已准备好。${deleteCount ? `其中 ${deleteCount} 个待删除，其余为审核通过的更新。` : '只有审核通过的博客及其引用会进入这批更新。'}` : git.pullRequest ? '这批更新已送到 GitHub，等待检查与发布确认。' : '还没有等待发布的更新。', { class: 'muted' }));
  for (const removed of git.removals || []) release.append(button(`取消删除「${removed.title}」`, async () => {
    await api('/heptabase/removal-cancel', { cardLink: removed.cardLink });
    items = items.filter(item => !item.removal || item.input.cardLink !== removed.cardLink); selected = null;
    await refresh(); notice('已取消待删除，原有待发布更新已保留。可重新拉取查看最新来源。');
  }));
  if (git.draftCount) release.append(button('提交通过的更新到 GitHub', async () => { const result = await api('/git/commit', { message: `更新博客内容 · ${new Date().toLocaleDateString('zh-CN')}` }); git = await api('/git'); await renderRelease(); notice(result.unchanged ? '待发布清单已清理，网站没有变化。' : '已提交，检查通过后再确认发布。'); }));
  if (git.pullRequest) { const actions = el('div', null, { class: 'actions' }); actions.append(link('查看 GitHub 更新 ↗', git.pullRequest.url), button('确认发布', reviewRelease)); release.append(actions); }
  if (git.release) release.append(el('p', `最近一次发布：${stages[git.release.stage] || '正在处理'}`));
  if (git.release?.error) release.append(el('p', git.release.error, { role: 'alert' }));
  if (git.release?.workflowUrl) release.append(link('查看发布进度 ↗', git.release.workflowUrl));
  try {
    const { decisions } = await api('/heptabase/decisions');
    for (const pending of decisions.filter(d => d.status === 'pending')) release.append(button(`重试「${pending.title}」的${pending.decision === 'approve' ? '通过' : '拒绝'}操作`, async () => { await api('/heptabase/decision', { cardLink: `heptabase://card/${pending.id}`, decision: pending.decision }); git = await api('/git'); await renderRelease(); notice('已恢复上次审核操作。'); }));
  } catch { /* decisions retry strip is optional */ }
  release.append(button('刷新发布状态', async () => { git = await api('/git'); await renderRelease(); }));
  clearTimeout(timer);
  if (git.release && ['running','queued'].includes(git.release.status)) timer = setTimeout(() => { if (!document.querySelector('dialog') && !loading) void run(async () => { git = await api('/git'); await renderRelease(); }); }, 15000);
  const legacy = docs.filter(d => !d.heptabaseCardLink);
  if (legacy.length) {
    const details = el('details', null, { class: 'legacy' }); details.append(el('summary', '首次关联旧文章'));
    for (const doc of legacy) details.append(button(`为「${doc.title}」创建 Heptabase 卡片`, async () => {
      const original = await api(`/doc?collection=${doc.collection}&id=${encodeURIComponent(doc.id)}`), modal = dialog('创建对应卡片');
      modal.append(el('p', '只在还没有对应卡片时使用。已有卡片请在审核时关联原文章。'), button('确认创建', async () => {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(original.raw)));
        await api('/heptabase/export', { collection: doc.collection, id: doc.id, documentHash: [...digest].map(n => n.toString(16).padStart(2,'0')).join('') }); closeDialog(); await refresh();
      }));
    })); release.append(details);
  }
}
async function reviewRelease() {
  const review = await api('/git/review'), d = dialog('确认发布到博客');
  if (!review.changes.length) { d.append(el('p', '这批更新已撤销，当前没有需要发布的页面。')); return; }
  d.append(el('p', '只有这些已审核页面会通过 GitHub 发布。确认前会再次检查内容是否变化。'));
  const list = el('ul'); review.changes.forEach(change => list.append(el('li', `${change.kind === 'removed' ? '删除 · ' : '更新 · '}${change.path.replace('src/content/', '').replace('.mdx', '')}`)));
  d.append(list, link('查看完整更新 ↗', review.pullRequest.url), button('确认发布到博客', async () => { await api('/git/publish', review); closeDialog(); git = await api('/git'); await renderRelease(); notice('发布已开始，显示“已上线”才表示完成。'); }));
}
void run(async () => {
  const session = await api('/session');
  booted = true;
  localPreview = session.localPreview;
  localOpen = pageIsLocal() || session.localOpen === true;
  await refresh();
});
