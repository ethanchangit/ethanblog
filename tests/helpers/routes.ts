/** Static routes derived from src/content — kept in sync with the site map. */
export const STATIC_ROUTES = [
  '/',
  '/stories',
  '/stories/how-this-site-works',
  '/stories/pkm-method',
  '/stories/heptabase-method',
  '/stories/notes/web-as-medium/01-medium-engine-groundwork',
  '/threads',
  '/threads/web-as-medium',
  '/projects',
  '/projects/robert',
  '/projects/network',
  '/projects/deeptalk',
  '/projects/aletheia',
  '/projects/ethanchang-io',
  '/projects/craft-space',
  '/projects/chunk',
  '/about',
  '/lab',
] as const;

export const KEY_PAGES_FOR_LINK_CHECK = [
  '/',
  '/stories',
  '/threads',
  '/projects',
  '/about',
  '/lab',
] as const;
