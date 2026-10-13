# MEDIUM.md —— 媒介创作规范（v3）

> **这是 Ethan Chang 的个人博客** https://ethanchang.io （只有英文站，cn.ethanchang.io 跳到同一路径）。
> 写作在 Heptabase，审核和发布走 `/dashboard`，公开页面就是 `#blog` 卡片原文。
> 本文记录站点的媒介观、组件怎么选、MDX 的页面接口和模板：后台生成的 MDX 要符合它，手工给文章接组件、写测试页时也照它来。
> 强制性技术约束见 [AGENTS.md](../AGENTS.md)，组件契约见
> [src/components/media/README.md](../src/components/media/README.md)，本文不复述、只引用。

## 1. 这份文档是什么

**这是 Ethan Chang 的个人博客**，附带可选的交互组件。文章在 Heptabase 里写成卡片，默认档位永远是安静的文字。
需要时才升档为可操作的实证：目标不是"加特效"，而是在论点需要时让读者**亲手操作、亲眼验证**。

### 六条研究原则

本站媒介形态的理论地基（详见 [docs/research/](research/) 两份调研档案），每条都落到了具体机制：

| # | 原则 | 出处 | 本站落点 |
|---|---|---|---|
| 1 | **反应式文档**：读者可以拨动作者的假设，看结论如何变化 | Bret Victor《Explorable Explanations》/ Tangle | `RuleGarden`：规则可开关、可改 |
| 2 | **活数据，而非死符号**；尽量同时展示所有状态，而不是一次一帧 | 《Media for Thinking the Unthinkable》/《Ladder of Abstraction》 | `InteractiveDemo`、`Timeline` |
| 3 | **可见源码**：程序印在物体上，页面自我解释 | Dynamicland / Realtalk | 规则写在它作用的物件旁边（`RuleGarden`） |
| 4 | **双声**：人的声音与机器的推导视觉可辨 | Ink & Switch《Untangle》黑/粉原则 | 正文是人声；`SideNote` 放补充 |
| 5 | **文字是尊贵的子集**：计算叠加在散文之上，绝不改写它 | Ink & Switch《Potluck》 | 无 JS 降级铁律（§2） |
| 6 | **缓坡而非悬崖**：从读者到操作者，每一步都是小台阶 | Ink & Switch《Malleable Software》 | 五档媒介阶梯（§2） |

## 2. 媒介观与升档纪律

信息媒介存在档位：

| 档位 | 媒介 | 读者获得什么 |
|---|---|---|
| 1 | 文字 | 靠抽象思维自己想象 |
| 2 | 图像 | 亲眼看见 |
| 3 | 音频 / 视频 | 时间与温度，仍是单向的 |
| 4 | 可交互的软件 | 亲手操作，从操作中获得理解 |
| 5 | **可改写的规则 / 环境** | **亲手改造，从改造中变成作者** |

第五档是 Realtalk 给这个网站的礼物：页面即房间，规则可读、可改、可组合（RuleGarden）。

**铁律**：
- **文字是尊贵的子集**。能用文字讲清楚的内容就安静地用文字。交互是升档而非门槛。
- 每次升档必须回答一个问题："**它给叙事增加了什么档位**"——加的是理解，不是装饰。
- 交互必须是**论据**（读者操作后论点被验证），不能只是插图。
- 降档永远安全：任何交互失效时，读者仍能获得完整内容（组件契约的无 JS 降级）。

第四档用现在还在的组件：`InteractiveDemo` 给可玩切片，`Timeline` 给步骤，`TweetEmbed` / `VideoEmbed` 给外部引用。数字关系用文字写清楚。

## 3. 文章就是文章

本站不区分 notebook / essay / interactive 档位，也没有研究线路由。
一篇 MDX 就是一篇 `/<slug>`。要不要嵌交互组件，按 §4 决策表逐论点判断，
不写 `kind`。记录过程、尝试、失败的也写成文章，半成品判断留在正文里，不另开编号笔记。

## 4. 组件选用决策表

**论点类型 → 组件**（第一列是你在输入里识别到的东西）：

| 论点类型 | 组件 | 何时不用 |
|---|---|---|
| 随时间/步骤的演进 | `Timeline` | 少于 3 个节点 |
| 可玩的完整演示切片 | `InteractiveDemo` | 交互 10 秒内讲不出论点 |
| 引用外部视频 | `VideoEmbed` | — |
| 引用一条推文 | `TweetEmbed`（自绘卡片，全文展开） | 只需要转述一句话、不必出示原帖时 |
| **合集文里引用另一篇已有文章/项目** | **`DocList` + `DocRef`** | 只是提一句、不必出示那一行卡片时 |
| 行为与因果、系统如何响应 | `RuleGarden` + 正文散布 `RuleTarget` | 因果链只有一步且无需读者试 |
| 离题但增味的补充 | `SideNote` | 内容其实属于正文时 |

正文里的站内链接和 mention 由阅读壳的右侧预览承接。

**DocRef 专则**：
- `of` 写 `articles/<id>` 或 `projects/<id>`（系列子文是 `articles/<hub>/1`）。构建期查不到就报错。
- 卡片长得和 `/articles` 索引行一样（`Card.astro`）；包在 `<DocList>` 里。系列总览的篇目要在 `<hub>.mdx` 里手写 `DocRef`，并写 `<DocList pane="series">`（宽屏第三栏打开子文）。
- 文件夹只决定子文路由与「不进 `/articles`」，**不会**往总览正文自动插一篇目列表。
- `/blogs` 的名单只改 `src/content/pages/blogs.mdx` 里的 `DocRef`，不会自动收录整个 `articles/`。

**RuleGarden 专则**（第五档，用它时页面就是房间）：
- 目标元素用 `<RuleTarget name label>` 散布在**正文里**，不要挤在组件框内——空间感来自散布。
- 初始规则 2-4 条，覆盖至少两种谓词；规则句必须通顺（它同时是降级散文）。
- 词槽是下拉，不做自由文本；禁规则链（引擎层已禁止）。
- 一篇文章至多一个 RuleGarden。

## 5. 页面接口规范

Story 布局自动提供论文式接口，创作时只需喂对 frontmatter：

- **收录位置** = `slot`：`article` → `/articles`，`project` → `/projects`。不要写进 topical `tags`。`/blogs` 靠 MDX 里的 `DocRef` 引用，不另开 slot。
- **摘要** = description：≤80 字，写成可检验的陈述句，不写悬念句。
- **日期**：`date` 为首发；有修订时再写 `updated`（页眉会显示「更新于」）。
- **目录**：有 h2/h3 时自动浮在阅读区右侧，无需手工维护——因此**标题层级要写实**。无标题则不出现。
- **标签**：`tags` 渲染在摘要下方。
- **SideNote 纪律**：每屏至多一条；只放"删掉不影响论证，读到会心一笑"的内容。

## 6. 可见性原则

Realtalk：程序印在物体上。规则花园把规则写在它作用的物件旁边。不要向读者注入组件源码。

## 7. 语言与调性

- 内容是英文：先写完整的英文正文，再在底部用 `## 中文` 开一节，按同样顺序放中文版。标题行只写英文。公开页面就是 `#blog` 卡片原文，包括这一节。一篇只有一个文件，不写 `titleEn` / `descriptionEn`，不插入语言分隔标记。技术名词、代码和引用保留原文。
- 宣言式短段落；第二人称克制使用；每个抽象论点尽快落到一个可操作的实证。
- `SideNote` 也用创作者语气写。它离开正文，不靠文风突变。
- 范本：现有文章（调性）。
- agent 不改写创作者的用词与判断；要动的只有结构和媒介。

## 8. 强制约束与验证

技术红线全部在 [AGENTS.md](../AGENTS.md)（token-only 配色、极简无边框/无色块、无 JS 降级、注水指令、
props 可序列化、reduced-motion、`.media-frame` 仅作间距与图注），组件契约在
[media/README.md](../src/components/media/README.md)。提交前**验证四连**：

```bash
npm run validate:content && npm run check && npm run build && npm run test
```

`validate:content`（`scripts/validate-story.mjs`）查的是 schema 查不到的创作规约：
**单版本内容检查**（主标题、摘要和正文；不要求翻译）、`slot: article | project`、注水指令、Astro 组件误加指令、
RuleGarden 数量与规则数、SideNote 密度、barrel 导入。
error 挡提交；draft 文件的 error 自动降级为 warning（草稿是工作台）。

### 图片落盘

内容配图放 `public/media/<collection>/<slug>/`，MDX 里写 `/media/<collection>/<slug>/…`。
不要用外部图床。

### 页面架构

固定页：`/`（文章列表）、`/about`、`/now`、`/articles`、`/projects`、`/blogs`、`/tags`。详情页是同一套 MDX 文档形态，
用 frontmatter `slot: article | project` 决定出现在哪份索引（不是 topical `tags`）。
落盘仍可分 `articles/` 与 `projects/` 两个文件夹，只是方便；列表与路由按 `slot` 过滤。
两份索引共用 `Card.astro` 行（标题下划线 + meta 变色）；
`/projects` 可以在列表上方写传承导语与时间线，不要把项目长文堆在索引上。
`/blogs` 不是第三个 slot，而是 `src/content/pages/blogs.mdx` 里用 `<DocRef of="articles/…" />` 手工引用已有文档。
单篇在站点根路径 `/<slug>`；旧的 `/articles/<id>`、`/projects/<id>` 由 `src/lib/routes.ts` 的 `legacyContentRedirect` 301 过来。
系列教程把总览放 `articles/<hub>.mdx`（进 `/articles`），子页放 `articles/<hub>/<n>.mdx`
（路由 `/<hub>/<n>`，默认不进列表 / 标签 / 搜索 / RSS）。总览上的篇目卡片在 `<hub>.mdx` 里用 `DocList` + `DocRef` 手写，不从文件夹生成。`listed: false` 可把顶层文章也藏起来。

## 9. 附录：模板

**文章**（放 `src/content/articles/<slug>.mdx`）：

```yaml
---
slot: article
title: "……"
description: "……（≤80 字摘要）"
date: 2026-07-03
updated: 2026-08-18   # 可选；有修订时才写
tags: []
draft: true
heptabaseCardLink: heptabase://card/00000000-0000-4000-8000-000000000000
---
```

只写一份正文。`heptabaseCardLink` 必须是 Heptabase 里真实存在的卡片，不能照抄上面的占位符，也不能编造。图片放 `public/media/articles/<slug>/`。

**项目**（放 `src/content/projects/<slug>.mdx`；同一套字段，`slot` 决定出现在 `/projects`）：

```yaml
---
slot: project
title: "……"
description: "……"
draft: true
heptabaseCardLink: heptabase://card/00000000-0000-4000-8000-000000000000
# 以下均可选
status: wip
order: 99
stack: []
repo: https://github.com/…
demo:
  src: /demos/<name>/
---
```

`slot` 是「哪份索引收录我」的标记，不要写进 topical `tags`（否则会污染 `/tags`）。
项目可多写 `repo` / `homepage` / `downloads` / `screenshots` / `demo`；文章省略即可。

**系列子文**（总览进 `/articles`，第 1、2、3… 页不进列表）放 `src/content/articles/<hub>/<n>.mdx`：

```yaml
---
slot: article
title: "…… · 第 1 页"
description: "……"
date: 2026-08-19
order: 1          # 子页「上一篇 / 下一篇」顺序
draft: true
---
```

总览是旁边那份 `src/content/articles/<hub>.mdx`（不要用 `index.mdx`）。子文 id 含 `/`，默认不进索引；不必写 `listed: false`。若要把一篇顶层文章藏起来，写 `listed: false`。

总览正文的篇目列表要手写（只写一份；引用资料会随主文章发布，全文搜索也收录）：

```mdx
import { DocList, DocRef } from '@/components/media';

<DocList pane="series">
  <DocRef of="articles/<hub>/1" />
  <DocRef of="articles/<hub>/2" />
</DocList>
```

自定义合集（不必靠文件夹、也不开第三栏）在 MDX 里写：

```mdx
import { DocList, DocRef } from '@/components/media';

<DocList>
  <DocRef of="articles/pkm-method" />
  <DocRef of="projects/aletheia" />
</DocList>
```

`/blogs` 的名单改 `src/content/pages/blogs.mdx`，同一套语法。

**新媒介组件准入**：满足 media/README 六条契约 → 接到用到它的文章或项目
→ 补测试 → 更新 README 目录表与本文 §4 决策表
→ **同步 `scripts/validate-story.mjs` 的组件清单**（SVELTE_ISLANDS / ASTRO_ONLY）。
