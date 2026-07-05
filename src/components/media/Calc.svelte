<script lang="ts">
  import { compile, formatValue } from '@/lib/reactive/eval';
  import { getScope, ssrValues } from '@/lib/reactive/store.svelte';

  interface Props {
    /** 安全算术表达式：数字、Var 名、+ - * / % ^ ()、min/max/round/floor/ceil/abs/sqrt/clamp */
    expr: string;
    unit?: string;
    /** 显示小数位；缺省 auto（整数原样，小数 ≤2 位去尾零） */
    decimals?: number;
    scope?: string;
  }

  const { expr, unit = '', decimals, scope = 'page' }: Props = $props();

  // 编译一次；语法错误在 SSR 构建期直接抛出
  const compiled = compile(expr);

  const store = import.meta.env.SSR ? null : getScope(scope);

  /** 岛屿注水顺序不保证：store 里还没有的依赖，从 Var 的 SSR 标记兜底读初值 */
  function domInitial(dep: string): number {
    const el = document.querySelector<HTMLElement>(`[data-rvar="${scope}:${dep}"]`);
    return el?.dataset.initial !== undefined ? Number(el.dataset.initial) : NaN;
  }

  const value = $derived.by(() => {
    if (!store) return compiled.evaluate(ssrValues(scope));
    const vars: Record<string, number> = {};
    for (const dep of compiled.deps) {
      vars[dep] = store.values[dep] ?? domInitial(dep);
    }
    return compiled.evaluate(vars);
  });
</script>

<span class="reactive-calc" data-rcalc={expr}>{formatValue(value, decimals)}{unit}</span>
