import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { site } from '@/data/profile';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const stories = (await getCollection('stories', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? site.url,
    items: stories.map((s) => ({
      title: s.data.title,
      description: s.data.description,
      pubDate: s.data.date,
      link: `/stories/${s.id}`,
    })),
    customData: `<language>zh-cn</language>`,
  });
}
