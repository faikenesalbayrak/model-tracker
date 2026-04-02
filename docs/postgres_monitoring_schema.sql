CREATE TABLE IF NOT EXISTS monitor_runs (
  id UUID PRIMARY KEY,
  run_type TEXT NOT NULL CHECK (run_type IN ('scheduled_12h', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial_success', 'failed')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  summary_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leaderboard_changes (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES monitor_runs(id) ON DELETE CASCADE,
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
  score_before DOUBLE PRECISION,
  score_after DOUBLE PRECISION,
  event_fingerprint TEXT NOT NULL UNIQUE,
  details_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_health (
  source_name TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('leaderboard', 'news', 'metadata')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  total_successes INTEGER NOT NULL DEFAULT 0,
  total_failures INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms DOUBLE PRECISION,
  last_error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES monitor_runs(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('top10_alert')),
  category TEXT,
  source_name TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
  provider TEXT NOT NULL DEFAULT 'smtp',
  message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llm_current (
  id UUID PRIMARY KEY,
  category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score DOUBLE PRECISION,
  score_unit TEXT,
  model_url TEXT,
  payload_json JSONB,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category, source_name, canonical_model_key)
);

CREATE TABLE IF NOT EXISTS llm_history (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES monitor_runs(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER NOT NULL,
  source_model_id TEXT,
  canonical_model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vendor TEXT,
  score DOUBLE PRECISION,
  score_unit TEXT,
  model_url TEXT,
  payload_json JSONB,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vlm_current (LIKE llm_current INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS vlm_history (LIKE llm_history INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS tts_current (LIKE llm_current INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS tts_history (LIKE llm_history INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS stt_current (LIKE llm_current INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS stt_history (LIKE llm_history INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS embeddings_current (LIKE llm_current INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS embeddings_history (LIKE llm_history INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);

CREATE TABLE IF NOT EXISTS news_current (
  id UUID PRIMARY KEY,
  source_name TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  author_or_outlet TEXT,
  summary TEXT,
  topic_tags_json JSONB,
  importance_score DOUBLE PRECISION,
  payload_json JSONB,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_name, canonical_url)
);

CREATE TABLE IF NOT EXISTS news_history (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES monitor_runs(id) ON DELETE SET NULL,
  source_name TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  author_or_outlet TEXT,
  summary TEXT,
  topic_tags_json JSONB,
  importance_score DOUBLE PRECISION,
  payload_json JSONB,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skills_current (
  id UUID PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  view TEXT NOT NULL CHECK (view IN ('all_time', 'trending', 'hot')),
  rank INTEGER,
  source_skill_id TEXT NOT NULL,
  canonical_skill_key TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  provider TEXT,
  repository TEXT,
  description TEXT,
  category TEXT,
  officiality TEXT NOT NULL CHECK (officiality IN ('official', 'unofficial', 'unknown')),
  installs INTEGER,
  installs_yesterday INTEGER,
  change_24h INTEGER,
  match_confidence DOUBLE PRECISION,
  match_method TEXT CHECK (match_method IN ('strict', 'fuzzy', 'none')),
  primary_source TEXT NOT NULL,
  enriched_by_json JSONB,
  field_source_map_json JSONB,
  payload_json JSONB,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (view, canonical_skill_key)
);

CREATE TABLE IF NOT EXISTS skills_history (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES monitor_runs(id) ON DELETE SET NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  view TEXT NOT NULL CHECK (view IN ('all_time', 'trending', 'hot')),
  rank INTEGER,
  source_skill_id TEXT NOT NULL,
  canonical_skill_key TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  provider TEXT,
  repository TEXT,
  description TEXT,
  category TEXT,
  officiality TEXT NOT NULL CHECK (officiality IN ('official', 'unofficial', 'unknown')),
  installs INTEGER,
  installs_yesterday INTEGER,
  change_24h INTEGER,
  match_confidence DOUBLE PRECISION,
  match_method TEXT CHECK (match_method IN ('strict', 'fuzzy', 'none')),
  primary_source TEXT NOT NULL,
  enriched_by_json JSONB,
  field_source_map_json JSONB,
  payload_json JSONB,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp_current (
  id UUID PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER,
  source_server_id TEXT NOT NULL,
  canonical_mcp_key TEXT NOT NULL,
  server_name TEXT NOT NULL,
  provider TEXT,
  repository TEXT,
  description TEXT,
  category TEXT,
  officiality TEXT NOT NULL CHECK (officiality IN ('official', 'unofficial', 'unknown')),
  installs INTEGER,
  primary_source TEXT NOT NULL,
  enriched_by_json JSONB,
  field_source_map_json JSONB,
  payload_json JSONB,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canonical_mcp_key)
);

CREATE TABLE IF NOT EXISTS mcp_history (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES monitor_runs(id) ON DELETE SET NULL,
  source_name TEXT NOT NULL,
  source_priority INTEGER NOT NULL DEFAULT 100,
  rank INTEGER,
  source_server_id TEXT NOT NULL,
  canonical_mcp_key TEXT NOT NULL,
  server_name TEXT NOT NULL,
  provider TEXT,
  repository TEXT,
  description TEXT,
  category TEXT,
  officiality TEXT NOT NULL CHECK (officiality IN ('official', 'unofficial', 'unknown')),
  installs INTEGER,
  primary_source TEXT NOT NULL,
  enriched_by_json JSONB,
  field_source_map_json JSONB,
  payload_json JSONB,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitor_runs_started_at ON monitor_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_changes_lookup ON leaderboard_changes(category, source_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_status ON notification_log(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_current_lookup ON llm_current(category, source_name, rank);
CREATE INDEX IF NOT EXISTS idx_vlm_current_lookup ON vlm_current(category, source_name, rank);
CREATE INDEX IF NOT EXISTS idx_tts_current_lookup ON tts_current(category, source_name, rank);
CREATE INDEX IF NOT EXISTS idx_stt_current_lookup ON stt_current(category, source_name, rank);
CREATE INDEX IF NOT EXISTS idx_embeddings_current_lookup ON embeddings_current(category, source_name, rank);
CREATE INDEX IF NOT EXISTS idx_news_current_published ON news_current(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_current_source_url ON news_current(source_name, canonical_url);
CREATE INDEX IF NOT EXISTS idx_skills_current_lookup ON skills_current(view, rank, installs DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_current_lookup ON mcp_current(rank, installs DESC);

CREATE INDEX IF NOT EXISTS idx_llm_history_observed ON llm_history(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_vlm_history_observed ON vlm_history(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tts_history_observed ON tts_history(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_stt_history_observed ON stt_history(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_embeddings_history_observed ON embeddings_history(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_history_observed ON news_history(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_skills_history_observed ON skills_history(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_history_observed ON mcp_history(observed_at DESC);
