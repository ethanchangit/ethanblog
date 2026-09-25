// Local sample blog only. preview.mjs and astro dev serve it. Production publish never imports this file.
import { parseMdx } from '../core.mjs';
import { seedSampleReview } from './sample-review.mjs';
import { fixture } from './test-fixtures.mjs';

const ID_PART = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
let seeded;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function chineseDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!match) return '';
  return `${match[1]} 年 ${Number(match[2])} 月 ${Number(match[3])} 日`;
}

function englishDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date);
}

function sourceId(id) {
  return String(id).replace(/\/[a-z]{2,3}$/, '');
}

function isEnglishDoc(doc) {
  return doc.language === 'en' && Boolean(doc.translationOf);
}

function cardIdOf(doc) {
  const link = String(doc.cardLink || '');
  const match = /^heptabase:\/\/card\/([0-9a-f-]+)$/i.exec(link);
  return match ? match[1].toLowerCase() : '';
}

function mentionHref(docs, id) {
  const key = String(id || '').toLowerCase();
  const doc = docs.find((item) => cardIdOf(item) === key);
  return doc ? previewHref(doc.collection, sourceId(doc.id)) : '';
}

function keepLink(html) {
  return `\u0000${html}\u0000`;
}

function inline(text, docs = []) {
  const kept = [];
  const source = String(text)
    .replace(/<hepta-mention\b([^>]*)>([\s\S]*?)<\/hepta-mention>/gi, (whole, attrs, inner) => {
      const id = /(?:^|\s)id\s*=\s*(["'])([^"']+)\1/.exec(attrs)?.[2] || '';
      const href = mentionHref(docs, id);
      if (!href) return inner;
      kept.push(`<a href="${escapeHtml(href)}" data-doc-mention>${escapeHtml(inner)}</a>`);
      return keepLink(kept.length - 1);
    })
    .replace(/<a\b([^>]*\bdata-doc-mention\b[^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs, inner) => {
      const href = /\bhref\s*=\s*"([^"]*)"/.exec(attrs)?.[1] || '';
      if (!href) return inner;
      kept.push(`<a href="${escapeHtml(href)}" data-doc-mention>${escapeHtml(inner)}</a>`);
      return keepLink(kept.length - 1);
    })
    .replace(/<[^>\n]+>/g, '');
  return escapeHtml(source).replace(/\u0000(\d+)\u0000/g, (_, index) => kept[Number(index)]);
}

function renderTable(rows, docs) {
  const parsed = rows
    .map((row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^:?-+:?$/.test(cell)));
  if (!parsed.length) return '';
  const [head, ...body] = parsed;
  const cells = (tag, row) => row.map((cell) => `<${tag}>${inline(cell, docs)}</${tag}>`).join('');
  return `<table><thead><tr>${cells('th', head)}</tr></thead><tbody>${body.map((row) => `<tr>${cells('td', row)}</tr>`).join('')}</tbody></table>`;
}

function renderBody(markdown, docs = []) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.trimStart().startsWith('|')) {
      const rows = [];
      while (index < lines.length && lines[index].trimStart().startsWith('|')) rows.push(lines[index++]);
      html.push(renderTable(rows, docs));
      continue;
    }
    const heading = /^(#{1,3}) /.exec(line);
    if (heading) {
      const level = heading[1].length + 1;
      html.push(`<h${level}>${inline(line.slice(heading[0].length), docs)}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^[-*] /.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*] /.test(lines[index])) items.push(`<li>${inline(lines[index++].slice(2), docs)}</li>`);
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !lines[index].trimStart().startsWith('|') && !/^#{1,3} /.test(lines[index]) && !/^[-*] /.test(lines[index])) {
      paragraph.push(lines[index++]);
    }
    const text = inline(paragraph.join('\n'), docs);
    if (text.trim()) html.push(`<p>${text}</p>`);
  }
  return html.join('\n');
}

function previewHref(collection, id) {
  return `/sample-blog/${collection}/${id.split('/').map(encodeURIComponent).join('/')}`;
}

function readDocs(local) {
  const files = local.filesFor(local.refs.get('main'));
  const docs = [];
  for (const filePath of Object.keys(files)) {
    const match = /^src\/content\/(articles|projects|pages)\/(.+)\.mdx$/.exec(filePath);
    if (!match || !match[2].split('/').every((part) => ID_PART.test(part))) continue;
    const parsed = parseMdx(local.text(filePath, 'main'));
    const data = parsed.frontmatter;
    docs.push({
      collection: match[1],
      id: match[2],
      slot: data.slot,
      title: String(data.title || match[2]),
      description: String(data.description || ''),
      date: String(data.date || ''),
      draft: data.draft === true,
      listed: data.listed !== false,
      language: typeof data.language === 'string' ? data.language : '',
      translationOf: typeof data.translationOf === 'string' ? data.translationOf : '',
      cardLink: typeof data.heptabaseCardLink === 'string' ? data.heptabaseCardLink : '',
      url: typeof data.url === 'string' ? data.url : '',
      body: parsed.bodyZh,
    });
  }
  return docs;
}

async function sampleLocal() {
  if (!seeded) {
    seeded = (async () => {
      const local = await fixture();
      seedSampleReview(local);
      return local;
    })();
  }
  return seeded;
}

function page(lang, title, body) {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<script>
try {
  var stored = localStorage.getItem('theme');
  var dark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = stored === 'light' || stored === 'dark' ? stored : (dark ? 'dark' : 'light');
} catch (e) {}
</script>
<style>
:root, [data-theme="light"] { color-scheme: light; --theme-surface-950: rgb(255 255 255); --theme-ink-100: rgb(23 23 23); --theme-ink-400: rgb(115 115 115); }
[data-theme="dark"] { color-scheme: dark; --theme-surface-950: rgb(25 25 25); --theme-ink-100: rgb(241 245 249); --theme-ink-400: rgb(148 163 184); }
html { background: var(--theme-surface-950); color: var(--theme-ink-100); }
body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif; }
main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.5rem 4.5rem; }
a { color: inherit; }
h1 { margin: 0 0 1.5rem; font-size: 1.875rem; font-weight: 600; letter-spacing: -0.02em; }
h2 { margin: 2rem 0 0.25rem; font-size: 1.25rem; font-weight: 600; }
h3 { margin: 0; font-size: 1.125rem; font-weight: 600; }
.note, .meta, .desc { color: var(--theme-ink-400); }
.note { margin: 0 0 2rem; font-size: 0.875rem; }
.entry { display: block; padding: 0.9rem 0; text-decoration: none; }
.entry .desc, .entry .meta { margin: 0.35rem 0 0; font-size: 0.875rem; line-height: 1.6; }
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
article p, article li { line-height: 1.75; }
article ul { padding-left: 1.2rem; }
table { width: 100%; border-collapse: collapse; margin: 1rem 0 1.25rem; }
th, td { padding: 0.35rem 1rem 0.35rem 0; text-align: left; vertical-align: top; }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

function publicPath(doc) {
  const id = sourceId(doc.id);
  if (doc.url) return `/${doc.url}`;
  return `/${id}`;
}

function indexHtml(docs, lang = 'zh', chineseOrigin = '') {
  const articles = docs
    .filter((doc) => doc.collection === 'articles' && doc.slot === 'article' && !doc.draft && doc.listed && !doc.translationOf)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title, 'zh'));
  const pages = docs
    .filter((doc) => doc.collection === 'pages' && doc.slot === 'page' && doc.id !== 'blogs' && !doc.draft && !doc.translationOf)
    .sort((a, b) => a.title.localeCompare(b.title, 'zh'));
  if (lang === 'en') return englishIndex(docs, articles, chineseOrigin);
  const years = [];
  for (const article of articles) {
    const year = /^(\d{4})/.exec(article.date)?.[1] || '';
    const group = years.find((item) => item.year === year);
    const entry = `<a class="entry" href="${previewHref('articles', article.id)}"><h3>${escapeHtml(article.title)}</h3>${article.description ? `<p class="desc">${escapeHtml(article.description)}</p>` : ''}${article.date ? `<p class="meta">${escapeHtml(chineseDate(article.date))}</p>` : ''}</a>`;
    if (group) group.html.push(entry);
    else years.push({ year, html: [entry] });
  }
  const articleHtml = years.map((group) => `<section>${group.year ? `<h2>${escapeHtml(group.year)}</h2>` : ''}${group.html.join('')}</section>`).join('');
  const pageHtml = pages.length
    ? `<section><h2>页面</h2>${pages.map((doc) => `<a class="entry" href="${previewHref('pages', doc.id)}"><h3>${escapeHtml(doc.title)}</h3></a>`).join('')}</section>`
    : '';
  return page('zh-CN', '文章', `<p class="note">本地示例。内容来自审核用的假数据，不会发布。</p><h1>文章</h1>${articleHtml}${pageHtml}`);
}

function englishIndex(docs, chineseArticles, chineseOrigin) {
  const translated = docs.filter((doc) => isEnglishDoc(doc) && !doc.draft);
  const section = (heading, items) => items.length ? `<section><h2>${heading}</h2>${items.join('')}</section>` : '';
  const entry = (doc) => `<a class="entry" href="/sample-blog/${doc.collection}/${sourceId(doc.id)}"><h3>${escapeHtml(doc.title)}</h3>${doc.description ? `<p class="desc">${escapeHtml(doc.description)}</p>` : ''}${doc.date ? `<p class="meta">${escapeHtml(englishDate(doc.date))}</p>` : ''}</a>`;
  const group = (collection) => translated.filter((doc) => doc.collection === collection).sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title, 'en'));
  const translatedSources = new Set(translated.filter((doc) => doc.collection === 'articles').map((doc) => sourceId(doc.id)));
  const chineseOnly = chineseArticles
    .filter((doc) => !translatedSources.has(doc.id))
    .map((doc) => `<a class="entry" href="${chineseOrigin}/sample-blog/articles/${encodeURIComponent(doc.id)}"><h3>${escapeHtml(doc.title)}</h3>${doc.date ? `<p class="meta">${escapeHtml(englishDate(doc.date))}</p>` : ''}</a>`);
  return page('en', 'Articles', `<p class="note">Local sample. The copy comes from the review fixture and is not published.</p><h1>Articles</h1>${section('Articles', group('articles').map(entry))}${section('Projects', group('projects').map(entry))}${section('Pages', group('pages').map(entry))}${chineseOnly.length ? `<section>${chineseOnly.join('')}</section>` : ''}`);
}

function docHtml(doc, lang = 'zh', docs = []) {
  if (lang === 'en') {
    const kind = doc.collection === 'projects' ? 'Project' : doc.collection === 'pages' ? 'Page' : 'Article';
    const typeName = doc.language ? `Translation · ${doc.language}` : kind;
    return page('en', doc.title, `<p class="back"><a href="/sample-blog/">← Articles</a></p><h1>${escapeHtml(doc.title)}</h1><section class="meta"><p>Properties</p><p>Type ${escapeHtml(typeName)}</p><p>Address ${escapeHtml(publicPath(doc))}</p>${doc.date ? `<p>Published ${escapeHtml(englishDate(doc.date))}</p>` : ''}</section><article>${renderBody(doc.body, docs)}</article>`);
  }
  const back = '/sample-blog/';
  return page('zh-CN', doc.title, `<p class="back"><a href="${back}">← 文章</a></p><h1>${escapeHtml(doc.title)}</h1>${doc.date ? `<p class="meta">${escapeHtml(chineseDate(doc.date))}</p>` : ''}${doc.description ? `<p class="desc">${escapeHtml(doc.description)}</p>` : ''}<article>${renderBody(doc.body, docs)}</article>`);
}

function hostLang(url) {
  const name = url.hostname.toLowerCase();
  return name === 'ethanchang.io' || name === 'www.ethanchang.io' || name.startsWith('en.') ? 'en' : 'zh';
}

export async function sampleBlogResponse(requestUrl, local = null) {
  const url = new URL(requestUrl, 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/'; }
  catch { return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }); }
  if (pathname !== '/sample-blog' && !pathname.startsWith('/sample-blog/')) return null;
  const source = local || await sampleLocal();
  const docs = readDocs(source);
  const lang = hostLang(url);
  let status = 200;
  let html;
  if (pathname === '/sample-blog') {
    const chineseOrigin = `${url.protocol}//${url.hostname.replace(/^en\./, '')}${url.port ? `:${url.port}` : ''}`;
    html = indexHtml(docs, lang, chineseOrigin);
  } else {
    const match = /^\/sample-blog\/(articles|projects|pages)\/(.+)$/.exec(pathname);
    const id = match?.[2] || '';
    const valid = match && id.split('/').every((part) => ID_PART.test(part));
    const doc = valid ? docs.find((item) => item.collection === match[1] && item.id === id && !item.translationOf) : null;
    const english = valid && lang === 'en' ? docs.find((item) => item.collection === match[1] && isEnglishDoc(item) && sourceId(item.id) === id) : null;
    if (lang === 'en') {
      if (english) html = docHtml(english, 'en', docs);
      else if (doc) {
        const chinese = new URL(url.href);
        chinese.hostname = url.hostname.replace(/^en\./, '');
        return new Response(null, { status: 302, headers: { location: chinese.href, 'cache-control': 'no-store' } });
      } else { status = 404; html = page('en', 'Page not found', '<h1>Page not found</h1>'); }
    } else if (!doc) { status = 404; html = page('zh-CN', '找不到页面', '<h1>找不到页面</h1>'); }
    else html = docHtml(doc, 'zh', docs);
  }
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}
