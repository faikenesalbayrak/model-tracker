PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS monitor_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL CHECK (run_type IN ('scheduled_12h', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial_success', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  summary_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('top10_alert')),
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

CREATE TABLE IF NOT EXISTS llm_current (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score REAL,
  score_unit TEXT,
  model_url TEXT,
  payload_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (category, source_name, canonical_model_key)
);

CREATE TABLE IF NOT EXISTS llm_history (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score REAL,
  score_unit TEXT,
  model_url TEXT,
  payload_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (run_id) REFERENCES monitor_runs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vlm_current (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score REAL,
  score_unit TEXT,
  model_url TEXT,
  payload_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (category, source_name, canonical_model_key)
);

CREATE TABLE IF NOT EXISTS vlm_history (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score REAL,
  score_unit TEXT,
  model_url TEXT,
  payload_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (run_id) REFERENCES monitor_runs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tts_current (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score REAL,
  score_unit TEXT,
  model_url TEXT,
  payload_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (category, source_name, canonical_model_key)
);

CREATE TABLE IF NOT EXISTS tts_history (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score REAL,
  score_unit TEXT,
  model_url TEXT,
  payload_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (run_id) REFERENCES monitor_runs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS stt_current (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score REAL,
  score_unit TEXT,
  model_url TEXT,
  payload_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (category, source_name, canonical_model_key)
);

CREATE TABLE IF NOT EXISTS stt_history (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score REAL,
  score_unit TEXT,
  model_url TEXT,
  payload_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (run_id) REFERENCES monitor_runs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS embeddings_current (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score REAL,
  score_unit TEXT,
  model_url TEXT,
  payload_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (category, source_name, canonical_model_key)
);

CREATE TABLE IF NOT EXISTS embeddings_history (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score REAL,
  score_unit TEXT,
  model_url TEXT,
  payload_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (run_id) REFERENCES monitor_runs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS news_current (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TEXT,
  author_or_outlet TEXT,
  summary TEXT,
  topic_tags_json TEXT,
  importance_score REAL,
  payload_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source_name, canonical_url)
);

CREATE TABLE IF NOT EXISTS news_history (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  source_name TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TEXT,
  author_or_outlet TEXT,
  summary TEXT,
  topic_tags_json TEXT,
  importance_score REAL,
  payload_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (run_id) REFERENCES monitor_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_monitor_runs_started_at
  ON monitor_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_changes_lookup
  ON leaderboard_changes(category, source_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_status
  ON notification_log(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_current_lookup
  ON llm_current(category, source_name, rank);
CREATE INDEX IF NOT EXISTS idx_vlm_current_lookup
  ON vlm_current(category, source_name, rank);
CREATE INDEX IF NOT EXISTS idx_tts_current_lookup
  ON tts_current(category, source_name, rank);
CREATE INDEX IF NOT EXISTS idx_stt_current_lookup
  ON stt_current(category, source_name, rank);
CREATE INDEX IF NOT EXISTS idx_embeddings_current_lookup
  ON embeddings_current(category, source_name, rank);
CREATE INDEX IF NOT EXISTS idx_news_current_published
  ON news_current(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_current_source_url
  ON news_current(source_name, canonical_url);

CREATE INDEX IF NOT EXISTS idx_llm_history_observed
  ON llm_history(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_vlm_history_observed
  ON vlm_history(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tts_history_observed
  ON tts_history(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_stt_history_observed
  ON stt_history(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_embeddings_history_observed
  ON embeddings_history(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_history_observed
  ON news_history(observed_at DESC);
