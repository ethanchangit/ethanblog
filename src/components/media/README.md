# 媒介组件库（Media Component Library）

> **这是 Ethan Chang 的个人博客**（https://ethanchang.io）上的可选交互组件。

一组可以直接嵌进 MDX 故事里的交互组件。
写故事时默认用文字；需要时再逐级升档：文字 → 图片 → 音视频 → 可交互组件。

在线演示与 QA：访问 [/lab](/lab)。

## 组件契约（新组件必须遵守）

1. **Props 必须 JSON 可序列化**（跨岛屿注水边界）；富内容用声明式数据（数组/对象），不用函数
2. **无 JS 必须优雅降级**：服务端渲染出有意义的静态内容（ScrollScene 平铺全部场景、AudioClip 渲染原生 `<audio>`、InteractiveDemo 给出新窗口链接、CodePlayground 渲染只读代码块、VideoEmbed 的 YouTube 封面链到原站）
3. **注水指令**：默认 `client:visible`；仅首屏组件用 `client:load`；能不注水就不注水（VideoEmbed 是 Astro + 文档级点击委托，YouTube 封面点击后再加载官方播放器；TweetEmbed 是零 JS 自绘卡片）。**CodePlayground** 为 Astro 薄包装，内部已含 `client:visible`，MDX 可直接 `<CodePlayground />` 无需写指令。**ScrollScene 例外**：必须用 `client:visible={{ rootMargin: '150% 0px' }}` 提前注水——它注水后会从静态平铺膨胀成数倍视口高度的滚动剧场，提前展开可避免读者眼前的布局跳动
4. **只消费设计 token**（`--color-*`），组件内不写死色值；canvas / WebGL 通过 `getComputedStyle` 读 token
5. **统一支持 `caption`**，外框统一用 `.media-frame` / `.media-caption`（仅间距与图注，**无边框、无背景色块**）
6. **动效尊重 `prefers-reduced-motion`**（用 `@/lib/motion` 的 `reducedMotion()`），GSAP / three.js 只在 onMount/$effect 里创建并在销毁时 kill / dispose
7. **视觉极简**：不使用装饰性边框、圆角卡片、色条、渐变遮罩、设备边框（红绿灯）等产品感 chrome。**TweetEmbed 例外**：边框与圆角只为对齐 X 帖子的阅读结构，不含关注 / 互动 / 回复入口。

## 可见性：拆开看

构建期 remark 插件（`plugins/remark-source-view.mjs`）仍在仓库里，
**默认不向读者注入「⌥ 源码」**。需要自我解释时把插件 `ENABLED` 打开，并在 frontmatter 写 `sourceView: true`。

白名单与本目录的 `index.ts` barrel 保持同步
（MediaFrame / SideNote / RuleTarget / Var / Calc / Mention / MentionTarget 这类纯排版、
标记与行内组件除外——行内组件在 MDX 里是 `mdxJsxTextElement`，本就不会被插件命中）。

单处关闭：给组件加 `noSource` 属性（构建期会被摘除，不会泄漏到渲染输出）。

## 目录

| 组件 | 类型 | 用途 |
|---|---|---|
| `ParamSlider` | Svelte | 滑块驱动 canvas 可视化（network/bars/curve，可通过 `src/lib/viz/registry.ts` 扩展） |
| `ScrollScene` | Svelte | GSAP 滚动剧场：场景文字 + 可视化随滚动演进 |
| `BeforeAfterSlider` | Svelte | 前后对比拖拽（图片），键盘可访问 |
| `Timeline` | Svelte | 垂直时间线，滚动渐入；条目可选 `href`（SSR `<a>`） |
| `StatCounter` | Svelte | 数字滚动计数面板 |
| `AudioClip` | Svelte | 自绘波形音频播放器（峰值用 `scripts/audio-peaks.mjs` 预计算） |
| `InteractiveDemo` | Svelte | 沙箱 iframe 承载自包含软件演示（`public/demos/<name>/index.html`）；可选 `poster`/`posterVideo`/`posterAlt` 提供未加载态预览（视频先行、点击升级；reduced-motion 或无 JS 时退回图片） |
| `Scene3D` | Svelte | three.js 岛屿：线框地球 / 粒子场 / 旋转立方体 |
| `VideoEmbed` | Astro | YouTube 封面点击后再加载官方播放器；Bilibili 仍直接 iframe；本地文件用原生 video |
| `TweetEmbed` | Astro | 自绘 X 卡片：构建期拉正文并完整展开；X logo 进原帖，头像 / handle 进主页，视频页内播放 |
| `CodePlayground` | Astro → Svelte | Sandpack 沙箱：点击 Run 在 iframe 中执行代码 |
| `MediaFrame` | Astro | 把任意内容包进统一媒介外框 |
| `SideNote` | Astro | 旁注：宽屏悬挂右页边，窄屏回落为插注块（零 JS，不套 media-frame） |
| `RuleGarden` | Astro → Svelte | 规则花园：Claim/When/Wish 的网页版，"页面即房间"，规则句可开关/改写/添加；无 JS 时降级为 describeRules 散文 |
| `RuleTarget` | Astro | 零 JS 目标标记：给页面元素声明 `data-rule-target` 身份（Claim），供 RuleGarden 的规则引用（不套 media-frame） |
| `Var` | Svelte（行内） | 反应式散文：正文里可拖动的数字（Tangle 手感），同 scope 共享状态；SSR 是纯文本，注水后 `role="slider"` + 键盘可访问 |
| `Calc` | Svelte（行内） | 反应式散文：随 `Var` 实时重算的内联结果（accent「机器声」音色）；安全表达式求值，无 JS 时显示初值 |
| `VerdictTable` | Astro | 零 JS 裁决表：多方案 × 多维度评分矩阵（✓/—/✗ + 备注 + 条形图），窄屏横滚 |
| `Mention` | Astro | 正文词语，与同 id 的 `MentionTarget` 双向高亮；点击/Enter 滚动到目标（零 JS 降级为普通文本） |
| `MentionTarget` | Astro | `Mention` 的落点容器（可包住任何媒介块，含已套 MediaFrame 的组件） |

## MDX 用法示例

```mdx
import { ParamSlider, ScrollScene, InteractiveDemo, Scene3D, TweetEmbed } from '@/components/media';

<ParamSlider
  client:visible
  label="卡片数量"
  paramKey="count"
  min={10} max={200} initial={60}
  viz="network"
  caption="左边的滑块控制右边的知识网络。"
/>

<TweetEmbed
  url="https://x.com/ethanchang_/status/1234567890"
  caption="月度整理里引用的一条原帖。"
/>

<CodePlayground
  title="hello.js"
  template="vanilla"
  code={`console.log('Hello, medium!');`}
  caption="点击 Run 在线运行。"
/>

<Scene3D
  client:visible
  scene="globe"
  caption="旅行故事里的线框地球。"
/>

<InteractiveDemo
  client:visible
  src="/demos/knowledge-garden/"
  title="知识花园"
  caption="一个可以玩的小软件。"
/>
```

### VideoEmbed props

| Prop | 类型 | 说明 |
|---|---|---|
| `provider` | `'youtube'` \| `'bilibili'` \| `'file'` | 来源 |
| `id` | `string` | YouTube 视频 id 或 Bilibili bvid |
| `src` | `string` | `file` 的视频地址 |
| `title` | `string` | 无障碍标题 |
| `poster` | `string` | 封面；YouTube 缺省用 `i.ytimg.com` 的 `hqdefault` |
| `caption` | `string` | 图注 |

YouTube 不在进页时自动挂 `youtube.com/embed` iframe。封面点击后才加载官方播放器；「在 YouTube 观看」始终留在播放器外，iframe 被登录墙挡住时还能出去。无 JS 时封面就是原站链接。换 `youtube-nocookie.com` 或改 `referrerpolicy` 挡不住 YouTube 的 bot 检测（Cursor 内嵌浏览器尤其容易中），所以不走那条。Bilibili 仍直接出 iframe。MDX 无需 `client:*`。

### TweetEmbed props

| Prop | 类型 | 说明 |
|---|---|---|
| `url` | `string` | X / Twitter 帖子链接（`https://x.com/<user>/status/<id>`） |
| `caption` | `string` | 图注 |

构建期从链接解析 id，优先读 `src/data/tweet-cache/<id>.json`，没有再走 syndication 拉正文；用本站 chrome 画成推文卡（头像 / 认证 / 全文 / 媒体 / 时间）。长帖不折叠、没有「显示更多」，也没有「查看 N 条回复」。只有右上角 X logo 打开原帖，头像与 handle 打开作者主页；正文与图片不跳转。帖子里的视频用原生 `<video>` 在页内播放。MDX 无需 `client:*`。卡片边框与圆角是为了对齐 X 的阅读结构，不引入官方 widget。

### CodePlayground props

| Prop | 类型 | 说明 |
|---|---|---|
| `code` | `string` | 主文件源码 |
| `lang` | `string` | 语法高亮语言标签（SSR 降级展示用） |
| `title` | `string` | 文件名，默认 `playground.js` |
| `caption` | `string` | 图注 |
| `files` | `Record<string, { code, hidden? }>` | 多文件模式（可选） |
| `template` | `vanilla` \| `vanilla-ts` \| `react` \| `svelte` | Sandpack 模板 |

### RuleGarden props

| Prop | 类型 | 说明 |
|---|---|---|
| `rules` | `Rule[]` | 初始规则。一条 Rule = `{ id, enabled?, when: 触发谓词, wish: 愿望效果 }`（见 `src/lib/rules/types.ts`，JSON 可序列化） |
| `title` | `string` | 顶部 mono 小条标题 |
| `caption` | `string` | 图注 |

规则句中的词槽（目标 / 谓词 / 效果 / 数值 / 颜色）都是下拉或数字输入，**不解析自由文本**；
目标下拉的选项来自页面上 `RuleTarget` 声明的物件清单。

### Scene3D props

| Prop | 类型 | 说明 |
|---|---|---|
| `scene` | `globe` \| `particles` \| `simple-cube` | 预设场景 |
| `height` | `number` | 画布高度（px），默认 320 |
| `caption` | `string` | 图注 |

### 反应式散文 Var / Calc props

`Var`（正文里可拖的数字）与 `Calc`（随之重算的结果）通过共享 store 联动，
同一 `scope`（缺省 `page`）内以 `name` 关联。**`Calc` 必须写在它引用的所有 `Var` 之后**
（SSR 初值依赖文档顺序）。求值器（`src/lib/reactive/eval.ts`）只支持算术
与白名单函数 `min/max/round/floor/ceil/abs/sqrt/clamp`，不用 `eval`。

| 组件 | Prop | 类型 | 说明 |
|---|---|---|---|
| `Var` | `name` | `string` | scope 内变量名，`Calc` 表达式引用它 |
| `Var` | `initial` / `min` / `max` | `number` | 初值与范围 |
| `Var` | `step` | `number` | 步长，默认 1 |
| `Var` | `unit` | `string` | 显示后缀（自带空格，如 `" 张卡片"`） |
| `Var` | `decimals` | `number` | 显示小数位；缺省由 step 推断 |
| `Var` | `scope` | `string` | 缺省 `page`；一页多组时分组 |
| `Var` | `label` | `string` | 读屏标签，缺省用 name |
| `Calc` | `expr` | `string` | 安全算术表达式（引用 Var 名） |
| `Calc` | `unit` / `decimals` / `scope` | 同上 | — |

```mdx
每天读 <Var client:visible name="cards" min={1} max={50} initial={10} unit=" 张卡片" />，
一年就是 <Calc client:visible expr="cards * 365" unit=" 张" />。
```

### VerdictTable props

| Prop | 类型 | 说明 |
|---|---|---|
| `columns` | `string[]` | 维度列头 |
| `rows` | `{ label, cells: (Verdict \| { verdict, note?, bar? })[] }[]` | 每行一个方案；`Verdict` = `'yes' \| 'partial' \| 'no'`，`bar` 为 0–100 |
| `corner` | `string` | 左上角表头，默认「方案」 |
| `title` / `caption` | `string` | mono 顶条标题 / 图注 |

### Mention props

| 组件 | Prop | 类型 | 说明 |
|---|---|---|---|
| `Mention` | `target` | `string` | 对应 `MentionTarget` 的 id（须在同页） |
| `MentionTarget` | `id` | `string` | 页内唯一 id |
| `MentionTarget` | `block` | `boolean` | 块级容器，默认 true；行内包词语时写 false |

> 页面接口 `PageHistory`（frontmatter `history: true` 时文末的「这一页如何长成」）
> 由 `src/components/shell/PageHistory.astro` + `src/lib/history.ts` 实现，
> 是 Story 布局的自动接口而非媒介组件，不在此 barrel 中——详见
> [docs/MEDIUM.md §6](../../../docs/MEDIUM.md)。
