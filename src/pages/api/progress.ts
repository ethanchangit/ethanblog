import type { APIRoute } from 'astro';
import { getSession } from '@/lib/auth';
import { getProgress, saveProgress } from '@/lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, url }) => {
  const session = await getSession(request, locals.runtime.env);
  if (!session?.user) {
    return Response.json({ percent: null });
  }

  const slug = url.searchParams.get('slug');
  if (!slug) {
    return Response.json({ error: 'slug required' }, { status: 400 });
  }

  const percent = await getProgress(locals.runtime.env.DB, session.user.id, slug);
  return Response.json({ percent });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request, locals.runtime.env);
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { storySlug?: string; percent?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storySlug = body.storySlug?.trim();
  if (!storySlug || typeof body.percent !== 'number' || Number.isNaN(body.percent)) {
    return Response.json({ error: 'storySlug and percent required' }, { status: 400 });
  }

  await saveProgress(locals.runtime.env.DB, session.user.id, storySlug, body.percent);
  return Response.json({ ok: true });
};
