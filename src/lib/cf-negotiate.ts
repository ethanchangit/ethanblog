/**
 * Accept negotiation that runs *before* Astro's Cloudflare handler.
 *
 * @astrojs/cloudflare short-circuits prerendered paths with
 * `env.ASSETS.fetch()` before `app.render()`, so `src/middleware.ts` never
 * sees `/` or `/articles/*` in production. This wrapper is the request-time
 * surface that actually runs on Pages.
 */
import {
  appendVaryAccept,
  markdownAssetPath,
  preferredType,
  shouldNegotiate,
} from './accept';
import { ARTICLES_PATH, CONTACT_PATH, FOR_AGENTS_PATH, PRIVACY_PATH } from './routes';

const NOT_ACCEPTABLE = 'Not Acceptable. Available representations: text/html, text/markdown.';

export type AssetEnv = {
  ASSETS?: { fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response> };
};

export type WorkerFetch = {
  fetch: (request: Request, env: AssetEnv, ctx: unknown) => Promise<Response> | Response;
};

export function negotiateNotFoundMarkdown(origin: string): string {
  const root = origin.replace(/\/+$/, '');
  return [
    '# 404 — page not found',
    '',
    'This URL is not a page on ethanchang.io. It may have moved, or it never existed.',
    '',
    'Try one of these next:',
    '',
    `- [Home](${root}/)`,
    `- [Articles](${root}${ARTICLES_PATH})`,
    `- [ethanchang.io developer resources](${root}${FOR_AGENTS_PATH})`,
    `- [llms.txt](${root}/llms.txt)`,
    `- [Sitemap](${root}/sitemap.xml)`,
    `- [Contact](${root}${CONTACT_PATH})`,
    `- [Privacy](${root}${PRIVACY_PATH})`,
    '',
  ].join('\n');
}

export function createNegotiateFetch(inner: WorkerFetch): WorkerFetch {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (request.method !== 'OPTIONS' && shouldNegotiate(url.pathname)) {
        const chosen = preferredType(request.headers.get('accept'));
        if (chosen === null) {
          return new Response(NOT_ACCEPTABLE, {
            status: 406,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              Vary: 'Accept',
            },
          });
        }
        if (chosen === 'text/markdown') {
          const mdPath = markdownAssetPath(url.pathname);
          const assets = env.ASSETS;
          if (assets) {
            const asset = await assets.fetch(new Request(new URL(mdPath, url)));
            if (asset.ok) {
              return new Response(asset.body, {
                status: 200,
                headers: {
                  'Content-Type': 'text/markdown; charset=utf-8',
                  Vary: 'Accept',
                },
              });
            }
          }
          return new Response(`${negotiateNotFoundMarkdown(url.origin)}\n`, {
            status: 404,
            headers: {
              'Content-Type': 'text/markdown; charset=utf-8',
              Vary: 'Accept',
            },
          });
        }
      }

      const response = await inner.fetch(request, env, ctx);
      const headers = new Headers(response.headers);
      appendVaryAccept(headers);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
  };
}
