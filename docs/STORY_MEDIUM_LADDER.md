# 故事媒介阶梯 — 从文字到软件级交互

> 讲故事时，媒介越丰富，读者越不需要靠想象补全；最高一级是**软件级交互**——用户不再观看故事，而是**置身其中**。

---

## 1. 媒介阶梯定义

```
L0  文字        抽象 · 想象        「读者在脑中构图」
L1  图像        具象 · 看见        「读者看见你看见的」
L2  视频        连续 · 亲历        「读者感到自己在场」
L3  软件交互    参与 · 塑造        「读者与故事共同发生」
```

| 级别 | 名称 | 信息通道 | 读者角色 | 典型载体 |
|------|------|---------|---------|---------|
| **L0** | 文字 | 语言符号 | 想象者 | Markdown 段落 |
| **L1** | 图像 | 静态视觉 | 观看者 | 照片、插图、信息图 |
| **L2** | 视频 | 时序视听 | 旁观者 | 录像、动画、有声画 |
| **L3** | 软件交互 | 多模态 + 状态 + 反馈 | **参与者** | Widget、Scene、可操控叙事 |

**关键洞见**：每一级不是替代上一级，而是**叠加**。L3 交互故事仍然可以有文字、图片、视频——但多了**用户输入 → 系统状态 → 感官反馈**的闭环。

---

## 2. L3 为什么是「软件级」

视频再丰富，时间轴是作者固定的。读者只能暂停、快进，**不能改变故事世界的规则**。

软件级媒介具备：

| 能力 | 含义 | 示例 |
|------|------|------|
| **状态** | 故事世界有变量 | 雨量、时间、地点、情绪 |
| **输入** | 用户动作被接收 | 滑块、点击、拖拽、选择 |
| **反馈** | 输入改变呈现 | 画面滤镜、音效、文案、分支 |
| **闭环** | 参与 → 变化 → 再参与 | 调大雨量，街道更模糊，旁白换句 |

这就是「像软件一样」：**有输入、有状态、有反馈**——不是播片，是运行。

---

## 3. 内容作者怎么用

### 3.1 选对阶梯级别

| 你想传达的 | 建议级别 |
|-----------|---------|
| 一个观点、论证 | L0 文字足够 |
| 一个地方长什么样 | L1 加图 |
| 一段动态过程 | L2 加视频 |
| 一种感受、一个抉择、一种「如果…会怎样」 | **L3 交互** |
| 软件产品能力 | **L3 可玩 Demo** |

**原则**：不要为了 L3 而 L3。但当故事的核心是「体验」而非「告知」时，L3 是唯一诚实的媒介。

### 3.2 Story Scene 数据格式

故事以 **beats（节拍）** 为单元，每个 beat 有文字；更高级媒介在 Scene 层配置：

```yaml
# data/stories/kyoto-rain.yaml
title: "京都：一场意外的雨"
tagline: "从文字想象，到亲手走进雨里"

beats:
  - id: start
    text: "鸭川边，天还好好的。"
  - id: cloud
    text: "云压得很低。第一滴落下来。"
  - id: downpour
    text: "雨大了。石板路反光，像碎镜子。"

# L1：各 beat 对应图像（可选）
images:
  start: /images/kyoto-clear.jpg
  cloud: /images/kyoto-cloud.jpg
  downpour: /images/kyoto-rain.jpg

# L2：整段视频（可选）
video:
  src: /media/kyoto-walk.mp4
  poster: /images/kyoto-rain.jpg

# L3：交互控制 — 绑定到故事状态
interactive:
  controls:
    - id: rain
      label: 雨量
      min: 0
      max: 100
      affects: [filter, beat, ambience]
    - id: time
      label: 时间
      type: scrubber
      binds: beats
```

### 3.3 在 Markdown 中调用

```markdown
{{< story-scene story="kyoto-rain" >}}
```

读者页面上会出现**媒介阶梯切换器**：L0 → L1 → L2 → L3，可对比同一故事在不同媒介下的表达力；在 L3 可亲手操控。

---

## 4. L3 交互模式库（路线图）

| 模式 | 适合的故事 | 状态变量 |
|------|-----------|---------|
| **氛围调节** | 天气、情绪、记忆色调 | 雨量、色温、模糊 |
| **时间穿梭** | 旅行、成长、项目历程 | 时间轴 beat 索引 |
| **空间漫游** | 地理经历 | 地图坐标、缩放 |
| **抉择分支** | 关键决定、方法论 | 分支 ID |
| **参数探索** | 软件、算法、设计 | 任意参数 |
| **可玩 Demo** | 产品故事 | 应用真实 UI 状态 |

Phase 1 实现：**氛围调节 + 时间穿梭**（`story-scene` Widget）。
后续扩展：地图、分支、Sandpack 可玩 Demo。

---

## 5. 技术实现要点

```
data/stories/*.yaml     →  Hugo 构建时注入 JSON
layouts/shortcodes/story-scene.html
assets/js/widgets/story-scene.js   →  运行时：媒介切换 + 状态机 + 反馈
```

- L0–L2：根据 `mediumLevel` 渲染不同 DOM 层
- L3：`controls` 改变 `state`，`state` 驱动 filter / beat / audio / copy
- 无 JS：降级为 L0 纯文字（beats 全文输出在 `<noscript>`）

---

## 6. 与 EthanOS 的关系

- **Story Medium Ladder** 是内容创作理论（用什么讲故事）
- **Scene Engine** 是运行时（怎么组装 L0–L3 层）
- **EthanOS** 是壳（Trip.app 里默认以 L3 讲经历，Blog.app 里默认 L0）

经历（Experiences）的默认目标媒介是 **L3**；文章（Posts）的默认是 **L0**，可按需升级。

*示例：[`/experiences/kyoto-rain/`](/experiences/kyoto-rain/) · 北极星愿景见 [VISION_NORTH_STAR.md](./VISION_NORTH_STAR.md)*
