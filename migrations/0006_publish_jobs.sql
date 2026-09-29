-- The browser hands off an immutable request. Only the signed cloud runner advances it.
CREATE TABLE IF NOT EXISTS studio_publish_jobs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, repository TEXT NOT NULL, branch TEXT NOT NULL,
  payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', stage TEXT NOT NULL DEFAULT 'prepare',
  cursor INTEGER NOT NULL DEFAULT 0, page_done INTEGER NOT NULL DEFAULT 0, prepared TEXT, reviewed TEXT NOT NULL DEFAULT '[]',
  release_id TEXT, commit_sha TEXT,
  dispatched INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0, error TEXT, runner_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_publish_jobs_active
  ON studio_publish_jobs (user_id, repository, branch) WHERE status IN ('queued', 'running');
