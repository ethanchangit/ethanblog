// Local integration preview only: all GitHub and Heptabase writes stay in memory.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { assets } from './assets.generated.mjs';
import { fixture, CARD, article } from './test-fixtures.mjs';
import { serializeMdx } from '../core.mjs';

const local = await fixture(assets);
local.env.STUDIO_LOCAL_PREVIEW = true;
globalThis.fetch = local.fetcher;
await local.login(); await local.connect();
const child = '9732c208-c3b1-4a7b-a922-0c3483475d6b';
const fresh = '122560bd-b99f-4fb9-9fa5-742090feacb1', rejected = '34adea15-b8fa-49a2-9e90-922a661d7790';
local.properties.set(CARD, { Status: 'review', 'Publish Date': { start: '2024-02-01T00:00:00Z' }, Tag: ['Mission'] });
local.properties.set(fresh, { Status: 'review', Tag: ['AI Native'] });
local.properties.set(rejected, { Status: 'review', Tag: [] });
const first = '知识管理并不是把更多资料放进一个地方，而是让已有的想法发生连接。';
const last = '好的系统应该让写作更自然，而不是让整理本身成为负担。';
const table = '| 阶段 | 做法 |\n| --- | --- |\n| 写作 | 从一个问题开始 |\n| 发布 | 检查正文与引用 |';
local.remote(article.replace('title: 测试文章', 'title: 知识管理，先从连接开始').replace('draft: true', 'draft: false').replace('中文正文。', `${first}\n\n过去，我会每周整理一次所有笔记，再为它们添加分类。\n\n${table}\n\n${last}`));
local.setSource(`# 知识管理，先从连接开始\n\n${first}\n\n现在，我会从正在写的文章出发，只整理当下真正用得上的笔记。\n\n${last}\n\n${table}\n\n## 把连接带给读者\n\n文章提到的资料可以跟随正文发布，但不需要进入博客列表。`);
local.cardSources.set(fresh, `# 将笔记变成可以分享的文章\n\n写作不必从一张白纸开始。很多时候，一篇文章早已藏在日常积累的卡片之间。\n\n## 从一条连接开始\n\n先找到一个值得表达的问题，再把与它相关的想法放在一起。\n\n<hepta-mention type="card" id="${child}">原子笔记与连接</hepta-mention>\n\n发布之前，再检查一次：这些资料是否都可以公开？`);
local.cardSources.set(child, '# 原子笔记与连接\n\n一张卡片只回答一个问题。卡片之间的连接，则让这些回答组成更大的思考。\n\n- 保留清晰的标题\n- 让每条连接都有理由\n- 发布前检查隐私');
local.cardSources.set(rejected, '# 一次还没想清楚的尝试\n\n这是一张用于演示拒绝操作的卡片，尚未进入任何公开版本。');
const tagsOnly = '6b6309a2-43a9-4c85-9b4f-037dcb0f898b';
const tagTitle = '让标签跟着想法生长', tagBody = '标签不是一次完成的分类。随着理解加深，我们可以重新整理文章之间的关系，而不必改动正文。';
local.remote(serializeMdx({ frontmatter: { slot: 'article', title: tagTitle, description: '调整分类，不必重写文章。', date: '2024-03-12', created: '2026-09-21T00:00:00Z', updated: '2026-09-21T00:00:00Z', tags: ['Mission', 'AI Native'], heptabaseType: 'article', heptabaseCardLink: `heptabase://card/${tagsOnly}` }, bodyZh: tagBody }), 'src/content/articles/growing-tags.mdx');
local.properties.set(tagsOnly, { Status: 'review', 'Publish Date': { start: '2024-03-12T00:00:00Z' }, Tag: ['Mission', 'Productivity'], Summary: '调整分类，不必重写文章。' });
local.cardSources.set(tagsOnly, `# ${tagTitle}\n\n${tagBody}`);
const untagged = '411f45cb-1296-48d2-b32b-a30d1546d2b6', deleted = '7ece4d64-b906-4e1a-a836-bfb57b19d24d', retiredRef = 'a6d72b42-2cf7-437d-99f1-dce55a667e90';
for (const [id, title, body, listed] of [
  [untagged, '已经不再公开的旧笔记', `这篇笔记仍保留在 Heptabase，但已经移除了 #blog。\n\n<DocList pane="embed">\n<DocRef of="articles/hepta-${retiredRef}" />\n</DocList>`, true],
  [deleted, '已在 Heptabase 删除的文章', '这是 GitHub 保留的上一版正文。Heptabase 中的原卡片已经删除。', true],
  [retiredRef, '仅由旧笔记引用的资料', '这份资料不再被其他公开文章使用，会随旧笔记一起撤下。', false],
]) {
  local.remote(serializeMdx({ frontmatter: { slot: 'article', title, description: '撤下流程的本地示例。', date: '2024-01-08', listed, heptabaseCardLink: `heptabase://card/${id}` }, bodyZh: body }), `src/content/articles/hepta-${id}.mdx`);
  local.cardSources.set(id, `# ${title}\n\n${body}`);
}
local.missingCards.add(deleted);
if (process.env.STUDIO_PAGE_CAP_FIXTURE === '1') {
  for (const [id, title, slug] of [
    ['a51ada66-ee0b-4759-9b1f-830c8374fcae', '关于', 'about'],
    ['b51ada66-ee0b-4759-9b1f-830c8374fcae', 'Now', 'now'],
    ['c51ada66-ee0b-4759-9b1f-830c8374fcae', '联系', 'contact'],
    ['d51ada66-ee0b-4759-9b1f-830c8374fcae', '隐私', 'privacy'],
  ]) {
    local.properties.set(id, { Status: 'published', 'Blog Type': 'Page', 'Publish Date': { start: '2026-09-21T00:00:00.000Z' } });
    local.cardSources.set(id, `# ${title}\n\n${title}页。`);
    local.remote(`---\nslot: page\ntitle: ${title}\ndescription: ${title}\ndate: 2026-09-21\nheptabaseCardLink: heptabase://card/${id}\n---\n\n${title}页。\n`, `src/content/pages/${slug}.mdx`);
  }
  const extra = 'e51ada66-ee0b-4759-9b1f-830c8374fcae';
  local.properties.set(extra, { Status: 'review', 'Blog Type': 'Page' });
  local.cardSources.set(extra, '# 读书笔记\n\n新的站点页。');
}
local.remote(`---\nslot: page\ntitle: 博客\n---\n\n<DocList>\n<DocRef of="articles/hepta-${untagged}" />\n<DocRef of="articles/hepta-${deleted}" />\n</DocList>\n`, 'src/content/pages/blogs.mdx');
const server = createServer(async (req, res) => {
  try {
    if (/^\/_astro\/[A-Za-z0-9_.-]+$/.test(req.url)) {
      const bytes = await readFile(new URL(`../../dist${req.url}`, import.meta.url));
      res.writeHead(200, { 'content-type': req.url.endsWith('.css') ? 'text/css' : req.url.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); res.end(bytes); return;
    }
    // Only this loopback-only simulator has test controls, never the deployed handler.
    if (req.url === '/__test/deploy' && req.method === 'POST') { local.deploy(); res.end('ok'); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const host = req.headers.host || `localhost:${server.address().port}`;
    const request = new Request(`http://${host}${req.url}`, { method: req.method, headers: req.headers, ...(body.length ? { body, duplex: 'half' } : {}) });
    const response = await local.handler(request, local.env);
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.writeHead(500); res.end(error.message); }
}).listen(Number(process.env.STUDIO_PREVIEW_PORT ?? 4350), '127.0.0.1', () => console.log(`Local simulated dashboard: http://localhost:${server.address().port}/dashboard`));
