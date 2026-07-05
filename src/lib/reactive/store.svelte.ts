/**
 * 反应式散文的跨岛屿共享状态。
 * 页面上的每个 Var / Calc 都是独立注水的小岛屿，但它们 import 的这个模块
 * 会被 Vite 去重进同一 chunk——模块级 Map 就是页面会话内的单例，
 * 拖动一个 Var，同 scope 的所有 Calc 立即重算。
 *
 * SSR 侧另有一个普通注册表：MDX 自上而下单遍渲染，Var 先声明、Calc 后求值
 * （validate:content 强制这个顺序），Calc 的服务端初值由此而来。
 */

/** $state 只能出现在类字段/变量声明处（Svelte 5 约束），所以 scope 用类承载 */
class Scope {
  values: Record<string, number> = $state({});
}

const scopes = new Map<string, Scope>();

/** SSR 构建期注册表（跨请求常驻无妨：同名 Var 注册即覆盖，且 Calc 只读同页更早声明的名字） */
const ssrScopes = new Map<string, Record<string, number>>();

// ClientRouter 对策：客户端导航不重载模块，换页前清空，避免上一页的值泄漏
if (typeof document !== 'undefined') {
  document.addEventListener('astro:before-swap', () => scopes.clear());
}

export function getScope(scope = 'page'): Scope {
  let s = scopes.get(scope);
  if (!s) {
    s = new Scope();
    scopes.set(scope, s);
  }
  return s;
}

/** Var 挂载时声明自己；重复声明（如导航返回）直接覆写为初始值 */
export function declareVar(scope: string, name: string, initial: number): void {
  if (import.meta.env.SSR) {
    const values = ssrScopes.get(scope) ?? {};
    values[name] = initial;
    ssrScopes.set(scope, values);
    return;
  }
  getScope(scope).values[name] = initial;
}

export function setValue(scope: string, name: string, value: number): void {
  getScope(scope).values[name] = value;
}

/** Calc 的 SSR 初值来源：此刻已声明的同 scope Var 值快照 */
export function ssrValues(scope: string): Record<string, number> {
  return ssrScopes.get(scope) ?? {};
}
