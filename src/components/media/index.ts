/**
 * 媒介组件库 barrel。
 * MDX 中使用：import { ParamSlider, ScrollScene } from '@/components/media';
 * 注意：交互组件（.svelte）在 MDX 里必须写明 client:* 指令；
 * Astro 组件（VideoEmbed / CodePlayground / MediaFrame）零注水，无需指令。
 */
export { default as ParamSlider } from './ParamSlider.svelte';
export { default as BeforeAfterSlider } from './BeforeAfterSlider.svelte';
export { default as ScrollScene } from './ScrollScene.svelte';
export { default as Timeline } from './Timeline.svelte';
export { default as StatCounter } from './StatCounter.svelte';
export { default as AudioClip } from './AudioClip.svelte';
export { default as InteractiveDemo } from './InteractiveDemo.svelte';
export { default as VideoEmbed } from './VideoEmbed.astro';
export { default as CodePlayground } from './CodePlayground.astro';
export { default as MediaFrame } from './MediaFrame.astro';
