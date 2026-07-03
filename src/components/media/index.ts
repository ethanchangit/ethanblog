/**
 * 媒介组件库 barrel。
 * MDX 中使用：import { ParamSlider, ScrollScene } from '@/components/media';
 * 注意：交互组件（.svelte）在 MDX 里必须写明 client:* 指令。
 */
export { default as ParamSlider } from './ParamSlider.svelte';
export { default as BeforeAfterSlider } from './BeforeAfterSlider.svelte';
export { default as ScrollScene } from './ScrollScene.svelte';
export { default as MediaFrame } from './MediaFrame.astro';
