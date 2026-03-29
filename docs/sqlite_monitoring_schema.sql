PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS monitor_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL CHECK (run_type IN ('scheduled_12h', 'weekly_digest', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial_success', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  summary_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'general_llm',
      'image_generation',
      'video_generation',
      'text_to_speech',
      'speech_to_text',
      'embeddings'
    )
  ),
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  snapshot_at TEXT NOT NULL,
  top_n INTEGER NOT NULL DEFAULT 10,
  raw_payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES monitor_runs(id) ON DELETE CASCADE,
  UNIQUE (run_id, category, source_name)
);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score REAL,
  score_unit TEXT,
  model_url TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (snapshot_id) REFERENCES leaderboard_snapshots(id) ON DELETE CASCADE,
  UNIQUE (snapshot_id, rank),
  UNIQUE (snapshot_id, canonical_model_key)
);

CREATE TABLE IF NOT EXISTS leaderboard_changes (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'general_llm',
      'image_generation',
      'video_generation',
      'text_to_speech',
      'speech_to_text',
      'embeddings'
    )
  ),
  source_name TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('entered', 'exited', 'moved')),
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  rank_before INTEGER,
  rank_after INTEGER,
  score_before REAL,
  score_after REAL,
  event_fingerprint TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES monitor_runs(id) ON DELETE CASCADE,
  UNIQUE (event_fingerprint)
);

CREATE TABLE IF NOT EXISTS news_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  snapshot_at TEXT NOT NULL,
  raw_payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES monitor_runs(id) ON DELETE CASCADE,
  UNIQUE (run_id, source_name)
);

CREATE TABLE IF NOT EXISTS news_entries (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TEXT,
  author_or_outlet TEXT,
  summary TEXT,
  topic_tags_json TEXT,
  importance_score REAL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (snapshot_id) REFERENCES news_snapshots(id) ON DELETE CASCADE,
  UNIQUE (snapshot_id, canonical_url)
);

CREATE TABLE IF NOT EXISTS weekly_digests (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  selection_strategy TEXT NOT NULL DEFAULT 'recency_source_diversity_keywords',
  generated_at TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES monitor_runs(id) ON DELETE CASCADE,
  UNIQUE (window_start, window_end)
);

CREATE TABLE IF NOT EXISTS weekly_digest_items (
  id TEXT PRIMARY KEY,
  digest_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  source_name TEXT NOT NULL,
  published_at TEXT,
  importance_score REAL,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (digest_id) REFERENCES weekly_digests(id) ON DELETE CASCADE,
  UNIQUE (digest_id, rank),
  UNIQUE (digest_id, canonical_url)
);

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('top10_alert', 'weekly_digest')),
  category TEXT,
  source_name TEXT,
  dedupe_key TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
  provider TEXT NOT NULL DEFAULT 'smtp',
  message_id TEXT,
  error_message TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES monitor_runs(id) ON DELETE SET NULL,
  UNIQUE (dedupe_key)
);

CREATE TABLE IF NOT EXISTS source_health (
  source_name TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('leaderboard', 'news', 'metadata')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_checked_at TEXT,
  last_success_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  total_successes INTEGER NOT NULL DEFAULT 0,
  total_failures INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms REAL,
  last_error_message TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_monitor_runs_started_at
  ON monitor_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_lookup
  ON leaderboard_snapshots(category, source_name, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_model
  ON leaderboard_entries(canonical_model_key);

CREATE INDEX IF NOT EXISTS idx_leaderboard_changes_lookup
  ON leaderboard_changes(category, source_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_snapshots_lookup
  ON news_snapshots(source_name, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_entries_published
  ON news_entries(published_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_entries_source_url
  ON news_entries(source_name, canonical_url);

CREATE INDEX IF NOT EXISTS idx_notification_status
  ON notification_log(status, created_at DESC);
