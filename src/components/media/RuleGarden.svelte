<script lang="ts">
  import { onMount } from 'svelte';
  import { reducedMotion } from '@/lib/motion';
  import type { EffectSpec, Rule, TriggerSpec } from '@/lib/rules/types';
  import {
    TRIGGER_OPTIONS,
    EFFECT_OPTIONS,
    TONE_OPTIONS,
    describeRules,
  } from '@/lib/rules/describe';
  import { createRuleEngine, type RuleEngine } from '@/lib/rules/engine';

  interface Props {
    /** 初始规则（JSON 可序列化，跨岛屿边界） */
    rules: Rule[];
    title?: string;
    caption?: string;
  }

  const { rules: initialRules, title, caption }: Props = $props();

  /** props 深拷贝为本地可编辑状态，props 本身保持只读 */
  const cloneRules = (list: Rule[]): Rule[] => JSON.parse(JSON.stringify(list)) as Rule[];

  let rules = $state<Rule[]>(cloneRules(initialRules));
  let hydrated = $state(false);
  let reduceMotion = $state(false);
  /** 房间里的物件：扫描 [data-rule-target] 收集到的目标清单 */
  let targets = $state<{ name: string; label: string }[]>([]);
  /** ruleId → 触发次数 */
  let fireCounts = $state<Record<string, number>>({});
  /** ruleId → 规则行是否处于"刚触发"的闪烁态 */
  let firedRows = $state<Record<string, boolean>>({});

  let engine: RuleEngine | null = null;
  let localIdSeq = 0;
  const flashTimers = new Map<string, number>();

  /**
   * SSR 降级散文的标签表：注水前拿不到 DOM 上的 data-rule-label，
   * 就用规则里的 target 原样名字充当标签。
   */
  const ssrLabels: Record<string, string> = {};
  for (const rule of initialRules) {
    if ('target' in rule.when) ssrLabels[rule.when.target] = rule.when.target;
    ssrLabels[rule.wish.target] = rule.wish.target;
  }
  const ssrProse = describeRules(initialRules, ssrLabels);

  function enabledRules(): Rule[] {
    return $state.snapshot(rules).filter((r) => r.enabled !== false);
  }

  /** 任何编辑后：组装新 Rule[] → 引擎幂等重建（旧效果全部 undo） */
  function sync() {
    engine?.setRules(enabledRules());
  }

  function onFired(ruleId: string) {
    fireCounts[ruleId] = (fireCounts[ruleId] ?? 0) + 1;
    if (reduceMotion) return; // 不闪，只计数
    const prev = flashTimers.get(ruleId);
    if (prev !== undefined) window.clearTimeout(prev);
    firedRows[ruleId] = true;
    flashTimers.set(
      ruleId,
      window.setTimeout(() => {
        firedRows[ruleId] = false;
        flashTimers.delete(ruleId);
      }, 600)
    );
  }

  onMount(() => {
    hydrated = true;
    reduceMotion = reducedMotion();

    // 扫描房间：页面上所有声明过身份（Claim）的物件，按 name 去重
    const seen = new Map<string, string>();
    for (const el of document.querySelectorAll<HTMLElement>('[data-rule-target]')) {
      const name = el.dataset.ruleTarget;
      if (!name || seen.has(name)) continue;
      seen.set(name, el.dataset.ruleLabel ?? name);
    }
    targets = Array.from(seen, ([name, label]) => ({ name, label }));

    engine = createRuleEngine({
      rules: enabledRules(),
      reducedMotion: reduceMotion,
      onFired,
    });

    return () => {
      engine?.dispose();
      engine = null;
      for (const id of flashTimers.values()) window.clearTimeout(id);
      flashTimers.clear();
    };
  });

  /* ---------- 词槽编辑 ---------- */

  function toggleRule(rule: Rule, checked: boolean) {
    rule.enabled = checked;
    sync();
  }

  /** 切换谓词 kind：用该选项的默认值重建 spec，尽量保留原 target */
  function setTriggerKind(rule: Rule, kind: TriggerSpec['kind']) {
    const opt = TRIGGER_OPTIONS.find((o) => o.kind === kind);
    if (!opt) return;
    const prevTarget = 'target' in rule.when ? rule.when.target : (targets[0]?.name ?? '');
    if (kind === 'scroll-depth') {
      rule.when = { kind, percent: opt.needsNumber?.default ?? 50 };
    } else if (kind === 'tick') {
      rule.when = { kind, seconds: opt.needsNumber?.default ?? 2 };
    } else {
      rule.when = { kind, target: prevTarget };
    }
    sync();
  }

  /** 切换效果 kind：保留 target；tint 补默认色 */
  function setEffectKind(rule: Rule, kind: EffectSpec['kind']) {
    const target = rule.wish.target;
    if (kind === 'tint') {
      rule.wish = { kind, target, tone: TONE_OPTIONS[0]?.value ?? 'primary' };
    } else {
      rule.wish = { kind, target };
    }
    sync();
  }

  function setTriggerTarget(rule: Rule, name: string) {
    if ('target' in rule.when) {
      rule.when.target = name;
      sync();
    }
  }

  function setWishTarget(rule: Rule, name: string) {
    rule.wish.target = name;
    sync();
  }

  function setTone(rule: Rule, tone: string) {
    if (rule.wish.kind === 'tint' && (tone === 'primary' || tone === 'accent')) {
      rule.wish.tone = tone;
      sync();
    }
  }

  /** 数值槽：按 needsNumber 元数据夹取到 [min, max] */
  function setNumber(rule: Rule, raw: string) {
    const spec = TRIGGER_OPTIONS.find((o) => o.kind === rule.when.kind)?.needsNumber;
    if (!spec) return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const value = Math.min(spec.max, Math.max(spec.min, Math.round(n)));
    if (rule.when.kind === 'scroll-depth') rule.when.percent = value;
    else if (rule.when.kind === 'tick') rule.when.seconds = value;
    sync();
  }

  function uniqueId(): string {
    let id = '';
    do {
      id = `rg-local-${++localIdSeq}`;
    } while (rules.some((r) => r.id === id));
    return id;
  }

  function addRule() {
    const first = targets[0]?.name ?? '';
    rules.push({
      id: uniqueId(),
      when: { kind: 'click', target: first },
      wish: { kind: 'highlight', target: first },
    });
    sync();
  }

  /** 复原：回到 props 的深拷贝并重置计数（引擎重建时会 undo 全部已生效效果） */
  function resetRules() {
    rules = cloneRules(initialRules);
    fireCounts = {};
    firedRows = {};
    for (const id of flashTimers.values()) window.clearTimeout(id);
    flashTimers.clear();
    sync();
  }
</script>

{#snippet targetSelect(rule: Rule, current: string, slotLabel: string, apply: (rule: Rule, name: string) => void)}
  <select
    class="rg-chip"
    aria-label={slotLabel}
    value={current}
    onchange={(e) => apply(rule, e.currentTarget.value)}
  >
    {#if current && !targets.some((t) => t.name === current)}
      <!-- 规则引用了页面上不存在的目标：保留原名，别丢用户数据 -->
      <option value={current}>{current}</option>
    {/if}
    {#each targets as t (t.name)}
      <option value={t.name}>{t.label}</option>
    {/each}
  </select>
{/snippet}

<figure class="media-frame not-prose">
  {#if title}
    <div class="py-2">
      <p class="font-mono text-xs text-ink-400">{title}</p>
    </div>
  {/if}

  {#if hydrated}
    <ul class="m-0 list-none space-y-1 py-1">
      {#each rules as rule, i (rule.id)}
        {@const triggerOpt = TRIGGER_OPTIONS.find((o) => o.kind === rule.when.kind)}
        {@const effectOpt = EFFECT_OPTIONS.find((o) => o.kind === rule.wish.kind)}
        <li class="rg-row" class:rg-row-fired={firedRows[rule.id]}>
          <input
            type="checkbox"
            checked={rule.enabled !== false}
            onchange={(e) => toggleRule(rule, e.currentTarget.checked)}
            aria-label={`启用第 ${i + 1} 条规则`}
          />
          <span class="rg-sentence">
            {#if rule.when.kind !== 'tick'}当{/if}
            {#if triggerOpt?.needsTarget && 'target' in rule.when}
              {@render targetSelect(rule, rule.when.target, '触发目标', setTriggerTarget)}
            {/if}
            <select
              class="rg-chip"
              aria-label="触发方式"
              value={rule.when.kind}
              onchange={(e) => setTriggerKind(rule, e.currentTarget.value as TriggerSpec['kind'])}
            >
              {#each TRIGGER_OPTIONS as opt (opt.kind)}
                <option value={opt.kind}>{opt.label}</option>
              {/each}
            </select>
            {#if triggerOpt?.needsNumber}
              <input
                class="rg-chip rg-chip-num"
                type="number"
                min={triggerOpt.needsNumber.min}
                max={triggerOpt.needsNumber.max}
                value={rule.when.kind === 'scroll-depth'
                  ? rule.when.percent
                  : rule.when.kind === 'tick'
                    ? rule.when.seconds
                    : triggerOpt.needsNumber.default}
                onchange={(e) => setNumber(rule, e.currentTarget.value)}
                aria-label="触发数值"
              />
              {triggerOpt.needsNumber.unit}
            {/if}
            ，希望
            {@render targetSelect(rule, rule.wish.target, '效果目标', setWishTarget)}
            <select
              class="rg-chip"
              aria-label="效果"
              value={rule.wish.kind}
              onchange={(e) => setEffectKind(rule, e.currentTarget.value as EffectSpec['kind'])}
            >
              {#each EFFECT_OPTIONS as opt (opt.kind)}
                <option value={opt.kind}>{opt.label}</option>
              {/each}
            </select>
            {#if rule.wish.kind === 'tint' && effectOpt?.toneOptions}
              <select
                class="rg-chip"
                aria-label="颜色"
                value={rule.wish.tone}
                onchange={(e) => setTone(rule, e.currentTarget.value)}
              >
                {#each effectOpt.toneOptions as tone (tone.value)}
                  <option value={tone.value}>{tone.label}</option>
                {/each}
              </select>
            {/if}
          </span>
          {#if fireCounts[rule.id]}
            <span class="ui-meta ml-auto shrink-0 self-center">
              ·已触发 ×{fireCounts[rule.id]}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
    <div class="flex gap-4 py-2">
      <button
        type="button"
        onclick={addRule}
        class="font-mono text-xs text-ink-400 transition-colors hover:text-ink-100"
      >
        ＋ 添加一条规则
      </button>
      <button
        type="button"
        onclick={resetRules}
        class="font-mono text-xs text-ink-400 transition-colors hover:text-ink-100"
      >
        复原
      </button>
    </div>
  {:else}
    <!-- SSR / 无 JS 降级：把规则说成一段通顺散文，内容不被劫持 -->
    <p class="py-2 text-sm leading-loose text-ink-400">
      {ssrProse}（启用 JavaScript 后，你可以亲手开关、改写、添加这些规则。）
    </p>
  {/if}

  {#if caption}
    <figcaption class="media-caption">{caption}</figcaption>
  {/if}
</figure>
