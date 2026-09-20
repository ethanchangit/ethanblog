CREATE TABLE IF NOT EXISTS studio_drafts (
  user_id TEXT NOT NULL,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  raw TEXT NOT NULL,
  base_commit_sha TEXT,
  base_raw TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'draft',
  submitted_commit_sha TEXT,
  saved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, repository, branch, path)
);

CREATE INDEX IF NOT EXISTS studio_drafts_user_state_idx
  ON studio_drafts (user_id, repository, branch, state, saved_at);

CREATE TABLE IF NOT EXISTS studio_releases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  workflow_path TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  workflow_run_id TEXT,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  error TEXT,
  url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS studio_releases_user_created_idx
  ON studio_releases (user_id, repository, branch, created_at);
