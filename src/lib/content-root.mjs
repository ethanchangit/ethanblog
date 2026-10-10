/**
 * Which content a build reads.
 *
 * The real site reads src/content and src/data/page-order.ts; dashboard publishes change those.
 * `BLOG_FIXTURES=1` builds the test site from tests/fixtures/site instead: a frozen copy that
 * publishes never touch, so feature tests keep their pages after cards are taken down.
 * That build goes to dist-fixtures/ and is never deployed.
 *
 * Read by astro.config.mjs, src/content.config.ts and plugins/remark-heptabase-mentions.mjs.
 */
export const FIXTURE_SITE = process.env.BLOG_FIXTURES === '1';

/** Relative to the repo root, as the content loaders expect. */
export const CONTENT_BASE = FIXTURE_SITE ? './tests/fixtures/site/content' : './src/content';

export const CONTENT_DIR = new URL(`../../${CONTENT_BASE.slice(2)}/`, import.meta.url);

export const PAGE_ORDER_FILE = new URL(
  FIXTURE_SITE ? '../../tests/fixtures/site/page-order.ts' : '../data/page-order.ts',
  import.meta.url,
);

export const OUT_DIR = FIXTURE_SITE ? './dist-fixtures' : './dist';
