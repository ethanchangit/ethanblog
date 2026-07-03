---
title: "平台架构"
date: 2026-07-03
draft: false
description: "个人超媒体平台的技术架构与演进路线"
---

本站正在从传统博客演进为**可交互的个人超媒体平台**。

## 核心理念

- **Hugo 管「发布什么」** — 文章、项目、经历全部版本化在 Git 仓库
- **Widget 管「怎么玩」** — 滑块、动画、媒体控制等交互组件
- **Cloudflare 管「记住谁」** — 未来通过 Workers + D1 实现用户收藏与阅读进度

## 内容类型

| 类型 | 路径 | 用途 |
|------|------|------|
| 文章 | `content/posts/` | 技术思考、方法论 |
| 项目 | `content/projects/` | 软件与开源项目 |
| 经历 | `content/experiences/` | 旅行、故事、多媒体叙事 |

## 实施阶段

1. **Phase 1**（当前）：内容容器 + Widget 骨架 + 结构化项目数据
2. **Phase 2**：音频播放器、地图、项目 Demo 嵌入
3. **Phase 3**：Cloudflare Workers 用户系统（登录、收藏）
4. **Phase 4**：个性化推荐、标注、跨设备同步

完整架构文档见仓库 [`docs/PERSONAL_PLATFORM_ARCHITECTURE.md`](https://github.com/ethanchang/ethanblog/blob/main/docs/PERSONAL_PLATFORM_ARCHITECTURE.md)。

## 交互演示

{{< widget name="media-slider" >}}{{< /widget >}}
