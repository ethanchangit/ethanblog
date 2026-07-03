# ethanchang.io 框架计划书与路线图

> 本文档是这个网站的**整体架构计划**：它从哪里来、为什么这样设计、将往哪里去。
> 执行层的细节见 [CLAUDE.md](../CLAUDE.md)（日常操作指南）、[AGENTS.md](../AGENTS.md)（强制约束）、[媒介组件库 README](../src/components/media/README.md)（组件契约）。

## 一、愿景与核心理念

**这个网站不是博客，是一个超媒体产品**——一个能同时承载文字、图像、音视频和软件级交互的容器，并且像软件一样持续加功能。

核心理念一句话：**我们不分享文章，我们分享超媒介。**

信息媒介存在档位：

| 档位 | 媒介 | 读者获得什么 |
|---|---|---|
| 1 | 文字 | 靠抽象思维自己想象 |
| 2 | 图像 | 亲眼看见 |
| 3 | 音频 / 视频 | 时间与温度，但仍是单向的 |
| 4 | **可交互的软件** | **亲手操作，从操作中获得理解** |

网站的存在理由是第四档：滑块联动可视化、滚动驱动叙事、沙箱中运行的真实软件。同时**文字档位是尊贵的子集**——能用文字讲清楚的内容就安静地用文字，交互是升档而非门槛。

这一理念的现场证明：[/stories/how-this-site-works](https://ethanchang.io/stories/how-this-site-works)。

## 二、技术决策一览（2026-07 确定）

| 决策 | 选择 | 理由 |
|---|---|---|
| 框架 | Astro 5（islands + MDX + content collections） | 内容为主、按需注水交互，是"超媒体容器"的最佳匹配 |
| 岛屿 UI | Svelte 5（runes） | 每页多个小岛屿时打包体积远小于 React；`$state` 响应式天然契合"滑块改变可视化" |
| 滚动叙事 | GSAP 3 + ScrollTrigger | scrollytelling 行业标准（已完全免费）；微交互用 svelte/motion |
| 样式 | Tailwind CSS v4 `@theme` 设计 token | 深色视觉身份从旧 Hugo 站的 custom-dark.css 完整移植 |
| 内容 | MDX + `stories` / `projects` 两个集合 | 散文与交互组件自由交织——这就是超媒体本身 |
| 输出 | `output: 'static'` + `@astrojs/cloudflare` adapter | Phase 1 纯静态；Phase 2 加 API 路由零重构 |
| 部署 | Cloudflare Pages（项目 `ethanblog`）+ GitHub Actions | 域名、secrets 延续；`wrangler-action@v3` |
| 语言 | 单语言（中文为主） | 控制复杂度，不引入 i18n 框架 |
| 主题 | 仅深色 | 深色即身份 |

## 三、站点架构

```
内容层    src/content/{stories,projects}/*.mdx   + src/data/profile.ts（个人资料单一数据源）
媒介层    src/components/media/                   12 个可嵌入 MDX 的媒介组件（网站的心脏）
可视化    src/lib/viz/registry.ts                 canvas 绘制注册表，新可视化在此注册
外壳层    layouts/{Base,Story,Project}            + components/{shell,home}
质保层    /lab 页面                               每个组件的常驻最小示例（先点亮再进故事）
接缝层    src/lib/user.ts                         用户态入口（/api/me，未登录时 null）
```

**媒介组件库契约要点**（完整版见 [media/README.md](../src/components/media/README.md)）：
props 可序列化 / 无 JS 优雅降级 / 尊重 prefers-reduced-motion / 只消费设计 token / 统一 `.media-frame` 外框 / ScrollScene 必须提前注水（`rootMargin: '150% 0px'`）。

**主页 = 个人 OS**：Hero（解码动效 + 网络画布）→ Now 面板（正在做/读/想）→ 技能图谱（芯片点击联动项目）→ 精选网格。

## 四、Phase 1 —— 超媒体容器 ✅（2026-07 完成）

- [x] Hugo + Blowfish 整体迁移到 Astro 5（删 submodule，无损迁移全部文章与项目，旧 URL 301）
- [x] 媒介组件库 10 件（Phase 1）：ParamSlider ★ / ScrollScene ★ / InteractiveDemo ★ / BeforeAfterSlider / Timeline / StatCounter / AudioClip / VideoEmbed / CodePlayground(stub) / MediaFrame
- [x] 首个软件演示包 `public/demos/knowledge-garden/`（沙箱 iframe 承载）
- [x] 旗舰交互故事 how-this-site-works（宣言 + 全组件演示）
- [x] 个人 OS 主页、/lab 试验场、RSS
- [x] CI 重写（Node 22 + astro check + wrangler-action@v3）
- [x] 验证体系：Playwright 真实交互测试（46 项）、全站路由爬取、reduced-motion 降级检查、双端截图

## 五、Phase 2 —— 账户体系 ✅（2026-07 完成）

目标：网站开始"认识回来的你"——登录、收藏、阅读进度、跨设备记忆。

- [x] **API 路由**：`src/pages/api/**`（auth / me / bookmarks / progress），`export const prerender = false`
- [x] **数据库**：Cloudflare D1 绑定 `wrangler.toml` → `migrations/0001_init.sql`（better-auth 表 + bookmarks / progress）
- [x] **认证**：better-auth + GitHub/Google OAuth → `src/pages/api/auth/[...all].ts`
- [x] **接缝点亮**：`src/lib/user.ts` 经 `/api/me` 读取会话；Story 布局的阅读进度条与收藏按钮已接入
- [x] **UI**：Nav 登录/登出（AuthMenu）、Story 收藏按钮（BookmarkButton）、滚动进度同步（ReadingProgress）
- [ ] **部署配置**（需手动）：创建 D1 实例、设置 OAuth secrets（见 `src/env.d.ts` 注释）
- [ ] **标注（highlight）**：收藏与进度先行，标注其后

## 六、Phase 3+ —— 媒介升档（进行中）

- [x] **CodePlayground 真实运行**：Sandpack 沙箱 iframe，支持 vanilla / vanilla-ts / react / svelte 模板
- [x] **Scene3D**：three.js 岛屿（globe / particles / simple-cube），尊重 reduced-motion
- [x] **更多演示包**：`public/demos/robert/`、`public/demos/network/` 可玩切片，嵌入项目页
- [x] **ImageGallery**：图片网格 + Lightbox，键盘可访问
- [x] **验证体系补全**：Playwright 46 项测试 + CI test job
- [ ] **声音档位扩展**：播客/语音笔记流（AudioClip 已就绪，等内容）
- [ ] **地图叙事 / 数据故事**：viz registry 已可扩展，待内容驱动
- [ ] **产品化深水区**（有账户体系后）：读者标注与留言、订阅通知、创作数据面板

## 七、演进原则

1. **媒介优先**：新功能先问"它给叙事增加了什么档位"，再问技术
2. **内容永不被劫持**：任何交互失效时，读者仍能获得完整内容
3. **组件先进 /lab，再进故事**
4. **接缝先行**：为下一阶段留接口，但不提前实现
5. **每一步可验证**：构建通过 + Playwright 驱动真实页面
