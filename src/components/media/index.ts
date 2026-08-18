/**
 * 媒介组件库 barrel。
 * MDX 中使用：import { ParamSlider, ScrollScene } from '@/components/media';
 * 注意：交互组件（.svelte）在 MDX 里必须写明 client:* 指令；
 * CodePlayground 为 Astro 薄包装（内部 client:visible），MDX 可直接使用无需指令。
 */
export { default as ParamSlider } from './ParamSlider.svelte';
export { default as BeforeAfterSlider } from './BeforeAfterSlider.svelte';
export { default as ScrollScene } from './ScrollScene.svelte';
export { default as Timeline } from './Timeline.svelte';
export { default as StatCounter } from './StatCounter.svelte';
export { default as AudioClip } from './AudioClip.svelte';
export { default as InteractiveDemo } from './InteractiveDemo.svelte';
export { default as ImageGallery } from './ImageGallery.svelte';
export { default as Scene3D } from './Scene3D.svelte';
export { default as VideoEmbed } from './VideoEmbed.astro';
// TweetEmbed：自绘 X 卡片；作者只给 url，构建期拉正文
export { default as TweetEmbed } from './TweetEmbed.astro';
export { default as CodePlayground } from './CodePlayground.astro';
export { default as MediaFrame } from './MediaFrame.astro';
export { default as SideNote } from './SideNote.astro';
// RuleGarden：Astro 薄包装（内部 client:visible），MDX 免指令；规则花园（Claim/When/Wish 网页版）
export { default as RuleGarden } from './RuleGarden.astro';
// RuleTarget：零 JS 标记组件，给页面元素声明 data-rule-target 身份，供 RuleGarden 规则引用
export { default as RuleTarget } from './RuleTarget.astro';
// 反应式散文（Tangle/Potluck）：Var 是正文里可拖动的数字，Calc 是随之重算的内联结果。
// 两者都是行内 Svelte 岛屿，MDX 里必须写 client:visible；同 scope 共享状态。
export { default as Var } from './Var.svelte';
export { default as Calc } from './Calc.svelte';
// VerdictTable：零 JS 裁决表（原则 × 方案 评分矩阵，Ink & Switch 评分卡范式）
export { default as VerdictTable } from './VerdictTable.astro';
// Mention / MentionTarget：正文词语 ↔ 媒介块 的双向高亮（Embark 范式），零 JS 降级为普通文本
export { default as Mention } from './Mention.astro';
export { default as MentionTarget } from './MentionTarget.astro';
