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
  integrations: [mdx({ remarkPlugins: [remarkSourceView, remarkLangSplit] }), svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: {
      theme: 'vesper',
    },
  },
});
