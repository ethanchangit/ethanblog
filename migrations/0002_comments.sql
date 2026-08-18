-- Article guestbook: visitors can leave a short message on an article.
-- user_id is optional (anonymous name+text is enough); attach the session user when logged in.

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY NOT NULL,
  story_slug TEXT NOT NULL,
  user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS comments_slug_created_idx ON comments (story_slug, created_at);
