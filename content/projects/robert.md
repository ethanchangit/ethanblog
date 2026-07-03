---
title: "Robert"
date: 2026-03-01
draft: false
description: "Voice-first iOS 笔记应用"
project:
  id: robert
  status: active
  github: https://github.com/ethanchang/robert
  stack:
    - SwiftUI
    - GRDB
    - Cloudflare Workers
  tags:
    - ios
    - ai
    - productivity
---

Robert 是一款受 flomo 启发的灵活笔记应用，以**语音优先**的输入方式为核心。

## 核心功能

- 语音录制与 AI 转写
- 块级内容管理
- To-Do 系统（重复与提醒）
- AI 驱动的提问建议
- 卡片合并/拆分推荐

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | SwiftUI, iOS 17+ |
| 数据库 | GRDB (SQLite) |
| 后端 | Cloudflare Workers (Whisper + LLM) |

## 链接

[GitHub 仓库](https://github.com/ethanchang/robert)
