/** Independent Heptabase and GitHub reads. High enough to overlap latency, low enough not to stampede. */
export const IO_CONCURRENCY = 3;

/**
 * Run `fn` over `items` with at most `limit` calls in flight.
 * Results keep input order. The first rejection stops new work and is rethrown
 * after the calls already running have settled.
 */
export async function mapLimited(items, limit, fn) {
  const results = new Array(items.length);
  const width = Math.min(Math.max(1, limit | 0), items.length);
  if (!width) return results;
  let cursor = 0;
  let failure = null;
  const worker = async () => {
    while (failure == null) {
      const index = cursor++;
      if (index >= items.length) return;
      try { results[index] = await fn(items[index], index); }
      catch (error) { failure ??= error; }
    }
  };
  await Promise.all(Array.from({ length: width }, worker));
  if (failure) throw failure;
  return results;
}

/**
 * Identity of the preview or diff body. Review decisions are omitted on purpose:
 * approving a card must not rebuild the iframe.
 */
export function previewBodyKey(card, mode, removal) {
  return JSON.stringify([
    mode,
    Boolean(removal),
    card?.id || '',
    card?.title || '',
    card?.beforeContent || '',
    card?.afterContent || '',
    card?.beforeProperties || null,
    card?.afterProperties || null,
  ]);
}
