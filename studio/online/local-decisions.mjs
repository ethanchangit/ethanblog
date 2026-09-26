/**
 * Review decisions stay on the card until publish.
 * This module only mutates that local list. It does not fetch, and it does not
 * write Heptabase or GitHub. Publish sends decisionBatch() once.
 */

/** Shown where a cited article used to be blocked. It stays on its address as a reference. */
export function referenceKeepCopy(title, citations) {
  const who = [...new Set((citations || []).map(item => item?.title).filter(Boolean))].join('、');
  return `「${title}」仍被「${who}」引用。发布后会从文章列表、项目列表和站点页面撤下，留下为 reference，链接不断。没有人引用的专属资料仍会撤下。`;
}

export function referenceKeepBatchCopy(entries) {
  const who = [...new Set(entries.flatMap(entry => (entry.citations || []).map(item => item?.title).filter(Boolean)))].join('、');
  const count = entries.length;
  const names = count <= 3 ? entries.map(entry => `「${entry.title}」`).join('、') : `${count} 篇`;
  return `${names}仍被「${who}」引用。发布不会被拦住：它们会从文章列表、项目列表和站点页面撤下，留下为 reference，链接不断。没有人引用的专属资料仍会撤下。`;
}

export function applyLocalDecision(item, verdict, { remark, pageKeep, choiceRequired } = {}) {
  if (!item?.plan) return null;
  const next = item.removal ? (verdict === 'approve' ? 'remove' : 'skip') : verdict;
  if (item.decision === next && (next !== 'reject' || remark === undefined || remark === item.pendingRemark)) return null;
  if (next === 'approve' && !item.removal && item.plan.pageChoiceRequired && choiceRequired && !pageKeep?.has(item.card.id)) {
    throw new Error('站点页面最多显示 4 页。请先在审核清单里选择留下哪几页。');
  }
  const first = !item.decision;
  let extra = '';
  const markReferences = next === 'approve' && !item.removal && (item.plan.changes || []).some(change => !change.mainArticle && !change.referenceTagged && !change.translation);
  if (next === 'reject' && remark !== undefined) {
    item.pendingRemark = remark;
    extra = remark ? '备注会在发布上线后写回 Heptabase。' : '备注为空，发布上线后会清空 Remark。';
  } else if (markReferences) {
    item.markReferences = true;
    extra = '引用卡片会在发布时加上 references 标签。';
  }
  if (next !== 'approve') item.markReferences = false;
  const changed = Boolean(item.decision && item.decision !== next);
  item.decision = next;
  if (item.flushed) item.flushed = false;
  return { first, next, extra, changed };
}

export function pageChoicePayload(pageSet, keepDraft, orderDraft = [], hiddenDraft = new Set()) {
  if (!pageSet?.cards?.length) return null;
  const keep = pageSet.choiceRequired ? [...keepDraft] : pageSet.cards.map(card => card.id);
  const order = [...orderDraft].filter(id => keep.includes(id));
  for (const id of keep) if (!order.includes(id)) order.push(id);
  if (keep.length > 4) throw new Error('站点页面最多留下 4 页。');
  const hidden = [...hiddenDraft].filter(id => order.includes(id));
  return { keep, order, hidden };
}

function selection(item) {
  return {
    cardLink: item.input.cardLink,
    sourceHash: item.plan.sourceHash,
    documentHash: item.plan.documentHash,
    planHash: item.plan.planHash,
    ...(item.input.collection ? { collection: item.input.collection } : {}),
    ...(item.input.id ? { id: item.input.id } : {}),
  };
}

/** One payload for the publish/commit request. Already flushed rows are omitted. */
export function decisionBatch(items, { pageChoice = null } = {}) {
  const decisions = [];
  for (const item of items) {
    if (!item?.plan || item.error || !item.decision || item.flushed || item.capped) continue;
    if (item.removal) {
      if (item.decision === 'remove' && !item.plan.approved) decisions.push({ kind: 'removal', ...selection(item), confirmDelete: true });
      else if (item.decision === 'skip' && item.plan.approved) decisions.push({ kind: 'removal-cancel', cardLink: item.input.cardLink });
      continue;
    }
    if (item.decision === 'approve') {
      decisions.push({ kind: 'review', ...selection(item), decision: 'approve', confirmPublic: true, resolveConflict: true, ...(item.markReferences ? { markReferences: true } : {}) });
    } else if (item.decision === 'reject') {
      decisions.push({ kind: 'review', ...selection(item), decision: 'reject', ...(item.pendingRemark !== undefined ? { remark: item.pendingRemark } : {}) });
    }
  }
  for (const item of items) {
    if (item?.capped && !item.flushed && item.decision === 'skip') decisions.push({ kind: 'removal-cancel', cardLink: item.input.cardLink });
  }
  return { decisions, ...(pageChoice ? { pageChoice } : {}) };
}
