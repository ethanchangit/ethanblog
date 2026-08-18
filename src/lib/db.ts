import {
  COMMENT_LIST_LIMIT,
  type ArticleComment,
  type CommentVisibility,
} from '@/lib/comments';

export async function isBookmarked(
  db: D1Database,
  userId: string,
  storySlug: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND story_slug = ?')
    .bind(userId, storySlug)
    .first();
  return row != null;
}

export async function toggleBookmark(
  db: D1Database,
  userId: string,
  storySlug: string,
): Promise<boolean> {
  const exists = await isBookmarked(db, userId, storySlug);
  if (exists) {
    await db
      .prepare('DELETE FROM bookmarks WHERE user_id = ? AND story_slug = ?')
      .bind(userId, storySlug)
      .run();
    return false;
  }

  await db
    .prepare('INSERT INTO bookmarks (user_id, story_slug, created_at) VALUES (?, ?, ?)')
    .bind(userId, storySlug, Date.now())
    .run();
  return true;
}

export async function getProgress(
  db: D1Database,
  userId: string,
  storySlug: string,
): Promise<number | null> {
  const row = await db
    .prepare('SELECT percent FROM progress WHERE user_id = ? AND story_slug = ?')
    .bind(userId, storySlug)
    .first<{ percent: number }>();
  return row?.percent ?? null;
}

export async function saveProgress(
  db: D1Database,
  userId: string,
  storySlug: string,
  percent: number,
): Promise<void> {
  const clamped = Math.min(100, Math.max(0, percent));
  await db
    .prepare(
      `INSERT INTO progress (user_id, story_slug, percent, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, story_slug)
       DO UPDATE SET percent = excluded.percent, updated_at = excluded.updated_at`,
    )
    .bind(userId, storySlug, clamped, Date.now())
    .run();
}

interface CommentRow {
  id: string;
  author_name: string;
  body: string;
  created_at: number;
  visibility: string;
}

function toVisibility(raw: string | null | undefined): CommentVisibility {
  return raw === 'private' ? 'private' : 'public';
}

function toComment(row: CommentRow): ArticleComment {
  return {
    id: row.id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    visibility: toVisibility(row.visibility),
  };
}

export async function listComments(
  db: D1Database,
  storySlug: string,
  opts: { includePrivate?: boolean } = {},
): Promise<ArticleComment[]> {
  const includePrivate = opts.includePrivate ? 1 : 0;
  const { results } = await db
    .prepare(
      `SELECT id, author_name, body, created_at, visibility
       FROM comments
       WHERE story_slug = ?
         AND (? = 1 OR visibility = 'public')
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .bind(storySlug, includePrivate, COMMENT_LIST_LIMIT)
    .all<CommentRow>();

  return results.map(toComment);
}

export async function countComments(db: D1Database, storySlug: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM comments WHERE story_slug = ?')
    .bind(storySlug)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function insertComment(
  db: D1Database,
  input: {
    slug: string;
    name: string;
    body: string;
    userId?: string | null;
    visibility?: CommentVisibility;
  },
): Promise<ArticleComment> {
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const visibility: CommentVisibility = input.visibility === 'private' ? 'private' : 'public';
  await db
    .prepare(
      `INSERT INTO comments (id, story_slug, user_id, author_name, body, created_at, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.slug, input.userId ?? null, input.name, input.body, createdAt, visibility)
    .run();
  return { id, authorName: input.name, body: input.body, createdAt, visibility };
}
