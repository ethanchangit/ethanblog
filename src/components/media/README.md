# 媒介组件库（Media Component Library）

这是本站的心脏：一组可以直接嵌进 MDX 故事里的交互媒介组件。
写故事时，从最低档的文字开始，需要时逐级升档：文字 → 图片 → 音视频 → **可交互的软件级媒介**。

在线演示与 QA：访问 [/lab](/lab)。

## 组件契约（新组件必须遵守）

1. **Props 必须 JSON 可序列化**（跨岛屿注水边界）；富内容用声明式数据（数组/对象），不用函数
2. **无 JS 必须优雅降级**：服务端渲染出有意义的静态内容（ScrollScene 平铺全部场景、AudioClip 渲染原生 `<audio>`、InteractiveDemo 给出新窗口链接）
3. **注水指令**：默认 `client:visible`；仅首屏组件用 `client:load`；能不注水就不注水（VideoEmbed / CodePlayground 是零 JS 的 Astro 组件）。**ScrollScene 例外**：必须用 `client:visible={{ rootMargin: '150% 0px' }}` 提前注水——它注水后会从静态平铺膨胀成数倍视口高度的滚动剧场，提前展开可避免读者眼前的布局跳动
4. **只消费设计 token**（`--color-*`），组件内不写死色值；canvas 通过 `getComputedStyle` 读 token
5. **统一支持 `caption`**，外框统一用 `.media-frame` / `.media-caption`
6. **动效尊重 `prefers-reduced-motion`**（用 `@/lib/motion` 的 `reducedMotion()`），GSAP 只在 onMount/$effect 里创建并在销毁时 kill

## 目录

| 组件 | 类型 | 用途 |
|---|---|---|
| `ParamSlider` | Svelte | 滑块驱动 canvas 可视化（network/bars/curve，可通过 `src/lib/viz/registry.ts` 扩展） |
| `ScrollScene` | Svelte | GSAP 滚动剧场：场景文字 + 可视化随滚动演进 |
| `BeforeAfterSlider` | Svelte | 前后对比拖拽（图片），键盘可访问 |
| `Timeline` | Svelte | 垂直时间线，滚动渐入 |
| `StatCounter` | Svelte | 数字滚动计数面板 |
| `AudioClip` | Svelte | 自绘波形音频播放器（峰值用 `scripts/audio-peaks.mjs` 预计算） |
| `InteractiveDemo` | Svelte | 沙箱 iframe 承载自包含软件演示（`public/demos/<name>/index.html`） |
| `VideoEmbed` | Astro | YouTube/Bilibili/本地视频 facade，点击才加载 |
| `CodePlayground` | Astro | 代码展示（stub：Run 能力在路线图上） |
| `MediaFrame` | Astro | 把任意内容包进统一媒介外框 |

## MDX 用法示例

```mdx
import { ParamSlider, ScrollScene, InteractiveDemo } from '@/components/media';

<ParamSlider
  client:visible
  label="卡片数量"
  paramKey="count"
  min={10} max={200} initial={60}
  viz="network"
  caption="左边的滑块控制右边的知识网络。"
/>

<InteractiveDemo
  client:visible
  src="/demos/knowledge-garden/"
  title="知识花园"
  caption="一个可以玩的小软件。"
/>
```

## 路线图（未实现）

- `CodePlayground` 真实运行能力（Sandpack 或轻量 WebContainer）
- `Scene3D`（three.js 岛屿）
- 图片画廊 / Lightbox
- Phase 2：账户体系点亮后，组件可读写用户态（进度、收藏、标注）
