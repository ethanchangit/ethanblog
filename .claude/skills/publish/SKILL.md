---
name: publish
description: 把创作者的原始输入（对话记录 / 个人笔记 / 博客草稿）转化为 Ethan Chang 个人博客（ethanchang.io）的 MDX 文章页面。当用户消息首行以 /publish 或 发布： 开头时必须使用本 skill。它是 docs/MEDIUM.md 创作规范的可执行形态。
---

# /publish —— 把素材写成文章页

**这是 Ethan Chang 的个人博客。** 用户负责写剧本（对话 / 笔记 / 草稿），你负责把它翻译成本站的 MDX 页面（默认文字；需要时再嵌交互组件）。
本 skill 是操作清单；**判定规则的完整依据在 [docs/MEDIUM.md](../../../docs/MEDIUM.md)**，
不确定时回去查它对应小节。硬性技术红线在 [AGENTS.md](../../../AGENTS.md)。

## 边界（先确认，再动手）

- 只动内容层：`src/content/articles/`、`src/content/projects/`。
- **禁止**新建或修改媒介组件、布局、样式、API、测试基建——除非用户在 YAML 头写了 `allow-new-component: true`。
- 新页面默认 `draft: true`。

## 十步清单

### 1. 解析输入头
读 `---` 上方的可选 YAML：`slug` / `draft` / `allow-new-component`（都可省略）。`---` 下方是原始素材。

### 2. 识别输入类型 → 读对应专则
判断素材是 **chat**（对话记录）/ **notes**（个人笔记）/ **blog**（文章草稿）/ **mixed**，
然后读 [MEDIUM.md §8](../../../docs/MEDIUM.md) 的对应专则。要点速记：
- **chat**：区分人声（创作者判断 → 正文）与机器声（AI 补充 → `Calc`/`SideNote`/`VerdictTable`）；不保留一问一答的往返结构，只提炼论点。
- **notes**：bullet 先聚类成 3–8 个论点。
- **blog**：升档植入为主，不重写作者语气；只动"用文字硬讲参数/对比/因果"的段落。

### 3. 提炼论点清单
列出 3–8 个论点/发现/情节节点。**保留创作者的原话与判断**——你转化的是形式，不是观点。

### 4. 逐论点选档（查决策表）
对每个论点查 [MEDIUM.md §5](../../../docs/MEDIUM.md) 决策表。默认档位是文字；只有当
"亲手操作能替代一段解释"时才升档。一篇通常 1–3 个交互组件，超过 4 个要自我怀疑。
常用映射：数字关系且读者会想改假设 → `Var`+`Calc`；多方案 × 多维度 → `VerdictTable`；
正文词语与媒介块互证 → `Mention`+`MentionTarget`；行为/因果 → `RuleGarden`。

### 5. 定落盘路径
- 文章 → `src/content/articles/<slug>.mdx`
- 系列子文 → `src/content/articles/<hub>/<n>.mdx`（总览是 `<hub>.mdx`；子文默认不进 `/articles`）
- 项目页（用户明确说「项目」）→ `src/content/projects/<slug>.mdx`

### 6. 写 frontmatter
- `description` ≤80 字，可检验的陈述句（渲染成摘要块 + RSS，别写悬念句）
- **定稿必须双语**：`titleEn` + `descriptionEn`（文章必填 `titleEn`；项目可省略若标题已是英文），正文用 `<div data-lang-split></div>` 切开中英；草稿可暂缺（`validate:content` 对 draft 降级）
- **`slot`**：`article` 或 `project`，决定出现在 `/articles` 还是 `/projects`。不要写进 topical `tags`。
- 系列子文靠目录嵌套（`<hub>/<n>.mdx`），不必写 `listed: false`；顶层文章要藏起来才写 `listed: false`。
- `draft: true`
- 模板见 [MEDIUM.md §11](../../../docs/MEDIUM.md)

### 7. 组装 MDX
- 从 `@/components/media` 导入组件（**只走 barrel，不走深路径**）
- **Svelte 岛屿写 `client:visible`**：`ParamSlider` / `ScrollScene` / `Timeline` / `StatCounter` /
  `BeforeAfterSlider` / `AudioClip` / `InteractiveDemo` / `ImageGallery` / `Scene3D` / **`Var` / `Calc`**
  （`ScrollScene` 必须 `client:visible={{ rootMargin: '150% 0px' }}`）
- **Astro 组件不写 client 指令**：`VideoEmbed` / `TweetEmbed` / `CodePlayground` / `MediaFrame` / `SideNote` /
  `RuleGarden` / `RuleTarget` / `VerdictTable` / `Mention` / `MentionTarget` / `DocList` / `DocRef`
- **`Calc` 必须出现在它引用的所有 `Var` 之后**（SSR 初值依赖文档顺序）
- 不要写 `sourceView`：读者侧永不注入「⌥ 源码」

### 8. 验证四连
```bash
npm run validate:content && npm run check && npm run build && npm run test
```
含交互组件时 `npm run test` 不可省。`validate:content` 报 error 必须先修
（draft 文件的 error 会降级为 warning，但正式发布前应清零）。

### 9. 提交
普通 git 提交即可。不要为读者写 `publish:` / `revise:` 前缀——文末不再渲染提交史。

### 10. 汇报
向用户报告：slug、draft 状态、本地预览路径（如 `/articles/<slug>`）、
用到的媒介组件清单。

## 新媒介组件（仅当 allow-new-component: true）

若这次创作确实需要一个不存在的媒介组件，走 [MEDIUM.md §11](../../../docs/MEDIUM.md) 的
「新媒介组件准入」流程（六条契约 → /lab 点亮 → 测试 → README/决策表/白名单/validate 清单同步）。
否则**用现有组件表达**，不要为一篇内容临时造组件。
