ALTER TABLE matches ADD COLUMN external_provider TEXT;
ALTER TABLE matches ADD COLUMN external_match_id TEXT;
ALTER TABLE matches ADD COLUMN last_synced_at TEXT;
ALTER TABLE matches ADD COLUMN result_source TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE matches ADD COLUMN manually_locked INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_external_provider_match_id
ON matches (external_provider, external_match_id)
WHERE external_provider IS NOT NULL
  AND external_match_id IS NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_result_sync_logs_created_at
ON result_sync_logs (created_at);