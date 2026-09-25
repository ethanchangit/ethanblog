# 媒介组件库（Media Component Library）

> **这是 Ethan Chang 的个人博客**（https://ethanchang.io）上的可选交互组件。

一组可以直接嵌进 MDX 的交互组件。写文章时默认用文字；需要时再升档。

## 组件契约

1. **Props 必须 JSON 可序列化**（跨岛屿注水边界）；富内容用声明式数据（数组/对象），不用函数
2. **无 JS 必须优雅降级**：服务端渲染出有意义的静态内容（InteractiveDemo 给出新窗口链接、VideoEmbed 的 YouTube 封面链到原站、RuleGarden 降级为一段规则散文）
3. **注水指令**：默认 `client:visible`；仅首屏组件用 `client:load`。VideoEmbed 是 Astro，封面点击后再加载官方播放器。TweetEmbed 是零 JS 自绘卡片。RuleGarden 为 Astro 薄包装，内部已含 `client:visible`，MDX 可直接使用
4. **只消费设计 token**（`--color-*`），组件内不写死色值
5. **统一支持 `caption`**，外框统一用 `.media-frame` / `.media-caption`（仅间距与图注，**无边框、无背景色块**）
6. **动效尊重 `prefers-reduced-motion`**（用 `@/lib/motion` 的 `reducedMotion()`）
7. **视觉极简**：不使用装饰性边框、圆角卡片、色条、渐变遮罩、设备边框。**TweetEmbed 例外**：边框与圆角只为对齐 X 帖子的阅读结构

## 目录

| 组件 | 类型 | 用途 |
|---|---|---|
| `Timeline` | Svelte | 垂直时间线；项目列表在用。条目可选 `href` |
| `InteractiveDemo` | Svelte | iframe 承载 `public/demos/<name>/index.html` |
| `VideoEmbed` | Astro | YouTube 封面点击后再加载官方播放器；Bilibili 仍直接 iframe |
| `TweetEmbed` | Astro | 自绘 X 卡片：构建期拉正文并完整展开 |
| `SideNote` | Astro | 旁注：宽屏悬挂右页边，窄屏回落为插注块 |
| `RuleGarden` | Astro → Svelte | 规则可开关、可改；无 JS 时降级为散文 |
| `RuleTarget` | Astro | 给页面元素声明 `data-rule-target`，供 RuleGarden 引用 |
| `MentionPreview` | Svelte | 悬停正文里的本站链接或外链时的预览。由布局挂一次，不要写进 MDX |
| `DocRef` | Astro | 引用一篇已有文章或项目，渲染成索引行 |
| `DocList` | Astro | `DocRef` 的列表容器 |

## MDX 用法示例

```mdx
import { InteractiveDemo, TweetEmbed } from '@/components/media';

<TweetEmbed
  url="https://x.com/ethanchang_/status/1234567890"
  caption="月度整理里引用的一条原帖。"
/>

<InteractiveDemo
  client:visible
  src="/demos/robert/"
  title="Robert"
  caption="一个可以玩的小软件。"
/>
```

### RuleGarden props

| Prop | 类型 | 说明 |
|---|---|---|
| `rules` | `Rule[]` | 初始规则。一条 Rule = `{ id, enabled?, when, wish }` |
| `title` | `string` | 顶部标题 |
| `caption` | `string` | 图注 |

### DocRef / DocList props

| 组件 | Prop | 类型 | 说明 |
|---|---|---|---|
| `DocRef` | `of` | `string` | `articles/<id>` 或 `projects/<id>` |
| `DocList` | `pane` | `'series' \| 'embed'` | 可选。`series` 带「篇目」标题。`embed` 在宽屏第三栏打开 |

`MentionPreview` 不是正文组件。`Base` 用 `client:visible` 挂一次。悬停正文里的本站文章、项目、页面、资料或外链时出现。导航、左侧索引、右侧目录和页脚不预览。审核页 `/dashboard/preview` 不包含这个岛屿。
