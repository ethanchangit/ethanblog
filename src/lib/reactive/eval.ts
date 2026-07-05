/**
 * 反应式散文的安全表达式求值器（Var/Calc 共用）。
 * 手写词法 + 递归下降，不用 eval/new Function——表达式来自 MDX 的字符串 prop，
 * 编译错误在 SSR 构建期抛出，作者当场发现写错的公式。
 *
 * 语法：数字、变量名、+ - * / % ^（右结合）、一元负号、括号、
 * 函数白名单 min / max / round / floor / ceil / abs / sqrt / clamp。
 */

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: string };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  sqrt: Math.sqrt,
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
};

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^\d*\.?\d+/.exec(expr.slice(i));
      if (!m) throw new Error(`表达式里有无法解析的数字（位置 ${i}）：${expr}`);
      tokens.push({ kind: 'num', value: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(expr.slice(i))!;
      tokens.push({ kind: 'ident', name: m[0] });
      i += m[0].length;
    } else if ('+-*/%^(),'.includes(ch)) {
      tokens.push({ kind: 'op', op: ch });
      i++;
    } else {
      throw new Error(`表达式里有不支持的字符 "${ch}"：${expr}`);
    }
  }
  return tokens;
}

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'unary'; node: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'call'; fn: string; args: Node[] };

function parse(tokens: Token[], expr: string): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (op?: string): Token => {
    const t = tokens[pos];
    if (!t) throw new Error(`表达式意外结束：${expr}`);
    if (op !== undefined && !(t.kind === 'op' && t.op === op))
      throw new Error(`表达式期望 "${op}"：${expr}`);
    pos++;
    return t;
  };

  // additive → multiplicative (('+'|'-') multiplicative)*
  function additive(): Node {
    let left = multiplicative();
    while (peek()?.kind === 'op' && '+-'.includes((peek() as { op: string }).op)) {
      const op = (eat() as { op: string }).op;
      left = { kind: 'binary', op, left, right: multiplicative() };
    }
    return left;
  }

  // multiplicative → power (('*'|'/'|'%') power)*
  function multiplicative(): Node {
    let left = power();
    while (peek()?.kind === 'op' && '*/%'.includes((peek() as { op: string }).op)) {
      const op = (eat() as { op: string }).op;
      left = { kind: 'binary', op, left, right: power() };
    }
    return left;
  }

  // power → unary ('^' power)?  —— 右结合
  function power(): Node {
    const left = unary();
    if (peek()?.kind === 'op' && (peek() as { op: string }).op === '^') {
      eat('^');
      return { kind: 'binary', op: '^', left, right: power() };
    }
    return left;
  }

  function unary(): Node {
    if (peek()?.kind === 'op' && (peek() as { op: string }).op === '-') {
      eat('-');
      return { kind: 'unary', node: unary() };
    }
    return primary();
  }

  function primary(): Node {
    const t = peek();
    if (!t) throw new Error(`表达式意外结束：${expr}`);
    if (t.kind === 'num') {
      eat();
      return { kind: 'num', value: t.value };
    }
    if (t.kind === 'ident') {
      eat();
      if (peek()?.kind === 'op' && (peek() as { op: string }).op === '(') {
        if (!(t.name in FUNCTIONS))
          throw new Error(`表达式调用了白名单外的函数 "${t.name}"：${expr}`);
        eat('(');
        const args: Node[] = [];
        if (!(peek()?.kind === 'op' && (peek() as { op: string }).op === ')')) {
          args.push(additive());
          while (peek()?.kind === 'op' && (peek() as { op: string }).op === ',') {
            eat(',');
            args.push(additive());
          }
        }
        eat(')');
        return { kind: 'call', fn: t.name, args };
      }
      return { kind: 'var', name: t.name };
    }
    if (t.kind === 'op' && t.op === '(') {
      eat('(');
      const inner = additive();
      eat(')');
      return inner;
    }
    throw new Error(`表达式无法解析（位置 ${pos}）：${expr}`);
  }

  const root = additive();
  if (pos !== tokens.length) throw new Error(`表达式末尾有多余内容：${expr}`);
  return root;
}

function collectDeps(node: Node, deps: Set<string>): void {
  switch (node.kind) {
    case 'var':
      deps.add(node.name);
      break;
    case 'unary':
      collectDeps(node.node, deps);
      break;
    case 'binary':
      collectDeps(node.left, deps);
      collectDeps(node.right, deps);
      break;
    case 'call':
      node.args.forEach((a) => collectDeps(a, deps));
      break;
  }
}

function evalNode(node: Node, vars: Record<string, number>): number {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'var': {
      const v = vars[node.name];
      return typeof v === 'number' ? v : NaN;
    }
    case 'unary':
      return -evalNode(node.node, vars);
    case 'binary': {
      const l = evalNode(node.left, vars);
      const r = evalNode(node.right, vars);
      switch (node.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return l / r;
        case '%':
          return l % r;
        case '^':
          return l ** r;
        default:
          return NaN;
      }
    }
    case 'call':
      return FUNCTIONS[node.fn](...node.args.map((a) => evalNode(a, vars)));
  }
}

export interface CompiledExpr {
  /** 表达式引用的全部变量名（Calc 用它订阅依赖） */
  deps: string[];
  evaluate(vars: Record<string, number>): number;
}

/** 编译表达式；语法错误直接 throw（SSR 时 = 构建失败，公式错误当场暴露）。 */
export function compile(expr: string): CompiledExpr {
  const ast = parse(tokenize(expr), expr);
  const deps = new Set<string>();
  collectDeps(ast, deps);
  return { deps: [...deps], evaluate: (vars) => evalNode(ast, vars) };
}

/**
 * 数值展示格式化：decimals 缺省 auto——整数原样、小数 ≤2 位去尾零；
 * 非有限值显示 "—"（依赖缺失时 Calc 的兜底展示）。
 */
export function formatValue(v: number, decimals?: number): string {
  if (!Number.isFinite(v)) return '—';
  if (decimals !== undefined) return v.toFixed(decimals);
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toFixed(2)));
}
