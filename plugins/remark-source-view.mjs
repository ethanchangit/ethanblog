/**
 * 拆开看（source-view）—— 构建期 remark 插件。
 *
 * Realtalk 可见性原则：程序印在物体上。读者在故事里看到一个媒介组件，
 * 就应当能就地拆开，看到驱动它的那段 MDX 原文。
 * 本插件在每个媒介组件节点之后注入一个 <details class="source-view">，
 * 内含该组件调用的源码片段（标准 mdast code 节点，交给 shiki 高亮）。
 *
 * 零依赖：手写递归遍历，不引入 unist-util-visit。
 */

/**
 * 媒介组件白名单 —— 与 src/components/media/index.ts barrel 保持同步。
 * 刻意排除 MediaFrame / SideNote / RuleTarget：它们是纯排版/标记容器，源码无信息量。
 * RuleGarden 为即将新增的组件，预先列入。
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
  'CodePlayground',
  'RuleGarden',
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
        children: [{ type: 'text', value: '⌥ 源码 · ' + name }],
      },
      { type: 'code', lang: 'mdx', value: code },
    ],
  };
}

export function remarkSourceView() {
  return (tree, file) => {
    // 整篇退出阀：frontmatter 写 sourceView: false 时跳过全文
    if (file.data?.astro?.frontmatter?.sourceView === false) return;

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
