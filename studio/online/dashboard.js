import './dashboard.css';
import { paragraphs, paragraphDiff, renderedProse, tagDiff, onlyTagsChanged } from './review-content.mjs';
import { formatDate as siteDate } from '../../src/lib/format.ts';

const root = document.querySelector('#studio');
document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const stages = { merging: '正在合并', queued: '等待部署', building: '正在检查和部署', verifying: '正在确认线上版本', deployed: '已上线', failed: '发布失败' };
let docs = [], items = [], selected, git, connected = false, loading = false, pulled = false, localPreview = false, localOpen = false, booted = false, mode = 'preview', template, timer;
let clearMoveLines = () => {};
function el(tag, text, attrs = {}) { const n = document.createElement(tag); if (text != null) n.textContent = text; for (const [k,v] of Object.entries(attrs)) n.setAttribute(k, v); return n; }
function link(text, href) { return el('a', text, { href, ...(href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }); }
function button(text, action, attrs = {}) { const b = el('button', text, { type: 'button', ...attrs }); b.addEventListener('click', () => void run(action)); return b; }
async function api(path, data) {
  const response = await fetch(`/dashboard/api${path}`, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  let result;
  try { result = await response.json(); }
  catch {
    const message = response.status === 401 ? '登录已过期，请重新输入后台密码。'
      : response.redirected ? '后台请求被跳转到了其他页面，请刷新后重试。'
      : !response.ok ? `后台暂时无法完成请求（${response.status}），请稍后重新拉取。`
      : '后台返回了无法读取的数据，请刷新后重试。';
    throw Object.assign(new Error(message), { status: response.status });
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('后台返回了无法读取的数据，请刷新后重试。');
  if (!response.ok) throw Object.assign(new Error(result.error || '操作未完成，请重试。'), { status: response.status });
  return result;
}
function notice(text, error = false) {
  const node = document.querySelector('dialog[open] .status') || document.querySelector('#notice');
  if (node) { node.textContent = text; node.setAttribute('role', error ? 'alert' : 'status'); }
}
async function run(action) {
  if (loading) return; loading = true;
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await action(); } catch (error) {
    if (error.status === 401) { closeDialog(); showLogin(booted ? error.message : ''); }
    else notice(error.message, true);
  } finally { loading = false; document.querySelectorAll('button').forEach(b => b.disabled = false); }
}
function showLogin(message = '') {
  clearTimeout(timer); clearMoveLines(); root.replaceChildren(); items = []; selected = null; pulled = false;
  const form = el('form', null, { class: 'login' });
  const password = el('input', null, { id: 'password', type: 'password', autocomplete: 'current-password', required: '', minlength: '12', maxlength: '256' });
  form.append(el('h1', 'Ethan 的发布后台'), el('p', '在 Heptabase 写作，在这里审查和发布。', { class: 'muted' }), el('label', '后台密码', { for: 'password' }), password, el('button', '进入发布后台', { type: 'submit' }), el('p', message, { id: 'notice', class: 'status', role: message ? 'alert' : 'status' }));
  form.addEventListener('submit', event => { event.preventDefault(); void run(async () => { await api('/login', { password: password.value }); const session = await api('/session'); booted = true; localPreview = session.localPreview; localOpen = session.localOpen === true; password.value = ''; await refresh(); }); });
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
  try {
    const [state, content, connection] = await Promise.all([api('/git'), api('/docs'), api('/heptabase/status')]);
    git = state; docs = [...content.articles, ...content.projects]; connected = connection.connected;
  } catch (error) {
    if (error.status === 401) throw error;
    git = { draftCount: 0, files: [], removals: [] };
    docs = [];
    connected = false;
    failed = error.message;
  }
  clearMoveLines(); root.replaceChildren();
  const header = el('header'), actions = el('div', null, { class: 'actions' });
  actions.append(button('切换明暗', async () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; await showSelection(); }), link('查看博客 ↗', 'https://ethanchang.io'));
  if (!localOpen) actions.append(button('退出', async () => { await api('/logout', {}); showLogin(); }));
  header.append(el('span', 'ETHAN / REVIEW', { class: 'eyebrow' }), actions);
  const intro = el('section', null, { class: 'intro' });
  intro.append(el('h1', '发布前，再看一遍。'), el('p', '拉取 Review 博客，同时检查已移除的文章。逐篇审核，确认后再发布。', { class: 'muted' }), button('拉取最新更新 ↗', pullUpdates, { class: 'pull-button', 'aria-label': '拉取最新更新' }));
  if (!connected) intro.append(el('p', '首次拉取时，需要连接你的 Heptabase。', { class: 'muted' }));
  root.append(header, intro, el('p', '', { id: 'notice', class: 'status', role: 'status' }));
  if (localPreview) intro.append(el('p', '本地样式预览 · 示例内容，所有操作均不影响 Heptabase、GitHub 或线上网站。', { class: 'muted group-caption' }));
  const layout = el('div', null, { class: 'review-layout' }); layout.append(el('aside', null, { id: 'review-list', 'aria-label': '本次审核清单' }), el('section', null, { id: 'review-preview', 'aria-label': '卡片预览' })); root.append(layout);
  root.append(el('section', null, { id: 'release', 'aria-label': '发布进度' }));
  renderList(); await showSelection();
  if (failed) { notice(failed, true); return; }
  await renderRelease();
}
async function pullUpdates() {
  if (!connected) { location.assign((await api('/heptabase/connect', {})).url); return; }
  notice('正在拉取 Review 卡片，以及它们跟随发布的引用资料…');
  const { cards, removals = [] } = await api('/heptabase/cards'), next = [];
  for (const card of cards) {
    const input = { cardLink: card.cardLink, preparePublish: true, reviewOnly: true, ...(card.linked[0] || {}) };
    try { next.push({ card, input, plan: await api('/heptabase/preview', input), decision: '' }); }
    catch (error) { if (error.status === 401) throw error; next.push({ card, input, error: error.message, decision: '' }); }
  }
  for (const removed of removals) {
    const card = { ...removed, id: removed.cardLink.split('/').pop() }, input = { collection: removed.collection, id: removed.id, cardLink: removed.cardLink };
    try { const plan = await api('/heptabase/removal-preview', input); next.push({ card, input, plan, removal: true, decision: plan.approved ? 'remove' : '' }); }
    catch (error) { if (error.status === 401) throw error; next.push({ card, input, removal: true, error: error.message, decision: '' }); }
  }
  items = next; pulled = true; selected = items[0] ? { item: items[0], id: items[0].card.id } : null;
  renderList(); await showSelection();
  notice(cards.length || removals.length ? `已拉取 ${cards.length} 篇 Review 博客${removals.length ? `，另有 ${removals.length} 篇待删除` : ''}。选择左侧条目，检查正文和跟随资料。` : '没有等待审核或删除的博客。');
}
const selection = item => ({ ...item.input, sourceHash: item.plan.sourceHash, documentHash: item.plan.documentHash, planHash: item.plan.planHash });
const rootChange = item => item.plan?.changes.find(c => c.id === item.card.id);
const title = item => rootChange(item)?.title || item.card.title;
function renderList() {
  const list = document.querySelector('#review-list'); if (!list) return; list.replaceChildren();
  if (!pulled) { list.append(el('p', '等待拉取', { class: 'muted empty' })); return; }
  const active = items.filter(item => !item.removal), removed = items.filter(item => item.removal);
  const refs = new Set(active.flatMap(item => item.plan?.changes.filter(c => !c.mainArticle).map(c => c.id) || []));
  list.append(el('p', `这一版 · ${active.length} blog / ${refs.size} page${removed.length ? ` · 待删除 ${removed.length} 篇` : ''}`, { class: 'edition-summary' }));
  if (items.some(i => i.decision)) list.append(el('p', `待审 ${items.filter(i => !i.decision).length} · 通过 ${items.filter(i => i.decision === 'approve').length} · 拒绝 ${items.filter(i => i.decision === 'reject').length}${removed.length ? ` · 确认删除 ${removed.filter(i => i.decision === 'remove').length} · 暂不删除 ${removed.filter(i => i.decision === 'skip').length}` : ''}`, { class: 'muted group-caption' }));
  for (const kind of ['new', 'edited', ...(removed.length ? ['removed'] : [])]) {
    const deleting = kind === 'removed', edited = kind === 'edited';
    const group = deleting ? removed : active.filter(item => Boolean(rootChange(item)?.previouslyPublished) === edited);
    const section = el('section', null, { class: 'review-group', 'data-review-group': kind });
    section.append(el('h2', `${deleting ? 'Deleted articles' : edited ? 'Edited articles' : 'New articles'} · ${group.length}`), el('p', deleting ? '已移出 #blog 或已删除，确认后从网站撤下' : edited ? '已有文章的修改与重新发布' : '新卡片与首次发布的文章', { class: 'muted group-caption' }));
    const ol = el('ol');
    for (const item of group) {
      const li = el('li'), row = el('div', null, { class: 'blog-row' });
      row.append(button(title(item), async () => { selected = { item, id: item.card.id }; renderList(); await showSelection(); }, { class: 'card-select', 'aria-pressed': String(selected?.item === item && selected.id === item.card.id) }));
      const decisions = el('div', null, { class: 'decisions' });
      if (!item.decision && item.plan) decisions.append(button('✓', () => deleting ? confirmRemoval(item) : confirmDecision(item, 'approve'), { 'aria-label': `${deleting ? '删除' : '通过'}「${title(item)}」`, title: deleting ? '审查删除这篇博客' : '通过这篇博客' }), button('×', async () => {
        if (!deleting) return confirmDecision(item, 'reject');
        item.decision = 'skip'; renderList(); await showSelection(); notice('本次暂不删除，线上页面不变；下次拉取会再次提醒。');
      }, { 'aria-label': `${deleting ? '暂不删除' : '拒绝'}「${title(item)}」`, title: deleting ? '本次暂不删除' : '拒绝这篇博客' }));
      row.append(decisions); li.append(row, el('small', item.decision === 'remove' ? '已确认删除，待发布' : item.decision === 'skip' ? '本次暂不删除' : item.decision === 'approve' ? 'blog · 已通过，待发布' : item.decision === 'reject' ? 'blog · 已拒绝，已回写 Block' : item.error ? '读取失败，尚未审核' : deleting ? item.plan.reasonLabel : `blog · ${onlyTagsChanged(rootChange(item)) ? '仅标签更新' : edited ? '编辑更新' : '首次发布'}`, { class: 'item-meta' }));
      const change = rootChange(item);
      if (change && !deleting) {
        const { added, removed } = tagDiff(change.beforeProperties.tags, change.afterProperties.tags);
        if (added.length || removed.length) li.append(el('small', `标签：新增 ${added.length} · 移除 ${removed.length}`, { class: 'item-meta' }));
      }
      const references = item.plan?.changes.filter(c => c.id !== item.card.id) || [];
      if (references.length) {
        const ul = el('ul', null, { class: 'references' });
        for (const card of references) {
          const ref = el('li'); ref.append(button(card.title, async () => { selected = { item, id: card.id }; renderList(); await showSelection(); }, { class: 'card-select', 'aria-pressed': String(selected?.item === item && selected.id === card.id) }), el('small', `${card.mainArticle ? 'blog · 需单独审核' : 'page'} · ${card.kind}`, { class: 'item-meta' })); ul.append(ref);
        }
        li.append(ul);
      }
      ol.append(li);
    }
    section.append(group.length ? ol : el('p', '这一组没有待审文章。', { class: 'muted' })); list.append(section);
  }
}
async function showSelection() {
  clearMoveLines();
  const pane = document.querySelector('#review-preview'); if (!pane) return; pane.replaceChildren();
  pane.closest('.review-layout').dataset.mode = mode;
  if (!selected) { pane.append(el('div', !pulled ? '拉取后，在这里预览文章实际发布的排版。' : items.length ? '选择左侧条目，查看正文和跟随资料。' : '这一版没有等待审核的文章。', { class: 'preview-empty muted' })); return; }
  const { item, id } = selected;
  if (item.error) { pane.append(el('p', item.error, { role: 'alert' })); return; }
  const card = item.plan.changes.find(c => c.id === id), bar = el('div', null, { class: 'preview-bar' });
  const tabs = el('div', null, { class: 'actions', role: 'group', 'aria-label': '预览方式' });
  for (const [value, text] of [['preview', item.removal ? '现有页面' : '发布预览'], ['diff', '段落对比']]) tabs.append(button(text, async () => { mode = value; await showSelection(); }, { 'aria-pressed': String(mode === value) }));
  bar.append(tabs);
  if (!item.removal || item.plan.reason !== 'deleted') bar.append(link('在 Heptabase 打开 ↗', card.cardLink));
  const pageKind = card.afterProperties?.slot === 'project' ? 'project' : 'blog';
  pane.append(bar, el('p', `${card.mainArticle ? pageKind : 'page · 不出现在博客列表'} / ${card.title}`, { class: 'muted preview-caption' }));
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
  if (!item.decision && !item.removal) {
    const scope = el('div', null, { class: 'review-scope' }), refs = item.plan.changes.filter(c => !c.mainArticle);
    scope.append(el('p', `审核「${title(item)}」时，会同时确认 ${refs.length} 个引用资料页可以公开。引用资料不单独设置通过或拒绝。`));
    if (refs.some(c => !c.referenceTagged)) scope.append(button('标记引用资料为 #blog-reference', async () => { await api('/heptabase/mark-references', selection(item)); refs.forEach(c => c.referenceTagged = true); await showSelection(); notice('引用已标记。请确认这些资料不含私人内容。'); }));
    if (!item.card.linked.length) {
      const kind = item.card.properties?.type === 'project' ? 'projects' : 'articles';
      const select = el('select', null, { 'aria-label': kind === 'projects' ? '关联已有项目' : '关联已有文章' });
      select.append(el('option', kind === 'projects' ? '新建项目页（若已有项目页，可在此关联）' : '新建文章（若已有文章，可在此关联）', { value: '' }));
      docs.filter(d => !d.heptabaseCardLink && d.collection === kind).forEach(d => select.append(el('option', d.title, { value: `${d.collection}/${d.id}` })));
      select.addEventListener('change', () => void run(async () => {
        if (!select.value) { delete item.input.collection; delete item.input.id; }
        else { const [collection, ...parts] = select.value.split('/'); item.input.collection = collection; item.input.id = parts.join('/'); }
        item.plan = await api('/heptabase/preview', item.input); renderList(); await showSelection();
      })); scope.append(select);
    }
    pane.append(scope);
  }
}
async function confirmRemoval(item) {
  selected = { item, id: item.card.id }; renderList(); await showSelection();
  const d = dialog(`删除「${title(item)}」`);
  d.append(el('p', '确认后将这些页面加入待删除清单。通过 GitHub 发布后，正文、博客列表和全文搜索都会移除；不会删除或修改 Heptabase 里的其他卡片。历史版本仍可从 GitHub 恢复。'));
  const list = el('ul'); item.plan.changes.forEach(c => list.append(el('li', `${c.mainArticle ? 'blog' : 'page'} · ${c.title}`))); d.append(list);
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
async function previewTemplate() { template ||= await (await fetch('/dashboard/preview.html')).text(); return new DOMParser().parseFromString(template, 'text/html'); }
function referenceHtml(path, cards, doc, version = 'afterProperties') {
  const card = cards.find(c => c.path === `src/content/${path}.mdx`), p = card?.[version];
  if (!p?.title) return el('p', `引用资料：${path}（此版本的资料未拉取）`, { class: 'muted' }).outerHTML;
  const fragment = doc.querySelector('#reference-template').content.cloneNode(true), a = fragment.querySelector('a');
  a.href = '/' + path; fragment.querySelector('h3').textContent = p.title; fragment.querySelector('p:not(.ui-meta)').textContent = p.description || ''; fragment.querySelector('.ui-meta').textContent = formatDate(p.date);
  fragment.querySelector('ul').replaceChildren(...(p.tags || []).slice(0, 3).map(t => el('li', t, { class: 'ui-tag' })));
  const nav = el('nav', null, { class: 'not-prose', 'data-doc-list': '', 'data-doc-embed': '' }), inner = el('div', null, { class: 'flex flex-col' }); inner.append(fragment); nav.append(inner); return nav.outerHTML;
}
async function previewHtml(card, cards) {
  const doc = await previewTemplate(), p = card.afterProperties;
  doc.documentElement.dataset.theme = document.documentElement.dataset.theme; doc.querySelectorAll('script').forEach(n => n.remove());
  const csp = doc.createElement('meta'); csp.httpEquiv = 'Content-Security-Policy'; csp.content = "default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; script-src 'none'; form-action 'none'; base-uri 'none'"; doc.head.insertBefore(csp, doc.head.firstChild);
  doc.querySelector('h1').textContent = p.title;
  const time = doc.querySelector('time'); time.textContent = formatDate(p.date); time.dateTime = String(p.date || '');
  doc.querySelector('.article-dek-text').textContent = p.description || '';
  doc.querySelector('.article-dek .ui-tag-list').replaceChildren(...(p.tags || []).map(t => el('li', t, { class: 'ui-tag' })));
  doc.querySelector('[data-preview-body]').innerHTML = await renderedProse(card.afterContent, path => referenceHtml(path, cards, doc)); doc.querySelector('#reference-template').remove();
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
  selected = { item, id: item.card.id }; renderList(); await showSelection();
  const approve = decision === 'approve', d = dialog(`${approve ? '通过' : '拒绝'}「${title(item)}」`);
  d.append(el('p', approve ? `通过这篇博客，也表示你已确认它的 ${item.plan.changes.filter(c => !c.mainArticle).length} 个引用资料页可以公开。将回写 Published；发布日期为空时填入今天。网站仍需下一步提交发布。` : '将回写 Block，不修改发布日期，也不会改动线上已有文章。'));
  if (approve) appendTagChanges(d, rootChange(item));
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
  const release = document.querySelector('#release'); release.replaceChildren(el('h2', '审核之后，再发布。'));
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
  const { decisions } = await api('/heptabase/decisions');
  for (const pending of decisions.filter(d => d.status === 'pending')) release.append(button(`重试「${pending.title}」的${pending.decision === 'approve' ? '通过' : '拒绝'}操作`, async () => { await api('/heptabase/decision', { cardLink: `heptabase://card/${pending.id}`, decision: pending.decision }); git = await api('/git'); await renderRelease(); notice('已恢复上次审核操作。'); }));
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
  localOpen = session.localOpen === true;
  await refresh();
});
