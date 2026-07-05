# Ink & Switch 与 Realtalk 调研档案

> 调研时间：2026-07-03。本档案是"把网页当动态媒介"研究线（`web-as-medium`）的原始材料，
> 由四份并行调研笔记整理而成：实验室全貌、动态媒介核心文章精读、Realtalk 思想脉络、网站形态分析。
> 它直接催生了本站的媒介引擎建设（见 [docs/MEDIUM.md](../MEDIUM.md) 与研究线笔记）。

## 一、Ink & Switch 实验室全貌

### 概况与使命

Ink & Switch（https://www.inkandswitch.com/）是一家独立的**工业研究实验室**，2016 年由
Heroku 创始团队（James Lindenbaum、Adam Wiggins、Orion Henry 等）创立，现任 lab director 为
Peter van Hardenberg。使命：追求"一台放大人类智能的新计算机"——直接继承
Engelbart / Alan Kay / Bret Victor 一脉的 "computing as a dynamic medium" 与 "tools for thought" 传统。

产出形态：深度 Essay（旗舰长文）、项目结项报告、**Lab Notebook**（进行中项目的编号滚动记录）、
生产级软件（Automerge；Muse → 现名 Allume）、Newsletter（Dispatch 001–018）与 Local-First Conf。

### 方法论

1. **小团队短周期项目制**：数周到数月一个项目，编号制（001 LiveBook → 039 Livelymerge，约 40 个）。
2. **四条研究线（track）组织**，项目可跨线：
   - Local-first Software（/local-first-software/）
   - Malleable Software（/malleable-software/）
   - Programmable Ink（/ink/）
   - Universal Version Control（/universal-version-control/）
3. **Lab Notebook 文化**（约 2024 年起）：公开"内部规划文档、design jam 的 mockup、丢弃的微型原型"；
   essay 是结晶，notebook 是矿脉。
4. **原型优先、dogfooding**：识别根本缺陷 → 造能用的原型 → 用它做真实工作 → 公开报告提炼原则。
   PlayBook 项目的自省很典型：意识到"从未用自己的技术真正做过东西"后转向 design-first。
5. **Spin-out**：Capstone → Muse 公司；CRDT 研究 → Automerge 生态；Local-first 理念 → 整个社区运动。

### 关键项目清单（按研究线）

**Local-first**：
- *Local-first software*（2019，/essay/local-first/）——创造术语的宣言。七大理想：无加载等待、
  多设备、离线可用、无缝协作、数据长存、隐私安全、用户最终控制权；CRDT 为候选基础技术。
- Pixelpusher（2018）/ PushPin（2020）——P2P 协作的早期试水与生产化探索。
- Cambria（2020）——双向 lens 做 schema 演化翻译。
- Peritext（2021）——富文本 CRDT，格式区间锚定稳定字符 ID。
- Backchannel（2021）——基于关系的身份（petname + 共享密钥），身份是社交关系的产物而非平台账户。
- Keyhive（2024–2026，前名 Beehive）——convergent capabilities + BeeKEM 群组密钥协商 + Beelay
  盲同步协议，补齐 local-first 的加密与权限拼图。

**Universal Version Control**：
- Upwelling（2023）——写作者需要"创作隐私"（草稿层）+ 显式合并。
- Patchwork（2024–2026）——通用版本控制活体实验台：文档和"编辑器本身"都可分支；实验室自己
  长期在其中写作（Tenfold 即在其中完成）。
- Jacquard（2024）——科研论文写作场景；Backstitch（2024–2026）——Godot 游戏引擎教学场景的
  可视化版本控制（青少年可用）。

**Malleable Software**：
- *End-user programming*（2019）——三大设计维度：**Embodiment（具身化）/ Living system（活系统）/
  In-place toolchain（原地工具链）**。Capstone 五实验的关键洞察：计算一旦遵循与数据相同的规则
  （可克隆、可分享、可存放），就被民主化了。
- *Potluck*（2022）——动态文档作为个人软件：**gradual enrichment**，文本笔记渐进长成应用；
  Searches / Computations / Dynamic annotations 三基元；live text as source of truth。
- *Embark*（2023）——**unbundling**：数据/计算/视图三层解绑为 Mentions / Formulas / Views 三原语；
  大纲即基底；自由文本是一切计算的 graceful fallback。
- *Malleable Software*（2025，纲领 essay）——**gentle slope**（从使用到创造应是缓坡而非悬崖）；
  tools, not apps（共享数据基底 + 可组合 UI）；communal creation（local developers、
  home-cooked apps）；AI 须与可塑基底结合，否则只能生产更多孤岛 app。
- Tenfold（2026）——十周年互动字体，"字母即工具"；开放社区改造后溢出原始意图。
- Livelymerge（2026）——把 Lively Kernel 全部系统状态放进一个 Automerge 文档，合并活系统。

**Programmable Ink**：
- *Inkbase*（2022）——手绘草图像电子表格一样可编程；空间关系是响应式编程原语。
- Crosscut（2022）/ Untangle（2023）/ Habitat（2022 冬）/ Inkling（2023）/ PlayBook（2024–）——
  从"画出动态模型"到"多计算模型生态"到 ink/paper/pin/beam 四种材料。
- Sketchpad 复刻（2024–2026）——忠实复刻 Sutherland 1963 年系统，历史考古作为研究方法。

**早期 tools-for-thought**：Capstone（2018）、Muse（2019）、Slow software（2018，100ms 内才有
"物理感"）、Ambsheets（2024–2025，单元格容纳多个 amb 值做情景枚举）。

### 跨项目核心理念

1. **Computing as a dynamic medium**：计算机不是"应用的容器"而是像纸/黏土一样的动态材料。
2. **Tools for thought**：产品判据不是效率而是"是否让人想得更清楚"。
3. **Agency 与 Ownership**：四条线是同一命题（把控制权从云平台移回用户）的数据层、代码层、
   安全层与协作层。
4. **Gentle slope / 渐进增强**：从消费者到创造者的缓坡。
5. **文档优于 App**："app 是数据竖井"；通用基底 + 可组合小工具。
6. **公开过程**：半成品、失败实验照发不误。
7. **历史考古**：反复回到 Sketchpad、HyperCard、spreadsheet 寻找被遗忘的路径。

## 二、动态媒介核心文章精读要点

### Local-first（2019）
"你拥有数据，尽管有云"。七理想逐项给现有方案打分（无一满分）→ 引出 CRDT。
原型（Trellis / Pixelpusher / PushPin）的坦率结论：离线体验有"无焦虑的拥有感"，
但 CRDT 历史累积、P2P NAT、在线/离线状态模糊都是真问题。

### End-user Programming（2019）
Embodiment / Living system / In-place toolchain 三维度是本系列最常被引用的框架。
Capstone 的 Bots 实验：长驻程序被具身为"有个性的卡片"，删除=扔出屏幕、复制=克隆——
用户像管理数据一样管理计算。

### Potluck（2022）
文本同时是"信息的来源"和"承载 UI 的基底"。三基元：可复用文本模式搜索（`{number:amount} g`）、
电子表格式公式、**标注层叠回原文且绝不改写原始文本**。所有状态必须以文本形式存在文档里
（没有隐藏元数据），因此天然继承 undo/copy/paste 与可移植性。局限坦承：解析他人文本远难于
自己的微语法；标注只有一维布局；几十条 search 后维护成本陡增。

### Inkbase（2022）
每一笔 ink 都是可编程对象；`(? obj prop)` 读属性自动登记响应式依赖，空间查询
（inside/overlaps/方位）都是响应式原语。Sketchy math demo：手绘弹跳球轨迹 + 画个三角形
（导数算子）→ 实时导数曲线。坦承编程模型是"最未解决的部分"。
区分"增强信息（人决策）"与"替代工作（系统代劳）"——前者才保住"与材料一起工作"的手感。

### Embark（2023）
Bundling 批判：app 把数据、计算、视图捆死。三原语 Mentions（@引用带结构化属性）、
Formulas（`Weather(in: @Aachen, on: @Friday)`，刻意选"具体计算+智能复制"而非抽象模式匹配，
换可预测性）、Views（地图/日历/表格挂在大纲节点上读子树）。杀手镜头：同一个日历合并显示
天气公式结果和手记条目。

### Malleable Software（2025）
"悬崖 vs 缓坡"曲线；"牛油果切片器 vs 刀"；共享数据基底（文件系统、Smalltalk image、
Webstrates、Automerge）+ 可组合 UI（OpenDoc、Dynamicland）。对 AI 的论述："把 AI 编码工具
丢进今天的软件生态，如同给自助餐厅配名厨"——没有可塑基底，AI 只能生产更多孤岛。

### Untangle（2023）—— 黑/粉双色，人机声音之辨（★ Batch 1 溯源）
手绘 + SMT 求解器（Z3）解决日常"够用就好"的约束问题（排班/座位/分配）。
关键设计：**用户手写的输入是黑墨，求解器算出的结果是粉墨——两种声音永远视觉可辨**。
过约束时优雅降级（放松约束而非报错，"错误答案好过没有答案"，被违反的规则标红）；
多解并陈，用户滑动挑一个顺眼的。**本站翻译**：正文 ink 色 = 人声（创作者的判断），
`Calc` 的 accent 色 = 机器声（AI/计算的推导）——这是本站"人机双声"视觉体系的直接出处
（见 MEDIUM §8 chat 专则）。

### Upwelling / Patchwork —— 版本历史即媒介（★ Batch 1 溯源）
**Upwelling（2023）**：写作者需要"创作隐私"——初稿不想被实时围观（fishbowl effect），
用 draft 图层做可私有/可分享的工作区，再刻意合并进永久 stack；每个 draft 带标题说明意图
（借自 Git commit message）；变更可视化把"删除"藏在可交互标记后而非删除线，降低视觉噪音。
**Patchwork（2024–）**："版本历史即聊天"——用类聊天界面给历史加轻量标注，
分支是"探索的一等公民"，愿景是把版本控制推广到图表/表格等任意数据（beyond prose）。
**核心洞见**：版本历史不是行政开销、不是备份，而是**一种可读的媒介**——修订说明写给读者看，
让思路的演进透明。**本站翻译**：`PageHistory`（frontmatter `history: true`）把一篇故事的
git 提交史渲染成文末"这一页如何长成"时间线；配 commit 信息约定
（`publish:` / `revise:` 前缀 + 一句话意图，写给读者看）。

### Ambsheets（2024–2025）—— 一格多值的可能性空间（Batch 3 出处）
"如果单个单元格能同时持有多个值会怎样？"`{500, 1200}` 表示"500 或 1200"，
即一个 amb（ambiguous）值，代表可能性空间的一维。amb 值像普通值一样流过公式，
`{500,1200} × {2800,3700,5500}` 自动扇出成 6 个场景，用堆叠/表格视图可视化结果分布。
**对本站**：非常适合展示 AI 生成的多个备选表达 / 多条推理路径——已列入 Batch 3
（`Calc` 的 amb 扩展），本档案先存出处。

### 他们的文章页面本身如何做（形式自证）
1. 嵌入式可交互 demo（Potluck 页面里的示例文档可直接编辑，"Open in Potluck"）；
   **视频先行、点击升级为可交互实例**。
2. 视频/GIF 优先于文字描述交互，"眼见即论据"；Embark 一文 12 个原生 `<video>`（非 iframe）。
3. 学术骨架 + 杂志质感：目录、正式引用元数据、附录、图注当正文用。
4. 诚实的实验报告文体：愿景 → 原型 → findings → 坦承失败。
5. 物理世界照片做修辞锚点。
6. 反馈回路：文末 email/Bluesky、GitHub、notebook 链接——essay 是长期对话的节点而非终稿。

## 三、Realtalk / Dynamicland 思想脉络

### 那篇博客的论点（sheracaolity.ghost.io/realtalk-and-visual-end-user-programming/）

作者（Heptabase 创始人 Alan Chan）：**Realtalk 的目的不是让软件开发更快，而是创造一个人人都能
把计算机当作动态媒介、用来研究复杂系统和扩展认知的世界。**

- Realtalk 是 Bret Victor 的 Dynamicland 实验室开发的系统（名字致敬 Smalltalk）。物理空间中由
  "计算对象"组成——每个对象既是程序又是界面，状态被实时投射为可见的视觉表现。
- 编程模型三原语：**Claim（宣称"我是一张地图"）/ When（当空间中存在地图对象时）/ Wish
  （希望把 OpenStreetMap 取图投影到它上面）**。对象间不靠变量和函数调用通信，用声明式语法交流。
- 核心创新：传统软件"开发"与"使用"分离，Realtalk 把二者耦合——用户发现软件不合需求时当场
  改写对象上的代码，立刻生效。蛋白质可视化例子：三位科学家逐层叠加彼此的工作，无需预先设计接口。
- Victor 对编程两种目的的区分：**工程**（构建可靠系统）vs **创作**（authoring，以计算机为媒介
  在他人心智中创造印象）。理解新系统的正确问题不是"它能做什么"，而是"**它想创造什么样的世界**"。

### Dynamicland 与 Victor 作品脉络

天花板相机与投影仪把整栋建筑变成计算机；纸张（彩色圆点标记）既是程序清单又是界面，放上桌面即
运行；程序像"物理迷因"在空间中被复印、传播、改编。思想脉络：《Magic Ink》(2006) →
《Media for Thinking the Unthinkable》→《The Humane Representation of Thought》
（批判"指尖大小的玻璃矩形"）→ Dynamicland 是实体化答案。终点是 Alan Kay 式愿景：
计算成为像读写能力一样的公共素养。

### 核心设计原则

1. **可见性**：程序就印在物体上，代码、数据、界面同在一处，没有藏在文件系统深处的黑箱。
2. **实时性**：代码持续运行，修改立即生效。
3. **空间性与具身性**：空间关系（"上方有对象时"）本身就是程序语义。
4. **社群性**：程序归属于空间而非个人设备，学习靠围观发生。
5. **对"屏幕里的 app"范式的批判**：app 是密封消费品；计算应像电灯一样融入环境。

### 可迁移 / 不可迁移（对本站最重要的判断）

**可迁移到网页**：实时性/可修改性（live coding、可编辑沙箱、explorable explanations）；
声明式/响应式模型（Claim/When/Wish ≈ 响应式规则引擎）；可见性（组件携带并展示自己的源码）;
创作优先于工程；小对象互相声明、彼此叠加的可组合性。

**本质上不可迁移**：具身性与全身尺度的空间语义；共同在场的社群性（多人围桌、余光学习）；
计算融入建筑环境；纸的物质惰性与随手性。

**一句话：网页能继承 Realtalk 的软件灵魂（实时、可见、可改、可组合、面向理解的创作），
但继承不了它的身体和场所。** 本站的对应翻译：**页面即房间，视口即桌面，滚动即走动，
文中元素即摊在桌上的物件**——"当这段文字进入视野"与"当我上方有对象时"是同构的空间谓词。

## 四、inkandswitch.com 网站形态分析

### 信息架构
首页不是时间线，是**研究议程**：Research Areas（四线）→ Featured Work（Essay / Lab Notebook
类型标签）→ Production Software → Lab Meta。**Essay = 定稿**（摘要、正式引用、致谢，不再滚动
更新）；**Lab Notebook = 项目 URL 下的编号日志**（"01 · A spreadsheet for exploring scenarios"，
带 `<time>`）。项目是一等公民，文章类型是它的属性。Dispatch 是横切近况通讯。

### Essay 版面语言（HTML 层面）
- 页眉即论文首页：h1 + 副标题 + byline（作者外链 + time）+ 摘要段 + "Please cite this work as"
  blockquote + 反馈渠道。
- 目录：纯 HTML nav + 锚点。
- 旁注：`<aside class="move-up" style="--move-up: 6">` 写在正文流内，桌面端 CSS 绝对定位推到
  右侧 15rem 边栏，`--move-up` 变量手工微调对齐；窄屏自然回落为块级插注。低技术、高效果。
- 图注当正文；宽幅 `class="wide"` 破栏；demo 全部用原生 `<video controls playsinline>`
  短视频而非 iframe（快、稳、可归档）。
- 自定义元素 `<outlink>` 做外链箭头；对比表 scorecard 三色。
- 文末固定：Acknowledgments + 反馈邀请。

### 视觉
正文 Merriweather 衬线严格基线网格；标题 Geogrotesque；近乎黑白 + 唯一强调色朱红 #f7505e；
链接下划线是手绘 SVG；分隔线是墨点飞溅。手绘"墨水"风统一插图与装饰，软化论文严肃感。

### 对本站的可借鉴机制（已转化为建设任务）

**第一轮（Phase 3+，已完成）**：
1. **两档发布制**（essay/notebook）→ stories 集合 kind: notebook + thread/seq
2. **项目/研究线为一等公民** → src/data/threads.ts + /threads 路由
3. **论文式页眉**（署名+摘要+引用+反馈接口）→ Story 布局升级
4. **CSS 旁注** → SideNote 组件
5. **视频先行、点击升级** → InteractiveDemo poster 档
6. **可见性** → remark 源码 disclosure（"拆开看"）
7. **每篇文末的关系接口** → 招募段 + mailto

**第二轮（Phase 4 Batch 1，已完成）**：
8. **反应式文档**（Tangle：拨动作者的假设）→ `Var` + `Calc` 反应式散文
9. **scorecard 评分表**（Local-first 的 7 理想 × 候选方案）→ `VerdictTable`
10. **文本 ↔ 视图双向高亮**（Embark 的 mention/view 同步）→ `Mention` + `MentionTarget`
11. **版本历史即媒介**（Upwelling/Patchwork）→ `PageHistory` + commit 约定
12. **人机双声之辨**（Untangle 黑/粉）→ 正文 ink 色 vs `Calc` accent 色 + `source` 溯源
13. **渐进形式化 / 缓坡**（Potluck/Malleable）→ 输入类型转换专则（MEDIUM §8）+ 两档发布制

## 附：主要来源

- https://www.inkandswitch.com/ （首页、四条 track 页、essay 索引、十余个项目页）
- https://www.inkandswitch.com/essay/local-first/
- https://www.inkandswitch.com/end-user-programming/
- https://www.inkandswitch.com/potluck/ · /inkbase/ · /embark/
- https://www.inkandswitch.com/essay/malleable-software/
- https://sheracaolity.ghost.io/realtalk-and-visual-end-user-programming/
- https://dynamicland.org/2024/Intro/ · https://dynamicland.org/publications/
- https://tashian.com/articles/dynamicland/ （At Dynamicland, The Building Is The Computer）
- https://notes.fringeling.com/WhatIsBretVictorTryingToDo/
