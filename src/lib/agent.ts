/**
 * Machine-readable surface for agents: markdown bodies, llms.txt, sitemap,
 * OpenAPI, RFC 9727 catalog, JSON-LD, and the 404 recovery note.
 * This is a publication, not a product API — do not invent MCP/OAuth/webhooks.
 */
import { readFile } from 'node:fs/promises';
import { getCollection, getEntry } from 'astro:content';
import { profile, site, skills } from '@/data/profile';
import { docHref, docsBySlot, isIndexed, isReference, type DocEntry } from '@/lib/docs';
import { copy } from '@/lib/i18n';
import { withLocalePrefix } from '@/lib/locale';
import {
  ARTICLES_PATH,
  BLOGS_PATH,
  CONTACT_PATH,
  FOR_AGENTS_PATH,
  NOW_PATH,
  PRIVACY_PATH,
  PROJECTS_PATH,
  SEARCH_PATH,
  TAGS_PATH,
  sitePageHref,
} from '@/lib/routes';

export type AgentLang = 'en' | 'zh';

const LANG_SPLIT = /<div\s+data-lang-split\s*>\s*<\/div>/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** Tiny Markdown subset for our own agent-facing pages (not user content). */
export function liteMarkdownHtml(markdown: string): string {
  const blocks = markdown.trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split('\n');
      const first = lines[0] ?? '';
      if (first.startsWith('# ')) return `<h1>${inlineMarkdown(first.slice(2))}</h1>`;
      if (first.startsWith('## ')) return `<h2>${inlineMarkdown(first.slice(3))}</h2>`;
      if (first.startsWith('### ')) return `<h3>${inlineMarkdown(first.slice(4))}</h3>`;
      if (lines.every((line) => line.startsWith('- '))) {
        const items = lines.map((line) => `<li>${inlineMarkdown(line.slice(2))}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${lines.map((line) => inlineMarkdown(line)).join('<br />')}</p>`;
    })
    .join('\n');
}

export function markdownResponse(body: string, status = 200): Response {
  return new Response(body.endsWith('\n') ? body : `${body}\n`, {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
    },
  });
}

export function notFoundMarkdown(origin: string = site.url): string {
  const root = origin.replace(/\/+$/, '');
  return [
    '# 404 — page not found',
    '',
    'This URL is not a page on ethanchang.io. It may have moved, or it never existed.',
    '',
    'Try one of these next:',
    '',
    `- [Home](${root}/)`,
    `- [Articles](${root}${ARTICLES_PATH})`,
    `- [ethanchang.io developer resources](${root}${FOR_AGENTS_PATH})`,
    `- [llms.txt](${root}/llms.txt)`,
    `- [Sitemap](${root}/sitemap.xml)`,
    `- [Contact](${root}${CONTACT_PATH})`,
    `- [Privacy](${root}${PRIVACY_PATH})`,
    '',
  ].join('\n');
}

function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

export function mdxBodyToMarkdown(body: string, lang: AgentLang): string {
  const withoutImports = body.replace(/^import\s[\s\S]*?;\s*$/gm, '').trim();
  const parts = withoutImports.split(LANG_SPLIT);
  if (parts.length === 1) return (parts[0] ?? '').trim();
  const zh = (parts[0] ?? '').trim();
  const en = parts.slice(1).join('\n').trim();
  return zh;
}

type SourcedEntry = { body?: string; filePath?: string };

async function sourcedBody(entry: SourcedEntry): Promise<string> {
  if (entry.filePath) {
    try {
      return stripFrontmatter(await readFile(entry.filePath, 'utf8'));
    } catch {
      /* fall through */
    }
  }
  return entry.body ?? '';
}

async function entrySource(entry: DocEntry): Promise<string> {
  return sourcedBody(entry as DocEntry & SourcedEntry);
}

export async function docMarkdown(entry: DocEntry, lang: AgentLang): Promise<string> {
  const title = entry.data.title;
  const description =
    entry.data.description;
  const body = mdxBodyToMarkdown(await entrySource(entry), lang);
  const lines = [`# ${title}`, '', description];
  if (body) lines.push('', body);
  return `${lines.join('\n').trim()}\n`;
}

const CORE_PAGE_IDS = ['about', 'now', 'contact', 'privacy'] as const;

async function corePageMarkdown(
  id: (typeof CORE_PAGE_IDS)[number],
): Promise<string | null> {
  const entry = await getEntry('pages', id);
  if (!entry) return null;
  const body = (await sourcedBody(entry)).trim();
  return body || null;
}

async function aboutPageMarkdown(): Promise<string> {
  const body = await corePageMarkdown('about');
  const heading = `# ${profile.name} · ${profile.chineseName}`;
  return body ? `${heading}\n\n${body}\n` : `${heading}\n`;
}

export function forAgentsMarkdown(lang: AgentLang): string {

    return `# ethanchang.io 给 agent 的开发者资源

这不是 SaaS，也没有对外 MCP 服务器。给 agent 用的表面就是这份博客已经公开的内容栈。

## 同一 URL 的 Markdown

对 HTML 文档发送 \`Accept: text/markdown\`。响应是 \`Content-Type: text/markdown; charset=utf-8\`，并且 \`Vary\` 包含 \`Accept\`。浏览器的 \`Accept: text/html, …, */*\` 仍拿到 HTML。只接受既非 HTML 也非 Markdown 的类型时返回 406。

也可以直接请求 \`/index.md\`、\`/<slug>.md\`。

## 发现

- [/llms.txt](/llms.txt) — 何时使用本站、主要入口
- [/llms-full.txt](/llms-full.txt) — 把已发布文章和项目拼成一份长 Markdown
- [/sitemap.xml](/sitemap.xml)
- [/rss.xml](/rss.xml)
- [/robots.txt](/robots.txt)
- [/openapi.json](/openapi.json) — 实际存在的只读/留言接口
- [/.well-known/api-catalog](/.well-known/api-catalog) — RFC 9727 目录

## 真实存在、但不是产品的接口

\`POST /api/comments\` 把留言送到邮箱，不发布。\`GET /api/me\`、\`/api/bookmarks\`、\`/api/progress\` 需要会话，给已经登录的人同步收藏和进度。没有公开的写 API、没有 webhook、没有 OAuth 作为平台能力对外提供。不要为了分数去假装这里有 MCP。

## 人怎么用

写信：[${CONTACT_PATH}](${CONTACT_PATH})。隐私：[${PRIVACY_PATH}](${PRIVACY_PATH})。关于页是 \`/about\`。首页 \`/\` 是文章列表。
`;
}


function shortIndexMarkdown(title: string, description: string, path: string): string {
  return `# ${title}\n\n${description}\n\nHTML: ${path}\n`;
}

export type MarkdownPage = { slug: string; body: string };

export async function agentMarkdownPages(): Promise<MarkdownPage[]> {
  const [articles, projects] = await Promise.all([docsBySlot('article'), docsBySlot('project')]);
  const pages: MarkdownPage[] = [];

  const [about, nowPage, contactPage, privacyPage] = await Promise.all([
    aboutPageMarkdown(),
    corePageMarkdown('now'),
    corePageMarkdown('contact'),
    corePageMarkdown('privacy'),
  ]);
  const staticPages: { path: string; zh: string }[] = [
    { path: '/', zh: shortIndexMarkdown('Articles', copy.en.articlesDesc, '/') },
    { path: '/about', zh: about },
    ...(nowPage ? [{ path: NOW_PATH, zh: `${nowPage}\n` }] : []),
    ...(contactPage ? [{ path: CONTACT_PATH, zh: `${contactPage}\n` }] : []),
    ...(privacyPage ? [{ path: PRIVACY_PATH, zh: `${privacyPage}\n` }] : []),
    { path: FOR_AGENTS_PATH, zh: forAgentsMarkdown('zh') },
    {
      path: ARTICLES_PATH,
      zh: shortIndexMarkdown('Articles', copy.en.articlesDesc, ARTICLES_PATH),
    },
    {
      path: PROJECTS_PATH,
      zh: shortIndexMarkdown('Projects', copy.en.projectsDesc, PROJECTS_PATH),
    },
    {
      path: BLOGS_PATH,
      zh: shortIndexMarkdown('Blogs', copy.en.blogsDesc, BLOGS_PATH),
    },
    {
      path: SEARCH_PATH,
      zh: shortIndexMarkdown('Search', copy.en.searchDesc, SEARCH_PATH),
    },
    {
      path: TAGS_PATH,
      zh: shortIndexMarkdown('Tags', copy.en.tagsDesc, TAGS_PATH),
    },
  ];

  for (const page of staticPages) {
    pages.push({ slug: page.path === '/' ? 'index' : page.path.slice(1), body: page.zh });
  }

  for (const entry of articles) {
    if (/^\d+$/.test(entry.id)) continue;
    const href = docHref(entry);
    pages.push({ slug: href.slice(1), body: await docMarkdown(entry, 'zh') });
  }
  for (const entry of projects) {
    const href = docHref(entry);
    pages.push({ slug: href.slice(1), body: await docMarkdown(entry, 'zh') });
  }

  return pages;
}

export async function sitemapUrls(): Promise<{ loc: string; lastmod?: string }[]> {
  const [articles, projects, sitePages] = await Promise.all([
    docsBySlot('article'),
    docsBySlot('project'),
    getCollection('pages', ({ id, data }) => id !== 'blogs' && !data.draft && !data.translationOf),
  ]);
  const [nowPage, contactPage, privacyPage] = await Promise.all([
    corePageMarkdown('now'),
    corePageMarkdown('contact'),
    corePageMarkdown('privacy'),
  ]);
  const paths = new Set<string>([
    '/',
    ARTICLES_PATH,
    PROJECTS_PATH,
    BLOGS_PATH,
    ...(nowPage ? [NOW_PATH] : []),
    ...(contactPage ? [CONTACT_PATH] : []),
    ...(privacyPage ? [PRIVACY_PATH] : []),
    FOR_AGENTS_PATH,
    SEARCH_PATH,
    TAGS_PATH,
  ]);
  const lastmod = new Map<string, string>();

  for (const page of sitePages) {
    const href = sitePageHref(page.id);
    paths.add(href);
    const stamp = page.data.updated ?? page.data.created ?? page.data.date;
    if (stamp) lastmod.set(href, stamp.toISOString());
  }

  for (const entry of [...articles, ...projects]) {
    if (entry.data.slot === 'article' && /^\d+$/.test(entry.id)) continue;
    const href = docHref(entry);
    paths.add(href);
    const stamp = entry.data.updated ?? entry.data.date;
    if (stamp) lastmod.set(href, stamp.toISOString());
  }

  const urls: { loc: string; lastmod?: string }[] = [];
  for (const path of [...paths].sort()) {
    for (const locale of ['zh'] as const) {
      const loc = new URL(withLocalePrefix(path, locale), site.url).href;
      const iso = lastmod.get(path);
      urls.push(iso ? { loc, lastmod: iso } : { loc });
    }
  }
  return urls;
}

export async function buildLlmsTxt(): Promise<string> {
  const [articles, projects] = await Promise.all([
    docsBySlot('article').then((list) => list.filter(isIndexed)),
    docsBySlot('project').then((list) => list.filter((entry) => !isReference(entry))),
  ]);
  const articleLines = articles
    .filter((entry) => !entry.id.startsWith('dummy-'))
    .sort((a, b) => (b.data.date?.valueOf() ?? 0) - (a.data.date?.valueOf() ?? 0))
    .map((entry) => `- [${entry.data.title ?? entry.data.title}](${site.url}${docHref(entry)})`);
  const projectLines = projects.map(
    (entry) => `- [${entry.data.title ?? entry.data.title}](${site.url}${docHref(entry)})`,
  );

  return `# Ethan Chang

Ethan Chang (张峻源) writes at ${site.url}. Native iOS apps, LLM and voice tools, personal knowledge management. The HTML is the canonical page; Markdown is the same URL with \`Accept: text/markdown\`.

## When to use ethanchang.io

Use this site when you need how Ethan actually runs PKM (Obsidian, Heptabase), project notes for the software on /projects, or the living Now page for what he is doing this month. Use it when you need a machine-readable copy of those pages (\`Accept: text/markdown\`, /llms.txt, /rss.xml) rather than a screenshot of the layout.

Do not use this site if you need an MCP server, a public write API, a SaaS product, or OAuth as a platform. GitHub/Google login exists only so a reader can sync optional bookmarks and progress. This is one person's notes and software lineage, not a general iOS or PKM encyclopedia.

## Main pages

- [Home](${site.url}/)
- [About](${site.url}/about)
- [Articles](${site.url}${ARTICLES_PATH})
- [Projects](${site.url}${PROJECTS_PATH})
- [Now](${site.url}${NOW_PATH})
- [ethanchang.io developer resources](${site.url}${FOR_AGENTS_PATH})
- [Contact](${site.url}${CONTACT_PATH})
- [Privacy](${site.url}${PRIVACY_PATH})
- [RSS](${site.url}/rss.xml)
- [Sitemap](${site.url}/sitemap.xml)
- [OpenAPI](${site.url}/openapi.json)
- [RFC 9727 API catalog](${site.url}/.well-known/api-catalog)
- [Full Markdown dump](${site.url}/llms-full.txt)

## Articles

${articleLines.join('\n') || '- (none)'}

## Projects

${projectLines.join('\n') || '- (none)'}
`;
}

export async function buildLlmsFull(): Promise<string> {
  const [articles, projects] = await Promise.all([docsBySlot('article'), docsBySlot('project')]);
  const parts = [
    '# ethanchang.io — full Markdown',
    '',
    'Concatenated published essays and project files. Prefer the per-page URL with `Accept: text/markdown` when you only need one document.',
    '',
  ];
  for (const entry of [...articles.filter(isIndexed), ...projects.filter((entry) => !isReference(entry))]) {
    parts.push('---', '', await docMarkdown(entry, 'zh'), '');
  }
  return parts.join('\n');
}

export function robotsTxt(): string {
  return `# Content signals: search=yes, ai-input=yes, ai-train=yes
# Agents may read, cite, retrieve, and train on this public blog.

User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Anthropic-ai
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Bytespider
Allow: /

User-agent: CCBot
Allow: /

Sitemap: ${site.url}/sitemap.xml
`;
}

export function openApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'ethanchang.io',
      summary: 'Personal blog machine-readable surface',
      description:
        'Read-only discovery plus an email-bound comment inbox. There is no public MCP server and no write API for third-party apps.',
      version: '1.0.0',
      contact: { name: profile.name, email: profile.email, url: site.url },
    },
    servers: [{ url: site.url }],
    paths: {
      '/llms.txt': {
        get: {
          summary: 'Agent instructions and catalog',
          operationId: 'getLlmsTxt',
          responses: { '200': { description: 'text/plain catalog' } },
        },
      },
      '/rss.xml': {
        get: {
          summary: 'Article feed',
          operationId: 'getRss',
          responses: { '200': { description: 'application/rss+xml' } },
        },
      },
      '/sitemap.xml': {
        get: {
          summary: 'XML sitemap',
          operationId: 'getSitemap',
          responses: { '200': { description: 'application/xml' } },
        },
      },
      '/api/comments': {
        post: {
          summary: 'Email a comment on an article; not published on the page',
          operationId: 'postComment',
          responses: {
            '200': { description: 'Accepted' },
            '400': { description: 'Invalid body' },
          },
        },
      },
      '/api/me': {
        get: {
          summary: 'Current session, or user: null',
          operationId: 'getMe',
          responses: { '200': { description: 'Session JSON' } },
        },
      },
    },
  };
}

export function apiCatalogDocument() {
  return {
    linkset: [
      {
        anchor: `${site.url}/`,
        item: [
          {
            href: `${site.url}/openapi.json`,
            type: 'application/openapi+json',
          },
          {
            href: `${site.url}/rss.xml`,
            type: 'application/rss+xml',
          },
          {
            href: `${site.url}/llms.txt`,
            type: 'text/plain',
          },
        ],
      },
    ],
  };
}

export function siteJsonLd(): string {
  const sameAs = profile.socials.filter((s) => s.url.startsWith('http')).map((s) => s.url);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${site.url}/#website`,
        url: site.url,
        name: site.title,
        description: site.description,
        inLanguage: ['en'],
        publisher: { '@id': `${site.url}/#person` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${site.url}${SEARCH_PATH}?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Person',
        '@id': `${site.url}/#person`,
        name: profile.name,
        alternateName: profile.chineseName,
        url: site.url,
        email: profile.email,
        description: profile.bio,
        jobTitle: 'iOS developer',
        sameAs,
        knowsAbout: skills.map((s) => s.name ?? s.name),
        contactPoint: {
          '@type': 'ContactPoint',
          email: profile.email,
          contactType: 'author',
          url: `${site.url}${CONTACT_PATH}`,
        },
      },
    ],
  };
  return JSON.stringify(graph).replace(/</g, '\\u003c');
}

export function docJsonLd(entry: DocEntry): string {
  const url = `${site.url}${docHref(entry)}`;
  const data = {
    '@context': 'https://schema.org',
    '@type': entry.data.slot === 'project' ? 'SoftwareApplication' : 'BlogPosting',
    headline: entry.data.title ?? entry.data.title,
    description: entry.data.description ?? entry.data.description,
    url,
    datePublished: entry.data.date?.toISOString(),
    dateModified: (entry.data.updated ?? entry.data.date)?.toISOString(),
    inLanguage: ['en'],
    author: { '@id': `${site.url}/#person` },
    publisher: { '@id': `${site.url}/#person` },
    mainEntityOfPage: url,
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
