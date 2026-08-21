// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import svelte from '@astrojs/svelte';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { remarkSourceView } from './plugins/remark-source-view.mjs';
import { remarkLangSplit } from './plugins/remark-lang-split.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://ethanchang.io',
  output: 'static',
  adapter: cloudflare({ imageService: 'compile' }),
  redirects: {
    '/about': {
      status: 301,
      destination: '/',
    },
    '/articles/1': {
      status: 301,
      destination: '/articles',
    },
  },
  integrations: [mdx({ remarkPlugins: [remarkSourceView, remarkLangSplit] }), svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: {
      // Highlighting theme; fg/bg are remapped to @theme tokens in global.css
      // (.astro-code) so fences stay readable in both site themes.
      theme: 'vesper',
    },
  },
});
