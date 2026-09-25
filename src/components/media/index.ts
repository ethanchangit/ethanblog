/**
 * 媒介组件库 barrel。
 * MDX 中使用：import { InteractiveDemo, RuleGarden } from '@/components/media';
 * 交互组件（.svelte）在 MDX 里必须写明 client:* 指令。
 * RuleGarden 为 Astro 薄包装（内部 client:visible），MDX 可直接使用无需指令。
 */
export { default as Timeline } from './Timeline.svelte';
export { default as InteractiveDemo } from './InteractiveDemo.svelte';
export { default as VideoEmbed } from './VideoEmbed.astro';
export { default as TweetEmbed } from './TweetEmbed.astro';
export { default as SideNote } from './SideNote.astro';
export { default as RuleGarden } from './RuleGarden.astro';
export { default as RuleTarget } from './RuleTarget.astro';
/** 悬停预览由 MentionPreviews.astro 挂到 Base，不要写进 MDX。 */
export { default as MentionPreview } from './MentionPreview.svelte';
export { default as DocRef } from './DocRef.astro';
export { default as DocList } from './DocList.astro';
