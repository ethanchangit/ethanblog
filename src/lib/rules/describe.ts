/**
 * 规则的中文描述 —— 单一真相。
 * 交互态的句子拼装、SSR 降级散文、无 JS 文案都必须经 describeRule / describeRules 生成，
 * 保证同一条规则在任何呈现层读起来都是同一句话。
 * 本文件零 DOM 依赖，SSR 安全。
 */

import type { EffectSpec, Rule, TriggerSpec } from './types';

export interface NumberSpec {
  unit: string;
  min: number;
  max: number;
  default: number;
}

export interface TriggerOption {
  kind: TriggerSpec['kind'];
  label: string;
  needsTarget: boolean;
  needsNumber?: NumberSpec;
}

export interface ToneOption {
  value: 'primary' | 'accent';
  label: string;
}

export interface EffectOption {
  kind: EffectSpec['kind'];
  label: string;
  needsTarget: boolean;
  toneOptions?: ToneOption[];
}

export const TRIGGER_OPTIONS: TriggerOption[] = [
  { kind: 'enters-view', label: '进入视野', needsTarget: true },
  { kind: 'click', label: '被点击', needsTarget: true },
  { kind: 'hover', label: '被悬停', needsTarget: true },
  {
    kind: 'scroll-depth',
    label: '滚动过页面的',
    needsTarget: false,
    needsNumber: { unit: '%', min: 5, max: 100, default: 50 },
  },
  {
    kind: 'tick',
    label: '每过',
    needsTarget: false,
    needsNumber: { unit: '秒', min: 1, max: 60, default: 2 },
  },
];

/** 标签是颜色语义（给人读的），实际色值永远来自 global.css 的 --color-* token。 */
export const TONE_OPTIONS: ToneOption[] = [
  { value: 'primary', label: '蓝色' },
  { value: 'accent', label: '青色' },
];

export const EFFECT_OPTIONS: EffectOption[] = [
  { kind: 'highlight', label: '被高亮', needsTarget: true },
  { kind: 'tint', label: '变成 __ 色', needsTarget: true, toneOptions: TONE_OPTIONS },
  { kind: 'nudge', label: '挪动一下', needsTarget: true },
  { kind: 'count', label: '计数加一', needsTarget: true },
  { kind: 'toggle', label: '显示或隐藏', needsTarget: true },
];

const MISSING_TARGET = '（未指定目标）';

/** target name → 『人类标签』；名字为空或 labels 里查不到时输出占位文案。 */
function slot(target: string | undefined, labels: Record<string, string>): string {
  const label = target ? labels[target] : undefined;
  return label ? `『${label}』` : MISSING_TARGET;
}

function toneLabel(tone: 'primary' | 'accent'): string {
  return TONE_OPTIONS.find((t) => t.value === tone)?.label ?? tone;
}

function describeTrigger(when: TriggerSpec, labels: Record<string, string>): string {
  switch (when.kind) {
    case 'enters-view':
      return `当${slot(when.target, labels)}进入视野`;
    case 'click':
      return `当${slot(when.target, labels)}被点击`;
    case 'hover':
      return `当${slot(when.target, labels)}被悬停`;
    case 'scroll-depth':
      return `当滚动过页面的 ${when.percent}%`;
    case 'tick':
      return `每过 ${when.seconds} 秒`;
  }
}

function describeEffect(wish: EffectSpec, labels: Record<string, string>): string {
  const target = slot(wish.target, labels);
  switch (wish.kind) {
    case 'highlight':
      return `希望${target}被高亮`;
    case 'tint':
      return `希望${target}变成${toneLabel(wish.tone)}`;
    case 'nudge':
      return `希望${target}挪动一下`;
    case 'count':
      return `希望${target}计数加一`;
    case 'toggle':
      return `希望${target}显示或隐藏`;
  }
}

/**
 * 把一条规则说成一句可读中文，
 * 如 "当『这段文字』进入视野，希望『右侧图形』变成蓝色"。
 */
export function describeRule(rule: Rule, labels: Record<string, string>): string {
  return `${describeTrigger(rule.when, labels)}，${describeEffect(rule.wish, labels)}`;
}

/**
 * 把多条规则串成一段通顺散文，供 SSR 降级 / 无 JS 时使用。
 * 与引擎行为对齐：enabled === false 的规则不计入。
 */
export function describeRules(rules: Rule[], labels: Record<string, string>): string {
  const active = rules.filter((rule) => rule.enabled !== false);
  if (active.length === 0) return '这个页面里暂时没有住着任何规则。';
  const sentences = active.map((rule) => describeRule(rule, labels));
  return `这个页面里住着 ${active.length} 条规则：${sentences.join('；')}。`;
}
