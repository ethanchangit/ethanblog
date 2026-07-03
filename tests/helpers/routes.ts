/** Static routes derived from src/content — kept in sync with the site map. */
export const STATIC_ROUTES = [
  '/',
  '/stories',
  '/stories/how-this-site-works',
  '/stories/pkm-method',
  '/stories/heptabase-method',
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
  '/projects',
  '/about',
  '/lab',
] as const;
