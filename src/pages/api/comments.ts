import type { APIRoute } from 'astro';
import { docsBySlot } from '@/lib/docs';
import { articleHref } from '@/lib/routes';
import { localeFromPath, localizeHref } from '@/lib/locale';
import { site } from '@/data/profile';
import {
  clientIp,
  isCommentNameTooLong,
  isCommentSlug,
  isFeedbackRateLimited,
  normalizeCommentBody,
  normalizeCommentEmail,
  resolveCommentName,
} from '@/lib/comments';
import { sendFeedbackEmail } from '@/lib/mail';

export const prerender = false;

async function findArticle(slug: string) {
  if (!isCommentSlug(slug)) return null;
  const hits = (await docsBySlot('article')).filter((entry) => entry.id === slug);
  return hits[0] ?? null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const contentType = request.headers.get('content-type') ?? '';
  const isForm =
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data');

  let slug = '';
  let name = '';
  let body = '';
  let emailRaw = '';
  let honeypot = '';

  try {
    if (isForm) {
      const form = await request.formData();
      slug = String(form.get('slug') ?? '').trim();
      name = String(form.get('name') ?? '');
      body = String(form.get('body') ?? '');
      emailRaw = String(form.get('email') ?? '');
      honeypot = String(form.get('website') ?? '').trim();
    } else {
      const json = (await request.json()) as {
        slug?: string;
        name?: string;
        body?: string;
        email?: string;
        website?: string;
      };
      slug = json.slug?.trim() ?? '';
      name = json.name ?? '';
      body = json.body ?? '';
      emailRaw = json.email ?? '';
      honeypot = json.website?.trim() ?? '';
    }
  } catch {
    return jsonOrRedirect(isForm, request, slug, { error: 'Invalid body' }, 400);
  }

  const article = await findArticle(slug);
  if (!article) {
    return jsonOrRedirect(isForm, request, slug, { error: 'Unknown article' }, 400);
  }

  // Silent drop for bots that fill the hidden field.
  if (honeypot) {
    return jsonOrRedirect(isForm, request, slug, { ok: true }, 200);
  }

  if (isCommentNameTooLong(name)) {
    return jsonOrRedirect(isForm, request, slug, { error: 'Name too long' }, 400);
  }
  const authorName = resolveCommentName(name);
  const text = normalizeCommentBody(body);
  const email = normalizeCommentEmail(emailRaw);

  if (!text) {
    return jsonOrRedirect(isForm, request, slug, { error: 'Message required' }, 400);
  }
  if (email === null) {
    return jsonOrRedirect(isForm, request, slug, { error: 'Invalid email' }, 400);
  }

  const env = locals.runtime?.env;
  if (!env?.GUESTBOOK) {
    return jsonOrRedirect(isForm, request, slug, { error: 'Email is not configured' }, 503);
  }

  if (isFeedbackRateLimited(clientIp(request))) {
    return jsonOrRedirect(isForm, request, slug, { error: 'Too many notes' }, 429);
  }

  const locale = localeFromReferer(request);
  const url = new URL(localizeHref(articleHref(slug), locale), site.url).href;

  const sent = await sendFeedbackEmail(env, {
    slug,
    title: article.data.title,
    url,
    name: authorName,
    email,
    body: text,
  });

  if (!sent.ok) {
    return jsonOrRedirect(isForm, request, slug, { error: sent.error }, sent.status);
  }

  if (isForm) {
    return redirectToArticle(request, slug, '1');
  }
  return Response.json({ ok: true });
};

function localeFromReferer(request: Request): string | undefined {
  const referer = request.headers.get('referer');
  if (!referer) return undefined;
  try {
    return localeFromPath(new URL(referer).pathname);
  } catch {
    return undefined;
  }
}

function redirectToArticle(request: Request, slug: string, sent: '1' | '0'): Response {
  const dest = new URL(localizeHref(articleHref(slug), localeFromReferer(request)), request.url);
  dest.searchParams.set('sent', sent);
  dest.hash = 'comments';
  return Response.redirect(dest, 303);
}

function jsonOrRedirect(
  isForm: boolean,
  request: Request,
  slug: string,
  payload: Record<string, unknown>,
  status: number,
): Response {
  if (isForm && slug) {
    const ok = status < 400 || payload.ok === true;
    return redirectToArticle(request, slug, ok ? '1' : '0');
  }
  if (isForm) {
    return new Response('Could not send', { status });
  }
  return Response.json(payload, { status });
}
