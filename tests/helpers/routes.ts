/** Static routes derived from src/content — kept in sync with the site map. */
export const STATIC_ROUTES = [
  '/',
  '/articles',
  '/articles/how-this-site-works',
  '/articles/embed-preview',
  '/articles/pkm-method',
  '/articles/heptabase-method',
  '/articles/notes/web-as-medium/01-medium-engine-groundwork',
  '/threads',
  '/threads/web-as-medium',
  '/projects',
  '/projects/maker-plan',
  '/projects/robert',
  '/projects/network',
  '/projects/trace',
  '/projects/aletheia',
  '/projects/ethanchang-io',
  '/projects/craft-space',
  '/projects/chunk',
  '/projects/deeptalk',
  '/about',
  '/lab',
] as const;

export const KEY_PAGES_FOR_LINK_CHECK = [
  '/',
  '/articles',
  '/threads',
  '/projects',
  '/about',
  '/lab',
] as const;
