/**
 * Cloudflare Pages entry: host routing (ethanchang.io is English, cn.ethanchang.io is Chinese),
 * Accept negotiation, then Astro's generated worker.
 * Bundled into dist/_worker.js/index.js by scripts/wrap-worker.mjs.
 */
import astro from 'astro-entry';
import { createNegotiateFetch } from '../src/lib/cf-negotiate.ts';
import { englishPublicPath, fallbackFor, isEnglishBuildPath, routeRequest } from '../src/lib/hosts.ts';
import dashboard from '../studio/online/worker.mjs';

const blog = createNegotiateFetch(astro);
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const decision = routeRequest(url);
    if (decision.type === 'redirect') return Response.redirect(decision.location, decision.status);
    if (decision.type === 'rewrite') {
      const target = new URL(decision.path + url.search, url);
      const response = await blog.fetch(new Request(target, request), env, ctx);
      // No English page yet: read the same path on the Chinese site.
      if (response.status === 404) return Response.redirect(fallbackFor(url), 302);
      // A trailing-slash redirect from the asset server must not expose the /en build prefix.
      const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
      if (location) {
        const next = new URL(location, target);
        if (next.host === url.host && isEnglishBuildPath(next.pathname)) {
          next.pathname = englishPublicPath(next.pathname);
          return Response.redirect(next.href, response.status);
        }
      }
      return response;
    }
    return url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')
      ? dashboard.fetch(request, env, ctx)
      : blog.fetch(request, env, ctx);
  },
};
export { pageMap } from 'astro-entry';
