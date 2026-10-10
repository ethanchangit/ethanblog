# Frozen test site

`npm run build:fixtures` (part of `npm run build`) builds this folder into `dist-fixtures/` with `BLOG_FIXTURES=1` (`src/lib/content-root.mjs`). Playwright's `fixtures` project runs every spec outside `tests/site/` against it.

- `content/` stands in for `src/content/`; `page-order.ts` stands in for `src/data/page-order.ts`.
- It started as a copy of the real content on 2026-10-10. Dashboard publishes never touch it, so pages that specs rely on stay when their Heptabase cards are taken down.
- Change it only to test something. Real articles live in `src/content/` and come from Heptabase.
- The dashboard only reads `src/content/`, so the duplicate `heptabaseCardLink` values here never count as a second linked file.
