# MEDIUM.md —— 媒介创作规范（v2）

> **这是 Ethan Chang 的个人博客**（https://ethanchang.io）。
> 本文档是这个博客的**创作规范**：它规定任何 agent（或人）如何把创作者的输入
> ——一段对话、一份笔记、一篇文章草稿——转化为本站的 MDX 故事页面。
> 可执行的分步操作清单在 [.claude/skills/publish/SKILL.md](../.claude/skills/publish/SKILL.md)；
> 强制性技术约束见 [AGENTS.md](../AGENTS.md)，组件契约见
> [src/components/media/README.md](../src/components/media/README.md)，本文不复述、只引用。

## 0. 触发约定

创作者与 agent 用消息**首行**的触发词声明意图。`/publish`（或 `发布：`）= 把输入转化为本站页面，走本文流水线；`/infra`（或 `基建：`）= 改网站基建，见 [AGENTS.md](../AGENTS.md) 任务路由。

### 用户模板

```markdown
/publish

slug: my-slug           # 可选；省略则由 title 生成
draft: true             # 默认 true

---
（对话记录、bullet 笔记、blog 草稿等原始素材）
```

`---` 上方为可选 YAML 头，下方为原始素材。需要新媒介组件时，在 YAML 头加 `allow-new-component: true`（默认禁止，见 [AGENTS.md](../AGENTS.md)）。

### Agent 检查清单（收到 `/publish` 后）

**按 [.claude/skills/publish/SKILL.md](../.claude/skills/publish/SKILL.md) 的十步清单逐步执行**——那是本文流水线的可执行形态。速查：

- **落盘路径**：文章 → `src/content/articles/<slug>.mdx`；项目页（用户明确说「项目」）→ `src/content/projects/<slug>.mdx`。对外路由 `/articles/<slug>`、`/projects/<slug>`。
- **提交前验证四连**：`npm run validate:content && npm run check && npm run build && npm run test`。

无前缀但意图明显是创作时，agent 仍应走流水线，但**优先建议用户下次使用 `/publish`**。

## 1. 这份文档是什么

**这是 Ethan Chang 的个人博客**，附带可选的交互组件。创作者的创作方式保持简单：与 agent 对话，或写下普通的文章草稿。
读了本文的 agent 负责把这些输入转化为本站的 MDX 页面——创作方式不变，需要时再升档为可操作的实证。

转化的目标不是"加特效"，而是在论点需要时让读者**亲手操作、亲眼验证**；
默认档位永远是安静的文字。

### 六条研究原则

本站媒介形态的理论地基（详见 [docs/research/](research/) 两份调研档案），每条都落到了具体机制：

| # | 原则 | 出处 | 本站落点 |
|---|---|---|---|
| 1 | **反应式文档**：读者可以拨动作者的假设，看结论如何变化 | Bret Victor《Explorable Explanations》/ Tangle | `Var` + `Calc` 反应式散文 |
| 2 | **活数据，而非死符号**；尽量同时展示所有状态，而不是一次一帧 | 《Media for Thinking the Unthinkable》/《Ladder of Abstraction》 | `ParamSlider`、`ScrollScene`、反应式散文 |
| 3 | **可见源码**：程序印在物体上，页面自我解释 | Dynamicland / Realtalk | 「拆开看」source-view 插件保留，默认永不注入（§7） |
| 4 | **双声**：人的声音与机器的推导视觉可辨 | Ink & Switch《Untangle》黑/粉原则 | `Calc` 的 accent 音色 |
| 5 | **文字是尊贵的子集**：计算叠加在散文之上，绝不改写它 | Ink & Switch《Potluck》 | 无 JS 降级铁律（§2）；Var/Calc 的 SSR 纯文本 |
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

### 档 4 的文字形态：反应式散文

`Var` + `Calc` 让**散文本身**成为第四档媒介：句子里的数字可以拖动，
结论随之实时重算——读者在不离开阅读流的情况下拨动作者的假设（原则 1）。
当论点是**数字关系**且读者会想问"如果换个数呢"，优先用反应式散文而不是把读者
送去一个大块组件。

**纪律**：
- 一篇文章通常一个 `scope`（缺省 `page`）就够；确需两组独立变量才用 `scope="xxx"` 分组。
- `Var` 每篇 2–5 个：可拖的数字应该个个值得拖。
- **`Calc` 必须出现在它引用的所有 `Var` 之后**（SSR 初值依赖文档顺序，`validate:content` 强制）。
- 拖拽值不进 URL、不持久化——它是思想实验，不是应用状态。
- 视觉即语义：`Var` 是人手可拖的值（ink 色 + primary 点状下划线），`Calc` 是机器算出的值（accent 音色）。这是 Untangle 黑/粉原则的本站翻译，**不要**用样式覆盖抹掉这层区分。

## 3. 文章就是文章

本站不再区分 notebook / essay / interactive 档位，也没有研究线路由。
一篇 MDX 就是一篇 `/articles/<slug>`。要不要嵌交互组件，按 §5 决策表逐论点判断，
不写 `kind`。

**判定清单**（转化输入时逐条问）：
- 有明确结论且经得起引用 → 写成文章
- 记录的是过程、尝试、失败、中间状态 → 仍写成文章；半成品判断留在正文里，不要另开编号笔记
- 拿不准 → `draft: true` 先放着

## 4. 转换流水线（The Pipeline）

把"对话/笔记/文章"变成本站页面的固定六步：

1. **识别输入类型**：chat（对话记录）/ notes（个人笔记）/ blog（文章草稿）/ mixed。
   按 §8 的对应专则处理——不同素材的"翻译腔"不同。
2. **提炼论点清单**：从输入中列出 3-8 个论点/发现/情节节点。保留创作者的原话与语气——
   转化的是形式，不是观点。
3. **逐论点选档**：对每个论点查 §5 决策表。默认档位是文字；只有当"亲手操作能替代
   一段解释"时才升档。一篇文章通常 1-3 个交互组件就够，超过 4 个要自我怀疑。
4. **写 frontmatter**：用 §11 模板。description 即摘要（≤80 字、可检验的陈述，
   它会渲染成页面摘要块与 RSS 描述）。
5. **组装正文**：从 `@/components/media` 导入组件；Svelte 组件写 `client:visible`
   （含 `Var` / `Calc`；ScrollScene 必须 `client:visible={{ rootMargin: '150% 0px' }}`；
   CodePlayground / RuleGarden / VideoEmbed / TweetEmbed / MediaFrame / SideNote / RuleTarget /
   VerdictTable / Mention / MentionTarget 是 Astro 组件无需指令）。
   组件调用写清楚即可；不要向读者展示源码（见 §7）。
6. **QA**：用到新组件？先在 `/lab` 点亮。提交前验证四连（§10）。

## 5. 组件选用决策表

**论点类型 → 组件**（第一列是你在输入里识别到的东西）：

| 论点类型 | 组件 | 何时不用 |
|---|---|---|
| 两种状态/方案的对比 | `BeforeAfterSlider` | 差异用一句话就能说清时 |
| **多方案 × 多维度的对比裁决** | **`VerdictTable`**（✓/—/✗ 评分矩阵，可加备注与条形图） | 仅两方案一维（一句话或 BeforeAfterSlider） |
| 随时间/步骤的演进 | `Timeline`；篇幅大且值得沉浸 → `ScrollScene` | 少于 3 个节点 |
| 结论对参数敏感（"越…越…"） | `ParamSlider`（需要配可视化时） | 参数关系是线性且显然的 |
| **结论是数字关系，读者会想改假设** | **`Var` + `Calc`（反应式散文）** | 关系一句话可穷尽；或参数需要配可视化（用 ParamSlider） |
| 一组关键数字 | `StatCounter` | 数字少于 3 个（直接写进正文） |
| 可玩的完整演示切片 | `InteractiveDemo`（配 `poster` 预览：视频先行、点击升级） | 交互 10 秒内讲不出论点 |
| 代码本身是论点 | `CodePlayground`（读者可 Run） | 代码只是引用（用普通代码块） |
| 空间/地理/立体结构 | `Scene3D` | 平面图足够时 |
| 声音是内容本体 | `AudioClip` | — |
| 引用外部视频 | `VideoEmbed` | — |
| 引用一条推文 | `TweetEmbed`（自绘卡片，全文展开） | 只需要转述一句话、不必出示原帖时 |
| 一组图片证据 | `ImageGallery` | 单图（用普通 img + MediaFrame） |
| **正文词语与某个媒介块互相印证** | **`Mention` + `MentionTarget`（双向高亮）** | 词语与媒介块紧邻出现时 |
| 行为与因果、系统如何响应 | `RuleGarden` + 正文散布 `RuleTarget` | 因果链只有一步且无需读者试 |
| 离题但增味的补充 | `SideNote` | 内容其实属于正文时 |
| 任意内容需要统一外框 | `MediaFrame` | — |

**Var/Calc 专则**（反应式散文，档 4 的文字形态）：见 §2 的纪律五条。
表达式只支持算术与白名单函数（`min/max/round/floor/ceil/abs/sqrt/clamp`），
写错会在构建期报错——这是特性：公式错误不该活到读者眼前。

**Mention 专则**：
- `target` 必须指向同一页面上存在的 `MentionTarget`（否则点击无处可去）。
- 被 Mention 的词语要自然地长在句子里——它是散文的一部分，不是按钮。
- 键盘可聚焦（组件自带 `tabindex`），点击/Enter 会把目标滚进视野。
- 同一个目标可以被多处 Mention；一篇文章的 Mention 不要超过 5 处（下划线太多会稀释信号）。

**RuleGarden 专则**（第五档，用它时页面就是房间）：
- 目标元素用 `<RuleTarget name label>` 散布在**正文里**，不要挤在组件框内——空间感来自散布。
- 初始规则 2-4 条，覆盖至少两种谓词；规则句必须通顺（它同时是降级散文）。
- 词槽是下拉，不做自由文本；禁规则链（引擎层已禁止）。
- 一篇文章至多一个 RuleGarden。

## 6. 页面接口规范

Story 布局自动提供论文式接口，创作时只需喂对 frontmatter：

- **收录位置** = `slot`：`article` → `/articles`，`project` → `/projects`。不要写进 topical `tags`。
- **摘要** = description：≤80 字，写成可检验的陈述句，不写悬念句。
- **日期**：`date` 为首发；有修订时再写 `updated`（页眉会显示「更新于」）。
- **目录**：h2/h3 ≥ 3 时自动出现，无需手工维护——因此**标题层级要写实**。
- **标签**：`tags` 渲染在摘要下方。
- **SideNote 纪律**：每屏至多一条；只放"删掉不影响论证，读到会心一笑"的内容。

## 7. 可见性原则（拆开看）

Realtalk：程序印在物体上。本站保留「拆开看」机制（构建期 remark 插件，见 media/README），
但 **永不向读者注入**——不要写 `sourceView`，嵌入媒介组件时不出现「⌥ 源码」行。

## 8. 输入类型转换专则

流水线第 1 步识别的输入类型，各有专门的翻译方法：

### chat（对话记录）

对话是本站最常见的剧本形态，翻译时**先区分两种声音**：

- **人声**：创作者在对话中的判断、选择、原话——保留为正文（ink 色）。
  转化的是形式，不是观点；创作者说过的关键句子尽量原样保留。
- **机器声**：AI 在对话中补充的计算、推演、数据、反例——转为"机器声"组件：
  `Calc`（数字推导）、`SideNote`（补充语境）、`VerdictTable`（AI 帮忙做的多方案对比）。
  视觉上天然可辨（原则 4）。
- **对话的往返结构不保留**。一问一答是思考的脚手架，不是结论的形态——只提炼论点。
  （原生承载对话往返的 `Transcript` 组件在 Batch 2 蓝图中，见 ROADMAP。）

### notes（个人笔记）

- bullet 群先**聚类成 3–8 个论点**，再走流水线；笔记的碎片感不该带进成稿。
- 半成品判断、未验证的直觉可以写进正文，用 `draft: true` 先放着。
- 数字类 bullet（"每天 X 就能 Y"）优先考虑 `Var`/`Calc` 或 `StatCounter`。

### blog（文章草稿）

- 结构已在，转换以**升档植入**为主：找出草稿里"用文字硬讲参数关系/对比/因果"的段落，
  逐段查 §5 决策表替换为对应媒介。
- **不重写作者语气**；只动被升档的段落，其余原样保留。

### mixed（混合素材）

按占比最大的类型走对应专则，其余素材作为补充。

## 9. 语言与调性

- 中文为主，技术名词保留英文原文。
- 宣言式短段落；第二人称克制使用；每个抽象论点尽快落到一个可操作的实证。
- 机器声组件（`Calc`、AI 补充的 `SideNote`/`VerdictTable`）的 caption 也用创作者语气写——
  声音的区分靠视觉（accent 色），不靠文风突变。
- 范本：现有文章（调性）。
- 转化对话输入时**保留创作者的用词与判断**；agent 补的是结构和媒介，不是观点。

## 10. 强制约束与验证

技术红线全部在 [AGENTS.md](../AGENTS.md)（token-only 配色、极简无边框/无色块、无 JS 降级、注水指令、
props 可序列化、reduced-motion、`.media-frame` 仅作间距与图注），组件契约在
[media/README.md](../src/components/media/README.md)。提交前**验证四连**：

```bash
npm run validate:content && npm run check && npm run build && npm run test
```

`validate:content`（`scripts/validate-story.mjs`）查的是 schema 查不到的创作规约：
**定稿双语硬门**（`titleEn`/`descriptionEn`；正文必须有
`<div data-lang-split></div>` 及之后的英文副本）、`slot: article | project`、注水指令、Astro 组件误加指令、
RuleGarden 数量与规则数、SideNote 密度、Var/Calc 声明顺序与重名、barrel 导入。
error 挡提交；draft 文件的 error 自动降级为 warning（草稿是工作台）。

### 图片落盘

内容配图放 `public/media/<collection>/<slug>/`，MDX 里写 `/media/<collection>/<slug>/…`。
不要用外部图床。Lab 共用夹具可以留在 `public/media/` 根下（如 `compare-before.svg`）。

### 页面架构

固定页（手写 Astro）：`/articles`、`/projects`、`/about`。详情页是同一套 MDX 文档形态，
用 frontmatter `slot: article | project` 决定出现在哪份索引（不是 topical `tags`）。
落盘仍可分 `articles/` 与 `projects/` 两个文件夹，只是方便；列表与路由按 `slot` 过滤。
两份索引共用 `Card.astro` 行（标题下划线 + meta 变色）；
`/projects` 可以在列表上方写传承导语与时间线，不要把项目长文堆在索引上。
对外路由只有 `/articles` 与 `/articles/<slug>`，没有 `/stories` 兼容层。
系列教程把总览放 `articles/<hub>.mdx`（进 `/articles`），子页放 `articles/<hub>/<n>.mdx`
（路由 `/articles/<hub>/<n>`，默认不进列表 / 标签 / 搜索 / RSS）。`listed: false` 可把顶层文章也藏起来。

## 11. 附录：模板

**文章**（放 `src/content/articles/<slug>.mdx`）：

```yaml
---
slot: article
title: "……"
titleEn: "……"
description: "……（≤80 字摘要）"
descriptionEn: "……"
date: 2026-07-03
updated: 2026-08-18   # 可选；有修订时才写
tags: []
draft: true
---
```

正文中英之间插一行 `<div data-lang-split></div>`。图片放 `public/media/articles/<slug>/`。

**项目**（放 `src/content/projects/<slug>.mdx`；同一套字段，`slot` 决定出现在 `/projects`）：

```yaml
---
slot: project
title: "……"
titleEn: "……"          # 标题已是英文时可省略
description: "……"
descriptionEn: "……"
draft: true
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
titleEn: "… · Part 1"
description: "……"
descriptionEn: "……"
date: 2026-08-19
order: 1          # 篇目顺序；总览页自动列出
draft: true
---
```

总览是旁边那份 `src/content/articles/<hub>.mdx`（不要用 `index.mdx`）。子文 id 含 `/`，默认不进索引；不必写 `listed: false`。若要把一篇顶层文章藏起来，写 `listed: false`。


**新媒介组件准入**：满足 media/README 六条契约 → 在 `/lab` 加带 `data-testid` 的最小示例
→ 补 lab-interactions / reduced-motion 两类测试 → 更新 README 目录表与本文 §5 决策表
→（若适用）把组件名加进 `plugins/remark-source-view.mjs` 白名单
→ **同步 `scripts/validate-story.mjs` 的组件清单**（SVELTE_ISLANDS / ASTRO_ONLY）。
