<script lang="ts">
  import { onMount } from 'svelte';
  import { declareVar, getScope, setValue } from '@/lib/reactive/store.svelte';
  import { formatValue } from '@/lib/reactive/eval';

  interface Props {
    /** scope 内变量名，Calc 的表达式里引用 */
    name: string;
    initial: number;
    min: number;
    max: number;
    step?: number;
    /** 显示后缀，如 " 张卡片"（含空格自己带） */
    unit?: string;
    /** 显示小数位；缺省由 step 推断（step<1 → 1 位） */
    decimals?: number;
    /** 一页多组反应式散文时才需要指定，缺省共用 'page' */
    scope?: string;
    /** 读屏标签，缺省用 name */
    label?: string;
  }

  const {
    name,
    initial,
    min,
    max,
    step = 1,
    unit = '',
    decimals,
    scope = 'page',
    label,
  }: Props = $props();

  const displayDecimals = decimals ?? (step < 1 ? 1 : 0);

  // SSR：登记到构建期注册表，供同页更靠后的 Calc 求初值；
  // 客户端：写入共享 store，同 scope 的 Calc 立即可读。
  declareVar(scope, name, initial);

  const store = import.meta.env.SSR ? null : getScope(scope);
  const value = $derived(store ? (store.values[name] ?? initial) : initial);

  // 注水前是纯文本（无 JS 散文照常可读），注水后才亮出 slider 语义
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });

  /** 对齐 step 网格并夹进 [min, max]，toFixed 抹掉浮点漂移 */
  function quantize(v: number): number {
    const snapped = Math.round((v - min) / step) * step + min;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(6));
  }

  let dragStartX = 0;
  let dragStartValue = 0;

  function onPointerDown(e: PointerEvent) {
    dragStartX = e.clientX;
    dragStartValue = value;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    // 水平拖动，每 6px 走一步（Tangle 的手感）
    const steps = Math.round((e.clientX - dragStartX) / 6);
    setValue(scope, name, quantize(dragStartValue + steps * step));
  }

  function onKeyDown(e: KeyboardEvent) {
    const mult = e.shiftKey ? 10 : 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + step * mult;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - step * mult;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next !== null) {
      e.preventDefault();
      setValue(scope, name, quantize(next));
    }
  }
</script>

{#if hydrated}
  <span
    class="reactive-var"
    data-rvar={`${scope}:${name}`}
    data-initial={initial}
    role="slider"
    tabindex="0"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={`${formatValue(value, displayDecimals)}${unit}`}
    aria-label={label ?? name}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onkeydown={onKeyDown}
  >{formatValue(value, displayDecimals)}{unit}</span>
{:else}
  <span class="reactive-var" data-rvar={`${scope}:${name}`} data-initial={initial}
    >{formatValue(value, displayDecimals)}{unit}</span
  >
{/if}
