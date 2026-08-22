/**
 * Machine-readable surface for agents: markdown bodies, llms.txt, sitemap,
 * OpenAPI, RFC 9727 catalog, JSON-LD, and the 404 recovery note.
 * This is a publication, not a product API — do not invent MCP/OAuth/webhooks.
 */
import { readFile } from 'node:fs/promises';
import { profile, site, skills } from '@/data/profile';
import { docHref, docsBySlot, isIndexed, type DocEntry } from '@/lib/docs';
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
  return lang === 'zh' ? zh : en || zh;
}

async function entrySource(entry: DocEntry): Promise<string> {
  const withMeta = entry as DocEntry & { body?: string; filePath?: string };
  if (withMeta.filePath) {
    try {
      return stripFrontmatter(await readFile(withMeta.filePath, 'utf8'));
    } catch {
      /* fall through */
    }
  }
  return withMeta.body ?? '';
}

export async function docMarkdown(entry: DocEntry, lang: AgentLang): Promise<string> {
  const title = lang === 'zh' ? entry.data.title : (entry.data.titleEn ?? entry.data.title);
  const description =
    lang === 'zh' ? entry.data.description : (entry.data.descriptionEn ?? entry.data.description);
  const body = mdxBodyToMarkdown(await entrySource(entry), lang);
  const lines = [`# ${title}`, '', description];
  if (body) lines.push('', body);
  return `${lines.join('\n').trim()}\n`;
}

const githubUrl =
  profile.socials.find((s) => s.icon === 'github')?.url ?? 'https://github.com/ethanchangit';
const twitterUrl =
  profile.socials.find((s) => s.icon === 'twitter')?.url ?? 'https://twitter.com/ethanchang_';

function homeMarkdown(lang: AgentLang): string {
  const doing = lang === 'zh' ? copy['zh-CN'] : copy.en;
  const lead = lang === 'zh' ? copy['zh-CN'].aboutLead : copy.en.aboutLead;
  const skillLines = skills.map((s) => `- ${lang === 'zh' ? s.name : (s.nameEn ?? s.name)}`);
  if (lang === 'zh') {
    return `# ${profile.name} · ${profile.chineseName}

${lead}

## 我在做什么

- ${doing.aboutIos}
- ${doing.aboutAi}
- ${doing.aboutPkm}

## 怎么读这个网站

### 文章和项目

文章在 ${ARTICLES_PATH}，项目在 ${PROJECTS_PATH}。Now 页是 ${NOW_PATH}：最近在做什么，不是简历。

### 给机器看的副本

同一 URL 在 \`Accept: text/markdown\` 时返回 Markdown。目录在 [/llms.txt](/llms.txt)，开发者资源在 [${FOR_AGENTS_PATH}](${FOR_AGENTS_PATH})。写信用 [${CONTACT_PATH}](${CONTACT_PATH})，隐私说明在 [${PRIVACY_PATH}](${PRIVACY_PATH})。

## 技术栈

${skillLines.join('\n')}
`;
  }
  return `# ${profile.name} · ${profile.chineseName}

${lead}

## What I do

- ${doing.aboutIos}
- ${doing.aboutAi}
- ${doing.aboutPkm}

## How to read this site

### Articles and projects

Essays live at ${ARTICLES_PATH}. Software lineage lives at ${PROJECTS_PATH}. The living status page is ${NOW_PATH}: what I am doing lately, not a CV.

### Machine-readable copies

The same URL serves Markdown when the client sends \`Accept: text/markdown\`. Start at [/llms.txt](/llms.txt). The machine-readable stack is documented at [ethanchang.io developer resources](${FOR_AGENTS_PATH}). Write to [${CONTACT_PATH}](${CONTACT_PATH}). Privacy is at [${PRIVACY_PATH}](${PRIVACY_PATH}).

## Stack

${skillLines.join('\n')}
`;
}

export function contactMarkdown(lang: AgentLang): string {
  if (lang === 'zh') {
    return `# 联系

这是 Ethan Chang（张峻源）的个人博客。要讨论文章、项目、纠错或转载，请写信到 [${profile.email}](mailto:${profile.email})。

我不住在一个对公众开放的办公室里，所以这里没有街道地址、没有工单系统、也没有会把信发进虚空的表单。邮件就是收件箱。GitHub 是 [${githubUrl}](${githubUrl})，X 是 [${twitterUrl}](${twitterUrl})。

留言功能（文章页底部）同样送到这个邮箱，不会出现在页面上。登录（GitHub / Google）只为可选的收藏和阅读进度，不是对外产品账号体系。

如果你是 agent：先读 [/llms.txt](/llms.txt) 和 [${FOR_AGENTS_PATH}](${FOR_AGENTS_PATH})，再决定要不要写信。
`;
  }
  return `# Contact

This is Ethan Chang's personal blog. For essays, projects, corrections, or reuse, email [${profile.email}](mailto:${profile.email}).

There is no public office, no ticket queue, and no form that posts into the void. Email is the inbox. GitHub is [${githubUrl}](${githubUrl}). X is [${twitterUrl}](${twitterUrl}).

The comment box at the bottom of an article goes to the same inbox and is not published on the page. GitHub / Google sign-in exists only for optional bookmarks and reading progress — it is not a product identity platform.

If you are an agent: read [/llms.txt](/llms.txt) and [ethanchang.io developer resources](${FOR_AGENTS_PATH}) before you write.
`;
}

export function privacyMarkdown(lang: AgentLang): string {
  if (lang === 'zh') {
    return `# 隐私

ethanchang.io 是一份个人博客。默认情况下，阅读文章不需要账号，我也不在页面上放第三方广告或分析像素。托管在 Cloudflare 上，因此边缘会有常规的请求日志（IP、User-Agent、路径）用于安全和性能；这些日志由 Cloudflare 按其政策处理，我不用它们做营销画像。

可选登录走 GitHub 或 Google OAuth。登录后，Cloudflare D1 会保存会话，以及你选择同步的收藏和阅读进度。不登录就不写这些记录。没有标注、没有公开的阅读排行、没有把进度卖给任何人。

文章页的留言会发到 ${profile.email}。留言正文和你留下的名字、邮箱只用于回复，不会出现在站点上。不要在留言里放密码或密钥。

站点提供 \`Accept: text/markdown\`、[/llms.txt](/llms.txt)、[/rss.xml](/rss.xml) 给 agent 和订阅器用。它们读取的是已经公开的页面，不另开一套私人数据。

要删除账号数据，写信到 ${profile.email}，说明是 GitHub 还是 Google 登录。我会删掉对应的会话、收藏和进度。
`;
  }
  return `# Privacy

ethanchang.io is a personal blog. Reading does not require an account. There are no third-party ads or analytics pixels on the pages. The site is hosted on Cloudflare, so the edge keeps ordinary request logs (IP, user-agent, path) for security and performance. Cloudflare handles those logs under its own policy; I do not use them to build a marketing profile.

Optional sign-in uses GitHub or Google OAuth. After you sign in, Cloudflare D1 stores the session and any bookmarks or reading progress you choose to sync. Stay signed out and none of that is written. There are no highlights, no public reading ranks, and no sale of progress data.

Comments on an article are emailed to ${profile.email}. The message, the name, and the address you leave are for a reply, not for publication. Do not put passwords or secrets in a comment.

\`Accept: text/markdown\`, [/llms.txt](/llms.txt), and [/rss.xml](/rss.xml) exist so agents and readers can fetch pages that are already public. They do not open a second, private dataset.

To delete account data, email ${profile.email} and say whether you signed in with GitHub or Google. I will delete the matching session, bookmarks, and progress.
`;
}

export function forAgentsMarkdown(lang: AgentLang): string {
  if (lang === 'zh') {
    return `# ethanchang.io 给 agent 的开发者资源

这不是 SaaS，也没有对外 MCP 服务器。给 agent 用的表面就是这份博客已经公开的内容栈。

## 同一 URL 的 Markdown

对 HTML 文档发送 \`Accept: text/markdown\`。响应是 \`Content-Type: text/markdown; charset=utf-8\`，并且 \`Vary\` 包含 \`Accept\`。浏览器的 \`Accept: text/html, …, */*\` 仍拿到 HTML。只接受既非 HTML 也非 Markdown 的类型时返回 406。

也可以直接请求 \`/index.md\`、\`/articles/<slug>.md\`、\`/projects/<slug>.md\`。

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

写信：[${CONTACT_PATH}](${CONTACT_PATH})。隐私：[${PRIVACY_PATH}](${PRIVACY_PATH})。身份页是 \`/\`。
`;
  }
  return `# ethanchang.io developer resources

This is a publication, not a SaaS, and it does not run a public MCP server. The surface for agents is the machine-readable copy of pages that already exist for humans.

## Markdown at the same URL

Send \`Accept: text/markdown\` to an HTML document. The response is \`Content-Type: text/markdown; charset=utf-8\` and \`Vary\` includes \`Accept\`. A browser \`Accept: text/html, …, */*\` still gets HTML. A client that rejects both HTML and Markdown gets 406.

Sibling files also exist: \`/index.md\`, \`/articles/<slug>.md\`, \`/projects/<slug>.md\`.

## Discovery

- [/llms.txt](/llms.txt) — when to use this site, and the main doors
- [/llms-full.txt](/llms-full.txt) — published essays and projects concatenated
- [/sitemap.xml](/sitemap.xml)
- [/rss.xml](/rss.xml)
- [/robots.txt](/robots.txt)
- [/openapi.json](/openapi.json) — the interfaces that actually exist
- [/.well-known/api-catalog](/.well-known/api-catalog) — RFC 9727 catalog

## Real interfaces that are not a product

\`POST /api/comments\` emails a note to the inbox and does not publish it. \`GET /api/me\`, \`/api/bookmarks\`, and \`/api/progress\` need a session so a signed-in reader can sync bookmarks and progress. There is no public write API, no webhook hub, and no OAuth platform for third-party apps. Do not invent an MCP server to chase a score.

## For humans

Email: [${CONTACT_PATH}](${CONTACT_PATH}). Privacy: [${PRIVACY_PATH}](${PRIVACY_PATH}). The identity page is \`/\`.
`;
}

function nowMarkdown(lang: AgentLang): string {
  if (lang === 'zh') {
    return `# Now

这是一页 Now：最近在做什么。格式来自 https://nownownow.com/about。

完整句子在 [${NOW_PATH}](${NOW_PATH})。这里只声明它存在，好让 agent 不必把首页误当成状态页。
`;
  }
  return `# Now

This is a Now page: what I am doing lately. The format comes from https://nownownow.com/about.

The living sentences are on [${NOW_PATH}](${NOW_PATH}). This file exists so an agent does not have to treat the identity page as a status page.
`;
}

function shortIndexMarkdown(title: string, description: string, path: string): string {
  return `# ${title}\n\n${description}\n\nHTML: ${path}\n`;
}

export type MarkdownPage = { slug: string; body: string };

export async function agentMarkdownPages(): Promise<MarkdownPage[]> {
  const [articles, projects] = await Promise.all([docsBySlot('article'), docsBySlot('project')]);
  const pages: MarkdownPage[] = [];

  const staticPages: { path: string; en: string; zh: string }[] = [
    { path: '/', en: homeMarkdown('en'), zh: homeMarkdown('zh') },
    { path: NOW_PATH, en: nowMarkdown('en'), zh: nowMarkdown('zh') },
    { path: CONTACT_PATH, en: contactMarkdown('en'), zh: contactMarkdown('zh') },
    { path: PRIVACY_PATH, en: privacyMarkdown('en'), zh: privacyMarkdown('zh') },
    { path: FOR_AGENTS_PATH, en: forAgentsMarkdown('en'), zh: forAgentsMarkdown('zh') },
    {
      path: ARTICLES_PATH,
      en: shortIndexMarkdown('Articles', copy.en.articlesDesc, ARTICLES_PATH),
      zh: shortIndexMarkdown('文章', copy['zh-CN'].articlesDesc, ARTICLES_PATH),
    },
    {
      path: PROJECTS_PATH,
      en: shortIndexMarkdown('Projects', copy.en.projectsDesc, PROJECTS_PATH),
      zh: shortIndexMarkdown('项目', copy['zh-CN'].projectsDesc, PROJECTS_PATH),
    },
    {
      path: BLOGS_PATH,
      en: shortIndexMarkdown('Blogs', copy.en.blogsDesc, BLOGS_PATH),
      zh: shortIndexMarkdown('博客', copy['zh-CN'].blogsDesc, BLOGS_PATH),
    },
    {
      path: SEARCH_PATH,
      en: shortIndexMarkdown('Search', copy.en.searchDesc, SEARCH_PATH),
      zh: shortIndexMarkdown('搜索', copy['zh-CN'].searchDesc, SEARCH_PATH),
    },
    {
      path: TAGS_PATH,
      en: shortIndexMarkdown('Tags', copy.en.tagsDesc, TAGS_PATH),
      zh: shortIndexMarkdown('标签', copy['zh-CN'].tagsDesc, TAGS_PATH),
    },
    {
      path: '/lab',
      en: shortIndexMarkdown('Component lab', copy.en.labDesc, '/lab'),
      zh: shortIndexMarkdown('组件试验场', copy['zh-CN'].labDesc, '/lab'),
    },
  ];

  for (const page of staticPages) {
    pages.push({ slug: page.path === '/' ? 'index' : page.path.slice(1), body: page.en });
    pages.push({
      slug: page.path === '/' ? 'zh' : `zh${page.path}`,
      body: page.zh,
    });
  }

  for (const entry of articles) {
    if (/^\d+$/.test(entry.id)) continue;
    const href = docHref(entry);
    pages.push({ slug: href.slice(1), body: await docMarkdown(entry, 'en') });
    pages.push({ slug: `zh${href}`, body: await docMarkdown(entry, 'zh') });
  }
  for (const entry of projects) {
    const href = docHref(entry);
    pages.push({ slug: href.slice(1), body: await docMarkdown(entry, 'en') });
    pages.push({ slug: `zh${href}`, body: await docMarkdown(entry, 'zh') });
  }

  return pages;
}

export async function sitemapUrls(): Promise<{ loc: string; lastmod?: string }[]> {
  const [articles, projects] = await Promise.all([docsBySlot('article'), docsBySlot('project')]);
  const paths = new Set<string>([
    '/',
    ARTICLES_PATH,
    PROJECTS_PATH,
    BLOGS_PATH,
    NOW_PATH,
    CONTACT_PATH,
    PRIVACY_PATH,
    FOR_AGENTS_PATH,
    SEARCH_PATH,
    TAGS_PATH,
    '/lab',
  ]);
  const lastmod = new Map<string, string>();

  for (const entry of [...articles, ...projects]) {
    if (entry.data.slot === 'article' && /^\d+$/.test(entry.id)) continue;
    const href = docHref(entry);
    paths.add(href);
    const stamp = entry.data.updated ?? entry.data.date;
    if (stamp) lastmod.set(href, stamp.toISOString());
  }

  const urls: { loc: string; lastmod?: string }[] = [];
  for (const path of [...paths].sort()) {
    for (const locale of ['en', 'zh'] as const) {
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
    docsBySlot('project'),
  ]);
  const articleLines = articles
    .filter((entry) => !entry.id.startsWith('dummy-'))
    .sort((a, b) => (b.data.date?.valueOf() ?? 0) - (a.data.date?.valueOf() ?? 0))
    .map((entry) => `- [${entry.data.titleEn ?? entry.data.title}](${site.url}${docHref(entry)})`);
  const projectLines = projects.map(
    (entry) => `- [${entry.data.titleEn ?? entry.data.title}](${site.url}${docHref(entry)})`,
  );

  return `# Ethan Chang

Ethan Chang (张峻源) writes at ${site.url}. Native iOS apps, LLM and voice tools, personal knowledge management. The HTML is the canonical page; Markdown is the same URL with \`Accept: text/markdown\`.

## When to use ethanchang.io

Use this site when you need how Ethan actually runs PKM (Obsidian, Heptabase), project notes for the software on /projects, or the living Now page for what he is doing this month. Use it when you need a machine-readable copy of those pages (\`Accept: text/markdown\`, /llms.txt, /rss.xml) rather than a screenshot of the layout.

Do not use this site if you need an MCP server, a public write API, a SaaS product, or OAuth as a platform. GitHub/Google login exists only so a reader can sync optional bookmarks and progress. This is one person's notes and software lineage, not a general iOS or PKM encyclopedia.

## Main pages

- [Home / about](${site.url}/)
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
  for (const entry of [...articles.filter(isIndexed), ...projects]) {
    parts.push('---', '', await docMarkdown(entry, 'en'), '');
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
        description: site.descriptionEn,
        inLanguage: ['en', 'zh-CN'],
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
        description: profile.bioEn,
        jobTitle: 'iOS developer',
        sameAs,
        knowsAbout: skills.map((s) => s.nameEn ?? s.name),
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
    headline: entry.data.titleEn ?? entry.data.title,
    description: entry.data.descriptionEn ?? entry.data.description,
    url,
    datePublished: entry.data.date?.toISOString(),
    dateModified: (entry.data.updated ?? entry.data.date)?.toISOString(),
    inLanguage: ['en', 'zh-CN'],
    author: { '@id': `${site.url}/#person` },
    publisher: { '@id': `${site.url}/#person` },
    mainEntityOfPage: url,
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
