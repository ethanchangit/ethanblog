#!/usr/bin/env node
/**
 * validate-story —— 内容校验闸门（npm run validate:content）。
 * 检查 src/content/articles 与 src/content/projects 中 astro check（schema）
 * 查不到的创作规约：主标题、摘要、正文、slot、注水指令、组件用法。
 * 不要求英文标题、摘要或正文副本。
 * 规则清单与 docs/MEDIUM.md / .claude/skills/publish/SKILL.md 保持同步。
 *
 * 分级：error 挡 CI（exit 1）；warning 只提醒。draft: true 的文件是工作台，
 * 其全部 error 降级为 warning。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ARTICLES_DIR = join(ROOT, 'src/content/articles');
const PROJECTS_DIR = join(ROOT, 'src/content/projects');

// 组件清单 —— 与 src/components/media/index.ts barrel 保持同步
const SVELTE_ISLANDS = [
  'Timeline',
  'InteractiveDemo',
];
const ASTRO_ONLY = [
  'VideoEmbed',
  'TweetEmbed',
  'SideNote',
  'RuleGarden',
  'RuleTarget',
  'DocList',
  'DocRef',
];

/** 递归收集 .mdx 文件 */
function collectMdx(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...collectMdx(p));
    else if (name.endsWith('.mdx')) out.push(p);
  }
  return out;
}

/** 切出 frontmatter 与正文文本；正文里的 fenced code block 整块置空（保留行数），避免代码示例误报 */
function splitDoc(raw) {
  let frontmatter = '';
  let body = raw;
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (m) {
    frontmatter = m[1];
    body = raw.slice(m[0].length);
  }
  let inFence = false;
  const bodyText = body
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? '' : line;
    })
    .join('\n');
  return { frontmatter, bodyText };
}

/**
 * 全局找一个组件的所有调用：返回 { index, line, call }。
 * call 只截开标签区（到第一个不在字符串字面量里的 ">"）——指令与 props 都在这里；
 * 带引号状态机，模板字符串里演示的 "/>" 不会导致误截。
 */
function findCalls(bodyText, tag) {
  const out = [];
  const re = new RegExp(`<${tag}(?=[\\s/>]|$)`, 'g');
  let m;
  while ((m = re.exec(bodyText)) !== null) {
    const rest = bodyText.slice(m.index);
    let inStr = null;
    let end = Math.min(rest.length, 3000);
    for (let i = 1; i < end; i++) {
      const ch = rest[i];
      if (inStr) {
        if (ch === '\\') i++;
        else if (ch === inStr) inStr = null;
      } else if (ch === '`' || ch === '"' || ch === "'") {
        inStr = ch;
      } else if (ch === '>') {
        end = i + 1;
        break;
      }
    }
    out.push({
      index: m.index,
      line: bodyText.slice(0, m.index).split('\n').length,
      call: rest.slice(0, end),
    });
  }
  return out;
}

/** 剥掉字符串/模板字面量内容，避免指令检查误报 */
function stripStrings(s) {
  return s
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function fmField(frontmatter, key) {
  const m = new RegExp(`^${key}:\\s*(?:"([^"]*)"|'([^']*)'|(\\S+))`, 'm').exec(frontmatter);
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim();
}


const results = [];

function articleIdFromPath(file) {
  return relative(ARTICLES_DIR, file).replaceAll('\\', '/').replace(/\.mdx$/, '');
}

const articleFiles = collectMdx(ARTICLES_DIR);
const articleIds = new Set(articleFiles.map(articleIdFromPath));

function validateFile(file) {
  const rel = relative(ROOT, file);
  const raw = readFileSync(file, 'utf8');
  const { frontmatter, bodyText } = splitDoc(raw);
  // 旧稿若仍有语言分隔标记，分隔后的文字不计入「一篇至多一个」类规约
  const primaryBody = bodyText.split(/<div\s+data-lang-split\b/)[0];
  const errors = [];
  const warnings = [];

  const isDraft = /^draft:\s*true/m.test(frontmatter);
  const slot = fmField(frontmatter, 'slot');

  if (slot !== 'article' && slot !== 'project') {
    errors.push('必须有 slot: article 或 slot: project（决定出现在 /articles 还是 /projects；不要写进 topical tags）');
  }

  // --- frontmatter 规约 ---

  if (slot === 'article') {
    const desc = /^description:\s*["']?(.+?)["']?\s*$/m.exec(frontmatter)?.[1] ?? '';
    const descLen = Array.from(desc).length;
    if (descLen > 100) errors.push(`description ${descLen} 字（>100）：摘要块和 RSS 都会溢出，请压到 80 字内`);
    else if (descLen > 80) warnings.push(`description ${descLen} 字（>80）：建议压到 80 字内`);

    const id = articleIdFromPath(file);
    const slash = id.lastIndexOf('/');
    if (slash !== -1) {
      const parent = id.slice(0, slash);
      if (!articleIds.has(parent)) {
        errors.push(
          `子文需要同系列总览 ${parent}.mdx（总览进 /articles，子文默认不进索引）`,
        );
      }
    }
  }

  // --- 正文组件规约 ---

  for (const line of bodyText.split('\n')) {
    if (/^import\s/.test(line) && /components\/media\/\w+/.test(line)) {
      errors.push(`媒介组件必须从 barrel 导入（'@/components/media'），不要走深路径：${line.trim()}`);
    }
  }

  for (const tag of SVELTE_ISLANDS) {
    for (const { line, call } of findCalls(bodyText, tag)) {
      if (!/client:/.test(stripStrings(call))) {
        errors.push(`第 ${line} 行：<${tag}> 是 Svelte 岛屿，必须写 client:* 指令（默认 client:visible）`);
      }
    }
  }

  for (const tag of ASTRO_ONLY) {
    for (const { line, call } of findCalls(bodyText, tag)) {
      if (/client:/.test(stripStrings(call))) {
        errors.push(`第 ${line} 行：<${tag}> 是 Astro 组件，不写 client: 指令`);
      }
    }
  }

  const gardens = findCalls(primaryBody, 'RuleGarden');
  if (gardens.length > 1) {
    errors.push(`一篇文章至多一个 RuleGarden（现在 ${gardens.length} 个）`);
  }
  for (const { line, call } of gardens) {
    const ruleCount = (call.match(/when:/g) ?? []).length;
    if (ruleCount > 0 && (ruleCount < 2 || ruleCount > 4)) {
      errors.push(`第 ${line} 行：RuleGarden 初始规则应为 2–4 条（现在 ${ruleCount} 条）`);
    }
  }

  // SideNote 密度：相邻两条间距 <30 行提醒（每屏至多一条的粗略代理）
  const sideNotes = findCalls(primaryBody, 'SideNote');
  for (let k = 1; k < sideNotes.length; k++) {
    if (sideNotes[k].line - sideNotes[k - 1].line < 30) {
      warnings.push(`第 ${sideNotes[k].line} 行：两条 SideNote 相距不足 30 行——旁注纪律是每屏至多一条`);
      break;
    }
  }

  // draft 是工作台：error 全部降级为 warning
  const finalErrors = isDraft ? [] : errors;
  const finalWarnings = isDraft ? [...warnings, ...errors.map((e) => `[draft] ${e}`)] : warnings;

  if (finalErrors.length || finalWarnings.length) {
    results.push({ rel, errors: finalErrors, warnings: finalWarnings });
  }
}

for (const file of articleFiles) validateFile(file);
for (const file of collectMdx(PROJECTS_DIR)) validateFile(file);

let errorCount = 0;
for (const { rel, errors, warnings } of results) {
  console.log(`\n${rel}`);
  for (const e of errors) {
    console.log(`  ✖ ${e}`);
    errorCount++;
  }
  for (const w of warnings) console.log(`  ⚠ ${w}`);
}

if (errorCount > 0) {
  console.log(`\nvalidate-story：${errorCount} 个 error，请修复后再提交。`);
  process.exit(1);
}
console.log(`\nvalidate-story：全部通过（${results.length} 个文件有 warning）。`);
