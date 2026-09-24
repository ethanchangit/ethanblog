// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import svelte from '@astrojs/svelte';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { remarkSourceView } from './plugins/remark-source-view.mjs';
import { studioIntegration } from './studio/plugin.mjs';

// https://astro.build/config
export default defineConfig({
  // cn.ethanchang.io is the Chinese blog; ethanchang.io serves the English build under dist/en.
  site: 'https://cn.ethanchang.io',
  output: 'static',
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
  redirects: {
    '/about': {
      status: 301,
      destination: '/',
    },
    '/zh/about': {
      status: 301,
      destination: '/',
    },
    '/articles/1': {
      status: 301,
      destination: '/articles',
    },
    '/articles/2': {
      status: 301,
      destination: '/articles',
    },
    '/zh/articles/1': {
      status: 301,
      destination: '/articles',
    },
    '/zh/articles/2': {
      status: 301,
      destination: '/articles',
    },
  },
  integrations: [mdx({ remarkPlugins: [remarkSourceView] }), svelte(), studioIntegration()],
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
