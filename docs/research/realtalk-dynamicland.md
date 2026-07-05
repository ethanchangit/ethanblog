# Realtalk / Dynamicland / Bret Victor 调研档案

> 调研时间：2026-07-05。本档案是"把网页当动态媒介"研究线（`web-as-medium`）的第二份原始材料，
> 聚焦 Bret Victor 谱系与 Realtalk 的编程/媒介思想。与 [ink-and-switch.md](ink-and-switch.md)
> 互补：那份偏"实验室在做什么"，这份偏"动态媒介的第一性原理"。
> 它直接催生了 Phase 4 Batch 1 的反应式散文（`Var`/`Calc`）与可见性/溯源建设。

## 一、Bret Victor：动态媒介的第一性原理

### Explorable Explanations（2011）—— 反应式文档（★ Var/Calc 直接出处）

目标：把文本从"要被消费的信息"变成**"a environment to think in（可思考的环境）"**，
把被动读者变成主动读者（提问、考虑替代方案、质疑假设）。三种原型：

1. **Reactive Documents（反应式文档）**：读者可"play with the author's assumptions and
   analyses, and see the consequences"——实时改参数看结论（范例 *Ten Brighter Ideas*）。
   配套的 **Tangle** JS 库：文中的数字带点状下划线示意可拖，拖动即联动重算全文相关值。
2. **Explorable Examples（可探索范例）**：让抽象变具体，读者直接操作系统、多重表征同时呈现。
3. **Contextual Information（上下文信息）**：就地"just-in-time"学习，不离开原文即可交叉验证。

**本站对应物**：`Var`（可拖数字，点状下划线的手感直接学 Tangle）+ `Calc`（联动重算的内联结果）
= 反应式散文，让"文字档"本身活起来（MEDIUM §2 档 4 的文字形态）。

### Magic Ink（2006）—— 软件即信息设计

- 软件三类：information / manipulation / communication；**多数软件其实是信息软件**——
  人用软件是为了**学习**（读、看、推理），不是操作。
- **信息软件设计 = 图形/信息设计，而非机械工程**。设计者该问："什么是相关信息？读者会问什么？"
- **上下文优先**：从 environment（位置/时间）、history（历史行为）、interaction（用户输入）
  三源推断上下文，尽量用前两者。尖锐论点："for information software, all interaction is
  essentially navigation around a data space"——不必要的交互是认知负担（excise）。

**本站对应物**：媒介优先于功能——先问"读者想问什么问题"，再决定升档（MEDIUM §2 铁律）；
溯源行用 frontmatter 自动渲染（context 优先，读者不用点就知道来历）。

### Up and Down the Ladder of Abstraction（2011）—— 在抽象层级间移动

最有力的洞察来自**在抽象层级之间移动**；关键技术：**直接实时控制自变量**、
把"一个状态"升级为**同时看到所有状态**（如把小车逐帧运动升级为一次画出整条轨迹）、
多重表征叠加。**本站对应物**：反应式散文让读者实时控制自变量；ROADMAP Batch 3 的
amb/可能性扇出瞄准"同时看到所有状态"。

### Media for Thinking the Unthinkable —— 表征决定思考

核心命题：**"Our representations of a system are how we understand it."**
要更强的思考就要更强的表征。**"live data, not dead symbols（活数据，而非死符号）"**：
表征应由实时数据构成、承载行为，而非仅是静态结构。**本站对应物**：媒介组件持有数据与规则
（`Var` 持有可拖的变量、`RuleGarden` 持有规则），而非只持有渲染好的像素（MEDIUM 原则 2）。

## 二、Realtalk / Dynamicland

### 编程模型：Claim / Wish / When

Realtalk 是 Dynamicland（Bret Victor 的实验室）开发的系统，是一个**反应式数据库**。
物件之间不调用函数、不共享变量，而是往共享数据库读写 statement：

- **Claim（声明）**= 关于当前状态的事实广播（"我是一张地图，坐标是…"），不保证发生任何事。
- **Wish（愿望）**= 希望成真的期望状态（"希望这张地图被高亮成蓝色"），不指定由谁实现。
- **When（当…时）**= 反应式处理器：数据库中出现匹配模式时触发。

行为从各自的规则中**涌现**——没有人预先协调。这就是反应式编程：状态一变，规则自动重新求值。

### 核心设计原则

1. **可见性**：程序就印在物体上，"there is no underlying stack hidden on a hard drive"。
2. **实时性**：代码持续运行，修改立即生效。
3. **空间性与具身性**：空间关系（"上方有对象时"）本身就是程序语义。
4. **社群性**：程序归属于空间而非个人设备，学习靠围观发生。
5. **反威权**：传统软件"程序员做、用户用"是一种威权分工；Realtalk 让二者拥有同等的创造与修改权。

### 那篇博客的论点（sheracaolity.ghost.io）—— 工程 vs 创作

作者（Alan Chan）的核心区分（引 Bret Victor）：**Programming 有两种用途——Engineering
（构建可靠系统）与 Authoring（把计算当媒介，在他人心智中创造理解）**。
Realtalk 优先服务 Authoring：**"它的目的从来不是让我们更快地造更多软件，而是创造一个
人人都能以计算机为动态媒介来研究和讨论复杂系统、拓展认知的世界。"**
评判它的正确问题不是"它现在能做什么"，而是"**它想创造一个什么样的世界**"。

### 可迁移 / 不可迁移（对本站最重要的判断）

**可迁移到网页**：实时性/可修改性（explorable explanations、可编辑沙箱）；
声明式/响应式模型（Claim/When/Wish ≈ 响应式规则引擎 = `RuleGarden`）；
可见性（组件携带并展示源码 = "拆开看"）；创作优先于工程；小对象彼此声明、叠加的可组合性。

**本质上不可迁移**：具身性与全身尺度的空间语义；共同在场的社群性（多人围桌、余光学习）；
计算融入建筑环境；纸的物质惰性与随手性。

**一句话**：网页能继承 Realtalk 的软件灵魂（实时、可见、可改、可组合、面向理解的创作），
但继承不了它的身体和场所。本站的对应翻译：**页面即房间，视口即桌面，滚动即走动，
文中元素即摊在桌上的物件**——"当这段文字进入视野"与"当我上方有对象时"是同构的空间谓词。

## 三、蒸馏：对本站的设计原则映射

| 原则 | 出处 | 本站落点 |
|---|---|---|
| 反应式文档，读者拨动假设 | Explorable Explanations / Tangle | `Var` + `Calc` |
| 活数据而非死符号，展示所有状态 | Media for Thinking / Ladder of Abstraction | 反应式散文、ParamSlider；Batch 3 amb |
| 可见源码，页面自我解释 | Dynamicland / Realtalk | 「拆开看」source-view + PageHistory |
| 声明式响应式规则，行为涌现 | Realtalk Claim/Wish/When | `RuleGarden` + `RuleTarget`（第五档） |
| 创作优先于工程 | Bret Victor / 那篇博客 | MEDIUM 全文以"媒介表达"为纲，不以"功能"为纲 |
| 上下文优先，减少无谓交互 | Magic Ink | 溯源行自动渲染、默认值即对的 |

## 附：主要来源

- https://sheracaolity.ghost.io/realtalk-and-visual-end-user-programming/ （主文章，Alan Chan）
- https://worrydream.com/ExplorableExplanations/ （反应式文档 + Tangle）
- https://worrydream.com/MagicInk/ · https://worrydream.com/LadderOfAbstraction/
- https://worrydream.com/MediaForThinkingTheUnthinkable/
- https://omar.website/posts/notes-from-dynamicland-geokit/ （Claim/Wish/When 最清晰实操）
- https://dynamicland.org/ （"humane dynamic medium" 与共同体计算）
