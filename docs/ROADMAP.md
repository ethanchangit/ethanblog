# ethanchang.io 框架计划书与路线图

> **这是 Ethan Chang 的个人博客**（https://ethanchang.io）。
> 本文档是这个网站的**整体架构计划**：它从哪里来、为什么这样设计、将往哪里去。
> 执行层的细节见 [CLAUDE.md](../CLAUDE.md)（日常操作指南）、[AGENTS.md](../AGENTS.md)（强制约束）、[组件库 README](../src/components/media/README.md)（组件契约）。

## 一、愿景与核心理念

**这是 Ethan Chang 的个人博客**——以文字与排版为主的极简站点。需要时，文章里可以嵌入图片、音视频或少量交互组件；交互是可选升档，不是站点身份。

信息媒介存在档位（写作时按需选用，默认用文字）：

| 档位 | 媒介 | 读者获得什么 |
|---|---|---|
| 1 | 文字 | 靠抽象思维自己想象 |
| 2 | 图像 | 亲眼看见 |
| 3 | 音频 / 视频 | 时间与温度，但仍是单向的 |
| 4 | 可交互组件 | 亲手操作，从操作中获得理解 |

视觉原则：**无装饰性边框、无背景色块、无圆角卡片、无色条**。页面靠排版与留白组织。

## 二、技术决策一览（2026-07 确定，2026-08 视觉收束）

| 决策 | 选择 | 理由 |
|---|---|---|
| 框架 | Astro 5（islands + MDX + content collections） | 内容为主、按需注水交互，适合博客 |
| 岛屿 UI | Svelte 5（runes） | 每页多个小岛屿时打包体积远小于 React |
| 滚动叙事 | GSAP 3 + ScrollTrigger | 仅在少数故事需要时使用 |
| 样式 | Tailwind CSS v4 `@theme` 设计 token | 极简双主题（白 / `#191919`），禁止裸色值 |
| 内容 | MDX 同一形态；`slot`（article / project）决定索引 | 散文为主，交互组件按需嵌入 |
| 输出 | `output: 'static'` + `@astrojs/cloudflare` adapter | 静态为主；API 路由按需 |
| 部署 | Cloudflare Pages（项目 `ethanblog`）+ GitHub Actions | 域名、secrets 延续 |
| 语言 | 单语言（中文为主） | 控制复杂度，不引入 i18n 框架 |
| 主题 | 浅色 / 深色双主题 | 跟随系统，可手动切换 |

## 三、站点架构

```
内容层    src/content/{articles,projects}/*.mdx  + src/data/profile.ts（个人资料单一数据源）
组件层    src/components/media/                   可嵌入 MDX 的可选交互组件
可视化    src/lib/viz/registry.ts                 canvas 绘制注册表
外壳层    layouts/{Base,Doc}                      + components/{shell,home}
质保层    /lab 页面                               每个组件的常驻最小示例
接缝层    src/lib/user.ts                         用户态入口（/api/me，未登录时 null）
```

**组件契约要点**（完整版见 [media/README.md](../src/components/media/README.md)）：
props 可序列化 / 无 JS 优雅降级 / 尊重 prefers-reduced-motion / 只消费设计 token / `.media-frame` 仅作间距与图注（无边框无背景）/ ScrollScene 必须提前注水（`rootMargin: '150% 0px'`）。

**主页**：Hero → Now → 精选 → 技能 → 联系。纯文字排版，无卡片壳。

## 四、Phase 1 —— 博客骨架与组件库 ✅（2026-07 完成）

- [x] Hugo + Blowfish 整体迁移到 Astro 5（删 submodule，无损迁移全部文章与项目，旧 URL 301）
- [x] 交互组件库（Phase 1）：ParamSlider / ScrollScene / InteractiveDemo / BeforeAfterSlider / Timeline / StatCounter / AudioClip / VideoEmbed / CodePlayground(stub) / MediaFrame
- [x] 首个演示包 `public/demos/knowledge-garden/`
- [x] 旗舰故事、主页、/lab、RSS
- [x] CI 重写（Node 22 + astro check + wrangler-action@v3）
- [x] 验证体系：Playwright、全站路由爬取、reduced-motion、双端截图

## 五、Phase 2 —— 账户体系 ✅（2026-07 完成）

目标：登录、收藏、阅读进度、跨设备记忆。

- [x] **API 路由**：`src/pages/api/**`（auth / me / bookmarks / progress），`export const prerender = false`
- [x] **数据库**：Cloudflare D1 绑定 `wrangler.toml` → `migrations/0001_init.sql`
- [x] **认证**：better-auth + GitHub/Google OAuth
- [x] **接缝点亮**：`src/lib/user.ts`；Story 布局的收藏与进度同步已接入
- [x] **UI**：Nav 登录/登出、Story 收藏按钮、滚动进度同步
- [x] **部署配置**：CI 在 deploy 前自动创建/绑定 D1 与 SESSION KV（`scripts/ensure-d1.sh`）
- [ ] **标注（highlight）**：收藏与进度先行，标注其后（可选，非优先）

## 六、Phase 3+ —— 交互组件补全 ✅

- [x] **CodePlayground 真实运行**：Sandpack 沙箱
- [x] **Scene3D**：three.js 岛屿
- [x] **更多演示包**：`public/demos/robert/`、`public/demos/network/`
- [x] **ImageGallery**：图片网格 + Lightbox
- [x] **验证体系补全**：Playwright 全量测试 + CI test job
- [x] **内容机制**：论文式页眉与文末、`SideNote`、`RuleGarden`、创作规范 `docs/MEDIUM.md`、`/publish` skill、`validate:content`（notebook / 研究线 / 页眉溯源 / PageHistory 已从读者面撤下）
- [ ] **声音档位扩展**：播客/语音笔记流（AudioClip 已就绪，等内容）

## 六·五、Phase 4 —— 反应式文档与溯源（分批蓝图）

源自 Bret Victor 与 Ink & Switch 调研（见 `docs/research/`）。从"可交互"到"可拨动假设、可溯源"。

**Batch 1 ✅（已完成，后经简化）—— 反应式散文**
- [x] `Var` + `Calc` 反应式散文
- [x] `VerdictTable` 裁决表
- [x] `Mention` + `MentionTarget` 双向高亮
- [x] 人机双声视觉基础（正文 ink vs `Calc` accent）
- ~~页眉溯源 `source` / `PageHistory` git 提交史~~（已从文章 chrome 移除）

**Batch 2 —— 对话媒介与双声部**（可选，按需）
- [ ] `Transcript` 对话组件
- [ ] `Voice` 包装组件
- [ ] `Var`/`Calc` ↔ `vizRegistry` 打通

**Batch 3 —— 可能性空间**（可选，按需）
- [ ] RuleGarden 阅读位置谓词
- [ ] amb / 可能性扇出组件
- [ ] charts / dataviz

## 七、演进原则

1. **文字优先**：能用文字讲清楚就不要硬加交互
2. **内容永不被劫持**：任何交互失效时，读者仍能获得完整内容
3. **组件先进 /lab，再进故事**
4. **视觉极简**：不引入边框、色块、卡片壳等产品感装饰
5. **每一步可验证**：构建通过 + Playwright 驱动真实页面

## 八、视觉收束 ✅（2026-08）

- [x] 去掉全站装饰性边框、背景色块、圆角卡片、色条与设备边框
- [x] 站点定位文档（本文 / CLAUDE / AGENTS）与极简博客一致
