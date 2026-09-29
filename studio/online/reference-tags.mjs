import { fail } from './auth.mjs';
import { references } from './card-content.mjs';
import { readCard, taggedCards } from './heptabase.mjs';

export const MENTIONED_BY = '## Mentioned by';

export function cardTitle(source) {
  return (/^#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/m.exec(String(source || ''))?.[1] || 'Untitled').trim();
}

/** The backlink section is written by the dashboard. It is not a new mention. */
export function withoutMentionedBy(source) {
  return String(source || '').replace(/\n*## Mentioned by\n[\s\S]*$/, '').replace(/\s+$/, '');
}

export function mentionedBySection(mentions) {
  const lines = [...mentions]
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    .map((item) => `- ${item.title} \`${item.id}\``);
  return `${MENTIONED_BY}\n\n${lines.join('\n')}\n`;
}

export function withMentionedBy(source, mentions) {
  return `${withoutMentionedBy(source)}\n\n${mentionedBySection(mentions)}`;
}

export function mentionersByCard(cards) {
  const map = new Map();
  for (const card of cards) {
    const title = card.title || cardTitle(card.source);
    for (const ref of references(withoutMentionedBy(card.source))) {
      if (ref.id === card.id) continue;
      const list = map.get(ref.id) || [];
      if (!list.some((item) => item.id === card.id)) list.push({ id: card.id, title });
      map.set(ref.id, list);
    }
  }
  return map;
}

/**
 * Only cards included in this review get the Heptabase `references` tag.
 * Unavailable mentions kept as plain text are outside this publication graph.
 * An article that is also mentioned keeps its Blog Type and gains the tag.
 * The card body records who mentioned it. Titles are plain text, not new mentions.
 */
export async function ensureReferenceTags(client, cards, { resume = false } = {}) {
  const mentioners = mentionersByCard(cards);
  const known = new Map(cards.map((card) => [card.id, card.source]));
  const ids = [...mentioners.keys()].filter(id => known.has(id));
  if (!ids.length) return { tagged: [], updates: [] };
  const { tagId } = await taggedCards(client, 'references');
  const result = await client.call('update_database_card_membership', { tagId, operation: 'add', cardIds: ids });
  if (result.failedCardIds?.length || result.invalidCardIds?.length) throw fail('部分被提到的卡片没有加上 references 标签，未继续。', 409);
  const updates = [];
  for (const id of ids) {
    const current = known.get(id);
    const next = withMentionedBy(current, mentioners.get(id));
    if (resume) {
      const live = (await readCard(client, id)).replace(/\s+$/, '');
      if (live === next.replace(/\s+$/, '')) continue;
      if (live !== current.replace(/\s+$/, '')) throw fail('引用内容在确认后又有修改，请重新拉取后发布。', 409);
    }
    if (current.replace(/\s+$/, '') === next.replace(/\s+$/, '')) continue;
    await client.call('edit_object_content', { objectType: 'card', objectId: id, oldString: current, newString: next.replace(/\n$/, '') });
    updates.push({ id, source: next.replace(/\n$/, '') });
  }
  return { tagged: ids, updates };
}
