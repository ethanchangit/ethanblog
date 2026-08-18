import rss from '@astrojs/rss';
import { site } from '@/data/profile';
import { docHref, docsBySlot } from '@/lib/docs';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const articles = (await docsBySlot('article')).sort(
    (a, b) => (b.data.date?.valueOf() ?? 0) - (a.data.date?.valueOf() ?? 0),
  );

  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? site.url,
    items: articles.flatMap((entry) => {
      const pubDate = entry.data.date;
      if (!pubDate) return [];
      return [
        {
          title: entry.data.title,
          description: entry.data.description,
          pubDate,
          link: docHref(entry),
        },
      ];
    }),
    customData: `<language>zh-cn</language>`,
  });
}
