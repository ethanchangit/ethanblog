import { legacyContentRedirect } from './routes.ts';
import type { Nodes } from 'mdast';

export type MentionKind = 'article' | 'project' | 'page' | 'reference';

export type MentionPreviewEntry = {
  /** 已去掉 hash、查询和 /en、/zh 前缀的站内路径。 */
  href: string;
  title: string;
  /** 摘要文字。空字符串表示没有摘要，预览不显示这一行，也不写占位。样式用文章页的 article-dek-text。 */
  summary: string;
  /** 构建期生成的静态正文 HTML，保留排版，不包含图片或交互组件。放不下时由浮层截断。 */
  bodyHtml: string;
  /** 类型和日期。排在正文后面；卡片放不下时不显示，避免挤掉正文。 */
  meta: string;
  /**
   * 外链的完整 URL。只有外链预览有这一项。
   * 有它时卡片只显示标题和这个地址，不显示摘要、正文或类型日期。
   */
  url?: string;
};

/** 够填满竖向卡片，并留一点给浮层截断。不把后文整篇带上。 */
const MAX_BLOCKS = 8;
const MAX_CHARS = 800;

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 摘要只做纯文本。空着就空着，不写占位。 */
export function mentionSummary(description: string): string {
  return collapse(
    description
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`]/g, ''),
  );
}

function stripMachinery(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, '\n\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .replace(/^\s*import\s.+$/gm, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\b[^>]*\bhref\s*=\s*(["'])([^"']*)\1[^>]*>([\s\S]*?)<\/a>/gi, (_, _quote, href, label) => `[${label}](${href.replace(/\(/g, '%28').replace(/\)/g, '%29')})`)
    .replace(/<\/?[A-Za-z](?:[^>"']|"[^"]*"|'[^']*')*>/g, '');
}

/** 只在构建期解析 Markdown；浏览器收到保留列表、缩进和行内格式的静态 HTML。 */
export async function mentionBodyHtml(body: string): Promise<string> {
  const [{ unified }, { default: remarkParse }, { default: remarkGfm }, { default: remarkRehype }, { default: rehypeStringify }] = await Promise.all([
    import('unified'), import('remark-parse'), import('remark-gfm'), import('remark-rehype'), import('rehype-stringify'),
  ]);
  const renderer = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify);
  const tree = renderer.parse(stripMachinery(body));
  let blocks = 0;
  let chars = 0;
  const textOf = (node: Nodes): string => 'value' in node ? node.value : 'children' in node ? node.children.map(textOf).join('') : '';
  const select = (node: Nodes): boolean => {
    if (node.type === 'definition') return true;
    if (['html', 'code', 'image', 'imageReference'].includes(node.type)) return false;
    if (node.type === 'root' || node.type === 'list' || node.type === 'listItem' || node.type === 'blockquote') {
      node.children = node.children.filter(select) as typeof node.children;
      return node.children.length > 0;
    }
    if (blocks >= MAX_BLOCKS || chars >= MAX_CHARS) return false;
    const text = textOf(node);
    if (!text.trim()) return false;
    blocks += 1;
    chars += text.length;
    return true;
  };
  const safe = (node: Nodes) => {
    if (node.type === 'link' || node.type === 'definition') {
      try {
        if (!['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(node.url, 'https://ethanchang.io').protocol)) node.url = '#';
      } catch {
        node.url = '#';
      }
    }
    if ('children' in node) node.children = node.children.filter(child => !['image', 'imageReference'].includes(child.type)) as typeof node.children;
    if ('children' in node) node.children.forEach(safe);
  };
  select(tree);
  safe(tree);
  return renderer.stringify(await renderer.run(tree));
}

/**
 * 目录键。先收成站内路径，再把旧的 /articles、/projects、/pages 前缀收成现在的公开地址。
 * 外站、邮件和锚点返回 null。悬停用这个键查构建期目录。
 */
export function mentionCatalogPath(href: string): string | null {
  const path = normalizeMentionHref(href);
  if (!path) return null;
  return legacyContentRedirect(path) ?? path;
}

const OWN_SITE_HOSTS = new Set(['ethanchang.io', 'cn.ethanchang.io', 'localhost', 'en.localhost']);

function isOwnSiteHost(hostname: string): boolean {
  return OWN_SITE_HOSTS.has(hostname);
}

/**
 * 外链预览只取链接的可见文字和解析后的完整 URL。
 * 不读取外站页面。没有可见文字、以及本站、邮件、电话、锚点，都返回 null。
 */
export function externalMention(href: string, label: string, base: string): { title: string; url: string } | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isOwnSiteHost(url.hostname)) return null;
  const title = collapse(label);
  if (!title) return null;
  return { title, url: url.href };
}

/** 站内路径。外站、邮件和锚点返回 null。 */
export function normalizeMentionHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || /^(mailto:|tel:)/i.test(trimmed)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !trimmed.startsWith('/')) {
    try {
      const url = new URL(trimmed);
      if (!isOwnSiteHost(url.hostname)) return null;
      return cleanPath(url.pathname);
    } catch {
      return null;
    }
  }
  if (!trimmed.startsWith('/')) return null;
  const path = trimmed.split(/[?#]/)[0] || '/';
  return cleanPath(path);
}

const KIND_LABEL: Record<MentionKind, Record<'zh-CN' | 'en', string>> = {
  article: { 'zh-CN': '文章', en: 'Article' },
  project: { 'zh-CN': '项目', en: 'Project' },
  page: { 'zh-CN': '页面', en: 'Page' },
  reference: { 'zh-CN': '资料', en: 'Reference' },
};

/** 与 formatDate 相同的读法。放在这里，是为了目录测试不经过 Astro 别名。 */
function previewDate(date: Date, lang: 'zh-CN' | 'en'): string {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  const dtf = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  if (lang === 'en') return dtf.format(date);
  const parts = Object.fromEntries(dtf.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year} 年 ${parts.month} 月 ${parts.day} 日`;
}

/** 类型，有日期时再接一行日期。没有日期就只有类型。 */
export function mentionMeta(kind: MentionKind, date: Date | undefined, lang: 'zh-CN' | 'en'): string {
  const label = KIND_LABEL[kind][lang];
  if (!date || Number.isNaN(date.getTime())) return label;
  return `${label} · ${previewDate(date, lang)}`;
}

function cleanPath(path: string): string {
  let next = path || '/';
  if (next.length > 1 && next.endsWith('/')) next = next.slice(0, -1);
  if (next === '/en' || next.startsWith('/en/')) next = next.slice(3) || '/';
  if (next === '/zh' || next.startsWith('/zh/')) next = next.slice(3) || '/';
  return next || '/';
}
