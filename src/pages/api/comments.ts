import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getSession } from '@/lib/auth';
import { articleHref } from '@/lib/routes';
import {
  COMMENT_LIST_LIMIT,
  isCommentNameTooLong,
  isCommentSlug,
  normalizeCommentBody,
  normalizeVisibility,
  resolveCommentName,
} from '@/lib/comments';
import { countComments, insertComment, listComments } from '@/lib/db';
import { isSiteOwner } from '@/lib/user';

export const prerender = false;

async function knownArticle(slug: string): Promise<boolean> {
  if (!isCommentSlug(slug)) return false;
  const hits = await getCollection('articles', (entry) => !entry.data.draft && entry.id === slug);
  return hits.length > 0;
}

export const GET: APIRoute = async ({ request, locals, url }) => {
  const slug = url.searchParams.get('slug')?.trim() ?? '';
  if (!isCommentSlug(slug)) {
    return Response.json({ error: 'slug required' }, { status: 400 });
  }

  try {
    let includePrivate = false;
    try {
      const session = await getSession(request, locals.runtime.env);
      includePrivate = isSiteOwner(session?.user);
    } catch {
      includePrivate = false;
    }
    const comments = await listComments(locals.runtime.env.DB, slug, { includePrivate });
    return Response.json({ comments });
  } catch {
    return Response.json({ error: 'Unavailable' }, { status: 503 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.runtime.env.DB;
  const contentType = request.headers.get('content-type') ?? '';
  const isForm =
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data');

  let slug = '';
  let name = '';
  let body = '';
  let honeypot = '';
  let visibilityRaw: unknown = 'public';

  try {
    if (isForm) {
      const form = await request.formData();
      slug = String(form.get('slug') ?? '').trim();
      name = String(form.get('name') ?? '');
      body = String(form.get('body') ?? '');
      honeypot = String(form.get('website') ?? '').trim();
      visibilityRaw = form.get('visibility');
    } else {
      const json = (await request.json()) as {
        slug?: string;
        name?: string;
        body?: string;
        website?: string;
        visibility?: string;
      };
      slug = json.slug?.trim() ?? '';
      name = json.name ?? '';
      body = json.body ?? '';
      honeypot = json.website?.trim() ?? '';
      visibilityRaw = json.visibility;
    }
  } catch {
    return jsonOrRedirect(isForm, request, slug, { error: 'Invalid body' }, 400);
  }

  if (!(await knownArticle(slug))) {
    return jsonOrRedirect(isForm, request, slug, { error: 'Unknown article' }, 400);
  }

  // Silent drop for bots that fill the hidden field.
  if (honeypot) {
    return jsonOrRedirect(isForm, request, slug, { ok: true }, 200);
  }

  let session: Awaited<ReturnType<typeof getSession>> | null = null;
  try {
    session = await getSession(request, locals.runtime.env);
  } catch {
    session = null;
  }
  if (isCommentNameTooLong(name)) {
    return jsonOrRedirect(isForm, request, slug, { error: 'Name too long' }, 400);
  }
  const authorName = resolveCommentName(name, session?.user.name);
  const text = normalizeCommentBody(body);
  const visibility = normalizeVisibility(visibilityRaw);

  if (!text) {
    return jsonOrRedirect(isForm, request, slug, { error: 'Message required' }, 400);
  }

  try {
    const n = await countComments(db, slug);
    if (n >= COMMENT_LIST_LIMIT) {
      return jsonOrRedirect(isForm, request, slug, { error: 'Full' }, 429);
    }

    const comment = await insertComment(db, {
      slug,
      name: authorName,
      body: text,
      userId: session?.user.id ?? null,
      visibility,
    });

    if (isForm) {
      return redirectToArticle(request, slug);
    }
    return Response.json({ comment });
  } catch {
    return jsonOrRedirect(isForm, request, slug, { error: 'Unavailable' }, 503);
  }
};

function redirectToArticle(request: Request, slug: string): Response {
  const dest = new URL(articleHref(slug), request.url);
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
    return redirectToArticle(request, slug);
  }
  if (isForm) {
    return new Response('Could not save', { status });
  }
  return Response.json(payload, { status });
}
