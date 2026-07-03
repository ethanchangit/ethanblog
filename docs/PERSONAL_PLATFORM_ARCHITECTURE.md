# Ethan 个人超媒体平台 — 架构蓝图

> 把个人网站从「博客」升级为「可交互的个人产品」：内容在仓库里，体验在浏览器里，记忆在边缘云上。

## 1. 愿景与定位

### 1.1 我们要做什么

这不是传统博客的替代品，而是它的**超级版**——一个能承载多种媒介、支持交互、可不断加功能的**个人产品容器**：

| 内容类型 | 媒介 | 交互深度 |
|---------|------|---------|
| 技术文章 | Markdown | 低（阅读为主） |
| 软件 / 开源项目 | 结构化数据 + 演示页 | 中（下载、跳转、内嵌 Demo） |
| 独特经历 | 图文 / 视频 / 音频 | 中高（时间线、地图、滑块控制样式） |
| 超媒体体验 | 自定义 Widget | 高（滑块、动画、状态反馈） |

**核心原则**：简单内容保持简单；需要「好玩」的内容才引入交互层。文章是子集，不是上限。

### 1.2 一个关键澄清：静态 ≠ 不能交互

当前栈（Hugo + Cloudflare Pages）生成的是**静态 HTML/CSS/JS**，但浏览器里的 JavaScript 完全可以做到：

- 滑块控制右侧预览样式
- Canvas / WebGL 动画
- 音频播放器、视频时间轴
- 本地状态（localStorage）记住上次阅读位置

**真正需要后端的部分**是：用户账号、跨设备同步、收藏/标注云端存储。这部分用 Cloudflare Workers + D1 补齐，而不是推翻 Hugo。

```
┌─────────────────────────────────────────────────────────────┐
│                     用户浏览器                               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Hugo 静态页  │  │ Widget 群岛  │  │ 客户端状态 (local)   │  │
│  │ 文章/项目/经历│  │ 交互组件     │  │ 主题/阅读进度(匿名)  │  │
│  └─────────────┘  └──────────────┘  └─────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS API (Phase 3+)
┌──────────────────────────▼──────────────────────────────────┐
│              Cloudflare Edge (你已在 Robert 里用过)            │
│  Workers API  │  D1 (用户数据)  │  KV (会话)  │  R2 (媒体)   │
└─────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Git 仓库 (内容源)                               │
│  content/  data/  assets/js/widgets/  layouts/              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 技术栈决策

### 2.1 保留什么

| 组件 | 理由 |
|------|------|
| **Hugo** | 内容即代码、构建快、Markdown 生态成熟、Blowfish 已集成 video/tabs/timeline 等 |
| **Blowfish 主题** | 通过 submodule 升级；用 `layouts/` 覆盖而非改主题源码 |
| **Cloudflare Pages** | 已有 CI、免费、全球 CDN |
| **Git 作为 CMS** | 文章、项目、经历全部版本化，PR 即审稿 |

### 2.2 新增什么（分阶段）

| 阶段 | 新增能力 | 技术选型 |
|------|---------|---------|
| Phase 1 | 结构化内容 + 项目目录 | Hugo `data/` + 自定义 section |
| Phase 2 | 交互 Widget 库 | 原生 ES Modules（无重型框架） |
| Phase 3 | 用户系统 | Cloudflare Workers + D1 + Auth (GitHub OAuth / Magic Link) |
| Phase 4 | 个性化 | 收藏、阅读进度、标注 API |

**为何不迁到 Next.js/Astro？** 你已有 Hugo 内容与 Blowfish 投资；「静态内容引擎 + 交互群岛 + 边缘 API」是更平滑的演进路径，Robert 项目已证明 Cloudflare Workers 能力。

---

## 3. 内容模型

### 3.1 目录结构（目标态）

```
content/
├── posts/              # 文章（已有）
├── projects/           # 软件 & 开源项目（每项目一页，可深可浅）
├── experiences/        # 独特经历（旅行、故事、多媒体叙事）
└── labs/               # 实验性超媒体页面（高交互 Demo）

data/
├── projects.yaml       # 项目元数据（列表页、首页卡片用）
└── site.yaml           # 站点级配置（社交链接、特色内容）

assets/
├── js/
│   ├── platform.js     # 全局入口：Widget 注册与初始化
│   └── widgets/        # 可复用交互组件
│       ├── media-slider.js
│       └── ...
└── css/
    └── platform.css    # 平台级 design tokens（非 !important 覆盖）

layouts/
├── projects/           # 项目 section 布局
├── experiences/        # 经历 section 布局
└── shortcodes/         # 文章内嵌组件
    ├── widget.html
    ├── audio.html
    └── experience-map.html

workers/                # Phase 3：边缘 API
└── api/
    ├── src/
    └── wrangler.toml
```

### 3.2 Front Matter 规范

**项目** (`content/projects/robert.md`)：

```yaml
---
title: "Robert"
type: "projects"
date: 2026-01-01
description: "Voice-first iOS 笔记应用"
project:
  id: robert
  status: active          # active | archived | experiment
  github: https://github.com/ethanchang/robert
  download:               # App Store / 脚本下载链接
  stack: [SwiftUI, GRDB, Cloudflare Workers]
  media:
    - type: video
      src: /media/robert-demo.mp4
    - type: screenshot
      src: /images/robert-1.png
  widgets: []             # 可选：页面级交互组件 ID
draft: false
---
```

**经历** (`content/experiences/kyoto-2025.md`)：

```yaml
---
title: "京都：一场意外的雨"
type: "experiences"
date: 2025-11-20
experience:
  location: "Kyoto, Japan"
  coordinates: [35.0116, 135.7681]
  media:
    - type: image
      src: /images/kyoto-1.jpg
    - type: audio
      src: /audio/kyoto-ambient.mp3
  mood: [travel, photography]
  widgets:
    - media-slider
draft: false
---
```

**文章**（保持现有格式，可选增强）：

```yaml
---
title: "..."
widgets: [code-playground]   # 仅当需要交互时添加
---
```

### 3.3 数据层 `data/projects.yaml`

列表页、首页、导航抽屉从 YAML 读取，避免手写重复信息。单页 `content/projects/*.md` 负责长文与 Demo。

---

## 4. 交互层：Widget 系统

### 4.1 设计哲学

- **群岛架构 (Islands)**：每个 Widget 自包含，通过 `data-widget="media-slider"` 挂载
- **渐进增强**：无 JS 时仍显示静态 fallback
- **内容作者友好**：Markdown 里一行 shortcode 即可调用

```markdown
{{< widget name="media-slider" preview="#demo" controls="blur,brightness,saturate" >}}
```

### 4.2 Widget 路线图

| Widget | 用途 | 阶段 |
|--------|------|------|
| `media-slider` | 滑块控制图片/视频 CSS 滤镜 | Phase 1 ✅ |
| `audio-player` | 自定义音频播放器（你的声音） | Phase 2 |
| `timeline-scrubber` | 时间轴拖动切换经历照片 | Phase 2 |
| `project-demo` | 内嵌 iframe / 脚本沙箱 Demo | Phase 2 |
| `code-playground` | 可编辑代码片段 + 实时预览 | Phase 3 |
| `progress-sync` | 阅读进度（需登录后云端同步） | Phase 4 |

### 4.3 实现约定

```html
<!-- layouts/shortcodes/widget.html 输出 -->
<div class="ethan-widget" data-widget="media-slider" data-config='{"controls":["blur"]}'>
  <noscript>静态预览图</noscript>
</div>
```

`assets/js/platform.js` 在 `DOMContentLoaded` 时扫描 `[data-widget]` 并动态 `import()` 对应模块。

---

## 5. 用户与个性化（Phase 3–4）

### 5.1 需要后端的能力

- 登录（GitHub OAuth 或邮箱 Magic Link）
- 收藏文章 / 项目
- 阅读进度、标注
- 「上次访问到哪里」

### 5.2 推荐架构：Cloudflare Workers + D1

与 Robert 后端同栈，账号与 API 可复用运维经验。

```
workers/api/
├── wrangler.toml
├── schema.sql          # users, favorites, reading_progress, annotations
└── src/
    ├── index.ts        # 路由：/api/auth, /api/favorites, ...
    └── auth.ts
```

**D1 表草案**：

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  github_id TEXT,
  created_at INTEGER
);

CREATE TABLE favorites (
  user_id TEXT,
  content_path TEXT,    -- 如 /posts/pkm-method/
  content_type TEXT,    -- post | project | experience
  created_at INTEGER,
  PRIMARY KEY (user_id, content_path)
);

CREATE TABLE reading_progress (
  user_id TEXT,
  content_path TEXT,
  progress REAL,        -- 0.0 ~ 1.0
  updated_at INTEGER,
  PRIMARY KEY (user_id, content_path)
);
```

### 5.3 匿名 vs 登录

| 能力 | 匿名 (localStorage) | 登录 (D1) |
|------|---------------------|-----------|
| 主题偏好 | ✅ | ✅ 同步 |
| 阅读进度 | ✅ 单设备 | ✅ 跨设备 |
| 收藏 | ❌ | ✅ |
| 标注 | ❌ | ✅ |

Phase 1–2 先用 localStorage；Phase 3 加登录后迁移脚本把本地数据 merge 到云端。

---

## 6. 页面与信息架构

### 6.1 导航结构

```
Home          → 个人名片 + 最新动态（文章/项目/经历混合流）
Projects      → 软件 & 开源目录（卡片 + 筛选）
Experiences   → 经历时间线 / 地图视图
Posts         → 传统文章列表
Labs          → 实验性超媒体（可选，后期）
About         → 关于我
```

### 6.2 首页演进

当前 Blowfish `homepage.layout = page` + `showRecent` 只展示 posts。目标：

1. **短期**：`mainSections = ["posts", "projects", "experiences"]` 混合最近内容
2. **中期**：自定义 `layouts/index.html`，分区展示「精选项目」「最新文章」「一条经历」
3. **长期**：可配置的首页模块（`data/home.yaml` 定义模块顺序）

---

## 7. 部署与 CI

### 7.1 当前流水线（保持）

```
push main → GitHub Actions → hugo build → Cloudflare Pages
```

### 7.2 Phase 3 扩展

```yaml
# .github/workflows/deploy.yml 增加 job
deploy-api:
  - wrangler deploy workers/api
```

Pages 与 Workers 同域名：`ethanchang.io` + `ethanchang.io/api/*` 通过 Cloudflare 路由。

---

## 8. 实施路线图

### Phase 1 — 内容容器（当前 PR）

- [x] 架构文档
- [x] `data/projects.yaml` 结构化项目数据
- [x] `content/projects/`、`content/experiences/` section
- [x] 项目/经历列表与详情布局
- [x] Widget 系统骨架 + `media-slider` 示例
- [x] 导航与 `hugo.toml` 更新

### Phase 2 — 媒介扩展

- [ ] `audio` shortcode 与自定义播放器
- [ ] 经历页地图组件（Leaflet 或 Mapbox static）
- [ ] 项目页：GitHub README 嵌入、Release 下载按钮
- [ ] 首页模块化布局
- [ ] `labs/` 实验页面

### Phase 3 — 产品化后端

- [ ] `workers/api` 脚手架
- [ ] GitHub OAuth 登录
- [ ] 收藏 API + 前端 UI
- [ ] 阅读进度 API

### Phase 4 — 个性化与增长

- [ ] 标注/高亮
- [ ] 「继续阅读」入口
- [ ] 相关内容推荐（基于 tags + 阅读历史）
- [ ] RSS / JSON Feed 扩展至多内容类型

---

## 9. 内容创作工作流

```bash
# 新文章（简单）
hugo new content posts/my-article.md

# 新项目
hugo new content projects/my-app.md
# 并更新 data/projects.yaml

# 新经历
hugo new content experiences/my-trip.md

# 本地预览
hugo server -D --baseURL http://localhost:1313/
```

**原则**：能一篇文章说清楚的，不写 Widget；需要「动手玩」才上交互。

---

## 10. 风险与约束

| 风险 | 缓解 |
|------|------|
| Blowfish 主题升级冲突 | 只覆盖 `layouts/`，不改 `themes/blowfish` |
| 交互组件过多影响性能 | 按需 `import()`，Intersection Observer 懒加载 |
| 用户系统复杂度 | Phase 3 前不阻塞内容建设；匿名体验完整 |
| 样式约束（AGENTS.md） | Widget 用组件内 scoped class + design tokens |

---

## 11. 总结

**一句话**：Hugo 管「发布什么」，Widget 管「怎么玩」，Cloudflare 管「记住谁」。

你的仓库已经是正确的起点。接下来不是推倒重来，而是：

1. **把内容分型**（文章 / 项目 / 经历）
2. **把交互组件化**（Widget 群岛）
3. **把记忆边缘化**（Workers + D1）

这样网站会像一个可以持续加功能的软件——每一篇新文章、每一个新项目、每一个新 Widget，都是在给这个产品写一个新版本。

---

*更大胆的北极星愿景（EthanOS 概念）见 [VISION_NORTH_STAR.md](./VISION_NORTH_STAR.md)*
