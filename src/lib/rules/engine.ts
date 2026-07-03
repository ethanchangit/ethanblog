/**
 * 声明式规则引擎 —— 只在浏览器里调用（SSR 侧请用 describe.ts 生成降级散文）。
 *
 * 契约：
 * - 效果不得触发谓词（禁规则链）：效果只做 class / attr 开关，触发器只观察
 *   用户与页面的原生交互，二者之间没有回路。
 * - 新增谓词 / 效果只改本文件的 triggerRegistry / effectRegistry，组件层零改动
 *   （对齐 src/lib/viz/registry.ts 的注册表风格）。
 * - 生命周期对齐 src/lib/scene3d/registry.ts 的 factory → dispose 范式：
 *   createRuleEngine 返回句柄，setRules 幂等重建，dispose 解绑一切并复原全部效果。
 * - 颜色零字面量：效果类（.rg-*）的视觉表现在 global.css 里用 --color-* token 定义。
 */

import type { EffectSpec, Rule, TriggerSpec } from './types';

export interface RuleEngine {
  setRules(rules: Rule[]): void;
  dispose(): void;
}

type Unbind = () => void;

interface EngineEnv {
  root: Document | HTMLElement;
  reducedMotion: boolean;
}

type TriggerBinder<S extends TriggerSpec = TriggerSpec> = (
  spec: S,
  resolveTargets: () => HTMLElement[],
  fire: () => void,
  env: EngineEnv
) => Unbind;

interface EffectHandler<S extends EffectSpec = EffectSpec> {
  apply(el: HTMLElement, spec: S, env: EngineEnv): void;
  undo(el: HTMLElement, spec: S, env: EngineEnv): void;
}

/** 按 name 惰性解析目标 —— 每次触发时才查询，容忍 DOM 后到。 */
function queryTargets(root: Document | HTMLElement, name: string): HTMLElement[] {
  const escaped = name.replace(/["\\]/g, '\\$&');
  return Array.from(
    root.querySelectorAll<HTMLElement>(`[data-rule-target="${escaped}"]`)
  );
}

/* ---------- 触发谓词注册表（扩展点） ---------- */

const triggerRegistry: {
  [K in TriggerSpec['kind']]: TriggerBinder<Extract<TriggerSpec, { kind: K }>>;
} = {
  // 进入视野：每次进入都触发（离开后再进来会再触发）。
  'enters-view': (_spec, resolveTargets, fire) => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) fire();
        }
      },
      { threshold: 0.4 }
    );
    for (const el of resolveTargets()) io.observe(el);
    return () => io.disconnect();
  },

  click: (_spec, resolveTargets, fire) => {
    const els = resolveTargets();
    for (const el of els) el.addEventListener('click', fire);
    return () => {
      for (const el of els) el.removeEventListener('click', fire);
    };
  },

  hover: (_spec, resolveTargets, fire) => {
    const els = resolveTargets();
    for (const el of els) el.addEventListener('mouseenter', fire);
    return () => {
      for (const el of els) el.removeEventListener('mouseenter', fire);
    };
  },

  // 向下穿越 percent 触发；回撤到线上方复位，可再次触发。
  'scroll-depth': (spec, _resolveTargets, fire) => {
    let past = false;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const depth = max > 0 ? (window.scrollY / max) * 100 : 100;
      if (!past && depth >= spec.percent) {
        past = true;
        fire();
      } else if (past && depth < spec.percent) {
        past = false;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  },

  tick: (spec, _resolveTargets, fire, env) => {
    if (env.reducedMotion) return () => {};
    const id = window.setInterval(fire, Math.max(500, spec.seconds * 1000));
    return () => window.clearInterval(id);
  },
};

/* ---------- 愿望效果注册表（扩展点） ---------- */

// nudge 的自动移除定时器，undo 时需要一并清掉。
const nudgeTimers = new WeakMap<HTMLElement, number>();

const effectRegistry: {
  [K in EffectSpec['kind']]: EffectHandler<Extract<EffectSpec, { kind: K }>>;
} = {
  highlight: {
    apply(el) {
      el.classList.add('rg-highlight');
    },
    undo(el) {
      el.classList.remove('rg-highlight');
    },
  },

  tint: {
    apply(el, spec) {
      el.classList.add(`rg-tint-${spec.tone}`);
    },
    undo(el, spec) {
      el.classList.remove(`rg-tint-${spec.tone}`);
    },
  },

  // 600ms 后自动移除，方便重复触发；reducedMotion 时不加 class（onFired 仍由引擎调用）。
  nudge: {
    apply(el, _spec, env) {
      if (env.reducedMotion) return;
      const prev = nudgeTimers.get(el);
      if (prev !== undefined) window.clearTimeout(prev);
      el.classList.remove('rg-nudge');
      void el.offsetWidth; // 强制回流，让动画重新播放
      el.classList.add('rg-nudge');
      nudgeTimers.set(
        el,
        window.setTimeout(() => {
          el.classList.remove('rg-nudge');
          nudgeTimers.delete(el);
        }, 600)
      );
    },
    undo(el) {
      const prev = nudgeTimers.get(el);
      if (prev !== undefined) {
        window.clearTimeout(prev);
        nudgeTimers.delete(el);
      }
      el.classList.remove('rg-nudge');
    },
  },

  count: {
    apply(el) {
      const raw = Number(el.getAttribute('data-rg-count') ?? '0');
      const cur = Number.isFinite(raw) ? raw : 0;
      el.setAttribute('data-rg-count', String(cur + 1));
    },
    undo(el) {
      el.removeAttribute('data-rg-count');
    },
  },

  toggle: {
    apply(el) {
      el.classList.toggle('rg-hidden');
    },
    undo(el) {
      el.classList.remove('rg-hidden');
    },
  },
};

/* ---------- 引擎 ---------- */

interface ActiveRule {
  unbind: Unbind;
  wish: EffectSpec;
  /** 效果实际作用过的元素，teardown 时逐一 undo 完全复原。 */
  touched: Set<HTMLElement>;
}

export function createRuleEngine(opts: {
  root?: Document | HTMLElement;
  rules: Rule[];
  reducedMotion: boolean;
  onFired?: (ruleId: string) => void;
}): RuleEngine {
  const env: EngineEnv = {
    root: opts.root ?? document,
    reducedMotion: opts.reducedMotion,
  };
  let active: ActiveRule[] = [];

  function teardown() {
    for (const item of active) {
      item.unbind();
      const handler = effectRegistry[item.wish.kind] as EffectHandler;
      for (const el of item.touched) handler.undo(el, item.wish, env);
      item.touched.clear();
    }
    active = [];
  }

  function setRules(rules: Rule[]) {
    // 幂等：先 undo 全部已生效效果、解绑全部触发器，再按新规则重建。
    teardown();
    for (const rule of rules) {
      if (rule.enabled === false) continue;
      const { when, wish } = rule;
      const handler = effectRegistry[wish.kind] as EffectHandler;
      const touched = new Set<HTMLElement>();

      const fire = () => {
        for (const el of queryTargets(env.root, wish.target)) {
          touched.add(el);
          handler.apply(el, wish, env);
        }
        opts.onFired?.(rule.id);
      };

      const resolveTriggerTargets = () =>
        'target' in when ? queryTargets(env.root, when.target) : [];

      const bind = triggerRegistry[when.kind] as TriggerBinder;
      const unbind = bind(when, resolveTriggerTargets, fire, env);
      active.push({ unbind, wish, touched });
    }
  }

  setRules(opts.rules);

  return {
    setRules,
    dispose: teardown,
  };
}
