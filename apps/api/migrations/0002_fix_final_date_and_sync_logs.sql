PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS result_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  competition_code TEXT NOT NULL,
  season INTEGER NOT NULL,
  status TEXT NOT NULL,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  finished_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE matches
SET
  stage = 'Final',
  group_name = NULL,
  starts_at = '2026-07-19T19:00:00Z',
  venue = 'New York New Jersey Stadium',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 104;
