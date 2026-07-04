import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { site } from '@/data/profile';
import { getThread } from '@/data/threads';
import type { APIContext } from 'astro';
import type { CollectionEntry } from 'astro:content';

/** notebook 条目在 RSS 里带研究线前缀，如【研究笔记 · 把网页当动态媒介 #01】 */
function itemTitle(data: CollectionEntry<'stories'>['data']): string {
  if (data.kind !== 'notebook' || !data.thread || data.seq === undefined) return data.title;
  const threadTitle = getThread(data.thread)?.title ?? data.thread;
  const seq = String(data.seq).padStart(2, '0');
  return `【研究笔记 · ${threadTitle} #${seq}】${data.title}`;
}

export async function GET(context: APIContext) {
  const stories = (await getCollection('stories', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? site.url,
    items: stories.map((s) => ({
      title: itemTitle(s.data),
      description: s.data.description,
      pubDate: s.data.date,
      link: `/stories/${s.id}`,
    })),
    customData: `<language>zh-cn</language>`,
  });
}
