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
