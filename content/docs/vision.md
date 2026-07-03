---
title: "北极星愿景"
date: 2026-07-03
draft: false
description: "EthanOS — 如果个人网站是可运行的操作系统"
---

如果个人网站不是「发布内容的容器」，而是「关于一个人的可运行操作系统」——它会是什么样子？

## EthanOS

**EthanOS = 在浏览器里运行的、关于 Ethan 的个人操作系统。**

- **Shell** — 命令面板、Dock、状态栏，永远在线的桌面
- **App** — Blog、Projects、Trips、Voice、Labs，各有一套 UX 范式
- **Scene** — 比页面更高一级：地图 + 时间轴 + 环境音 + 滑块，编排成一场互动叙事
- **Memory** — 账户即偏好配置，跨设备记住你是谁

文章只是 `Blog.app` 里的一种文件格式。

## 五条技术路径

| 路径 | 描述 | 风险 |
|------|------|------|
| A 登陆艇 | Hugo + Widget + Workers（当前） | 低，但 Shell 感弱 |
| B 双引擎 | Git 内容 → API → Vite/React Shell | **推荐中期** |
| C 全栈 | Next/SvelteKit 一体化 | 迁移成本高 |
| D 边缘原生 | Durable Objects + 实时 + AI | 适合 Labs |
| E 本地优先 | PWA + 离线博物馆 | 重度读者 |

**推荐组合：B + D** — 内容在 Git，体验在 SPA，记忆在边缘。

## 一个「封神 Scene」

比十篇普通文章更能定义品牌的，是一篇代表作——比如：

> **京都：一场意外的雨** — 地图漫游 + 滚动叙事 + 环境音 + 暗房 slider

你写一次 Scene 配置，得到一整场互动体验。

## 完整文档

- [北极星愿景（完整版）](https://github.com/ethanchangit/ethanblog/blob/main/docs/VISION_NORTH_STAR.md) — 无限大胆版构思
- [务实架构蓝图](/docs/architecture/) — Phase 1–4 落地路线

## 此刻可玩的 Demo

{{< widget name="media-slider" >}}{{< /widget >}}

这只是 EthanOS 的一个像素。真正的目标是：**让人探索你这个人，而不是阅读你写的东西。**
