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
export { default as CodePlayground } from './CodePlayground.astro';
export { default as MediaFrame } from './MediaFrame.astro';
