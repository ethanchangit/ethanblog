/**
 * Review decisions stay on the card until publish.
 * This module only mutates that local list. It does not fetch, and it does not
 * write Heptabase or GitHub. Publish saves the resulting decisions one at a time.
 */

export function applyLocalDecision(item, verdict, { remark, pageKeep, choiceRequired } = {}) {
  if (!item?.plan) return null;
  const next = item.removal ? (verdict === 'approve' ? 'remove' : 'skip') : verdict;
  if (item.decision === next && (next !== 'reject' || remark === undefined || remark === item.pendingRemark)) return null;
  if (next === 'approve' && !item.removal && item.plan.pageChoiceRequired && choiceRequired && !pageKeep?.has(item.card.id)) {
    throw new Error('站点页面最多显示 4 页。请先在审核清单里选择留下哪几页。');
  }
  const markReferences = next === 'approve' && !item.removal && (item.plan.changes || []).some(change => !change.mainArticle && !change.referenceTagged && !change.translation);
  if (next === 'reject' && remark !== undefined) {
    item.pendingRemark = remark;
  } else if (markReferences) {
    item.markReferences = true;
  }
  if (next !== 'approve') item.markReferences = false;
  item.decision = next;
  if (item.flushed) item.flushed = false;
  return { next };
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

/** Collect decisions still waiting to be saved. Already flushed rows are omitted. */
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
