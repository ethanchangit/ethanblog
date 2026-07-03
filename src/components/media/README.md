# 媒介组件库（Media Component Library）

这是本站的心脏：一组可以直接嵌进 MDX 故事里的交互媒介组件。
写故事时，从最低档的文字开始，需要时逐级升档：文字 → 图片 → 音视频 → **可交互的软件级媒介**。

在线演示与 QA：访问 [/lab](/lab)。

## 组件契约（新组件必须遵守）

1. **Props 必须 JSON 可序列化**（跨岛屿注水边界）；富内容用声明式数据（数组/对象），不用函数
2. **无 JS 必须优雅降级**：服务端渲染出有意义的静态内容（ScrollScene 平铺全部场景、AudioClip 渲染原生 `<audio>`、InteractiveDemo 给出新窗口链接、CodePlayground 渲染只读代码块）
3. **注水指令**：默认 `client:visible`；仅首屏组件用 `client:load`；能不注水就不注水（VideoEmbed 是零 JS 的 Astro 组件）。**CodePlayground** 为 Astro 薄包装，内部已含 `client:visible`，MDX 可直接 `<CodePlayground />` 无需写指令。**ScrollScene 例外**：必须用 `client:visible={{ rootMargin: '150% 0px' }}` 提前注水——它注水后会从静态平铺膨胀成数倍视口高度的滚动剧场，提前展开可避免读者眼前的布局跳动
4. **只消费设计 token**（`--color-*`），组件内不写死色值；canvas / WebGL 通过 `getComputedStyle` 读 token
5. **统一支持 `caption`**，外框统一用 `.media-frame` / `.media-caption`
6. **动效尊重 `prefers-reduced-motion`**（用 `@/lib/motion` 的 `reducedMotion()`），GSAP / three.js 只在 onMount/$effect 里创建并在销毁时 kill / dispose

## 可见性：拆开看

Realtalk 可见性原则——程序印在物体上。构建期 remark 插件（`plugins/remark-source-view.mjs`）
会自动为 MDX 故事中的每个媒介组件在其下方注入一个「⌥ 源码」disclosure，
读者展开即可看到这段组件调用的 MDX 原文。白名单与本目录的 `index.ts` barrel 保持同步
（MediaFrame / SideNote / RuleTarget 这类纯排版/标记容器除外）。

退出阀有两个：

- 整篇关闭：frontmatter 写 `sourceView: false`
- 单处关闭：给组件加 `noSource` 属性（构建期会被摘除，不会泄漏到渲染输出）

几乎永远不该使用退出阀——把组件调用写得值得被读。

## 目录

| 组件 | 类型 | 用途 |
|---|---|---|
| `ParamSlider` | Svelte | 滑块驱动 canvas 可视化（network/bars/curve，可通过 `src/lib/viz/registry.ts` 扩展） |
| `ScrollScene` | Svelte | GSAP 滚动剧场：场景文字 + 可视化随滚动演进 |
| `BeforeAfterSlider` | Svelte | 前后对比拖拽（图片），键盘可访问 |
| `Timeline` | Svelte | 垂直时间线，滚动渐入 |
| `StatCounter` | Svelte | 数字滚动计数面板 |
| `AudioClip` | Svelte | 自绘波形音频播放器（峰值用 `scripts/audio-peaks.mjs` 预计算） |
| `InteractiveDemo` | Svelte | 沙箱 iframe 承载自包含软件演示（`public/demos/<name>/index.html`）；可选 `poster`/`posterVideo`/`posterAlt` 提供未加载态预览（视频先行、点击升级；reduced-motion 或无 JS 时退回图片） |
| `Scene3D` | Svelte | three.js 岛屿：线框地球 / 粒子场 / 旋转立方体 |
| `VideoEmbed` | Astro | YouTube/Bilibili/本地视频 facade，点击才加载 |
| `CodePlayground` | Astro → Svelte | Sandpack 沙箱：点击 Run 在 iframe 中执行代码 |
| `MediaFrame` | Astro | 把任意内容包进统一媒介外框 |
| `SideNote` | Astro | 旁注：宽屏悬挂右页边，窄屏回落为插注块（零 JS，不套 media-frame） |

## MDX 用法示例

```mdx
import { ParamSlider, ScrollScene, InteractiveDemo, Scene3D } from '@/components/media';

<ParamSlider
  client:visible
  label="卡片数量"
  paramKey="count"
  min={10} max={200} initial={60}
  viz="network"
  caption="左边的滑块控制右边的知识网络。"
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

### CodePlayground props

| Prop | 类型 | 说明 |
|---|---|---|
| `code` | `string` | 主文件源码 |
| `lang` | `string` | 语法高亮语言标签（SSR 降级展示用） |
| `title` | `string` | 文件名，默认 `playground.js` |
| `caption` | `string` | 图注 |
| `files` | `Record<string, { code, hidden? }>` | 多文件模式（可选） |
| `template` | `vanilla` \| `vanilla-ts` \| `react` \| `svelte` | Sandpack 模板 |

### Scene3D props

| Prop | 类型 | 说明 |
|---|---|---|
| `scene` | `globe` \| `particles` \| `simple-cube` | 预设场景 |
| `height` | `number` | 画布高度（px），默认 320 |
| `caption` | `string` | 图注 |

## 路线图（未实现）

- 图片画廊 / Lightbox
- Phase 2：账户体系点亮后，组件可读写用户态（进度、收藏、标注）
