// Local review sample only. Production publish, real pulls and GitHub never import this.
import { serializeMdx } from '../core.mjs';
import { CARD, article } from './test-fixtures.mjs';

/** One dataset for the memory preview and for local dashboard design. */
export function seedSampleReview(local) {
  const child = '9732c208-c3b1-4a7b-a922-0c3483475d6b';
  const fresh = '122560bd-b99f-4fb9-9fa5-742090feacb1', rejected = '34adea15-b8fa-49a2-9e90-922a661d7790';
  const enArticle = 'e11ada66-1111-4759-8b1f-830c8374fcae';
  local.properties.set(CARD, { Status: 'review', 'Publish Date': { start: '2024-02-01T00:00:00Z' }, Tag: ['Mission'], 'blog i18n': [`card/${enArticle}`] });
  local.properties.set(fresh, { Status: 'review', Tag: ['AI Native'] });
  local.properties.set(rejected, { Status: 'review', Tag: [] });
  const first = '知识管理并不是把更多资料放进一个地方，而是让已有的想法发生连接。';
  const last = '好的系统应该让写作更自然，而不是让整理本身成为负担。';
  const table = '| 阶段 | 做法 |\n| --- | --- |\n| 写作 | 从一个问题开始 |\n| 发布 | 检查正文与引用 |';
  const publishedFirst = 'Knowledge work is linking ideas you already have.';
  const publishedOld = 'I used to file every note once a week, then sort them into categories.';
  const publishedLast = 'A good system makes writing feel natural, not like another chore.';
  const publishedTable = '| Stage | Practice |\n| --- | --- |\n| Writing | Start from a question |\n| Publishing | Check the text and its references |';
  const publishedNext = 'I now start from the piece I am writing, and only sort the notes it actually needs.';
  local.remote(article.replace('title: 测试文章', 'title: Start with connections').replace('draft: true', 'draft: false').replace('中文正文。', `${publishedFirst}\n\n${publishedOld}\n\n${publishedTable}\n\n${publishedLast}`));
  local.i18n.set(enArticle, { Language: 'en' });
  const englishBody = `${publishedFirst}\n\n${publishedNext}\n\n${publishedLast}\n\n${publishedTable}\n\n## Bring the links to the reader\n\nNotes mentioned in the piece can ship with it, without joining the blog list.`;
  local.cardSources.set(enArticle, `# Start with connections\n\n${englishBody}`);
  local.remote(serializeMdx({ frontmatter: { slot: 'article', title: 'Start with connections', description: '', date: '2024-02-01', tags: ['Mission'], draft: false, listed: false, language: 'en', translationOf: `heptabase://card/${CARD}`, heptabaseType: 'article', heptabaseCardLink: `heptabase://card/${enArticle}` }, bodyZh: englishBody }), 'src/content/articles/example/en.mdx');
  const projectCard = 'c31ada66-3333-4759-8b1f-830c8374fcae', enProject = 'c41ada66-4444-4759-8b1f-830c8374fcae';
  local.properties.set(projectCard, { Status: 'published', 'Blog Type': 'Project', 'Publish Date': { start: '2024-05-01T00:00:00.000Z' }, 'blog i18n': [`card/${enProject}`] });
  local.cardSources.set(projectCard, '# 痕迹\n\n一个还在继续的项目。');
  local.remote(serializeMdx({ frontmatter: { slot: 'project', title: '痕迹', description: '一个还在继续的项目。', date: '2024-05-01', heptabaseType: 'project', heptabaseCardLink: `heptabase://card/${projectCard}` }, bodyZh: '一个还在继续的项目。' }), 'src/content/projects/sample-trace.mdx');
  local.i18n.set(enProject, { Language: 'en' });
  local.cardSources.set(enProject, '# Trace\n\nA project you can read in English.');
  local.remote(serializeMdx({ frontmatter: { slot: 'project', title: 'Trace', description: 'A project you can read in English.', date: '2024-05-01', tags: [], draft: false, listed: false, language: 'en', translationOf: `heptabase://card/${projectCard}`, heptabaseType: 'project', heptabaseCardLink: `heptabase://card/${enProject}` }, bodyZh: 'A project you can read in English.\n\nThe notes stay with the work.' }), 'src/content/projects/sample-trace/en.mdx');
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
  } else {
    for (const [id, title, slug] of [
      ['f11ada66-1111-4759-9b1f-830c8374fcae', '笔记', 'notes'],
      ['f21ada66-2222-4759-9b1f-830c8374fcae', '书单', 'shelf'],
    ]) {
      local.properties.set(id, { Status: 'published', 'Blog Type': 'Page', 'Publish Date': { start: '2024-04-02T00:00:00.000Z' } });
      local.cardSources.set(id, `# ${title}\n\n${title}页。`);
      local.remote(`---\nslot: page\ntitle: ${title}\ndescription: ${title}\ndate: 2024-04-02\nheptabaseCardLink: heptabase://card/${id}\n---\n\n${title}页。\n`, `src/content/pages/${slug}.mdx`);
    }
    const notesId = 'f11ada66-1111-4759-9b1f-830c8374fcae', enNotes = 'e21ada66-2222-4759-8b1f-830c8374fcae';
    local.properties.get(notesId)['blog i18n'] = [`card/${enNotes}`];
    local.i18n.set(enNotes, { Language: 'en' });
    local.cardSources.set(enNotes, '# Notes\n\nA page of notes in English.');
    local.remote(serializeMdx({ frontmatter: { slot: 'page', title: 'Notes', description: 'A page of notes in English.', date: '2024-04-02', language: 'en', translationOf: `heptabase://card/${notesId}`, heptabaseType: 'page', heptabaseCardLink: `heptabase://card/${enNotes}` }, bodyZh: 'A page of notes in English.\n\nThe same path as the Chinese page.' }), 'src/content/pages/notes/en.mdx');
  }
  local.remote(`---\nslot: page\ntitle: 博客\n---\n\n<DocList>\n<DocRef of="articles/hepta-${untagged}" />\n<DocRef of="articles/hepta-${deleted}" />\n</DocList>\n`, 'src/content/pages/blogs.mdx');
}
