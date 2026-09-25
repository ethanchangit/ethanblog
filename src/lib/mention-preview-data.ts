import { getCollection } from 'astro:content';
import { docHref, includeDraftsInDev, isTranslation, sitePageHref, translationSourceId } from '@/lib/docs';
import {
  mentionMeta,
  mentionParagraphs,
  mentionSummary,
  normalizeMentionHref,
  type MentionKind,
  type MentionPreviewEntry,
} from '@/lib/mention-preview';

function pageHref(id: string): string {
  return sitePageHref(translationSourceId(id));
}

function put(
  map: Map<string, MentionPreviewEntry>,
  href: string,
  title: string,
  description: string,
  body: string | undefined,
  kind: MentionKind,
  date: Date | undefined,
  lang: 'zh-CN' | 'en',
) {
  const path = normalizeMentionHref(href);
  const label = title.trim();
  if (!path || !label) return;
  map.set(path, {
    href: path,
    title: label,
    summary: mentionSummary(description ?? ''),
    paragraphs: mentionParagraphs(body ?? ''),
    meta: mentionMeta(kind, date, lang),
  });
}

/**
 * 构建期目录。悬停时只查这份数据，不再请求 Heptabase 或外网。
 * 英文页用译文的标题和摘要盖住同一条路径。没有译文的项目和站点页仍用中文。
 */
export async function mentionPreviewEntries(lang: 'zh-CN' | 'en'): Promise<MentionPreviewEntry[]> {
  const includeDrafts = includeDraftsInDev;
  const [articles, projects, pages] = await Promise.all([
    getCollection('articles', ({ data }) => includeDrafts || !data.draft),
    getCollection('projects', ({ data }) => includeDrafts || !data.draft),
    getCollection('pages', ({ data }) => includeDrafts || !data.draft),
  ]);
  const map = new Map<string, MentionPreviewEntry>();

  for (const page of pages) {
    if (page.data.translationOf) continue;
    put(map, pageHref(page.id), page.data.title, page.data.description, page.body, 'page', page.data.date, lang);
  }
  for (const project of projects) {
    if (isTranslation(project)) continue;
    const kind: MentionKind = project.data.heptabaseType === 'reference' ? 'reference' : 'project';
    put(map, docHref(project), project.data.title, project.data.description, project.body, kind, project.data.date, lang);
  }
  const sources = articles.filter((article) => !isTranslation(article));
  for (const article of sources) {
    const kind: MentionKind = article.data.heptabaseType === 'reference' ? 'reference' : 'article';
    put(map, docHref(article), article.data.title, article.data.description, article.body, kind, article.data.date, lang);
  }
  if (lang === 'en') {
    for (const article of articles) {
      if (!article.data.translationOf || article.data.language !== 'en') continue;
      if (!includeDrafts && article.data.draft) continue;
      put(map, docHref(article), article.data.title, article.data.description, article.body, 'article', article.data.date, lang);
    }
    for (const project of projects) {
      if (!project.data.translationOf || project.data.language !== 'en') continue;
      put(map, docHref(project), project.data.title, project.data.description, project.body, 'project', project.data.date, lang);
    }
    for (const page of pages) {
      if (!page.data.translationOf || page.data.language !== 'en') continue;
      put(map, pageHref(page.id), page.data.title, page.data.description, page.body, 'page', page.data.date, lang);
    }
  }

  return [...map.values()].sort((a, b) => a.href.localeCompare(b.href));
}
