# MEDIUM.md —— 媒介创作规范

> 本文档是这个网站的**创作宪法**：它规定任何 agent（或人）如何把创作者的输入
> ——一段对话、一篇普通文章——转化为本站的超媒介表达。
> 强制性技术约束见 [AGENTS.md](../AGENTS.md)，组件契约见
> [src/components/media/README.md](../src/components/media/README.md)，本文不复述、只引用。

## 1. 这份文档是什么

这个网站是一台**媒介引擎**。创作者的创作方式保持简单：与 agent 对话，或写下普通的文章草稿。
读了本文的 agent 负责把这些输入转化为本站的媒介形态——就像剧作家只写剧本，
AI video generator 把剧本变成影片：**创作方式不变，输出形式被巨大强化**。

转化的目标不是"加特效"，而是 Ink & Switch 意义上的 dynamic medium：
让读者不只是读到论点，而是**亲手操作、亲眼验证、甚至亲手改写**论点。

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

## 3. 两档发布制

模仿 Ink & Switch 的 essay / lab notebook 双轨。**发布档位写在 frontmatter 的 `kind`**：

| kind | 含义 | 承诺 |
|---|---|---|
| `notebook` | 编号过程笔记 | 有过程、有失败、有半成品；**发出去的不回改，勘误写在下一篇** |
| `essay` | 定稿文章（纯文字为主） | 有结论、经得起引用 |
| `interactive` | 定稿互动故事 | 有结论 + 软件级媒介实证 |

**判定清单**（转化输入时逐条问）：
- 有明确结论且经得起引用 → 定稿档（`essay` 或 `interactive`，取决于是否值得升档）
- 记录的是过程、尝试、失败、中间状态 → `notebook`
- 拿不准 → `notebook`。低门槛是 notebook 的存在理由：五行 frontmatter 就能发。

**研究线（thread）**：长期追问的问题，登记在 [`src/data/threads.ts`](../src/data/threads.ts)。
notebook 必须挂线（`thread` + `seq` 必填，schema 强制）；定稿也可挂线。
新开一条线的条件：这个问题会持续产出至少 3 条笔记。开线 = 在 threads.ts 加一个对象，
文件放 `src/content/stories/notes/<thread>/<NN>-<slug>.mdx`。

## 4. 转换流水线（The Pipeline）

把"对话/文章"变成本站页面的固定六步：

1. **提炼论点清单**：从输入中列出 3-8 个论点/发现/情节节点。保留创作者的原话与语气——
   转化的是形式，不是观点。
2. **逐论点选档**：对每个论点查 §5 决策表。默认档位是文字；只有当"亲手操作能替代
   一段解释"时才升档。一篇文章通常 1-3 个交互组件就够，超过 4 个要自我怀疑。
3. **定发布档**：按 §3 判定清单选 kind；notebook 则确定 thread 与下一个 seq。
4. **写 frontmatter**：用 §10 模板。description 即摘要（≤80 字、可检验的陈述，
   它会渲染成页面摘要块与 RSS 描述）。
5. **组装正文**：从 `@/components/media` 导入组件；Svelte 组件写 `client:visible`
   （ScrollScene 必须 `client:visible={{ rootMargin: '150% 0px' }}`；
   CodePlayground / RuleGarden / VideoEmbed / MediaFrame / SideNote / RuleTarget 是 Astro
   组件无需指令）。把组件调用写得值得被读——它会被"拆开看"原样展示（§7）。
6. **QA**：用到新组件？先在 `/lab` 点亮。提交前 `npm run check && npm run build && npm run test`。

## 5. 组件选用决策表

**论点类型 → 组件**（第一列是你在输入里识别到的东西）：

| 论点类型 | 组件 | 何时不用 |
|---|---|---|
| 两种状态/方案的对比 | `BeforeAfterSlider` | 差异用一句话就能说清时 |
| 随时间/步骤的演进 | `Timeline`；篇幅大且值得沉浸 → `ScrollScene` | 少于 3 个节点 |
| 结论对参数敏感（"越…越…"） | `ParamSlider` | 参数关系是线性且显然的 |
| 一组关键数字 | `StatCounter` | 数字少于 3 个（直接写进正文） |
| 可玩的完整软件/产品切片 | `InteractiveDemo`（配 `poster` 预览：视频先行、点击升级） | 交互 10 秒内讲不出论点 |
| 代码本身是论点 | `CodePlayground`（读者可 Run） | 代码只是引用（用普通代码块） |
| 空间/地理/立体结构 | `Scene3D` | 平面图足够时 |
| 声音是内容本体 | `AudioClip` | — |
| 引用外部视频 | `VideoEmbed` | — |
| 一组图片证据 | `ImageGallery` | 单图（用普通 img + MediaFrame） |
| **行为与因果、系统如何响应** | **`RuleGarden` + 正文散布 `RuleTarget`** | 因果链只有一步且无需读者试 |
| 离题但增味的补充 | `SideNote` | 内容其实属于正文时 |
| 任意内容需要统一外框 | `MediaFrame` | — |

**RuleGarden 专则**（第五档，用它时页面就是房间）：
- 目标元素用 `<RuleTarget name label>` 散布在**正文里**，不要挤在组件框内——空间感来自散布。
- 初始规则 2-4 条，覆盖至少两种谓词；规则句必须通顺（它同时是降级散文）。
- 词槽是下拉，不做自由文本；禁规则链（引擎层已禁止）。
- 一篇文章至多一个 RuleGarden。

## 6. 页面接口规范

Story 布局自动提供论文式接口，创作时只需喂对 frontmatter：

- **摘要** = description：≤80 字，写成可检验的陈述句，不写悬念句。
- **目录**：定稿档且 h2/h3 ≥ 3 时自动出现，无需手工维护——因此**标题层级要写实**。
- **署名与引用块**：定稿档自动渲染（数据来自 `src/data/profile.ts`），不要在正文重复署名。
- **notebook 眉头**：自动显示研究线与编号、"非定稿"说明、前后篇导航——正文里不必解释这些。
- **文末招募段**：全档自动渲染（反馈 mailto）。若这篇内容特别需要同路人，
  可在正文末尾自写一段更具体的邀请（参照 Ink & Switch notebook 的 "we'd love to chat"）。
- **SideNote 纪律**：每屏至多一条；只放"删掉不影响论证，读到会心一笑"的内容。

## 7. 可见性原则（拆开看）

Realtalk：程序印在物体上。本站：**每个媒介组件下方自动出现「⌥ 源码」disclosure**
（构建期 remark 插件注入，见 media/README 的可见性小节），读者展开即见这段 MDX 原文。

创作者/agent 唯一的责任：**把组件调用写得值得被读**——props 排版即文档，
好的调用代码本身就在教读者"这个网站怎么用"。
退出阀（frontmatter `sourceView: false`、组件 `noSource` 属性）几乎永远不该用。

## 8. 语言与调性

- 中文为主，技术名词保留英文原文。
- 宣言式短段落；第二人称克制使用；每个抽象论点尽快落到一个可操作的实证。
- notebook 用 findings 式坦率：记录失败与被砍的设计，价值不低于成功。
- 范本：[/stories/how-this-site-works](../src/content/stories/how-this-site-works.mdx)（调性）
  与 `notes/web-as-medium/` 下的编号笔记（notebook 文体）。
- 转化对话输入时**保留创作者的用词与判断**；agent 补的是结构和媒介，不是观点。

## 9. 强制约束与验证

技术红线全部在 [AGENTS.md](../AGENTS.md)（token-only 配色、无 JS 降级、注水指令、
props 可序列化、reduced-motion、`.media-frame` 外框），组件契约在
[media/README.md](../src/components/media/README.md)。提交前三连：

```bash
npm run check && npm run build && npm run test
```

## 10. 附录：模板

**notebook 笔记**（放 `src/content/stories/notes/<thread>/<NN>-<slug>.mdx`）：

```yaml
---
title: "……"
description: "……（≤80 字摘要）"
date: 2026-07-03
kind: notebook
thread: web-as-medium
seq: 3
tags: ["研究线"]
draft: true   # 创作者审阅后移除
---
```

**定稿互动故事**：

```yaml
---
title: "……"
description: "……（≤80 字摘要）"
date: 2026-07-03
kind: interactive   # 纯文字定稿用 essay
thread: web-as-medium   # 可选
tags: []
featured: false
draft: true
---
```

**新研究线登记**（`src/data/threads.ts` 追加）：

```ts
{
  slug: 'a-new-thread',
  title: '线名',
  question: '这条线追问的一句话问题？',
  status: 'active',
  started: '2026-08',
  description: '一段宣言式简介。',
},
```

**新媒介组件准入**：满足 media/README 六条契约 → 在 `/lab` 加带 `data-testid` 的最小示例
→ 补 lab-interactions / reduced-motion 两类测试 → 更新 README 目录表与本文 §5 决策表
→（若适用）把组件名加进 `plugins/remark-source-view.mjs` 白名单。
