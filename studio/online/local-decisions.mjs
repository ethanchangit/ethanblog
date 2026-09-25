/**
 * Review decisions stay on the card until publish.
 * This module only mutates that local list. It does not fetch, and it does not
 * write Heptabase or GitHub. Publish sends decisionBatch() once.
 */

/** Shown where a cited article used to be blocked. It stays on its address as a reference. */
export function referenceKeepCopy(title, citations) {
  const who = [...new Set((citations || []).map(item => item?.title).filter(Boolean))].join('、');
  return `「${title}」仍被「${who}」引用。发布后会从文章列表撤下，留下为 reference，链接不断。没有人引用的专属资料仍会撤下。`;
}

export function referenceKeepBatchCopy(entries) {
  const who = [...new Set(entries.flatMap(entry => (entry.citations || []).map(item => item?.title).filter(Boolean)))].join('、');
  const count = entries.length;
  const names = count <= 3 ? entries.map(entry => `「${entry.title}」`).join('、') : `${count} 篇`;
  return `${names}仍被「${who}」引用。发布不会被拦住：它们会从文章列表撤下，留下为 reference，链接不断。没有人引用的专属资料仍会撤下。`;
}

/** One review row. Chinese is the #blog card. English is the #i18n card with the same slug, or missing. */
export function languageSlots(item) {
  if (!item?.plan || item.removal) return [{ lang: 'zh', missing: false, id: item?.card?.id || '', title: '' }];
  const changes = item.plan.changes || [];
  const zh = changes.find(change => change.id === item.card?.id && !change.translation) || changes.find(change => !change.translation);
  const slots = [{ lang: 'zh', missing: false, id: item.card?.id || '', title: zh?.title || '' }];
  let english = false;
  for (const change of changes) {
    if (!change.translation || !change.language) continue;
    if (change.language === 'en') english = true;
    slots.push({ lang: change.language, missing: false, id: change.id, title: change.title || '' });
  }
  if (!english) slots.push({ lang: 'en', missing: true, id: '', title: '' });
  return slots;
}

function aggregateDecision(slots, decisions) {
  const needed = slots.filter(slot => !slot.missing);
  if (needed.some(slot => decisions[slot.lang] !== 'approve' && decisions[slot.lang] !== 'reject')) return '';
  const values = needed.map(slot => decisions[slot.lang]);
  if (values.every(value => value === 'approve')) return 'approve';
  if (values.every(value => value === 'reject')) return 'reject';
  return 'split';
}

function ensureLangDecisions(item) {
  if (!item.langDecisions) {
    const seeded = {};
    if (item.decision === 'approve' || item.decision === 'reject') {
      for (const slot of languageSlots(item)) if (!slot.missing) seeded[slot.lang] = item.decision;
    }
    item.langDecisions = seeded;
  }
  return item.langDecisions;
}

export function applyLocalDecision(item, verdict, { remark, pageKeep, choiceRequired, lang, fillOnly } = {}) {
  if (!item?.plan) return null;
  if (item.removal) {
    const next = verdict === 'approve' ? 'remove' : 'skip';
    if (item.decision === next) return null;
    const first = !item.decision;
    const changed = Boolean(item.decision && item.decision !== next);
    item.decision = next;
    if (item.flushed) item.flushed = false;
    return { first, next, extra: '', changed };
  }
  if (verdict === 'approve' && item.plan.pageChoiceRequired && choiceRequired && !pageKeep?.has(item.card.id) && (!lang || lang === 'zh')) {
    throw new Error('站点页面最多显示 4 页。请先在审核清单里选择留下哪几页。');
  }
  const slots = languageSlots(item);
  const decisions = ensureLangDecisions(item);
  const targets = slots.filter(slot => !slot.missing && (!lang || slot.lang === lang));
  if (lang && !targets.length) return null;
  const beforeDecision = item.decision;
  let wrote = false;
  for (const slot of targets) {
    if (fillOnly && decisions[slot.lang]) continue;
    if (decisions[slot.lang] !== verdict) {
      decisions[slot.lang] = verdict;
      wrote = true;
    }
  }
  let extra = '';
  if ((!lang || lang === 'zh') && verdict === 'reject' && remark !== undefined && remark !== item.pendingRemark) {
    item.pendingRemark = remark;
    wrote = true;
  }
  if ((!lang || lang === 'zh') && verdict === 'reject' && remark !== undefined) {
    extra = remark ? '备注会在发布上线后写回 Heptabase。' : '备注为空，发布上线后会清空 Remark。';
  }
  const next = aggregateDecision(slots, decisions);
  if (!wrote && next === beforeDecision) return null;
  const unmarked = decisions.zh === 'approve' && (item.plan.changes || []).some(change => !change.mainArticle && !change.referenceTagged && !change.translation);
  if (unmarked) {
    item.markReferences = true;
    if (!extra) extra = '引用资料会在发布时加入 #blog，Blog Type 为 Reference。';
  } else if (decisions.zh !== 'approve') item.markReferences = false;
  const changed = Boolean(beforeDecision && beforeDecision !== next);
  item.decision = next;
  if (wrote && item.flushed) item.flushed = false;
  return { first: !beforeDecision, next, extra, changed };
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
    if (item.decision === 'approve' || item.decision === 'reject' || item.decision === 'split') {
      const slots = languageSlots(item);
      const languages = {};
      for (const slot of slots) languages[slot.lang] = slot.missing ? 'missing' : item.langDecisions?.[slot.lang];
      const decision = languages.zh;
      if (decision !== 'approve' && decision !== 'reject') continue;
      if (slots.some(slot => !slot.missing && languages[slot.lang] !== 'approve' && languages[slot.lang] !== 'reject')) continue;
      const publishes = Object.values(languages).includes('approve');
      decisions.push({
        kind: 'review', ...selection(item), decision, languages,
        ...(publishes ? { confirmPublic: true, resolveConflict: true } : {}),
        ...(item.markReferences ? { markReferences: true } : {}),
        ...(decision === 'reject' && item.pendingRemark !== undefined ? { remark: item.pendingRemark } : {}),
      });
    }
  }
  for (const item of items) {
    if (item?.capped && !item.flushed && item.decision === 'skip') decisions.push({ kind: 'removal-cancel', cardLink: item.input.cardLink });
  }
  return { decisions, ...(pageChoice ? { pageChoice } : {}) };
}
