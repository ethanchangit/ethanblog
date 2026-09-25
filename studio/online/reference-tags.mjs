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
 * Every card mentioned by this review gets the Heptabase `references` tag.
 * An article that is also mentioned keeps its Blog Type and gains the tag.
 * The card body records who mentioned it. Titles are plain text, not new mentions.
 */
export async function ensureReferenceTags(client, cards) {
  const mentioners = mentionersByCard(cards);
  const ids = [...mentioners.keys()];
  if (!ids.length) return { tagged: [], updates: [] };
  const { tagId } = await taggedCards(client, 'references');
  const result = await client.call('update_database_card_membership', { tagId, operation: 'add', cardIds: ids });
  if (result.failedCardIds?.length || result.invalidCardIds?.length) throw fail('部分被提到的卡片没有加上 references 标签，未继续。', 409);
  const known = new Map(cards.map((card) => [card.id, card.source]));
  const updates = [];
  for (const id of ids) {
    const current = known.has(id) ? known.get(id) : await readCard(client, id);
    const next = withMentionedBy(current, mentioners.get(id));
    if (current.replace(/\s+$/, '') === next.replace(/\s+$/, '')) continue;
    await client.call('edit_object_content', { objectType: 'card', objectId: id, oldString: current, newString: next.replace(/\n$/, '') });
    updates.push({ id, source: next.replace(/\n$/, '') });
  }
  return { tagged: ids, updates };
}
