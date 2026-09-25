/**
 * Address shown in the dashboard 属性 block.
 * A single article, project, or page is /<slug> on cn.ethanchang.io and the same
 * path on the English host. This label never includes the domain or an
 * articles/projects/pages prefix.
 */
export function auditAddress(card) {
  if (!card) return '';
  const slug = card.afterProperties?.url || card.beforeProperties?.url;
  if (typeof slug === 'string' && slug.trim()) return `/${slug.trim().replace(/^\/+/, '')}`;
  if (!card.path) return '';
  let id = card.path.replace(/^src\/content\//, '').replace(/\.mdx$/, '');
  if (card.translation) id = id.replace(/\/[a-z]{2,3}$/, '');
  id = id.replace(/^(articles|projects|pages)\//, '');
  return id ? `/${id}` : '';
}
