-- Guestbook visibility: public comments are listed on the article;
-- private ones are stored but only returned to the site owner session.
-- Existing rows default to public. Production apply: scripts/ensure-d1.sh
-- (`wrangler d1 migrations apply ethanblog --remote`).
-- If the owner session cannot be matched, private bodies stay out of
-- public GET/HTML; read them from this D1 table.

ALTER TABLE comments ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';

CREATE INDEX IF NOT EXISTS comments_slug_visibility_created_idx
  ON comments (story_slug, visibility, created_at);
