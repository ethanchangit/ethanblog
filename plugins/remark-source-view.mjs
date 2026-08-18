/**
 * 拆开看（source-view）—— 构建期 remark 插件。
 *
 * 默认不向读者注入。机制留在仓库里，日后若要自我解释的页，把 ENABLED 设回 true
 * 并在 frontmatter 写 sourceView: true。
 *
 * 零依赖：手写递归遍历，不引入 unist-util-visit。
 */

/**
 * 媒介组件白名单 —— 与 src/components/media/index.ts barrel 保持同步。
 * 刻意排除 MediaFrame / SideNote / RuleTarget / Var / Calc / Mention / MentionTarget：
 * 排版/标记容器与行内组件，源码无独立信息量（行内组件是 mdxJsxTextElement，本就不会命中）。
 */
const MEDIA_TAGS = new Set([
  'ParamSlider',
  'BeforeAfterSlider',
  'ScrollScene',
  'Timeline',
  'StatCounter',
  'AudioClip',
  'InteractiveDemo',
  'ImageGallery',
  'Scene3D',
  'VideoEmbed',
  'TweetEmbed',
  'CodePlayground',
  'RuleGarden',
  'VerdictTable',
]);

/** 构造 disclosure 节点：小写 HTML 元素 + 标准 mdast code 节点，绝不注入 import/mdxjsEsm。 */
function makeDisclosure(name, code) {
  return {
    type: 'mdxJsxFlowElement',
    name: 'details',
    attributes: [{ type: 'mdxJsxAttribute', name: 'class', value: 'source-view' }],
    children: [
      {
        type: 'mdxJsxFlowElement',
        name: 'summary',
        attributes: [],
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'span',
            attributes: [{ type: 'mdxJsxAttribute', name: 'class', value: 'i18n-zh' }],
            children: [{ type: 'text', value: '⌥ 源码 · ' + name }],
          },
          {
            type: 'mdxJsxFlowElement',
            name: 'span',
            attributes: [
              { type: 'mdxJsxAttribute', name: 'class', value: 'i18n-en' },
              { type: 'mdxJsxAttribute', name: 'aria-hidden', value: 'true' },
            ],
            children: [{ type: 'text', value: '⌥ Source · ' + name }],
          },
        ],
      },
      { type: 'code', lang: 'mdx', value: code },
    ],
  };
}

/** 默认关闭，不向文章注入。 */
const ENABLED = false;

export function remarkSourceView() {
  return (tree, file) => {
    if (!ENABLED) return;
    if (file.data?.astro?.frontmatter?.sourceView !== true) return;

    const src = String(file.value);

    const walk = (parent) => {
      const children = parent.children;
      if (!Array.isArray(children)) return;

      for (let i = 0; i < children.length; i++) {
        const node = children[i];

        if (node.type === 'mdxJsxFlowElement' && MEDIA_TAGS.has(node.name)) {
          // 单处退出阀：noSource 属性 —— 摘除后跳过，避免泄漏到渲染输出
          const attrs = Array.isArray(node.attributes) ? node.attributes : [];
          const noSourceIdx = attrs.findIndex(
            (attr) => attr.type === 'mdxJsxAttribute' && attr.name === 'noSource'
          );
          if (noSourceIdx !== -1) {
            attrs.splice(noSourceIdx, 1);
            continue;
          }

          // 无 position（如其他插件生成的节点）时安全跳过
          const start = node.position?.start?.offset;
          const end = node.position?.end?.offset;
          if (start == null || end == null) continue;

          const code = src.slice(start, end).trim();
          children.splice(i + 1, 0, makeDisclosure(node.name, code));
          i++; // 跳过刚注入的 disclosure
          continue; // 匹配过的节点不再下潜其 children，防嵌套重复注入
        }

        walk(node);
      }
    };

    walk(tree);
  };
}
