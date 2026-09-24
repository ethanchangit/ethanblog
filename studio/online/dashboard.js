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
  delete root.dataset.shell; root.replaceChildren(noticeNode(display, error));
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
  clearTimeout(timer); clearMoveLines(); root.replaceChildren(); delete root.dataset.shell; items = []; selected = null; pulled = false;
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
  if (pulled) root.dataset.shell = 'review'; else delete root.dataset.shell;
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
    stage.append(button('拉取最新更新', pullUpdates, { class: 'pull-button', 'aria-label': '拉取最新更新' }));
    if (!connected) {
      stage.append(button('连接 Heptabase ↗', connectHeptabase, { class: 'connect-button', 'aria-label': '连接 Heptabase' }));
      stage.append(el('p', '首次拉取时，需要连接你的 Heptabase。', { class: 'muted' }));
    }
    const message = failed || statusText || emptyPreviewCopy();
    stage.append(noticeNode(failed ? friendlyError(failed) : message, Boolean(failed) || statusError));
    root.append(stage);
    root.append(el('section', null, { id: 'release', class: 'release-bar', 'aria-label': '发布进度' }));
      try { await renderRelease(); } catch { /* release is optional before pull */ }
    if (failed) { statusText = friendlyError(failed); statusError = true; }
    return;
  }
  root.append(el('section', null, { id: 'review-summary', class: 'review-top', 'aria-label': '审核进度' }));
  const layout = el('div', null, { class: 'review-layout' });
  const sidebar = el('div', null, { class: 'review-sidebar' });
  sidebar.append(el('aside', null, { id: 'review-list', 'aria-label': '本次审核清单' }), el('section', null, { id: 'page-nav', 'aria-label': '站点页面导航' }), el('div', null, { id: 'legacy-host' }));
  layout.append(sidebar, el('section', null, { id: 'review-preview', 'aria-label': '卡片预览' }));
  root.append(layout);
  root.append(el('section', null, { id: 'release', class: 'release-bar', 'aria-label': '发布进度' }));
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
const groupLabels = { new: 'New articles', edited: 'Edited articles', removed: 'Deleted articles' };
const groupWords = { new: 'New', edited: 'Edited', removed: 'Deleted' };
const groupMarks = { new: '+', edited: '±', removed: '−' };
const kindLabels = { article: 'Article', project: 'Project', page: 'Page', reference: 'Reference', translation: 'Translation' };
function typeMark(group) { return el('span', groupMarks[group], { class: 'type-mark', 'data-type': group, 'aria-hidden': 'true' }); }
function typeLabel(group, kind) {
  const label = el('span', null, { class: 'type-label', 'data-type': group });
  label.append(typeMark(group), el('span', `${groupWords[group]} ${kindLabels[kind].toLowerCase()}`));
  return label;
}
function pageKind(change, removal) {
  if (change?.translation) return 'translation';
  const p = (removal ? change?.beforeProperties : change?.afterProperties) || {};
  if (p.slot === 'project') return 'project';
  if (p.slot === 'page') return 'page';
  if (p.heptabaseType === 'reference' || (change && !change.mainArticle)) return 'reference';
  return 'article';
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
const reviewKinds = ['new', 'edited', 'removed'];
const reviewed = item => Boolean(item.decision);
function reviewQueue() { const by = reviewGroups(); return reviewKinds.flatMap(kind => by[kind]); }
async function select(item, id = item.card.id) {
  focusedGroup = itemGroup(item);
  selected = { item, id };
  renderList();
  await showSelection();
}
/** Moves to the next unreviewed item in the same group, wrapping. Returns false when the group is done. */
function advanceFrom(item) {
  const group = reviewGroups()[itemGroup(item)], start = group.indexOf(item);
  const next = [...group.slice(start + 1), ...group.slice(0, start)].find(i => !reviewed(i) && !i.error && i.plan);
  if (!next) return false;
  selected = { item: next, id: next.card.id }; focusedGroup = itemGroup(next);
  return true;
}
function doneHint(item) {
  const by = reviewGroups(), group = itemGroup(item);
  const later = reviewKinds.find(kind => kind !== group && by[kind].some(i => !reviewed(i)));
  return later ? `${groupLabels[group]} 已全部审完，按 J 或点 ${groupLabels[later]} 继续。` : '全部已审完，可以在底部提交发布。';
}
function afterDecision(item, message) {
  const advanced = advanceFrom(item);
  return advanced ? message : `${message}${doneHint(item)}`;
}
/** The remark is written back only when the field differs from the card's current Remark. */
function remarkChange(item) {
  const base = item.plan?.properties?.remark || '';
  return item.remarkDraft !== undefined && item.remarkDraft !== base ? item.remarkDraft : undefined;
}
const decisionNotes = {
  approve: '已通过并回写 Published。只是审核通过，尚未上线。',
  reject: '已拒绝并回写 Block，线上旧文章保持不变。',
  remove: '已加入待删除清单，网站尚未改变。',
  skip: '本次暂不删除，线上页面不变；下次拉取会再次提醒。',
};
/** One click decides. A decided item can be decided again; only the first decision advances. */
async function decide(item, verdict) {
  if (!item?.plan) return;
  const next = item.removal ? (verdict === 'approve' ? 'remove' : 'skip') : verdict;
  const remark = next === 'reject' ? remarkChange(item) : undefined;
  if (item.decision === next && remark === undefined) return;
  const first = !reviewed(item);
  let extra = '';
  if (next === 'approve') {
    if (item.plan.pageChoiceRequired && !pageChoice?.keep.includes(item.card.id)) throw new Error('站点页面最多显示 4 页。请先在审核清单里选择留下哪几页。');
    if (first && item.plan.changes.some(c => !c.mainArticle && !c.referenceTagged && !c.translation)) {
      await api('/heptabase/mark-references', selection(item));
      item.plan = await api('/heptabase/preview', item.input);
      extra = '引用资料已加入 #blog，Blog Type 为 Reference。';
    }
    await api('/heptabase/decision', { ...selection(item), decision: 'approve', confirmPublic: true, resolveConflict: true });
  } else if (next === 'reject') {
    await api('/heptabase/decision', { ...selection(item), decision: 'reject', ...(remark !== undefined ? { remark } : {}) });
    if (remark !== undefined) { item.plan.properties = { ...item.plan.properties, remark }; extra = remark ? 'Remark 已写回 Heptabase。' : 'Remark 已清空。'; }
  } else if (next === 'remove') {
    await api('/heptabase/removal', { ...selection(item), confirmDelete: true });
  } else if (item.decision === 'remove') {
    await api('/heptabase/removal-cancel', { cardLink: item.input.cardLink });
  }
  const changed = item.decision && item.decision !== next;
  item.decision = next;
  const text = `${decisionNotes[next]}${extra}${changed ? '已改判。' : ''}`;
  const message = first ? afterDecision(item, text) : text;
  renderList(); await showSelection(); git = await api('/git'); await renderRelease();
  notice(message);
}
function renderSummary(by) {
  const top = document.querySelector('#review-summary'); if (!top) return;
  top.replaceChildren();
  const done = items.filter(reviewed).length, total = items.length;
  const head = el('div', null, { class: 'summary-head' });
  const progress = el('div', null, { class: 'summary-progress' });
  const bar = el('span', null, { class: 'progress-bar', role: 'progressbar', 'aria-label': '审核进度', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) });
  bar.append(el('span', null, { class: 'progress-fill' }));
  bar.style.setProperty('--progress', total ? `${(done / total) * 100}%` : '0%');
  progress.append(el('h2', '审核清单', { class: 'section-label' }), el('span', `已审 ${done} / ${total}`, { class: 'progress-count' }), bar);
  if (items.some(reviewed)) {
    progress.append(el('p', `待审 ${items.filter(i => !i.decision).length} · 通过 ${items.filter(i => i.decision === 'approve').length} · 拒绝 ${items.filter(i => i.decision === 'reject').length}${by.removed.length ? ` · 确认删除 ${by.removed.filter(i => i.decision === 'remove').length} · 暂不删除 ${by.removed.filter(i => i.decision === 'skip').length}` : ''}`, { class: 'muted group-caption' }));
  }
  const tools = el('div', null, { class: 'summary-tools' });
  const hint = el('p', null, { class: 'shortcut-hint' });
  for (const [keys, text] of [[['J', 'K'], '上下'], [['A'], '通过'], [['R'], '拒绝'], [['D'], '对比']]) {
    const group = el('span');
    keys.forEach(key => group.append(el('kbd', key)));
    group.append(document.createTextNode(text));
    hint.append(group);
  }
  tools.append(hint, button('拉取最新更新', pullUpdates, { class: 'btn', 'aria-label': '拉取最新更新' }));
  head.append(progress, tools);
  const tabs = el('div', null, { class: 'review-groups', role: 'tablist', 'aria-label': '审核分组' });
  for (const kind of reviewKinds) {
    const count = by[kind].length, checked = by[kind].filter(reviewed).length;
    const tab = button(`${groupLabels[kind]} · ${count}`, async () => {
      focusedGroup = kind;
      const first = by[kind].find(i => !reviewed(i)) || by[kind][0];
      selected = first ? { item: first, id: first.card.id } : null;
      renderList();
      await showSelection();
    }, {
      class: 'review-group-tab',
      role: 'tab',
      'aria-label': `${groupLabels[kind]} · ${count}`,
      'aria-selected': String(focusedGroup === kind),
      'aria-controls': 'review-items',
      'data-review-group': kind,
      'data-type': kind,
      title: `已审 ${checked} / ${count}`,
    });
    tab.replaceChildren(typeMark(kind), el('span', groupLabels[kind]), el('span', `${checked}/${count}`, { class: 'tab-count', 'aria-hidden': 'true', 'data-done': String(count > 0 && checked === count) }));
    tabs.append(tab);
  }
  if (pageSet?.cards?.length) {
    const kept = pageSet.choiceRequired ? pageKeepDraft.size : pageOrderDraft.length;
    tabs.append(button(pageSet.choiceRequired ? `站点页面 ${kept}/4` : `站点页面 ${kept}`, async () => {
      const host = document.querySelector('#page-nav');
      host?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      host?.querySelector('input, button')?.focus({ preventScroll: true });
    }, { class: 'summary-jump', 'aria-label': '跳到站点页面' }));
  }
  top.append(head, tabs);
}
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function renderList() {
  const list = document.querySelector('#review-list'); if (!list) return; list.replaceChildren();
  if (!pulled) return;
  const by = reviewGroups();
  if (!reviewKinds.includes(focusedGroup)) focusedGroup = 'new';
  renderSummary(by);
  const row = el('div', null, { id: 'review-items', class: 'review-items', 'data-review-group': focusedGroup, 'data-type': focusedGroup, role: 'tabpanel', 'aria-label': groupLabels[focusedGroup] });
  const group = by[focusedGroup];
  const deleting = focusedGroup === 'removed';
  const edited = focusedGroup === 'edited';
  if (!group.length) row.append(el('p', '这一组没有待审文章。', { class: 'muted empty-group' }));
  for (const item of group) {
    const active = selected?.item === item;
    const card = el('div', null, { class: 'review-item', 'data-type': focusedGroup, ...(item.decision ? { 'data-decision': item.decision } : {}), ...(active ? { 'data-selected': 'true' } : {}) });
    card.append(typeLabel(focusedGroup, pageKind(rootChange(item), deleting)));
    card.append(button(title(item), () => select(item), { class: 'card-select', 'aria-pressed': String(Boolean(active && selected.id === item.card.id)) }));
    const decisions = el('div', null, { class: 'decisions' });
    if (item.plan) {
      const yes = deleting ? 'remove' : 'approve', no = deleting ? 'skip' : 'reject';
      decisions.append(
        button('✓', () => decide(item, 'approve'), { class: 'decide', 'data-decide': yes, 'aria-pressed': String(item.decision === yes), 'aria-label': `${deleting ? '删除' : '通过'}「${title(item)}」`, title: deleting ? '从网站删除这篇博客' : '通过这篇博客，并确认正文和引用可以公开' }),
        button('×', () => decide(item, 'reject'), { class: 'decide', 'data-decide': no, 'aria-pressed': String(item.decision === no), 'aria-label': `${deleting ? '暂不删除' : '拒绝'}「${title(item)}」`, title: deleting ? '本次暂不删除' : '拒绝这篇博客' }),
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
      const block = el('div', null, { class: 'references-block' });
      const ul = el('ul', null, { class: 'references', 'aria-label': `跟随「${title(item)}」的资料` });
      for (const refCard of references) {
        const refActive = Boolean(active && selected.id === refCard.id);
        const ref = el('li', null, refActive ? { 'data-selected': 'true' } : {});
        ref.append(
          el('span', refCard.translation ? `Translation · ${refCard.language}` : refCard.mainArticle ? 'Article' : 'Reference', { class: 'kind-label' }),
          button(refCard.title, () => select(item, refCard.id), { class: 'card-select', 'aria-pressed': String(refActive) }),
          el('small', refCard.translation ? `译文，随中文原文一起审核 · ${refCard.kind}` : `${refCard.mainArticle ? 'article · 需单独审核' : 'page'} · ${refCard.kind}`, { class: 'item-meta' }),
        );
        ul.append(ref);
      }
      block.append(el('p', `跟随资料 ${references.length}`, { class: 'references-label' }), ul);
      card.append(block);
    }
    card.addEventListener('click', event => {
      if (event.target.closest('button, a, input, label')) return;
      void run(() => select(item));
    });
    row.append(card);
  }
  list.append(row);
  const sidebar = list.closest('.review-sidebar');
  if (sidebar && getComputedStyle(sidebar).overflowY === 'auto') list.querySelector('.review-item[data-selected=true]')?.scrollIntoView({ block: 'nearest' });
}
async function step(direction) {
  const queue = reviewQueue(); if (!queue.length) return;
  const index = queue.indexOf(selected?.item);
  const next = queue[index < 0 ? 0 : Math.min(queue.length - 1, Math.max(0, index + direction))];
  if (next === selected?.item && selected.id === next.card.id) return;
  await select(next);
  // run() re-enables buttons only after this returns, and a disabled button cannot take focus.
  setTimeout(() => document.querySelector('#review-list .review-item[data-selected=true] > .card-select')?.focus({ preventScroll: true }));
}
document.addEventListener('keydown', event => {
  if (!pulled || loading || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (document.querySelector('dialog[open]') || event.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const inList = Boolean(event.target.closest?.('#review-list'));
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  let action;
  if (key === 'j' || (inList && key === 'ArrowDown')) action = () => step(1);
  else if (key === 'k' || (inList && key === 'ArrowUp')) action = () => step(-1);
  else if (key === 'a' && selected) action = () => decide(selected.item, 'approve');
  else if (key === 'r' && selected) action = () => decide(selected.item, 'reject');
  else if (key === 'd' && selected && !selected.item.error) action = async () => { mode = mode === 'diff' ? 'preview' : 'diff'; await showSelection(); };
  if (!action) return;
  event.preventDefault();
  void run(action);
});
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
  const section = el('section', null, { class: 'review-group page-choice', 'data-review-group': 'pages', 'data-type': 'page' });
  const head = el('div', null, { class: 'panel-head' });
  const kept = pageSet.choiceRequired ? pageKeepDraft.size : pageOrderDraft.length;
  head.append(el('h2', '站点页面'), el('span', pageSet.choiceRequired ? `已选 ${kept} / 4` : `${kept} 页`, { class: 'page-meter', 'data-full': String(kept >= 4) }));
  section.append(head);
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
      const label = el('label', null, { for: `keep-${card.id}`, class: 'page-option', 'data-checked': String(box.checked) });
      label.append(box, el('span', card.title, { class: 'page-title' }), document.createTextNode(' '), el('span', card.onSite ? '已在网站上' : '尚未上线', { class: 'page-status', 'data-on-site': String(Boolean(card.onSite)) }));
      field.append(label);
    }
    section.append(field);
  }
  section.append(el('h3', '导航顺序', { class: 'section-label' }));
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
  if (pulled) renderSummary(reviewGroups());
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
  if (selected?.item.error || !selected) pane.removeAttribute('data-type');
  else pane.dataset.type = itemGroup(selected.item);
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
  const card = item.plan.changes.find(c => c.id === id), group = itemGroup(item), kind = pageKind(card, item.removal);
  const head = el('div', null, { class: 'preview-head', 'data-type': group });
  const titleRow = el('div', null, { class: 'preview-title-row' });
  const labels = el('div', null, { class: 'preview-labels' });
  labels.append(typeLabel(group, kind));
  if (card.id !== item.card.id) labels.append(el('span', `跟随「${title(item)}」`, { class: 'muted follows' }));
  titleRow.append(labels, el('h2', card.title, { class: 'preview-title' }));
  const bar = el('div', null, { class: 'preview-bar' });
  const tabs = el('div', null, { class: 'mode-tabs', role: 'group', 'aria-label': '预览方式' });
  for (const [value, text] of [['preview', item.removal ? '现有页面' : '发布预览'], ['diff', '段落对比']]) tabs.append(button(text, async () => { mode = value; await showSelection(); }, { 'aria-pressed': String(mode === value) }));
  bar.append(tabs);
  if (!item.removal || item.plan.reason !== 'deleted') bar.append(link('在 Heptabase 打开 ↗', card.cardLink));
  bar.append(detailActions(item));
  head.append(titleRow, bar);
  pane.append(head);
  if (!item.removal) pane.append(remarkField(item));
  const meta = el('section', null, { class: 'review-meta', 'aria-label': '属性与标签' });
  meta.append(el('h3', '属性', { class: 'section-label' }));
  appendProperties(meta, card, kind, item.removal);
  if (item.plan.pageNote) meta.append(el('p', item.plan.pageNote, { class: 'muted meta-note' }));
  if (item.removal) {
    meta.append(el('p', `${item.plan.reasonLabel}。下方是将被撤下的现有内容，不是准备重新发布的版本。`, { class: 'removal-notice' }));
    if (item.plan.blockers.length) meta.append(el('p', `仍被这些文章引用：${item.plan.blockers.map(b => b.title).join('、')}。先在 Heptabase 移除引用并审核更新，或先撤下引用它的文章，再重新拉取。`, { role: 'alert' }));
    if (item.plan.keptReferences.length) meta.append(el('p', `共享资料会保留：${item.plan.keptReferences.map(r => r.title).join('、')}。`, { class: 'muted meta-note' }));
  }
  pane.append(meta);
  const body = el('section', null, { class: 'review-body', 'aria-label': '正文' });
  body.append(el('h3', mode === 'preview' ? '正文 · 网站排版' : '正文 · 段落对比', { class: 'section-label' }));
  pane.append(body);
  const previewCards = item.removal ? item.plan.changes.map(c => ({ ...c, afterProperties: c.beforeProperties, afterContent: c.beforeContent })) : item.plan.changes;
  if (mode === 'preview') {
    const frame = el('iframe', null, { title: '网站发布样式预览', sandbox: 'allow-same-origin', class: 'article-preview', referrerpolicy: 'no-referrer' });
    frame.addEventListener('load', () => fitFrame(frame));
    frame.addEventListener('load', () => frame.contentDocument?.addEventListener('click', event => {
      const anchor = event.target.closest?.('a'); if (!anchor) return; event.preventDefault();
      const path = new URL(anchor.href).pathname, target = item.plan.changes.find(c => !c.translation && (previewPath(c) === path || '/' + c.path.replace(/^src\/content\//, '').replace(/\.mdx$/, '') === path));
      if (target) void run(async () => { selected = { item, id: target.id }; renderList(); await showSelection(); });
      else notice('预览中不打开外部链接，以免未发布内容发送到其他网站。');
    }));
    frame.srcdoc = await previewHtml(previewCards.find(c => c.id === id), previewCards); body.append(frame);
  } else await showDiff(body, card, item.plan.changes);
}
/** Grows the preview to its content so the article scrolls with the pane, as it does on the site. */
function fitFrame(frame) {
  const doc = frame.contentDocument; if (!doc?.documentElement) return;
  const fit = () => { frame.style.height = `${Math.ceil(doc.documentElement.getBoundingClientRect().height)}px`; };
  fit();
  new frame.contentWindow.ResizeObserver(fit).observe(doc.documentElement);
}
function detailActions(item) {
  const box = el('div', null, { class: 'detail-actions' });
  const yes = item.removal ? 'remove' : 'approve', no = item.removal ? 'skip' : 'reject';
  const action = (text, key, verdict, decision, variant) => {
    const b = button(text, () => decide(item, verdict), { class: `btn ${variant}`, 'data-decide': decision, 'aria-pressed': String(item.decision === decision), 'aria-keyshortcuts': key.toLowerCase() });
    b.append(el('kbd', key, { 'aria-hidden': 'true' }));
    return b;
  };
  box.append(
    action(item.removal ? '暂不删除' : '拒绝', 'R', 'reject', no, ''),
    action(item.removal ? '删除' : '通过', 'A', 'approve', yes, ''),
  );
  return box;
}
/** Remark is written to the card's Remark column when the review is rejected. */
function remarkField(item) {
  const box = el('div', null, { class: 'remark-field' });
  const id = `remark-${item.card.id}`;
  const label = el('label', null, { for: id });
  label.append(el('span', '拒绝说明'), el('span', 'Remark', { class: 'muted' }));
  const area = el('textarea', null, { id, rows: '2', maxlength: '2000', placeholder: '写给自己的修改意见。拒绝时写回 Heptabase，可以留空。' });
  area.value = item.remarkDraft ?? (item.plan.properties?.remark || '');
  const hint = el('p', '', { class: 'muted remark-hint', role: 'status' });
  const sync = () => { hint.textContent = item.decision === 'reject' && remarkChange(item) !== undefined ? '说明已修改，再点一次拒绝写回 Heptabase。' : ''; };
  area.addEventListener('input', () => { item.remarkDraft = area.value; sync(); });
  sync();
  box.append(label, area, hint);
  return box;
}
/**
 * Public address. Chinese (#blog) is on cn.ethanchang.io; an English translation has the same
 * path on ethanchang.io, other languages under ethanchang.io/<language>.
 */
function contentPath(card) {
  if (!card.path) return '';
  let id = card.path.replace(/^src\/content\//, '').replace(/\.mdx$/, '');
  if (card.translation) id = id.replace(/\/[a-z]{2,3}$/, '');
  const url = card.afterProperties?.url || card.beforeProperties?.url;
  const path = url && id.startsWith('articles/') ? '/' + id.slice('articles/'.length) : '/' + id;
  if (!card.translation) return `cn.ethanchang.io${path}`;
  return card.language === 'en' ? `ethanchang.io${path}` : `ethanchang.io/${card.language}${path}`;
}
function previewPath(card) {
  return contentPath(card).replace(/^(cn\.)?ethanchang\.io/, '');
}
function appendProperties(parent, card, kind, removal) {
  const before = card.beforeProperties || {}, p = (removal ? card.beforeProperties : card.afterProperties) || {};
  // Only an already published card has an old value to compare against; removals show what is live.
  const compare = !removal && Boolean(card.previouslyPublished);
  const where = { article: '文章列表', project: '项目页', page: '站点页面', reference: '不进文章列表', translation: `${card.language} 译文` };
  const rows = el('dl', null, { class: 'meta-grid' });
  const row = (name, value, attrs = {}) => { const dd = el('dd', null, attrs); if (typeof value === 'string') dd.textContent = value; else dd.append(value); rows.append(el('dt', name), dd); };
  const changed = (oldText, newText) => {
    const span = el('span', null, { class: 'inline-change' });
    span.append(el('del', oldText), el('ins', newText));
    return span;
  };
  const scalar = (name, oldText, newText, empty) => {
    if (compare && oldText !== newText) row(name, changed(oldText || empty, newText || empty));
    else row(name, newText ? newText : el('span', empty, { class: 'muted' }));
  };
  if (compare && before.title && before.title !== p.title) row('标题', changed(before.title, p.title || '未设置'));
  const oldKind = compare && before.slot ? pageKind({ ...card, afterProperties: before }, false) : kind;
  scalar('类型', `${kindLabels[oldKind]} · ${where[oldKind]}`, `${kindLabels[kind]} · ${where[kind]}`, '');
  if (contentPath(card)) row('地址', el('code', contentPath(card)));
  scalar('日期', formatDate(before.date), formatDate(p.date), '未设置');
  scalar('摘要', before.description || '', p.description || '', '未填写 Summary');
  appendTagRow(row, card, p, removal);
  parent.append(rows);
}
function appendTagRow(row, card, p, removal) {
  const { added, removed } = removal ? { added: [], removed: [] } : tagDiff(card.beforeProperties.tags, card.afterProperties.tags);
  const list = el('ul', null, { class: 'meta-tags', 'aria-label': '标签' });
  const addedSet = new Set(added);
  [...new Set(p.tags || [])].forEach(tag => {
    if (!addedSet.has(tag)) { list.append(el('li', tag)); return; }
    const li = el('li', null, { class: 'tag-added' }); li.append(document.createTextNode('+ '), el('span', tag)); list.append(li);
  });
  removed.forEach(tag => { const li = el('li', null, { class: 'tag-removed' }); li.append(document.createTextNode('− '), el('s', tag)); list.append(li); });
  const changes = added.length || removed.length;
  const value = el('div', null, { class: 'meta-tag-row' });
  if (list.children.length) value.append(list);
  if (!(p.tags || []).length) value.append(el('span', changes ? '更新后没有标签。' : '没有标签', { class: 'muted' }));
  row('标签', value, changes ? { class: 'tag-changes', 'aria-label': '标签与标签变化' } : {});
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
  // The site places the article in a 42rem reading column (see .reading-shell in global.css).
  const column = '.article-shell{max-width:42rem;margin-inline:auto}@media (min-width:768px){.article-shell{padding-top:.75rem}}';
  return `html{color-scheme:${theme}!important;${vars}}html,body{background-color:var(--color-surface-950)!important;color:var(--color-ink-300)!important}${column}`;
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
  if (!(p.tags || []).length) doc.querySelector('.article-dek .article-meta')?.remove();
  else if (tags) {
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
  const legend = el('p', null, { class: 'diff-legend' });
  legend.append(el('span', '− 红色：原有内容', { class: 'diff-legend-removed' }), el('span', '+ 绿色：新内容', { class: 'diff-legend-added' }), document.createTextNode('未改动的段落完整保留。'));
  pane.append(legend);
  const doc = await previewTemplate(), comparison = el('div', null, { class: 'full-diff', 'aria-label': '全文段落对比' });
  const original = el('article', null, { class: 'diff-original', 'aria-label': '发布前的完整原文' });
  const revision = el('article', null, { class: 'diff-revision', 'aria-label': '这一版全文与修改标记' });
  for (const [column, label, version] of [[original, '原文 · 发布前', 'before'], [revision, '这一版 · 发布后', 'after']]) {
    const properties = card[`${version}Properties`], removed = version === 'before';
    column.append(el('p', label, { class: 'diff-column-label' }));
    const columnMeta = el('div', null, { class: 'diff-column-meta' });
    if (properties.title) columnMeta.append(el('h2', properties.title, { class: 'diff-article-title' }));
    if (properties.date) columnMeta.append(el('p', formatDate(properties.date), { class: 'diff-article-date muted' }));
    if (properties.description) columnMeta.append(el('p', properties.description, { class: 'diff-article-description muted' }));
    if (columnMeta.children.length) column.append(columnMeta);
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
async function renderRelease() {
  const release = document.querySelector('#release'); if (!release) return;
  const status = el('div', null, { class: 'release-status' }), actions = el('div', null, { class: 'release-actions' });
  release.replaceChildren(status, actions);
  status.append(el('h2', '发布'));
  if (pulled && items.length) {
    const waiting = items.filter(item => !reviewed(item)).length;
    status.append(el('p', waiting ? `还有 ${waiting} 条待审` : '全部已审', { class: 'release-progress', 'data-ready': String(!waiting) }));
  }
  const deleteCount = git.files?.filter(f => f.code === 'D').length || 0;
  status.append(el('p', git.draftCount ? `${git.draftCount} 个页面已准备好。${deleteCount ? `其中 ${deleteCount} 个待删除，其余为审核通过的更新。` : '只有审核通过的博客及其引用会进入这批更新。'}` : git.pullRequest ? '这批更新已送到 GitHub，等待检查与发布确认。' : '还没有等待发布的更新。', { class: 'muted' }));
  if (git.release) status.append(el('p', `最近一次发布：${stages[git.release.stage] || '正在处理'}`, { class: 'release-stage', 'data-stage': git.release.stage || '' }));
  if (git.release?.error) status.append(el('p', git.release.error, { role: 'alert' }));
  if (git.release?.workflowUrl) status.append(link('查看发布进度 ↗', git.release.workflowUrl));
  if (git.pullRequest) status.append(link('查看 GitHub 更新 ↗', git.pullRequest.url));
  actions.append(button('刷新发布状态', async () => { git = await api('/git'); await renderRelease(); }, { class: 'btn' }));
  for (const removed of git.removals || []) actions.append(button(`取消删除「${removed.title}」`, async () => {
    await api('/heptabase/removal-cancel', { cardLink: removed.cardLink });
    items = items.filter(item => !item.removal || item.input.cardLink !== removed.cardLink); selected = null;
    await refresh(); notice('已取消待删除，原有待发布更新已保留。可重新拉取查看最新来源。');
  }, { class: 'btn' }));
  try {
    const { decisions } = await api('/heptabase/decisions');
    for (const pending of decisions.filter(d => d.status === 'pending')) actions.append(button(`重试「${pending.title}」的${pending.decision === 'approve' ? '通过' : '拒绝'}操作`, async () => { await api('/heptabase/decision', { cardLink: `heptabase://card/${pending.id}`, decision: pending.decision }); git = await api('/git'); await renderRelease(); notice('已恢复上次审核操作。'); }, { class: 'btn' }));
  } catch { /* decisions retry strip is optional */ }
  if (git.draftCount) actions.append(button('提交通过的更新到 GitHub', async () => { const result = await api('/git/commit', { message: `更新博客内容 · ${new Date().toLocaleDateString('zh-CN')}` }); git = await api('/git'); await renderRelease(); notice(result.unchanged ? '待发布清单已清理，网站没有变化。' : '已提交，检查通过后再确认发布。'); }, { class: 'btn primary' }));
  if (git.pullRequest) actions.append(button('确认发布', reviewRelease, { class: 'btn primary' }));
  clearTimeout(timer);
  if (git.release && ['running','queued'].includes(git.release.status)) timer = setTimeout(() => { if (!document.querySelector('dialog') && !loading) void run(async () => { git = await api('/git'); await renderRelease(); }); }, 15000);
  const legacyHost = document.querySelector('#legacy-host') || release;
  legacyHost.querySelector('.legacy')?.remove();
  const legacy = docs.filter(d => !d.heptabaseCardLink);
  if (legacy.length) {
    const details = el('details', null, { class: 'legacy' }); details.append(el('summary', '首次关联旧文章'));
    for (const doc of legacy) details.append(button(`为「${doc.title}」创建 Heptabase 卡片`, async () => {
      const original = await api(`/doc?collection=${doc.collection}&id=${encodeURIComponent(doc.id)}`), modal = dialog('创建对应卡片');
      modal.append(el('p', '只在还没有对应卡片时使用。已有卡片请在审核时关联原文章。'), button('确认创建', async () => {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(original.raw)));
        await api('/heptabase/export', { collection: doc.collection, id: doc.id, documentHash: [...digest].map(n => n.toString(16).padStart(2,'0')).join('') }); closeDialog(); await refresh();
      }));
    })); legacyHost.append(details);
  }
}
async function reviewRelease() {
  const review = await api('/git/review'), d = dialog('确认发布到博客');
  if (!review.changes.length) { d.append(el('p', '这批更新已撤销，当前没有需要发布的页面。')); return; }
  d.append(el('p', '只有这些已审核页面会通过 GitHub 发布。确认前会再次检查内容是否变化。'));
  const list = el('ul'); review.changes.forEach(change => list.append(el('li', `${change.kind === 'removed' ? '删除 · ' : '更新 · '}${change.path.replace('src/content/', '').replace('.mdx', '')}`)));
  d.append(list, link('查看完整更新 ↗', review.pullRequest.url), button('确认发布到博客', async () => { await api('/git/publish', review); closeDialog(); git = await api('/git'); await renderRelease(); notice('发布已开始，显示“已上线”才表示完成。'); }, { class: 'btn primary' }));
}
void run(async () => {
  const session = await api('/session');
  booted = true;
  localPreview = session.localPreview;
  localOpen = pageIsLocal() || session.localOpen === true;
  await refresh();
});
