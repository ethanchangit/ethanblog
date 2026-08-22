import { defineMiddleware } from 'astro:middleware';
import { localeFromPath, localizeHref } from '@/lib/locale';
import { appendVaryAccept, markdownAssetPath, preferredType, shouldNegotiate } from '@/lib/accept';
import { markdownResponse, notFoundMarkdown } from '@/lib/agent';

function notAcceptable(): Response {
  return new Response('Not Acceptable. Available representations: text/html, text/markdown.', {
    status: 406,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Vary: 'Accept',
    },
  });
}

function withVary(response: Response): Response {
  const headers = new Headers(response.headers);
  appendVaryAccept(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function loadMarkdownAsset(
  context: Parameters<Parameters<typeof defineMiddleware>[0]>[0],
  mdPath: string,
): Promise<Response | null> {
  const assets = context.locals.runtime?.env?.ASSETS;
  if (assets) {
    const res = await assets.fetch(new Request(new URL(mdPath, context.url)));
    if (res.ok) return res;
    return null;
  }
  const rewritten = await context.rewrite(mdPath);
  if (rewritten.status >= 400) return null;
  return rewritten;
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (!context.locals.lang) {
    const locale = localeFromPath(context.url.pathname);
    context.locals.locale = locale;
    context.locals.lang = locale === 'zh' ? 'zh-CN' : 'en';
    context.locals.localePath = (href: string) => localizeHref(href, locale);
  }

  if (!shouldNegotiate(context.url.pathname)) {
    return next();
  }

  const chosen = preferredType(context.request.headers.get('accept'));
  if (chosen === null) return notAcceptable();

  if (chosen === 'text/markdown') {
    const mdPath = markdownAssetPath(context.url.pathname);
    const asset = await loadMarkdownAsset(context, mdPath);
    if (asset) {
      const headers = new Headers(asset.headers);
      headers.set('Content-Type', 'text/markdown; charset=utf-8');
      appendVaryAccept(headers);
      return new Response(asset.body, { status: 200, headers });
    }
    return markdownResponse(notFoundMarkdown(context.url.origin), 404);
  }

  return withVary(await next());
});
