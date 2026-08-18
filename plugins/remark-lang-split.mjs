/**
 * 双语正文切分 —— 构建期 remark 插件。
 *
 * MDX 里写一个空的 <div data-lang-split></div>，其前为中文、其后为英文。
 * 插件把两侧分别包进 .i18n-zh-block / .i18n-en-block（CSS 按 html[data-lang] 显隐）。
 * 无切分标记时整篇保持中文，英文偏好下仍显示中文（永不空白）。
 *
 * 通过 remarkPluginFrontmatter.i18nHeadingSplit 把中文标题数量交给布局，
 * 用来把 TOC 拆成中英两份。
 */

function isLangSplit(node) {
  if (node.type === 'html' && /data-lang-split/.test(String(node.value ?? ''))) return true;
  if (node.type !== 'mdxJsxFlowElement' || node.name !== 'div') return false;
  const attrs = Array.isArray(node.attributes) ? node.attributes : [];
  return attrs.some(
    (attr) =>
      attr.type === 'mdxJsxAttribute' &&
      (attr.name === 'data-lang-split' || attr.name === 'dataLangSplit'),
  );
}

function isHoist(node) {
  return node.type === 'mdxjsEsm';
}

function countHeadings(nodes) {
  let n = 0;
  const walk = (node) => {
    if (node.type === 'heading') n += 1;
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return n;
}

function wrap(className, children) {
  return {
    type: 'mdxJsxFlowElement',
    name: 'div',
    attributes: [{ type: 'mdxJsxAttribute', name: 'class', value: className }],
    children,
  };
}

export function remarkLangSplit() {
  return (tree, file) => {
    const children = tree.children;
    if (!Array.isArray(children)) return;

    const idx = children.findIndex(isLangSplit);
    if (idx === -1) return;

    let hoistEnd = 0;
    while (hoistEnd < idx && isHoist(children[hoistEnd])) hoistEnd += 1;

    const zhNodes = children.slice(hoistEnd, idx);
    const enNodes = children.slice(idx + 1);
    if (enNodes.length === 0) {
      children.splice(idx, 1);
      return;
    }

    const astro = (file.data ??= {}).astro ??= {};
    const frontmatter = (astro.frontmatter ??= {});
    frontmatter.i18nHeadingSplit = countHeadings(zhNodes);

    children.splice(
      hoistEnd,
      children.length - hoistEnd,
      wrap('i18n-zh-block', zhNodes),
      wrap('i18n-en-block', enNodes),
    );
  };
}
