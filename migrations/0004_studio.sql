-- Studio working copies are unsubmitted edits; GitHub owns reviewed versions.
CREATE TABLE IF NOT EXISTS studio_drafts (
  user_id TEXT NOT NULL, repository TEXT NOT NULL, branch TEXT NOT NULL,
  path TEXT NOT NULL, raw TEXT NOT NULL, base_commit_sha TEXT, base_raw TEXT,
  version INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL DEFAULT 'draft',
  submitted_commit_sha TEXT, saved_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, repository, branch, path)
);
CREATE INDEX IF NOT EXISTS studio_drafts_user_state_idx ON studio_drafts (user_id, repository, branch, state, saved_at);
CREATE TABLE IF NOT EXISTS studio_releases (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, repository TEXT NOT NULL,
  branch TEXT NOT NULL, workflow_path TEXT NOT NULL, commit_sha TEXT NOT NULL,
  workflow_run_id TEXT, pr_number INTEGER, status TEXT NOT NULL, stage TEXT NOT NULL, error TEXT,
  url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_releases_user_created_idx ON studio_releases (user_id, repository, branch, created_at);
CREATE TABLE IF NOT EXISTS studio_sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, password_version TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS studio_login_attempts (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS studio_connections (id TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS studio_locks (id TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS studio_draft_history (id INTEGER PRIMARY KEY, path TEXT NOT NULL, raw TEXT NOT NULL, saved_at TEXT NOT NULL);
-- The previous full source is kept only for safe, explicit two-way comparison.
CREATE TABLE IF NOT EXISTS studio_heptabase_sync (card_id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, source TEXT NOT NULL, blog_body TEXT NOT NULL);
-- Durable per-card completion: a retry must not create another card or reset a date.
CREATE TABLE IF NOT EXISTS studio_card_exports (path TEXT PRIMARY KEY, card_id TEXT, source TEXT NOT NULL, started_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS studio_release_cards (
  release_id TEXT NOT NULL, card_id TEXT NOT NULL, expected_status TEXT NOT NULL,
  expected_date TEXT, published_date TEXT, completed INTEGER NOT NULL DEFAULT 0, error TEXT,
  PRIMARY KEY (release_id, card_id)
);
-- Consent covers an exact card version and exact generated public file, not a tag.
CREATE TABLE IF NOT EXISTS studio_reviews (
  path TEXT PRIMARY KEY, card_id TEXT NOT NULL, source_hash TEXT NOT NULL,
  raw_hash TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
-- A durable decision lets an interrupted property write resume without silently
-- approving a different version or losing a card after it leaves Review.
CREATE TABLE IF NOT EXISTS studio_review_decisions (
  card_id TEXT PRIMARY KEY, decision TEXT NOT NULL, status TEXT NOT NULL,
  payload TEXT NOT NULL, created_at TEXT NOT NULL
);
