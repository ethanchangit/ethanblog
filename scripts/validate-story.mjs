#!/usr/bin/env node
/**
 * validate-story —— 内容校验闸门（npm run validate:content）。
 * 检查 src/content/articles 与 src/content/projects 中 astro check（schema）
 * 查不到的创作规约：双语硬门、注水指令、组件用法、溯源、Var/Calc 顺序等。
 * 规则清单与 docs/MEDIUM.md / .claude/skills/publish/SKILL.md 保持同步。
 *
 * 分级：error 挡 CI（exit 1）；warning 只提醒。draft: true 的文件是工作台，
 * 其全部 error 降级为 warning（含双语缺失）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ARTICLES_DIR = join(ROOT, 'src/content/articles');
const PROJECTS_DIR = join(ROOT, 'src/content/projects');

// 组件清单 —— 与 src/components/media/index.ts barrel 保持同步
const SVELTE_ISLANDS = [
  'ParamSlider',
  'BeforeAfterSlider',
  'ScrollScene',
  'Timeline',
  'StatCounter',
  'AudioClip',
  'InteractiveDemo',
  'ImageGallery',
  'Scene3D',
  'Var',
  'Calc',
];
const ASTRO_ONLY = [
  'VideoEmbed',
  'TweetEmbed',
  'CodePlayground',
  'MediaFrame',
  'SideNote',
  'RuleGarden',
  'RuleTarget',
  'VerdictTable',
  'Mention',
  'MentionTarget',
];
// Calc 表达式里的函数白名单（与 src/lib/reactive/eval.ts 同步）
const EVAL_FUNCTIONS = new Set(['min', 'max', 'round', 'floor', 'ceil', 'abs', 'sqrt', 'clamp']);
const SOURCE_TYPES = new Set(['chat', 'notes', 'blog', 'mixed']);

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
 * 带引号状态机，模板字符串里演示的 "/>"（如 CodePlayground 的 code prop）不会导致误截。
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

/** 剥掉字符串/模板字面量内容（如 CodePlayground 的 code prop 里演示的 client:visible），避免指令检查误报 */
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

function englishAfterSplit(bodyText) {
  const m = /<div\s+data-lang-split\b[^>]*>(?:\s*<\/div>)?/.exec(bodyText);
  if (!m) return '';
  return bodyText.slice(m.index + m[0].length).trim();
}

const results = [];

function validateFile(file, collection) {
  const rel = relative(ROOT, file);
  const raw = readFileSync(file, 'utf8');
  const { frontmatter, bodyText } = splitDoc(raw);
  // 英文副本（<div data-lang-split> 之后）不计入「一篇至多一个」类规约
  const primaryBody = bodyText.split(/<div\s+data-lang-split\b/)[0];
  const errors = [];
  const warnings = [];

  const isDraft = /^draft:\s*true/m.test(frontmatter);
  const kindMatch = /^kind:\s*(\S+)/m.exec(frontmatter);
  const kind = kindMatch ? kindMatch[1].replace(/['"]/g, '') : collection === 'project' ? 'project' : 'essay';

  // --- 双语硬门（定稿必须中英齐全；草稿跳过） ---
  if (collection === 'article') {
    if (!fmField(frontmatter, 'titleEn')) errors.push('定稿必须有 titleEn');
    if (!fmField(frontmatter, 'descriptionEn')) errors.push('定稿必须有 descriptionEn');
  } else {
    if (!fmField(frontmatter, 'taglineEn')) errors.push('定稿必须有 taglineEn');
  }
  if (!englishAfterSplit(bodyText)) {
    errors.push('定稿必须有英文正文：在 <div data-lang-split></div> 之后写 EN 副本');
  }

  // --- frontmatter 规约 ---

  if (collection === 'article') {
    const desc = /^description:\s*["']?(.+?)["']?\s*$/m.exec(frontmatter)?.[1] ?? '';
    const descLen = Array.from(desc).length;
    if (descLen > 100) errors.push(`description ${descLen} 字（>100）：摘要块和 RSS 都会溢出，请压到 80 字内`);
    else if (descLen > 80) warnings.push(`description ${descLen} 字（>80）：建议压到 80 字内`);

    if (kind === 'notebook') {
      if (!/^thread:\s*\S+/m.test(frontmatter)) errors.push('notebook 必须指定 thread（所属研究线）');
      if (!/^seq:\s*\d+/m.test(frontmatter)) errors.push('notebook 必须指定 seq（线内编号）');
      const thread = /^thread:\s*["']?([\w-]+)/m.exec(frontmatter)?.[1];
      if (thread && !rel.split(sep).join('/').includes(`notes/${thread}/`)) {
        errors.push(`notebook 落盘路径应为 notes/${thread}/<NN>-<slug>.mdx`);
      }
    } else if (!/^source:/m.test(frontmatter)) {
      warnings.push('定稿档建议填 source 溯源块（type/origin/date），页眉会渲染溯源行');
    }
    if (/^source:/m.test(frontmatter)) {
      const sourceType = /^\s+type:\s*["']?(\w+)/m.exec(frontmatter)?.[1];
      if (!sourceType) errors.push('source 块缺少 type（chat | notes | blog | mixed）');
      else if (!SOURCE_TYPES.has(sourceType))
        errors.push(`source.type "${sourceType}" 非法，应为 chat | notes | blog | mixed`);
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
      if (tag === 'ScrollScene' && !/client:visible=\{\{\s*rootMargin:\s*'150% 0px'\s*\}\}/.test(call)) {
        errors.push(`第 ${line} 行：<ScrollScene> 必须写 client:visible={{ rootMargin: '150% 0px' }}`);
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

  // 反应式散文：Var 声明与 Calc 依赖按文档顺序核对（SSR 初值依赖 Var 先于 Calc）
  const reactive = [
    ...findCalls(bodyText, 'Var').map((c) => ({ ...c, tag: 'Var' })),
    ...findCalls(bodyText, 'Calc').map((c) => ({ ...c, tag: 'Calc' })),
  ].sort((a, b) => a.index - b.index);

  const varsByScope = new Map(); // scope -> Set<name>
  for (const { line, call, tag } of reactive) {
    const scope = /scope=["']([\w-]+)["']/.exec(call)?.[1] ?? 'page';
    if (tag === 'Var') {
      const name = /name=["'](\w+)["']/.exec(call)?.[1];
      if (!name) {
        errors.push(`第 ${line} 行：<Var> 缺少 name`);
        continue;
      }
      const names = varsByScope.get(scope) ?? new Set();
      if (names.has(name)) errors.push(`第 ${line} 行：Var "${name}" 在 scope "${scope}" 里重复声明`);
      names.add(name);
      varsByScope.set(scope, names);
    } else {
      const expr = /expr=["']([^"']+)["']/.exec(call)?.[1];
      if (!expr) {
        errors.push(`第 ${line} 行：<Calc> 缺少 expr`);
        continue;
      }
      const names = varsByScope.get(scope) ?? new Set();
      const idents = (expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).filter((id) => !EVAL_FUNCTIONS.has(id));
      for (const id of idents) {
        if (!names.has(id)) {
          errors.push(
            `第 ${line} 行：Calc 引用了 "${id}"，但 scope "${scope}" 里没有更早声明的同名 Var（SSR 初值依赖文档顺序）`
          );
        }
      }
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

for (const file of collectMdx(ARTICLES_DIR)) validateFile(file, 'article');
for (const file of collectMdx(PROJECTS_DIR)) validateFile(file, 'project');

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
