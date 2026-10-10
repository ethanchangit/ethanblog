// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import svelte from '@astrojs/svelte';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { remarkHeptabaseMentions } from './plugins/remark-heptabase-mentions.mjs';
import { studioIntegration } from './studio/plugin.mjs';
import { FIXTURE_SITE, OUT_DIR, PAGE_ORDER_FILE } from './src/lib/content-root.mjs';
import { fileURLToPath } from 'node:url';

// https://astro.build/config
export default defineConfig({
  // One English blog at ethanchang.io. cn.ethanchang.io redirects here.
  site: 'https://ethanchang.io',
  output: 'static',
  // BLOG_FIXTURES=1 builds the frozen test site into dist-fixtures/ (src/lib/content-root.mjs).
  // Its own cache keeps the two content stores apart.
  outDir: OUT_DIR,
  ...(FIXTURE_SITE ? { cacheDir: './node_modules/.astro-fixtures' } : {}),
  adapter: cloudflare({
    imageService: 'compile',
    routes: {
      extend: {
        include: [{ pattern: '/*' }],
        exclude: [
          { pattern: '/_astro/*' },
          { pattern: '/media/*' },
          { pattern: '/demos/*' },
          { pattern: '/favicon.svg' },
          { pattern: '/og-default.svg' },
        ],
      },
    },
  }),
  integrations: [mdx({ remarkPlugins: [remarkHeptabaseMentions] }), svelte(), studioIntegration()],
  vite: {
    plugins: [tailwindcss()],
    ...(FIXTURE_SITE
      ? { resolve: { alias: [{ find: /^@\/data\/page-order$/, replacement: fileURLToPath(PAGE_ORDER_FILE) }] } }
      : {}),
  },
  markdown: {
    shikiConfig: {
      // Highlighting theme; fg/bg are remapped to @theme tokens in global.css
      // (.astro-code) so fences stay readable in both site themes.
      theme: 'vesper',
    },
  },
});
