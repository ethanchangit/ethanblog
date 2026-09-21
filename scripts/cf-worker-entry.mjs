/**
 * Cloudflare Pages entry: Accept negotiation, then Astro's generated worker.
 * Bundled into dist/_worker.js/index.js by scripts/wrap-worker.mjs.
 */
import astro from 'astro-entry';
import { createNegotiateFetch } from '../src/lib/cf-negotiate.ts';
import dashboard from '../studio/online/worker.mjs';

const blog = createNegotiateFetch(astro);
export default {
  fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    return path === '/dashboard' || path.startsWith('/dashboard/')
      ? dashboard.fetch(request, env, ctx)
      : blog.fetch(request, env, ctx);
  },
};
export { pageMap } from 'astro-entry';
