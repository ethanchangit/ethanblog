/**
 * 声明式规则引擎的数据模型 —— Realtalk 的 Claim / When / Wish 的网页玩具版。
 * "页面即房间"：页面元素通过 data-rule-target="NAME" 声明自己是谁（Claim），
 * 一条规则 = 当（when，触发谓词）+ 希望（wish，愿望效果），描述房间里应发生的事。
 *
 * 所有类型必须 JSON 可序列化（禁函数、禁 DOM 引用），
 * 以便作为 props 跨 Astro / Svelte 岛屿边界传递、或直接存进 frontmatter。
 */

export type TriggerSpec =
  | { kind: 'enters-view'; target: string }
  | { kind: 'click'; target: string }
  | { kind: 'hover'; target: string }
  | { kind: 'scroll-depth'; percent: number }
  | { kind: 'tick'; seconds: number };

export type EffectSpec =
  | { kind: 'highlight'; target: string }
  | { kind: 'tint'; target: string; tone: 'primary' | 'accent' }
  | { kind: 'nudge'; target: string }
  | { kind: 'count'; target: string }
  | { kind: 'toggle'; target: string };

export interface Rule {
  id: string;
  enabled?: boolean;
  when: TriggerSpec;
  wish: EffectSpec;
}
