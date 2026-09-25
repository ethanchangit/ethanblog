import './dashboard.css';
import { paragraphs, paragraphDiff, renderedProse, tagDiff } from './review-content.mjs';
import { formatDate as siteDate } from '../../src/lib/format.ts';
import { IO_CONCURRENCY, mapLimited, previewBodyKey } from './pool.mjs';
import { auditAddress } from './audit-address.mjs';
import { directPublishFeedback, directPublishPlan } from './direct-publish.mjs';
import { applyLocalDecision, decisionBatch, pageChoicePayload, referenceKeepBatchCopy, referenceKeepCopy } from './local-decisions.mjs';
import { blogViewHref } from './blog-href.mjs';

const root = document.querySelector('#studio');
document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const stages = { merging: '正在合并', queued: '等待部署', building: '正在检查和部署', verifying: '正在确认线上版本', deployed: '已上线', failed: '发布失败' };
let docs = [], items = [], selected, git, connected = false, pulled = false, localPreview = false, localOpen = false, booted = false, mode = 'preview', template, timer;
let pageRemovalPlans = new Map();
let pageChoiceDirty = false;
let busyRelease = '';
let releaseNotice = { text: '', error: false };
let pageSet = null, pageChoice = null, pageKeepDraft = new Set(), pageOrderDraft = [], pageListDraft = [], pageHiddenDraft = new Set();
let pageChoiceSaveTimer = 0;
let focusedGroup = 'new';
let picked = new Set();
let pickAnchor = '';
let statusText = '', statusError = false, pulling = false;
let shownPreview = null, previewGen = 0, listStamp = '', listDecisionStamp = '', refreshToken = 0;
const htmlCache = new Map(), proseCache = new Map();
function el(tag, text, attrs = {}) { const n = document.createElement(tag); if (text != null) n.textContent = text; for (const [k,v] of Object.entries(attrs)) n.setAttribute(k, v); return n; }
function link(text, href) { return el('a', text, { href, ...(href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }); }
function button(text, action, attrs = {}) {
  const network = Object.hasOwn(attrs, 'network');
  if (network) delete attrs.network;
  const instant = Object.hasOwn(attrs, 'instant');
  if (instant) delete attrs.instant;
  const b = el('button', text, { type: 'button', ...attrs });
  b.addEventListener('click', () => {
    // Review clicks stay on the page. Only pull and publish opt into the network.
    if (!network) {
      try {
        const result = action();
        if (result && typeof result.then === 'function') result.catch(error => notice(error.message, true));
      } catch (error) { notice(error.message, true); }
      return;
    }
    void runControl(b, action);
  });
  return b;
}
async function runControl(control, action) {
  if (control.dataset.busy) return;
  control.dataset.busy = '1';
  control.disabled = true;
  const release = control.getAttribute('data-release');
  if (release) busyRelease = release;
  try { await action(); }
  catch (error) {
    if (error.status === 401 && !pageIsLocal()) { closeDialog(); showLogin(booted ? error.message : ''); }
    else {
      notice(error.message, true);
      // Preview notices sit in a scrolling column. The release bar is where this click happened.
      if (release) showReleaseNotice(friendlyError(error.message), true);
    }
  } finally {
    delete control.dataset.busy;
    if (release && busyRelease === release) busyRelease = '';
    const live = release ? document.querySelector(`#release [data-release="${release}"]`) : control;
    if (live?.isConnected) live.disabled = false;
  }
}
function showReleaseNotice(text, error = false) {
  releaseNotice = { text: String(text || ''), error: Boolean(error && text) };
  const status = document.querySelector('#release .release-status');
  if (!status) return;
  status.querySelector('[data-release-notice]')?.remove();
  if (!releaseNotice.text) return;
  status.append(el('p', releaseNotice.text, {
    'data-release-notice': '',
    role: releaseNotice.error ? 'alert' : 'status',
    class: releaseNotice.error ? 'release-alert' : 'muted',
  }));
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
function previewStatus(text, error) {
  return el('p', text, {
    class: error ? 'status' : 'preview-empty muted',
    role: error ? 'alert' : 'status',
  });
}
function notice(text, error = false) {
  const display = error ? friendlyError(text) : text;
  statusText = display; statusError = error;
  const dialogStatus = document.querySelector('dialog[open] .status');
  if (dialogStatus) { dialogStatus.textContent = display; dialogStatus.setAttribute('role', error ? 'alert' : 'status'); return; }
  const loginNotice = document.querySelector('.login #notice');
  if (loginNotice) {
    loginNotice.textContent = display;
    loginNotice.className = 'status';
    loginNotice.setAttribute('role', error ? 'alert' : 'status');
    return;
  }
  document.querySelector('#review-preview #notice')?.remove();
  const pane = document.querySelector('#review-preview');
  if (pane) {
    const alert = pane.querySelector(':scope > [data-preview-alert]');
    if (!error) { alert?.remove(); return; }
    if (alert) alert.textContent = display;
    else pane.prepend(el('p', display, { role: 'alert', 'data-preview-alert': '' }));
    return;
  }
  if (!pageIsLocal() || !root) return;
  delete root.dataset.shell;
  root.replaceChildren(previewStatus(display, error));
}
async function connectHeptabase() {
  notice('正在打开 Heptabase 授权…');
  const { url } = await api('/heptabase/connect', {});
  location.assign(url);
}
async function run(action) {
  try { await action(); } catch (error) {
    if (error.status === 401 && !pageIsLocal()) { closeDialog(); showLogin(booted ? error.message : ''); }
    else notice(error.message, true);
  }
}
function showLogin(message = '') {
  if (pageIsLocal()) { localOpen = true; notice(message || '本地后台请求被拒绝，请刷新后重试。', true); return; }
  clearTimeout(timer); root.replaceChildren(); delete root.dataset.shell; items = []; selected = null; pulled = false;
  statusText = ''; statusError = false; focusedGroup = 'new';
  const form = el('form', null, { class: 'login' });
  const password = el('input', null, { id: 'password', type: 'password', autocomplete: 'current-password', required: '', minlength: '12', maxlength: '256' });
  form.append(el('h1', 'Ethan 的发布后台'), el('p', '在 Heptabase 写作，在这里审查和发布。', { class: 'muted' }), el('label', '后台密码', { for: 'password' }), password, el('button', '进入发布后台', { type: 'submit' }), el('p', message, { id: 'notice', class: 'status', role: message ? 'alert' : 'status' }));
  form.addEventListener('submit', event => { event.preventDefault(); booted = true; void run(async () => { await api('/login', { password: password.value }); const session = await api('/session'); localPreview = session.localPreview; localOpen = pageIsLocal() || session.localOpen === true; password.value = ''; await refresh(); }); });
  root.append(form); password.focus();
}
function closeDialog() { document.querySelector('dialog')?.close(); document.querySelector('dialog')?.remove(); }
function dialog(title, { closeButton = true } = {}) {
  closeDialog(); const d = el('dialog', null, { 'aria-label': title, closedby: 'any' }), h = el('header');
  h.append(el('h2', title));
  if (closeButton) h.append(button('关闭', async () => closeDialog()));
  d.append(h, el('p', '', { class: 'status', role: 'status' }));
  document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal(); return d;
}
function applyGitDocs(gitResult, docsResult) {
  let failed = '';
  if (gitResult.status === 'fulfilled') git = gitResult.value;
  else {
    git = git && pulled ? git : { draftCount: 0, files: [], removals: [] };
    if (!pulled) failed = gitResult.reason?.message || failed;
  }
  if (docsResult.status === 'fulfilled') docs = [...docsResult.value.articles, ...docsResult.value.projects];
  else if (!pulled) {
    docs = [];
    failed = failed || docsResult.reason?.message || '';
  }
  return failed;
}
function syncShellNotice(failed) {
  if (pulling || pulled || selected) return;
  const message = failed || statusText || emptyPreviewCopy();
  const node = document.querySelector('#review-preview .preview-empty');
  if (!node) return;
  node.textContent = failed ? friendlyError(failed) : message;
  node.className = failed || statusError ? 'status' : 'preview-empty muted';
  node.setAttribute('role', failed || statusError ? 'alert' : 'status');
  if (!failed && !message) node.setAttribute('hidden', '');
  else node.removeAttribute('hidden');
  if (failed) { statusText = friendlyError(failed); statusError = true; }
}
async function refresh() {
  clearTimeout(timer);
  const token = ++refreshToken;
  const previousConnected = connected;
  // GitHub /git and /docs often take the full 20s timeout. The pull button and the
  // review list only need Heptabase status, so those reads finish in the background.
  const gitDocs = Promise.allSettled([api('/git'), api('/docs')]);
  let statusResult;
  try { statusResult = await api('/heptabase/status'); }
  catch (error) {
    if (error.status === 401) throw error;
    statusResult = null;
  }
  if (token !== refreshToken) return;
  if (statusResult) connected = statusResult.connected;
  else connected = pulled ? previousConnected || connected : false;
  if (!git) git = { draftCount: 0, files: [], removals: [] };
  root.replaceChildren();
  if (pulled) root.dataset.shell = 'review'; else delete root.dataset.shell;
  const header = el('header'), actions = el('div', null, { class: 'actions' });
  actions.append(button('切换明暗', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    const frame = document.querySelector('#review-preview iframe.article-preview');
    if (frame && patchPreviewTheme(frame, theme)) { if (shownPreview) shownPreview.theme = theme; return; }
    if (pulled && selected && mode === 'preview' && !selected.item?.error) void showSelection();
  }), el('a', '查看博客 ↗', { href: blogViewHref(location.hostname), target: '_blank', rel: 'noopener noreferrer' }));
  if (!localOpen) actions.append(button('退出', async () => { await api('/logout', {}); showLogin(); }, { network: '' }));
  header.append(el('h1', 'Audit', { class: 'brand' }), actions);
  root.append(header);
  if (localPreview) root.append(el('p', '本地样式预览 · 示例内容，所有操作均不影响 Heptabase、GitHub 或线上网站。', { class: 'muted group-caption' }));
  if (!pulled) {
    const stage = el('section', null, { class: 'empty-stage', id: 'review-preview', 'aria-label': '卡片预览' });
    const pullText = pullLabel();
    stage.append(button(pullText, pullUpdates, { class: 'pull-button', 'aria-label': pullText, network: '' }));
    if (!connected) {
      stage.append(button('连接 Heptabase ↗', connectHeptabase, { class: 'connect-button', 'aria-label': '连接 Heptabase', network: '' }));
      stage.append(el('p', '首次拉取时，需要连接你的 Heptabase。', { class: 'muted' }));
    }
    const message = statusText || (pulling ? '' : emptyPreviewCopy());
    const status = previewStatus(message, statusError);
    if (!message) status.setAttribute('hidden', '');
    stage.append(status);
    root.append(stage);
  } else {
    root.append(el('section', null, { id: 'review-summary', class: 'review-top', 'aria-label': '审核进度' }));
    const layout = el('div', null, { class: 'review-layout' });
    const sidebar = el('div', null, { class: 'review-sidebar' });
    sidebar.append(el('aside', null, { id: 'review-list', 'aria-label': '本次审核清单' }), el('div', null, { id: 'legacy-host' }));
    layout.append(sidebar, el('section', null, { id: 'review-preview', 'aria-label': '卡片预览' }));
    root.append(layout);
    renderList();
  }
  if (token !== refreshToken) return;
  root.append(el('section', null, { id: 'release', class: 'release-bar', 'aria-label': '发布进度' }));
  void gitDocs.then(async ([gitResult, docsResult]) => {
    if (token !== refreshToken) return;
    const unauthorized = [gitResult, docsResult].find(result => result.status === 'rejected' && result.reason?.status === 401);
    if (unauthorized) {
      if (!pageIsLocal()) { closeDialog(); showLogin(unauthorized.reason.message); }
      return;
    }
    const failed = applyGitDocs(gitResult, docsResult);
    if (token !== refreshToken) return;
    syncShellNotice(failed);
    try { await renderRelease(); } catch { /* release is optional */ }
  });
  if (pulled) await showSelection();
}
function pullLabel() { return pulling ? '正在拉取更新' : '拉取最新更新'; }
function syncPullButton() {
  const label = pullLabel();
  for (const node of document.querySelectorAll('.pull-button')) {
    node.textContent = label;
    node.setAttribute('aria-label', label);
    node.disabled = pulling;
  }
}
function hideEmptyPullNotice() {
  statusText = ''; statusError = false;
  const node = document.querySelector('#review-preview .preview-empty');
  if (!node) return;
  node.textContent = '';
  node.setAttribute('hidden', '');
}
async function pullUpdates() {
  if (pulling) return;
  if (!connected) { await connectHeptabase(); return; }
  pulling = true;
  syncPullButton();
  if (!pulled) hideEmptyPullNotice();
  try {
  notice('正在核对卡片列表…');
  let payload, guard = 0;
  do {
    payload = await api('/heptabase/cards');
    if (payload.partial) notice(`正在读取有更新的卡片 ${payload.fetched} / ${payload.changed}…`);
  } while (payload.partial && ++guard < 40);
  if (payload.partial) throw new Error('拉取没有完成，请稍后重新拉取。');
  const { cards, removals = [], pageSet: pages = null } = payload;
  pageSet = pages; pageChoice = pages?.choice || null; pageKeepDraft = new Set(pageChoice?.keep || (pages?.choiceRequired ? [] : pages?.order || [])); pageOrderDraft = [...(pageChoice?.order || pages?.order || [])]; pageListDraft = []; pageHiddenDraft = new Set(pageChoice?.hidden || []);
  pageChoiceDirty = false;
  pageRemovalPlans = new Map();
  await previewTemplate();
  const jobs = [
    ...cards.map(card => async () => {
      const input = { cardLink: card.cardLink, preparePublish: true, reviewOnly: true, ...(card.linked[0] || {}) };
      try { return { card, input, plan: await api('/heptabase/preview', input), decision: '' }; }
      catch (error) { if (error.status === 401) throw error; return { card, input, error: error.message, decision: '' }; }
    }),
    ...removals.map(removed => async () => {
      const card = { ...removed, id: removed.cardLink.split('/').pop() }, input = { collection: removed.collection, id: removed.id, cardLink: removed.cardLink };
      try { const plan = await api('/heptabase/removal-preview', input); return { card, input, plan, removal: true, capped: removed.reason === 'capped', decision: plan.approved ? 'remove' : '' }; }
      catch (error) { if (error.status === 401) throw error; return { card, input, removal: true, error: error.message, decision: '' }; }
    }),
  ];
  let finished = 0;
  const next = await mapLimited(jobs, IO_CONCURRENCY, async (job) => {
    try { return await job(); }
    finally { finished += 1; if (jobs.length) notice(`正在准备预览 ${finished} / ${jobs.length}…`); }
  });
  if (pages?.choiceRequired) {
    const candidates = pages.cards.filter(card => card.onSite && card.pageId);
    await mapLimited(candidates, IO_CONCURRENCY, async (card) => {
      const input = { collection: 'pages', id: card.pageId, cardLink: card.cardLink, previewOnly: true };
      try {
        const plan = await api('/heptabase/removal-preview', input);
        pageRemovalPlans.set(card.id, { card: { id: card.id, title: card.title, cardLink: card.cardLink }, input, plan, removal: true, capped: true });
      } catch (error) {
        if (error.status === 401) throw error;
        pageRemovalPlans.set(card.id, { card: { id: card.id, title: card.title, cardLink: card.cardLink }, input, removal: true, capped: true, error: error.message });
      }
    });
  }
  items = next; picked = new Set(); pickAnchor = ''; pulled = true; releaseNotice = { text: '', error: false }; selected = items[0] ? { item: items[0], id: items[0].card.id } : null;
  focusedGroup = selected ? itemGroup(selected.item) : 'new';
  statusText = cards.length || removals.length ? `已拉取 ${cards.length} 篇更新${removals.length ? `，另有 ${removals.length} 篇待删除` : ''}。选择一条更新，检查正文和跟随资料。` : '没有等待审核或删除的更新。';
  statusError = false;
  await refresh();
  notice(statusText);
  } finally {
    pulling = false;
    syncPullButton();
  }
}
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
function typeLabel(group, kind, text = `${groupWords[group]} ${kindLabels[kind].toLowerCase()}`) {
  const label = el('span', null, { class: 'type-label', 'data-type': group });
  label.append(typeMark(group), el('span', text));
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
/** Followed cards in this pull that are new Reference pages, one per card id. */
function newReferences() {
  const reviewing = new Set(items.filter(item => !item.removal).map(item => item.card.id));
  const seen = new Set();
  const list = [];
  for (const item of items) {
    if (item.removal || !item.plan?.changes) continue;
    for (const change of item.plan.changes) {
      if (seen.has(change.id) || reviewing.has(change.id) || change.translation || change.mainArticle || change.previouslyPublished) continue;
      if (pageKind(change, false) !== 'reference') continue;
      seen.add(change.id);
      list.push({ item, change });
    }
  }
  return list;
}
const reviewKinds = ['new', 'edited', 'removed'];
const reviewed = item => Boolean(item.decision);
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
  return later ? `${groupLabels[group]} 已全部审完，点 ${groupLabels[later]} 继续。` : '全部已审完，可以在底部提交发布。';
}
function afterDecision(item, message) {
  const advanced = advanceFrom(item);
  return advanced ? message : `${message}${doneHint(item)}`;
}
const decisionNotes = {
  approve: '已通过，待发布。只是审核通过，尚未上线。',
  reject: '已拒绝，待发布。线上旧文章保持不变。',
  remove: '已加入待删除清单，网站尚未改变。',
  skip: '本次暂不删除，线上页面不变；下次拉取会再次提醒。',
};
function paintAfterDecision(message) {
  renderList();
  notice(message);
  void showSelection();
  void renderRelease();
}
function localContext() {
  return { pageKeep: pageKeepDraft, choiceRequired: Boolean(pageSet?.choiceRequired) };
}
/** Records one decision on the card. Heptabase and GitHub hear about it at publish. */
function applyOne(item, verdict, remark) {
  return applyLocalDecision(item, verdict, { ...localContext(), remark });
}
function citedRemovals() {
  return items.filter(item => item.removal && item.plan?.citations?.length && item.decision !== 'skip');
}
function citationCopy(list) {
  if (list.length === 1) return referenceKeepCopy(title(list[0]), list[0].plan.citations);
  return referenceKeepBatchCopy(list.map(item => ({ title: title(item), citations: item.plan.citations })));
}
function citationParagraph(list, attrs) {
  const note = el('p', null, attrs);
  note.append(document.createTextNode(citationCopy(list)));
  if (list.some(item => item.decision !== 'remove')) {
    note.append(document.createTextNode(' '));
    note.append(button('留下为 reference', () => keepCitedAsReference(list), { class: 'btn' }));
  }
  return note;
}
function keepCitedAsReference(list) {
  const targets = list.filter(item => item.plan && item.decision !== 'remove' && item.decision !== 'skip');
  if (!targets.length) return;
  for (const item of targets) applyOne(item, 'approve');
  paintAfterDecision(citationCopy(targets));
}
function decide(item, verdict, remark) {
  const result = applyOne(item, verdict, remark);
  if (!result) return;
  const text = `${decisionNotes[result.next]}${result.extra}${result.changed ? '已改判。' : ''}`;
  paintAfterDecision(result.first ? afterDecision(item, text) : text);
}
function requestDecision(item, verdict) {
  if (!item?.removal && verdict === 'reject') { openRemarkDialog([item]); return; }
  decide(item, verdict);
}
function applyMany(list, verdict, remark) {
  const targets = list.filter(item => item?.plan && !item.error);
  if (!targets.length) throw new Error('请先勾选要处理的文章。');
  for (const item of targets) applyOne(item, verdict, remark);
  const message = !targets[0].removal && verdict === 'reject'
    ? `已拒绝 ${targets.length} 篇。备注会在发布上线后写回这些卡片。`
    : targets[0].removal && verdict === 'approve'
      ? `已将 ${targets.length} 篇加入待删除，网站尚未改变。`
      : targets[0].removal
        ? `已暂不删除 ${targets.length} 篇。`
        : `已通过 ${targets.length} 篇。只是审核通过，尚未上线。`;
  paintAfterDecision(message);
}
function openRemarkDialog(targets) {
  const list = targets.filter(item => item?.plan && !item.removal);
  if (!list.length) return;
  const d = dialog(list.length > 1 ? `拒绝 ${list.length} 篇` : `拒绝「${title(list[0])}」`);
  d.append(el('p', '写下备注。发布上线时写回这些卡片的 Remark，可以留空。'));
  const area = el('textarea', null, { id: 'reject-remark', class: 'reject-note', rows: '4', maxlength: '2000', placeholder: '写给自己的备注' });
  const label = el('label', '备注', { for: 'reject-remark' });
  if (list.length === 1 && list[0].pendingRemark !== undefined) area.value = list[0].pendingRemark;
  d.append(label, area, button(list.length > 1 ? '拒绝这些文章' : '拒绝', async () => {
    const remark = area.value;
    closeDialog();
    if (list.length === 1) await decide(list[0], 'reject', remark);
    else await applyMany(list, 'reject', remark);
  }, { class: 'btn primary' }));
  setTimeout(() => area.focus(), 0);
}
function releasePayload() {
  const pageChoice = pageChoiceDirty ? pageChoicePayload(pageSet, pageKeepDraft, pageOrderDraft, pageHiddenDraft) : null;
  return decisionBatch(items, { pageChoice });
}
function markFlushed() {
  for (const item of items) if (item.decision) item.flushed = true;
  pageChoiceDirty = false;
}
function localReleaseStats() {
  const paths = new Set();
  let deletes = 0;
  for (const item of items) {
    if (item.flushed || !item.plan || (item.decision !== 'approve' && item.decision !== 'remove')) continue;
    for (const change of item.plan.changes || []) {
      if (paths.has(change.path)) continue;
      paths.add(change.path);
      if (item.decision === 'remove') deletes += 1;
    }
  }
  if (pageChoiceDirty) paths.add('src/data/page-order.ts');
  return { pages: paths.size, deletes };
}
/** Sends the local batch once, then commits when there is something for GitHub. */
async function flushLocalDecisions(message) {
  const payload = releasePayload();
  const stats = localReleaseStats();
  if (!stats.pages && !git.draftCount && !payload.pageChoice) {
    if (!payload.decisions.length) throw new Error('没有可提交的更新。');
    await api('/heptabase/decisions', payload);
    markFlushed();
    return { flushedOnly: true };
  }
  const result = await api('/git/commit', { message, ...payload });
  markFlushed();
  git = result;
  return result;
}
/** Publish every pending update in this pull. Still commits through the existing checks, with no second dialog. */
async function publishWithoutReview() {
  const plan = directPublishPlan({ pulled, items, git });
  const feedback = directPublishFeedback(plan);
  if (!plan.ok) {
    showReleaseNotice(feedback.message, true);
    throw new Error(feedback.message);
  }
  showReleaseNotice(feedback.message);
  for (const item of plan.approve) applyOne(item, 'approve');
  for (const item of plan.remove) applyOne(item, 'approve');
  const payload = releasePayload();
  if (plan.commit || payload.decisions.length || payload.pageChoice) {
    const result = await flushLocalDecisions(`直接发布 · ${new Date().toLocaleDateString('zh-CN')}`);
    if (result.flushedOnly) {
      showReleaseNotice('已回写拒绝。没有需要提交到 GitHub 的页面。');
      paintAfterDecision('已回写拒绝。没有需要提交到 GitHub 的页面。');
      return;
    }
    if (result.unchanged && !git.pullRequest) {
      showReleaseNotice('待发布清单已清理，网站没有变化。');
      paintAfterDecision('待发布清单已清理，网站没有变化。');
      return;
    }
  }
  if (!git.pullRequest) {
    showReleaseNotice('没有可发布的更新。', true);
    paintAfterDecision('没有可发布的更新。');
    throw new Error('没有可发布的更新。');
  }
  try {
    const review = await api('/git/review');
    if (!review.changes.length) throw new Error('没有可发布的更新。');
    await api('/git/publish', review);
  } catch (error) {
    // Say why before the status refresh. A slow /git must not leave the click looking dead.
    showReleaseNotice(friendlyError(error.message), true);
    try {
      git = await api('/git');
      await renderRelease();
      renderList();
    } catch { /* the publish error stays on the release bar */ }
    throw error;
  }
  git = await api('/git');
  showReleaseNotice('发布已开始，显示“已上线”才表示完成。');
  paintAfterDecision('发布已开始，显示“已上线”才表示完成。');
}
function renderSummary(by) {
  const top = document.querySelector('#review-summary'); if (!top) return;
  top.replaceChildren();
  const head = el('div', null, { class: 'summary-head' });
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
      instant: '',
    });
    tab.replaceChildren(typeMark(kind), el('span', groupLabels[kind]), el('span', `${checked}/${count}`, { class: 'tab-count', 'aria-hidden': 'true', 'data-done': String(count > 0 && checked === count) }));
    tabs.append(tab);
  }
  const referenceCount = newReferences().length;
  const referenceTab = button(`New References · ${referenceCount}`, async () => {
    focusedGroup = 'references';
    renderList();
    await showSelection();
  }, {
    class: 'review-group-tab',
    role: 'tab',
    'aria-label': `New References · ${referenceCount}`,
    'aria-selected': String(focusedGroup === 'references'),
    'aria-controls': 'review-items',
    'data-review-group': 'references',
    'data-type': 'references',
    title: `${referenceCount} 篇新增 Reference`,
    instant: '',
  });
  referenceTab.replaceChildren(
    el('span', '+', { class: 'type-mark', 'data-type': 'references', 'aria-hidden': 'true' }),
    el('span', 'New References'),
    el('span', String(referenceCount), { class: 'tab-count', 'aria-hidden': 'true' }),
  );
  tabs.append(referenceTab);
  if (pageSet?.cards?.length) {
    const kept = pageSet.choiceRequired ? pageKeepDraft.size : pageOrderDraft.length;
    const countText = pageSet.choiceRequired ? `${kept}/4` : String(kept);
    const tab = button('Pages', async () => {
      focusedGroup = 'pages';
      renderList();
      await showSelection();
    }, {
      class: 'review-group-tab',
      role: 'tab',
      'aria-label': `Pages · ${countText}`,
      'aria-selected': String(focusedGroup === 'pages'),
      'aria-controls': 'review-preview',
      'data-review-group': 'pages',
      'data-type': 'page',
      instant: '',
    });
    tab.replaceChildren(el('span', '≡', { class: 'type-mark', 'data-type': 'page', 'aria-hidden': 'true' }), el('span', 'Pages'), el('span', countText, { class: 'tab-count', 'aria-hidden': 'true' }));
    tabs.append(tab);
  }
  head.append(tabs, button('拉取最新更新', pullUpdates, { class: 'btn pull-button', network: '', 'aria-label': '拉取最新更新' }));
  top.append(head);
}
function groupStamp(group) {
  return group.map(item => [item.card.id, item.error || '', title(item), (item.plan?.changes || []).map(change => change.id).join(',')].join('\t')).join('\n');
}
function paintListSelection(list, group) {
  const rows = [...list.querySelectorAll('#review-items > .review-item')];
  if (rows.length !== group.length || rows.some((row, index) => row.dataset.card !== group[index].card.id)) return false;
  rows.forEach((row, index) => {
    const item = group[index], active = selected?.item === item;
    if (active) row.dataset.selected = 'true'; else delete row.dataset.selected;
    if (item.decision) row.dataset.decision = item.decision; else delete row.dataset.decision;
    row.querySelector(':scope > .card-select')?.setAttribute('aria-pressed', String(Boolean(active && selected.id === item.card.id)));
    for (const node of row.querySelectorAll(':scope > .decisions .decide')) node.setAttribute('aria-pressed', String(item.decision === node.getAttribute('data-decide')));
  });
  return true;
}
let revealedSelection = '';
function revealSelected(list) {
  const key = `${focusedGroup}:${selected?.item?.card?.id || ''}:${selected?.id || ''}`;
  if (key === revealedSelection) return;
  revealedSelection = key;
  const sidebar = list.closest('.review-sidebar'), row = list.querySelector('.review-item[data-selected=true]');
  if (!sidebar || !row || getComputedStyle(sidebar).overflowY !== 'auto') return;
  const sb = sidebar.getBoundingClientRect(), rb = row.getBoundingClientRect();
  if (rb.top < sb.top || rb.bottom > sb.bottom) row.scrollIntoView({ block: 'nearest' });
}
function batchBar(group, deleting) {
  const selectable = group.filter(item => item.plan && !item.error);
  const chosen = selectable.filter(item => picked.has(item.card.id));
  const bar = el('div', null, { class: 'batch-bar' });
  const all = el('input', null, { type: 'checkbox', class: 'batch-pick', 'aria-label': '全选这一组' });
  all.checked = selectable.length > 0 && selectable.every(item => picked.has(item.card.id));
  all.indeterminate = !all.checked && chosen.length > 0;
  all.addEventListener('change', () => {
    for (const item of selectable) { if (all.checked) picked.add(item.card.id); else picked.delete(item.card.id); }
    renderList();
  });
  bar.append(all, el('span', chosen.length ? `已选 ${chosen.length}` : '勾选后可批量处理', { class: 'muted batch-count' }));
  const attrs = chosen.length ? { class: 'btn' } : { class: 'btn', disabled: '' };
  if (deleting) {
    bar.append(
      button('批量删除', () => applyMany(chosen, 'approve'), { ...attrs, 'aria-label': '批量删除已选文章' }),
      button('批量暂不删除', () => applyMany(chosen, 'reject'), { ...attrs, 'aria-label': '批量暂不删除已选文章' }),
    );
  } else {
    bar.append(
      button('批量通过', () => applyMany(chosen, 'approve'), { ...attrs, 'aria-label': '批量通过已选文章' }),
      button('批量拒绝', () => openRemarkDialog(chosen), { ...attrs, 'aria-label': '批量拒绝已选文章' }),
    );
  }
  return bar;
}
function referenceCardLine(change) {
  const description = (change.afterProperties?.description || '').trim();
  return description ? `Reference · ${description}` : `Reference · ${change.kind || '新增'}`;
}
function referenceCard(entry) {
  const change = entry.change;
  const card = button(null, () => openReference(entry), {
    class: 'reference-card',
    'aria-label': `查看「${change.title}」`,
    instant: '',
  });
  card.append(el('span', change.title, { class: 'reference-card-title' }), el('span', referenceCardLine(change), { class: 'reference-card-line' }));
  return card;
}
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
async function openReference(entry) {
  const change = entry.change;
  const props = change.afterProperties || {};
  const d = dialog(change.title || '未命名卡片', { closeButton: false });
  d.classList.add('reference-dialog');
  d.querySelector('.status')?.setAttribute('hidden', '');
  const meta = el('section', null, { class: 'review-meta reference-popup-meta', 'aria-label': '属性' });
  const rows = el('dl', null, { class: 'meta-grid' });
  const row = (name, value) => {
    const dd = el('dd');
    if (typeof value === 'string') dd.textContent = value;
    else dd.append(value);
    rows.append(el('dt', name), dd);
  };
  row('发布日期', formatDate(props.date) || '未设置');
  row('摘要', props.description || '未填写 Summary');
  const tags = el('ul', null, { class: 'meta-tags', 'aria-label': '标签' });
  for (const tag of [...new Set(props.tags || [])]) tags.append(el('li', `#${tag}`));
  const tagValue = el('div', null, { class: 'meta-tag-row' });
  if (tags.childElementCount) tagValue.append(tags);
  else tagValue.append(el('span', '没有标签', { class: 'muted' }));
  row('标签', tagValue);
  meta.append(rows);
  const body = el('div', null, { class: 'reference-popup-body prose-site', 'aria-label': '正文' });
  body.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });
  d.append(meta, body);
  const cards = entry.item.plan?.changes || [change];
  const source = change.afterContent || '';
  const html = await cachedProse(source, path => {
    const linked = cards.find(item => item.path === `src/content/${path}.mdx`);
    const name = linked?.afterProperties?.title;
    return name ? `<p>${escapeHtml(name)}</p>` : `<p>引用资料：${escapeHtml(path)}</p>`;
  }, source, `reference\0${change.id}\0${source}`);
  if (!d.isConnected) return;
  body.innerHTML = html.trim() ? html : '<p class="muted">正文为空。</p>';
}
function renderReferenceList(list, by) {
  const refs = newReferences();
  const stamp = `references\n${refs.map(entry => [entry.change.id, entry.change.title, referenceCardLine(entry.change)].join('\t')).join('\n')}`;
  const decisionStamp = items.map(item => item.decision || '').join('\n');
  if (stamp === listStamp && list.querySelector('.reference-gallery')) {
    if (decisionStamp !== listDecisionStamp) renderSummary(by);
    listDecisionStamp = decisionStamp;
    document.querySelector('.review-layout')?.setAttribute('data-group', 'references');
    return;
  }
  list.replaceChildren();
  renderSummary(by);
  document.querySelector('.review-layout')?.setAttribute('data-group', 'references');
  listStamp = stamp;
  listDecisionStamp = decisionStamp;
  revealedSelection = '';
  const panel = el('div', null, { id: 'review-items', class: 'reference-gallery', 'data-review-group': 'references', role: 'tabpanel', 'aria-label': 'New References' });
  if (!refs.length) panel.append(el('p', '这次拉取没有新增的 Reference。', { class: 'muted empty-group' }));
  else for (const entry of refs) panel.append(referenceCard(entry));
  list.append(panel);
}
function shiftSelectVisible(currentId) {
  const rows = [...document.querySelectorAll('#review-items > .review-item')];
  const ids = rows.map(row => row.dataset.card);
  const anchor = ids.indexOf(pickAnchor);
  const current = ids.indexOf(currentId);
  if (anchor < 0 || current < 0) return false;
  const [from, to] = anchor < current ? [anchor, current] : [current, anchor];
  for (const row of rows.slice(from, to + 1)) {
    const box = row.querySelector(':scope > .batch-pick');
    if (box && !box.disabled && row.dataset.card) picked.add(row.dataset.card);
  }
  return true;
}
function renderList() {
  const list = document.querySelector('#review-list'); if (!list) return;
  if (!pulled) { list.replaceChildren(); listStamp = ''; listDecisionStamp = ''; return; }
  const by = reviewGroups();
  if (focusedGroup !== 'pages' && focusedGroup !== 'references' && !reviewKinds.includes(focusedGroup)) focusedGroup = 'new';
  if (focusedGroup === 'references') { renderReferenceList(list, by); return; }
  const stamp = focusedGroup === 'pages' ? 'pages' : `${focusedGroup}\n${groupStamp(by[focusedGroup])}\n${[...picked].sort().join(',')}`;
  const decisionStamp = items.map(item => item.decision || '').join('\n');
  const sameList = focusedGroup === 'pages' ? list.childElementCount === 0 : Boolean(list.querySelector('#review-items'));
  if (stamp === listStamp && sameList && (focusedGroup === 'pages' || paintListSelection(list, by[focusedGroup]))) {
    if (decisionStamp !== listDecisionStamp) renderSummary(by);
    listDecisionStamp = decisionStamp;
    document.querySelector('.review-layout')?.setAttribute('data-group', focusedGroup);
    revealSelected(list);
    return;
  }
  list.replaceChildren();
  renderSummary(by);
  document.querySelector('.review-layout')?.setAttribute('data-group', focusedGroup);
  listStamp = stamp;
  listDecisionStamp = decisionStamp;
  revealedSelection = '';
  if (focusedGroup === 'pages') return;
  const row = el('div', null, { id: 'review-items', class: 'review-items', 'data-review-group': focusedGroup, 'data-type': focusedGroup, role: 'tabpanel', 'aria-label': groupLabels[focusedGroup] });
  const group = by[focusedGroup];
  const deleting = focusedGroup === 'removed';
  if (!group.length) row.append(el('p', '这一组没有待审文章。', { class: 'muted empty-group' }));
  else list.append(batchBar(group, deleting));
  for (const item of group) {
    const active = selected?.item === item;
    const card = el('div', null, { class: 'review-item', 'data-type': focusedGroup, 'data-card': item.card.id, ...(item.decision ? { 'data-decision': item.decision } : {}), ...(active ? { 'data-selected': 'true' } : {}) });
    const pick = el('input', null, { type: 'checkbox', class: 'batch-pick', 'aria-label': `选择「${title(item)}」` });
    if (!item.plan || item.error) pick.disabled = true;
    pick.checked = picked.has(item.card.id);
    pick.addEventListener('click', event => {
      if (!event.shiftKey || !shiftSelectVisible(item.card.id)) {
        pickAnchor = item.card.id;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      renderList();
    });
    pick.addEventListener('change', () => {
      if (pick.checked) picked.add(item.card.id); else picked.delete(item.card.id);
      renderList();
    });
    card.append(pick);
    card.append(button(title(item), () => select(item), { class: 'card-select', 'aria-pressed': String(Boolean(active && selected.id === item.card.id)), instant: '' }));
    const decisions = el('div', null, { class: 'decisions' });
    if (item.plan) {
      const yes = deleting ? 'remove' : 'approve', no = deleting ? 'skip' : 'reject';
      decisions.append(
        button('✓', () => requestDecision(item, 'approve'), { class: 'decide', 'data-decide': yes, 'aria-pressed': String(item.decision === yes), 'aria-label': `${deleting ? '删除' : '通过'}「${title(item)}」`, title: deleting ? '从网站删除这篇博客' : '通过这篇博客，并确认正文和引用可以公开' }),
        button('×', () => requestDecision(item, 'reject'), { class: 'decide', 'data-decide': no, 'aria-pressed': String(item.decision === no), 'aria-label': `${deleting ? '暂不删除' : '拒绝'}「${title(item)}」`, title: deleting ? '本次暂不删除' : '拒绝这篇博客' }),
      );
    }
    card.append(decisions);
    card.addEventListener('click', event => {
      if (event.target.closest('button, a, input, label')) return;
      void select(item);
    });
    row.append(card);
  }
  list.append(row);
  revealSelected(list);
}
function syncPageListDraft() {
  if (!pageSet?.choiceRequired) return;
  const ids = pageSet.cards.map(card => card.id);
  const known = pageListDraft.filter(id => ids.includes(id));
  const base = known.length ? known : pageOrderDraft.filter(id => ids.includes(id));
  pageListDraft = [...base, ...ids.filter(id => !base.includes(id))];
}
function syncPageOrder(id, checked) {
  if (pageSet?.choiceRequired) syncPageListDraft();
  if (checked) {
    pageKeepDraft.add(id);
    if (!pageOrderDraft.includes(id)) {
      if (pageSet?.choiceRequired) {
        const rank = new Map(pageListDraft.map((item, index) => [item, index]));
        pageOrderDraft = [...pageOrderDraft, id].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
      } else pageOrderDraft.push(id);
    }
  } else {
    pageKeepDraft.delete(id);
    pageOrderDraft = pageOrderDraft.filter(item => item !== id);
    pageHiddenDraft.delete(id);
  }
}
function syncCappedRemovals() {
  const previous = new Map(items.filter(item => item.capped).map(item => [item.card.id, item]));
  items = items.filter(item => !item.capped);
  if (!pageSet?.choiceRequired) return;
  for (const card of pageSet.cards) {
    if (!card.onSite || pageKeepDraft.has(card.id)) continue;
    const stored = pageRemovalPlans.get(card.id);
    if (!stored) continue;
    const prior = previous.get(card.id);
    items.push({ ...stored, decision: prior?.decision || 'remove', pendingRemark: prior?.pendingRemark, flushed: false });
  }
}
function localApplyPageChoice() {
  if (!pageSet?.cards?.length) return;
  const choice = pageChoicePayload(pageSet, pageKeepDraft, pageOrderDraft, pageHiddenDraft);
  pageOrderDraft = [...choice.order];
  pageHiddenDraft = new Set(choice.hidden);
  pageChoice = { keep: [...choice.keep], order: [...choice.order], hidden: [...choice.hidden] };
  pageChoiceDirty = true;
  syncCappedRemovals();
  renderList();
  void showSelection();
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
function pageDragIds() {
  return pageSet?.choiceRequired ? pageListDraft : pageOrderDraft;
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
      const ids = pageDragIds();
      const from = ids.indexOf(dragging.dataset.pageId);
      const to = ids.indexOf(li.dataset.pageId);
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
      const ids = pageDragIds();
      const from = ids.indexOf(dragging.dataset.pageId);
      const to = ids.indexOf(li.dataset.pageId);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...ids];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      if (pageSet?.choiceRequired) {
        pageListDraft = next;
        pageOrderDraft = next.filter(id => pageKeepDraft.has(id));
      } else pageOrderDraft = next;
      clearTimeout(pageChoiceSaveTimer);
      localApplyPageChoice();
    });
  }
}
function blockRowDrag(node) {
  node.setAttribute('draggable', 'false');
  node.addEventListener('pointerdown', event => event.stopPropagation());
  node.addEventListener('dragstart', event => { event.preventDefault(); event.stopPropagation(); });
}
function appendPageOrderRow(order, card, keep) {
  const id = card.id;
  const hidden = pageHiddenDraft.has(id);
  const checked = pageKeepDraft.has(id);
  const li = el('li', null, { 'data-page-id': id, ...(keep ? { class: 'page-option', 'data-checked': String(checked) } : {}), ...(hidden ? { 'data-hidden': 'true' } : {}) });
  const handle = el('button', '⠿', { type: 'button', class: 'page-drag', draggable: 'true', 'aria-label': `拖动「${card.title}」调整顺序`, title: '拖动调整顺序' });
  const titleNode = el('span', card.title, { class: 'page-title' });
  const title = keep ? el('label', null, { for: `keep-${id}` }) : titleNode;
  if (keep) title.append(titleNode);
  li.append(handle, title);
  if (keep) {
    const box = el('input', null, { type: 'checkbox', id: `keep-${id}`, value: id });
    box.checked = checked;
    blockRowDrag(box);
    box.addEventListener('change', () => {
      syncPageOrder(id, box.checked);
      if (pageKeepDraft.size > 4) {
        syncPageOrder(id, false);
        box.checked = false;
        return;
      }
      localApplyPageChoice();
    });
    li.append(box);
  }
  order.append(li);
}
function navPreviewLabel(card) {
  if (card.pageId === 'about') return 'EthanChang';
  if (card.pageId === 'now') return '现在';
  if (card.pageId === 'contact') return '联系';
  if (card.pageId === 'privacy') return '隐私';
  return card.title;
}
function publishedNavCards() {
  const choice = pageChoicePayload(pageSet, pageKeepDraft, pageOrderDraft, pageHiddenDraft);
  if (!choice) return [];
  const hidden = new Set(choice.hidden);
  return choice.order.filter(id => !hidden.has(id)).flatMap(id => {
    const card = pageSet.cards.find(item => item.id === id);
    return card ? [card] : [];
  });
}
function navSearchMark() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '11');
  circle.setAttribute('cy', '11');
  circle.setAttribute('r', '7');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M20 20l-3.5-3.5');
  svg.append(circle, path);
  const span = el('span', null, { class: 'nav-preview-search', 'aria-label': '搜索' });
  span.append(svg);
  const item = el('li');
  item.append(span);
  return item;
}
function renderNavTools() {
  const tools = el('ul', null, { class: 'nav-preview-tools' });
  for (const label of ['标签', 'EN']) {
    const item = el('li');
    item.append(el('span', label));
    tools.append(item);
  }
  tools.append(navSearchMark());
  return tools;
}
function emptyNavSlot(extraClass) {
  return el('span', null, { class: extraClass ? `${extraClass} nav-preview-slot` : 'nav-preview-slot', 'aria-hidden': 'true' });
}
function renderNavPreview() {
  const cards = publishedNavCards().slice(0, 4);
  const slots = [...cards, ...Array(4 - cards.length).fill(null)];
  const nav = el('nav', null, { class: 'nav-preview', 'aria-label': '导航预览' });
  const [lead, ...rest] = slots;
  if (lead) {
    const leadAttrs = { class: 'nav-preview-lead', 'data-page-id': lead.id };
    if (lead.pageId === 'about') leadAttrs['data-brand'] = 'true';
    nav.append(el('span', navPreviewLabel(lead), leadAttrs));
  } else nav.append(emptyNavSlot('nav-preview-lead'));
  const trail = el('div', null, { class: 'nav-preview-trail' });
  const list = el('ul', null, { class: 'nav-preview-stations' });
  for (const card of rest) {
    const item = el('li');
    item.append(card ? el('span', navPreviewLabel(card), { 'data-page-id': card.id }) : emptyNavSlot());
    list.append(item);
  }
  trail.append(list, renderNavTools());
  nav.append(trail);
  return nav;
}
function renderPageChoice(host) {
  if (!host || focusedGroup !== 'pages') return;
  host.replaceChildren();
  if (!pageSet?.cards?.length) return;
  const section = el('section', null, { class: 'review-group page-choice', 'data-review-group': 'pages', 'data-type': 'page' });
  section.append(renderNavPreview());
  const choosing = Boolean(pageSet.choiceRequired);
  if (choosing) syncPageListDraft();
  const field = choosing ? el('fieldset') : null;
  if (field) field.append(el('legend', '留下哪几页'));
  else section.append(el('h3', '导航顺序', { class: 'section-label' }));
  const order = el('ol', null, { class: choosing ? 'page-order page-keep' : 'page-order', 'aria-label': '导航顺序' });
  const rowIds = choosing ? pageListDraft : pageOrderDraft;
  if (!rowIds.length) order.append(el('li', '没有可排列的站点页。', { class: 'muted' }));
  for (const id of rowIds) {
    const card = pageSet.cards.find(item => item.id === id);
    if (card) appendPageOrderRow(order, card, choosing);
  }
  bindPageOrderDrag(order);
  if (field) field.append(order);
  section.append(field || order);
  host.append(section);
  if (pulled) renderSummary(reviewGroups());
}
function syncDecisionChrome(pane, item) {
  for (const node of pane.querySelectorAll('.detail-actions [data-decide]')) node.setAttribute('aria-pressed', String(item.decision === node.getAttribute('data-decide')));
}
function patchPreviewTheme(frame, theme) {
  const doc = frame.contentDocument;
  const style = doc?.querySelector('style[data-preview-theme]');
  if (!doc?.documentElement || !style) return false;
  doc.documentElement.dataset.theme = theme;
  style.textContent = previewThemeStyle(theme);
  return true;
}
function reusePreview(pane, item, id, card, theme) {
  const key = `${item.card.id}:${id}:${previewBodyKey(card, mode, item.removal)}`;
  const live = mode === 'preview' ? pane.querySelector('iframe.article-preview') : pane.querySelector('.full-diff');
  if (!live || shownPreview?.key !== key) return false;
  if (shownPreview.theme === theme) { syncDecisionChrome(pane, item); return true; }
  if (mode === 'preview' && patchPreviewTheme(live, theme)) { shownPreview = { key, theme }; syncDecisionChrome(pane, item); return true; }
  return false;
}
function remember(cache, key, value, limit) {
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value);
  return value;
}
async function showSelection() {
  const gen = ++previewGen;
  const pane = document.querySelector('#review-preview'); if (!pane) return;
  if (!pulled) {
    const node = pane.querySelector('.preview-empty');
    const progress = node && /^(正在核对卡片列表|正在读取有更新的卡片|正在准备预览)/.test(node.textContent || '');
    if (node && !pulling && !statusText && !progress) {
      node.removeAttribute('hidden');
      node.textContent = emptyPreviewCopy();
      node.className = 'preview-empty muted';
      node.setAttribute('role', 'status');
    }
    return;
  }
  if (focusedGroup !== 'pages' && focusedGroup !== 'references' && selected?.item?.plan && !selected.item.error) {
    const card = selected.item.plan.changes.find(change => change.id === selected.id);
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    if (card && reusePreview(pane, selected.item, selected.id, card, theme)) return;
  }
  shownPreview = null;
  pane.replaceChildren();
  pane.closest('.review-layout')?.setAttribute('data-mode', mode);
  pane.closest('.review-layout')?.setAttribute('data-group', focusedGroup);
  if (focusedGroup === 'pages') {
    pane.removeAttribute('data-type');
    renderPageChoice(pane);
    return;
  }
  if (focusedGroup === 'references') {
    pane.removeAttribute('data-type');
    pane.append(el('p', '点一张卡片，查看这篇 Reference 的完整内容。', { class: 'muted preview-empty' }));
    return;
  }
  if (selected?.item.error || !selected) pane.removeAttribute('data-type');
  else pane.dataset.type = itemGroup(selected.item);
  if (!selected) {
    pane.append(previewStatus(statusText || emptyPreviewCopy(), statusError));
    return;
  }
  const { item, id } = selected;
  if (item.error) {
    pane.replaceChildren(el('p', friendlyError(item.error), { role: 'alert' }));
    return;
  }
  const card = item.plan.changes.find(c => c.id === id), group = itemGroup(item), kind = pageKind(card, item.removal);
  const shown = (item.removal ? card.beforeProperties : card.afterProperties) || {};
  const when = formatDate(shown.date);
  const head = el('div', null, { class: 'preview-head', 'data-type': group });
  const titleRow = el('div', null, { class: 'preview-title-row' });
  const labels = el('div', null, { class: 'preview-labels' });
  labels.append(typeLabel(group, kind));
  if (card.id !== item.card.id) labels.append(el('span', `跟随「${title(item)}」`, { class: 'muted follows' }));
  const heading = el('div', null, { class: 'preview-heading' });
  heading.append(el('h2', card.title, { class: 'preview-title' }));
  if (when) heading.append(el('time', when, { class: 'preview-date muted', datetime: String(shown.date || '').slice(0, 10) }));
  heading.append(labels);
  titleRow.append(heading);
  const actions = el('div', null, { class: 'preview-actions' });
  const tabs = el('div', null, { class: 'mode-tabs', role: 'group', 'aria-label': '预览方式' });
  for (const [value, text] of [['preview', item.removal ? '现有页面' : '发布预览'], ['diff', '段落对比']]) tabs.append(button(text, async () => { mode = value; await showSelection(); }, { 'aria-pressed': String(mode === value), instant: '' }));
  actions.append(tabs);
  if (!item.removal || item.plan.reason !== 'deleted') actions.append(link('在 Heptabase 打开 ↗', card.cardLink));
  actions.append(detailActions(item));
  head.append(titleRow);
  const translations = (item.plan.changes || []).filter(change => change.translation);
  if (!item.removal && translations.length) {
    const row = el('div', null, { class: 'translation-row' });
    row.append(button('原文', () => select(item, item.card.id), { 'aria-pressed': String(id === item.card.id) }));
    for (const change of translations) {
      const label = change.language ? `Translation · ${change.language}` : 'Translation';
      row.append(button(label, () => select(item, change.id), { 'aria-pressed': String(id === change.id) }));
    }
    head.append(row);
  }
  pane.append(actions, head);
  const meta = el('section', null, { class: 'review-meta', 'aria-label': '属性与标签' });
  meta.append(el('h3', '属性', { class: 'section-label' }));
  appendProperties(meta, card, kind, item.removal);
  if (item.plan.pageNote) meta.append(el('p', item.plan.pageNote, { class: 'muted meta-note' }));
  if (item.removal) {
    if (item.plan.blockers?.length) meta.append(el('p', `「${title(item)}」仍被「${item.plan.blockers.map(b => b.title).join('、')}」引用。站点页面和项目不能改成 reference。`, { role: 'alert' }));
    if (item.plan.citations?.length) meta.append(citationParagraph([item], { class: 'status', role: 'status' }));
    if (item.plan.keptReferences.length) meta.append(el('p', `共享资料会保留：${item.plan.keptReferences.map(r => r.title).join('、')}。`, { class: 'muted meta-note' }));
  }
  pane.append(meta);
  appendSummary(pane, card, item.removal);
  const body = el('section', null, { class: 'review-body', 'aria-label': '正文' });
  pane.append(body);
  const previewCards = item.removal ? item.plan.changes.map(c => ({ ...c, afterProperties: c.beforeProperties, afterContent: c.beforeContent })) : item.plan.changes;
  if (mode === 'preview') {
    const frame = el('iframe', null, { title: '网站发布样式预览', sandbox: 'allow-same-origin', class: 'article-preview', referrerpolicy: 'no-referrer' });
    frame.addEventListener('load', () => fitFrame(frame));
    frame.addEventListener('load', () => frame.contentDocument?.addEventListener('click', event => {
      const anchor = event.target.closest?.('a'); if (!anchor) return; event.preventDefault();
      const path = new URL(anchor.href).pathname, target = item.plan.changes.find(c => !c.translation && (previewPath(c) === path || '/' + c.path.replace(/^src\/content\//, '').replace(/\.mdx$/, '') === path));
      if (target) void select(item, target.id);
      else notice('预览中不打开外部链接，以免未发布内容发送到其他网站。');
    }));
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (gen !== previewGen) return;
    const html = await previewHtml(previewCards.find(c => c.id === id), previewCards);
    if (gen !== previewGen) return;
    frame.srcdoc = html;
    body.append(frame);
  } else {
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (gen !== previewGen) return;
    if (!await showDiff(body, card, item.plan.changes, gen)) return;
  }
  if (gen !== previewGen) return;
  shownPreview = { key: `${item.card.id}:${id}:${previewBodyKey(card, mode, item.removal)}`, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' };
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
  const action = (text, verdict, decision, variant) => button(text, () => requestDecision(item, verdict), { class: `btn ${variant}`, 'data-decide': decision, 'aria-pressed': String(item.decision === decision) });
  box.append(
    action(item.removal ? '暂不删除' : '拒绝', 'reject', no, ''),
    action(item.removal ? '删除' : '通过', 'approve', yes, ''),
  );
  return box;
}
/**
 * Host form used only to match links inside the preview iframe.
 * The 属性 address row uses auditAddress() and does not show this host.
 */
function contentPath(card) {
  const address = auditAddress(card);
  if (!address) return '';
  if (!card.translation) return `cn.ethanchang.io${address}`;
  return card.language === 'en' ? `ethanchang.io${address}` : `ethanchang.io/${card.language}${address}`;
}
function previewReferenceHref(of) {
  const match = /^(articles|projects|pages)\/(.+)$/.exec(String(of || '').replace(/^\/+/, ''));
  if (!match) return `/${String(of || '').replace(/^\/+/, '')}`;
  if (match[1] === 'pages' && match[2] === 'about') return '/';
  return `/${match[2].replace(/\/[a-z]{2,3}$/, '')}`;
}
function previewPath(card) {
  return contentPath(card).replace(/^(cn\.)?ethanchang\.io/, '');
}
function appendProperties(parent, card, kind, removal) {
  const before = card.beforeProperties || {}, p = (removal ? card.beforeProperties : card.afterProperties) || {};
  // Only an already published card has an old value to compare against; removals show what is live.
  const compare = !removal && Boolean(card.previouslyPublished);
  const kindText = k => k === 'translation' && card.language ? `${kindLabels.translation} · ${card.language}` : kindLabels[k];
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
  scalar('类型', kindText(oldKind), kindText(kind), '');
  if (auditAddress(card)) row('地址', el('code', auditAddress(card)));
  scalar('发布日期', formatDate(before.date), formatDate(p.date), '未设置');
  appendTagRow(row, card, p, removal);
  parent.append(rows);
}
function appendSummary(parent, card, removal) {
  const before = card.beforeProperties || {}, p = (removal ? before : card.afterProperties) || {};
  const compare = !removal && Boolean(card.previouslyPublished);
  const oldText = (before.description || '').trim(), newText = (p.description || '').trim();
  const changed = compare && oldText !== newText;
  if (!changed && !newText) return;
  const block = el('p', null, { class: 'preview-summary' });
  if (!changed) block.textContent = newText;
  else {
    const span = el('span', null, { class: 'inline-change' });
    if (oldText) span.append(el('del', oldText));
    if (newText) span.append(el('ins', newText));
    block.append(span);
  }
  parent.append(block);
}
function appendTagRow(row, card, p, removal) {
  const { added, removed } = removal ? { added: [], removed: [] } : tagDiff(card.beforeProperties.tags, card.afterProperties.tags);
  const list = el('ul', null, { class: 'meta-tags', 'aria-label': '标签' });
  const hash = tag => `#${tag}`;
  const addedSet = new Set(added);
  [...new Set(p.tags || [])].forEach(tag => {
    if (!addedSet.has(tag)) { list.append(el('li', hash(tag))); return; }
    const li = el('li', null, { class: 'tag-added' }); li.append(el('span', hash(tag))); list.append(li);
  });
  removed.forEach(tag => { const li = el('li', null, { class: 'tag-removed' }); li.append(el('s', hash(tag))); list.append(li); });
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
  a.href = previewReferenceHref(path); fragment.querySelector('h3').textContent = p.title; fragment.querySelector('p:not(.ui-meta)').textContent = p.description || ''; fragment.querySelector('.ui-meta').textContent = formatDate(p.date);
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
  const column = '.article-shell{max-width:42rem;margin-inline:auto;padding-top:0;padding-bottom:0}.article-body-row{margin-top:0}';
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
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const cacheKey = `${theme}\0${previewBodyKey(card, 'preview', false)}\0${cards.map(item => `${item.path}\t${item.afterProperties?.title || ''}\t${item.afterProperties?.description || ''}\t${(item.afterProperties?.tags || []).join(',')}`).join('\n')}`;
  const cached = htmlCache.get(cacheKey);
  if (cached) return cached;
  const doc = await previewTemplate();
  const previewLang = card.translation && card.language === 'en' ? 'en' : 'zh-CN';
  doc.documentElement.lang = previewLang;
  doc.documentElement.dataset.theme = theme;
  doc.documentElement.dataset.lang = previewLang;
  doc.querySelectorAll('script').forEach(n => n.remove());
  absolutizePreviewAssets(doc);
  const themeStyle = doc.createElement('style');
  themeStyle.setAttribute('data-preview-theme', '');
  themeStyle.textContent = previewThemeStyle(theme);
  doc.head.append(themeStyle);
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; script-src 'none'; form-action 'none'; base-uri 'none'";
  doc.head.insertBefore(csp, doc.head.firstChild);
  doc.querySelector('.article-lede')?.remove();
  // Tags and the dek live in the review pane (review-meta, preview-summary). The frame is the body only.
  doc.querySelector('.article-dek')?.remove();
  doc.querySelector('[data-preview-body]').innerHTML = await renderedProse(card.afterContent, path => referenceHtml(path, cards, doc));
  doc.querySelector('#reference-template')?.remove();
  return remember(htmlCache, cacheKey, '<!doctype html>' + doc.documentElement.outerHTML, 8);
}
async function cachedProse(source, renderReference, context, signature) {
  const key = `${signature}\0${source}\0${context === source ? '' : context}`;
  const cached = proseCache.get(key);
  if (cached != null) return cached;
  return remember(proseCache, key, await renderedProse(source, renderReference, context), 240);
}
async function showDiff(pane, card, cards, gen) {
  if (gen !== previewGen) return false;
  const changes = paragraphDiff(card.beforeContent, card.afterContent);
  const doc = await previewTemplate(), comparison = el('div', null, { class: 'full-diff', 'aria-label': '全文段落对比' });
  const article = el('article', null, { 'aria-label': '全文与修改标记' });
  const body = el('div', null, { class: 'diff-article-body' });
  if (!card.beforeContent.trim() && !card.afterContent.trim()) body.append(el('p', '正文为空。', { class: 'muted' }));
  else if (!card.beforeContent.trim()) body.append(el('p', '首次发布，还没有原文。', { class: 'muted' }));
  else if (!card.afterContent.trim()) body.append(el('p', '这一版将移除全文。', { class: 'muted' }));
  const defs = {
    before: paragraphs(card.beforeContent).filter(p => p.type === 'definition').map(p => p.text).join('\n'),
    after: paragraphs(card.afterContent).filter(p => p.type === 'definition').map(p => p.text).join('\n'),
  };
  const versionKey = version => `${version}\0${cards.map(item => `${item.path}\t${item[`${version}Properties`]?.title || ''}`).join('\n')}`;
  let painted = 0;
  const paint = async (part, content, version, unchanged) => {
    const prose = el(unchanged ? 'div' : version === 'before' ? 'del' : 'ins', null, { class: 'prose-site' });
    prose.innerHTML = await cachedProse(content, path => referenceHtml(path, cards, doc, `${version}Properties`), defs[version], versionKey(version));
    if (gen !== previewGen) return false;
    if (++painted % 8 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (gen !== previewGen) return false;
    }
    // Definitions have no visible Markdown output, but changing a link target
    // must still be visible to the reviewer.
    if (!prose.innerHTML.trim()) { if (unchanged) return 'skip'; prose.append(el('code', content)); }
    part.append(prose);
    return 'ok';
  };
  const emptySide = () => el('div', null, { class: 'diff-empty', 'aria-hidden': 'true' });
  const side = part => part.querySelector('.prose-site') ? part : emptySide();
  const place = async (block, part, content, version, unchanged) => {
    const status = await paint(part, content, version, unchanged);
    if (status === false) return false;
    if (status === 'skip') return 'skip';
    if (unchanged) block.append(part, part.cloneNode(true));
    else if (version === 'before') block.append(part, emptySide());
    else block.append(emptySide(), part);
    body.append(block);
    return 'ok';
  };
  for (const row of changes) {
    if (row.kind === 'modified') {
      const block = el('div', null, { class: 'paragraph-change modified' });
      const before = el('div', null, { class: 'diff-removed', 'data-position': row.from });
      const after = el('div', null, { class: 'diff-added', 'data-position': row.to });
      if (row.before && await paint(before, row.before, 'before', false) === false) return false;
      if (row.after && await paint(after, row.after, 'after', false) === false) return false;
      if (!before.querySelector('.prose-site') && !after.querySelector('.prose-site')) continue;
      block.append(side(before), side(after));
      body.append(block);
      continue;
    }
    const leaving = row.kind === 'removed';
    const content = leaving ? row.before : (row.after || row.before);
    if (!content) continue;
    const unchanged = row.kind === 'unchanged';
    const position = leaving ? row.from : (row.to ?? row.from);
    const block = el('div', null, { class: `paragraph-change ${row.kind}`, ...(position != null ? { 'data-position': position } : {}) });
    const part = el('div', null, { class: unchanged ? 'diff-unchanged' : leaving ? 'diff-removed' : 'diff-added', ...(position != null ? { 'data-position': position } : {}) });
    if (await place(block, part, content, leaving || !row.after ? 'before' : 'after', unchanged) === false) return false;
  }
  article.append(body);
  comparison.append(article);
  comparison.addEventListener('click', event => {
    if (!event.target.closest?.('a')) return;
    event.preventDefault(); notice('对比中保留链接位置；查看引用资料请点击左侧对应条目，外部链接不会打开。');
  });
  if (gen !== previewGen) return false;
  pane.append(comparison);
  return true;
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
  const local = localReleaseStats();
  const gitDeletes = git.files?.filter(f => f.code === 'D').length || 0;
  const shownPages = local.pages || git.draftCount || 0;
  const shownDeletes = local.pages ? local.deletes : gitDeletes;
  const ready = shownPages
    ? `${shownPages} 个页面${local.pages && !git.draftCount ? '已在本机通过' : '已准备好'}。${shownDeletes ? `其中 ${shownDeletes} 个待删除，其余为审核通过的更新。` : (local.pages && !git.draftCount ? '点提交或直接发布才会送到 GitHub。' : '只有审核通过的博客及其引用会进入这批更新。')}`
    : git.pullRequest ? '这批更新已送到 GitHub，等待检查与发布确认。' : '还没有等待发布的更新。';
  status.append(el('p', ready, { class: 'muted' }));
  if (git.release) status.append(el('p', `最近一次发布：${stages[git.release.stage] || '正在处理'}`, { class: 'release-stage', 'data-stage': git.release.stage || '' }));
  if (git.release?.error) status.append(el('p', git.release.error, { role: 'alert' }));
  if (git.release?.workflowUrl) status.append(link('查看发布进度 ↗', git.release.workflowUrl));
  if (git.pullRequest) status.append(link('查看 GitHub 更新 ↗', git.pullRequest.url));
  if (releaseNotice.text) status.append(el('p', releaseNotice.text, { 'data-release-notice': '', role: releaseNotice.error ? 'alert' : 'status', class: releaseNotice.error ? 'release-alert' : 'muted' }));
  const cited = citedRemovals();
  if (cited.length) status.append(citationParagraph(cited, { class: 'release-alert', role: 'status', 'data-citation-notice': '' }));
  actions.append(button('直接发布', publishWithoutReview, { class: 'btn direct-publish', network: '', 'data-release': 'direct', 'aria-label': '直接发布', title: '立刻发布这次拉取的全部更新和待删除' }));
  actions.append(button('刷新发布状态', async () => { git = await api('/git'); await renderRelease(); }, { class: 'btn', network: '', 'data-release': 'refresh' }));
  const pendingLocal = items.some(item => item.decision && !item.flushed && item.plan && !item.error) || pageChoiceDirty;
  if (git.draftCount || pendingLocal) actions.append(button('提交通过的更新到 GitHub', async () => {
    const result = await flushLocalDecisions(`更新博客内容 · ${new Date().toLocaleDateString('zh-CN')}`);
    if (!result.flushedOnly) git = result;
    await renderRelease();
    notice(result.flushedOnly ? '已回写拒绝。没有需要提交到 GitHub 的页面。' : result.unchanged ? '待发布清单已清理，网站没有变化。' : '已提交，检查通过后再确认发布。');
  }, { class: 'btn primary', network: '', 'data-release': 'submit' }));
  if (git.pullRequest) actions.append(button('确认发布', reviewRelease, { class: 'btn primary', network: '', 'data-release': 'confirm' }));
  if (busyRelease) document.querySelector(`#release [data-release="${busyRelease}"]`)?.toggleAttribute('disabled', true);
  clearTimeout(timer);
  if (git.release && ['running','queued'].includes(git.release.status)) timer = setTimeout(() => { if (!document.querySelector('dialog') && !busyRelease) void run(async () => { git = await api('/git'); await renderRelease(); }); }, 15000);
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
      }, { network: '' }));
    }, { network: '' })); legacyHost.append(details);
  }
}
async function reviewRelease() {
  const review = await api('/git/review'), d = dialog('确认发布到博客');
  if (!review.changes.length) { d.append(el('p', '这批更新已撤销，当前没有需要发布的页面。')); return; }
  d.append(el('p', '只有这些已审核页面会通过 GitHub 发布。确认前会再次检查内容是否变化。'));
  const list = el('ul'); review.changes.forEach(change => list.append(el('li', `${change.kind === 'removed' ? '删除 · ' : '更新 · '}${change.path.replace('src/content/', '').replace('.mdx', '')}`)));
  d.append(list, link('查看完整更新 ↗', review.pullRequest.url), button('确认发布到博客', async () => { await api('/git/publish', review); closeDialog(); git = await api('/git'); await renderRelease(); notice('发布已开始，显示“已上线”才表示完成。'); }, { class: 'btn primary', network: '' }));
}
void run(async () => {
  const session = await api('/session');
  booted = true;
  localPreview = session.localPreview;
  localOpen = pageIsLocal() || session.localOpen === true;
  if (localPreview) pulling = true;
  await refresh();
  if (localPreview) {
    pulling = false;
    await pullUpdates();
  }
});
