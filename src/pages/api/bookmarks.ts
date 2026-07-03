import type { APIRoute } from 'astro';
import { getSession } from '@/lib/auth';
import { isBookmarked, toggleBookmark } from '@/lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, url }) => {
  const session = await getSession(request, locals.runtime.env);
  if (!session?.user) {
    return Response.json({ bookmarked: false, bookmarks: [] });
  }

  const slug = url.searchParams.get('slug');
  const db = locals.runtime.env.DB;

  if (slug) {
    const bookmarked = await isBookmarked(db, session.user.id, slug);
    return Response.json({ bookmarked });
  }

  const { results } = await db
    .prepare('SELECT story_slug FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC')
    .bind(session.user.id)
    .all<{ story_slug: string }>();

  return Response.json({ bookmarks: results.map((r) => r.story_slug) });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request, locals.runtime.env);
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { storySlug?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storySlug = body.storySlug?.trim();
  if (!storySlug) {
    return Response.json({ error: 'storySlug required' }, { status: 400 });
  }

  const bookmarked = await toggleBookmark(
    locals.runtime.env.DB,
    session.user.id,
    storySlug,
  );

  return Response.json({ bookmarked });
};
