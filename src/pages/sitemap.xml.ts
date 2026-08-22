import type { APIRoute } from 'astro';
import { sitemapUrls } from '@/lib/agent';

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const GET: APIRoute = async () => {
  const urls = await sitemapUrls();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((url) => {
    const lastmod = url.lastmod ? `\n    <lastmod>${escapeXml(url.lastmod)}</lastmod>` : '';
    return `  <url>\n    <loc>${escapeXml(url.loc)}</loc>${lastmod}\n  </url>`;
  })
  .join('\n')}
</urlset>
`;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
