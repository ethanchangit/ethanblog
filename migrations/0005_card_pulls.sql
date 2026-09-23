-- Last successful Heptabase pull, one row per card. edited_at is that card's
-- updated time. The next pull, including after a dashboard restart, skips the
-- body when this time is unchanged and reuses properties and source.
CREATE TABLE IF NOT EXISTS studio_card_pulls (
  card_id TEXT PRIMARY KEY,
  edited_at TEXT NOT NULL,
  properties TEXT,
  source TEXT,
  card_created TEXT NOT NULL DEFAULT '',
  pulled_at TEXT NOT NULL
);
