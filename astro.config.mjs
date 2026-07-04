// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import svelte from '@astrojs/svelte';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { remarkSourceView } from './plugins/remark-source-view.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://ethanchang.io',
  output: 'static',
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [mdx({ remarkPlugins: [remarkSourceView] }), svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: {
      theme: 'vesper',
    },
  },
});
