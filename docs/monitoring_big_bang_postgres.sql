-- Monitoring Big-Bang Migration (Postgres/Neon)
-- Goal: move from snapshot tables to domain current/history tables.
-- This script backfills ONLY *_current and then drops legacy tables.
-- Run in a controlled window after backup and validation.

BEGIN;

-- 1) Backfill leaderboard current tables from latest snapshot per (category, source_name)
WITH latest_snapshots AS (
  SELECT DISTINCT ON (category, source_name)
    id,
    category,
    source_name,
    source_priority,
    snapshot_at
  FROM public.leaderboard_snapshots
  ORDER BY category, source_name, snapshot_at DESC, created_at DESC
),
latest_entries AS (
  SELECT
    ls.category,
    ls.source_name,
    ls.source_priority,
    ls.snapshot_at,
    le.id,
    le.rank,
    le.source_model_id,
    le.canonical_model_key,
    le.model_name,
    le.vendor,
    le.score,
    le.score_unit,
    le.model_url,
    le.payload_json
  FROM latest_snapshots ls
  JOIN public.leaderboard_entries le ON le.snapshot_id = ls.id
)
INSERT INTO public.llm_current (
  id, category, source_name, source_priority, rank,
  source_model_id, canonical_model_key, model_name, vendor,
  score, score_unit, model_url, payload_json, observed_at
)
SELECT
  id, category, source_name, source_priority, rank,
  source_model_id, canonical_model_key, model_name, vendor,
  score, score_unit, model_url, payload_json, snapshot_at
FROM latest_entries
WHERE category = 'general_llm'
ON CONFLICT (category, source_name, canonical_model_key) DO UPDATE SET
  source_priority = EXCLUDED.source_priority,
  rank = EXCLUDED.rank,
  source_model_id = EXCLUDED.source_model_id,
  model_name = EXCLUDED.model_name,
  vendor = EXCLUDED.vendor,
  score = EXCLUDED.score,
  score_unit = EXCLUDED.score_unit,
  model_url = EXCLUDED.model_url,
  payload_json = EXCLUDED.payload_json,
  observed_at = EXCLUDED.observed_at,
  updated_at = NOW();

WITH latest_snapshots AS (
  SELECT DISTINCT ON (category, source_name)
    id,
    category,
    source_name,
    source_priority,
    snapshot_at
  FROM public.leaderboard_snapshots
  ORDER BY category, source_name, snapshot_at DESC, created_at DESC
),
latest_entries AS (
  SELECT
    ls.category,
    ls.source_name,
    ls.source_priority,
    ls.snapshot_at,
    le.id,
    le.rank,
    le.source_model_id,
    le.canonical_model_key,
    le.model_name,
    le.vendor,
    le.score,
    le.score_unit,
    le.model_url,
    le.payload_json
  FROM latest_snapshots ls
  JOIN public.leaderboard_entries le ON le.snapshot_id = ls.id
)
INSERT INTO public.vlm_current (
  id, category, source_name, source_priority, rank,
  source_model_id, canonical_model_key, model_name, vendor,
  score, score_unit, model_url, payload_json, observed_at
)
SELECT
  id, category, source_name, source_priority, rank,
  source_model_id, canonical_model_key, model_name, vendor,
  score, score_unit, model_url, payload_json, snapshot_at
FROM latest_entries
WHERE category IN ('image_generation', 'video_generation')
ON CONFLICT (category, source_name, canonical_model_key) DO UPDATE SET
  source_priority = EXCLUDED.source_priority,
  rank = EXCLUDED.rank,
  source_model_id = EXCLUDED.source_model_id,
  model_name = EXCLUDED.model_name,
  vendor = EXCLUDED.vendor,
  score = EXCLUDED.score,
  score_unit = EXCLUDED.score_unit,
  model_url = EXCLUDED.model_url,
  payload_json = EXCLUDED.payload_json,
  observed_at = EXCLUDED.observed_at,
  updated_at = NOW();

WITH latest_snapshots AS (
  SELECT DISTINCT ON (category, source_name)
    id,
    category,
    source_name,
    source_priority,
    snapshot_at
  FROM public.leaderboard_snapshots
  ORDER BY category, source_name, snapshot_at DESC, created_at DESC
),
latest_entries AS (
  SELECT
    ls.category,
    ls.source_name,
    ls.source_priority,
    ls.snapshot_at,
    le.id,
    le.rank,
    le.source_model_id,
    le.canonical_model_key,
    le.model_name,
    le.vendor,
    le.score,
    le.score_unit,
    le.model_url,
    le.payload_json
  FROM latest_snapshots ls
  JOIN public.leaderboard_entries le ON le.snapshot_id = ls.id
)
INSERT INTO public.tts_current (
  id, category, source_name, source_priority, rank,
  source_model_id, canonical_model_key, model_name, vendor,
  score, score_unit, model_url, payload_json, observed_at
)
SELECT
  id, category, source_name, source_priority, rank,
  source_model_id, canonical_model_key, model_name, vendor,
  score, score_unit, model_url, payload_json, snapshot_at
FROM latest_entries
WHERE category = 'text_to_speech'
ON CONFLICT (category, source_name, canonical_model_key) DO UPDATE SET
  source_priority = EXCLUDED.source_priority,
  rank = EXCLUDED.rank,
  source_model_id = EXCLUDED.source_model_id,
  model_name = EXCLUDED.model_name,
  vendor = EXCLUDED.vendor,
  score = EXCLUDED.score,
  score_unit = EXCLUDED.score_unit,
  model_url = EXCLUDED.model_url,
  payload_json = EXCLUDED.payload_json,
  observed_at = EXCLUDED.observed_at,
  updated_at = NOW();

WITH latest_snapshots AS (
  SELECT DISTINCT ON (category, source_name)
    id,
    category,
    source_name,
    source_priority,
    snapshot_at
  FROM public.leaderboard_snapshots
  ORDER BY category, source_name, snapshot_at DESC, created_at DESC
),
latest_entries AS (
  SELECT
    ls.category,
    ls.source_name,
    ls.source_priority,
    ls.snapshot_at,
    le.id,
    le.rank,
    le.source_model_id,
    le.canonical_model_key,
    le.model_name,
    le.vendor,
    le.score,
    le.score_unit,
    le.model_url,
    le.payload_json
  FROM latest_snapshots ls
  JOIN public.leaderboard_entries le ON le.snapshot_id = ls.id
)
INSERT INTO public.stt_current (
  id, category, source_name, source_priority, rank,
  source_model_id, canonical_model_key, model_name, vendor,
  score, score_unit, model_url, payload_json, observed_at
)
SELECT
  id, category, source_name, source_priority, rank,
  source_model_id, canonical_model_key, model_name, vendor,
  score, score_unit, model_url, payload_json, snapshot_at
FROM latest_entries
WHERE category = 'speech_to_text'
ON CONFLICT (category, source_name, canonical_model_key) DO UPDATE SET
  source_priority = EXCLUDED.source_priority,
  rank = EXCLUDED.rank,
  source_model_id = EXCLUDED.source_model_id,
  model_name = EXCLUDED.model_name,
  vendor = EXCLUDED.vendor,
  score = EXCLUDED.score,
  score_unit = EXCLUDED.score_unit,
  model_url = EXCLUDED.model_url,
  payload_json = EXCLUDED.payload_json,
  observed_at = EXCLUDED.observed_at,
  updated_at = NOW();

WITH latest_snapshots AS (
  SELECT DISTINCT ON (category, source_name)
    id,
    category,
    source_name,
    source_priority,
    snapshot_at
  FROM public.leaderboard_snapshots
  ORDER BY category, source_name, snapshot_at DESC, created_at DESC
),
latest_entries AS (
  SELECT
    ls.category,
    ls.source_name,
    ls.source_priority,
    ls.snapshot_at,
    le.id,
    le.rank,
    le.source_model_id,
    le.canonical_model_key,
    le.model_name,
    le.vendor,
    le.score,
    le.score_unit,
    le.model_url,
    le.payload_json
  FROM latest_snapshots ls
  JOIN public.leaderboard_entries le ON le.snapshot_id = ls.id
)
INSERT INTO public.embeddings_current (
  id, category, source_name, source_priority, rank,
  source_model_id, canonical_model_key, model_name, vendor,
  score, score_unit, model_url, payload_json, observed_at
)
SELECT
  id, category, source_name, source_priority, rank,
  source_model_id, canonical_model_key, model_name, vendor,
  score, score_unit, model_url, payload_json, snapshot_at
FROM latest_entries
WHERE category = 'embeddings'
ON CONFLICT (category, source_name, canonical_model_key) DO UPDATE SET
  source_priority = EXCLUDED.source_priority,
  rank = EXCLUDED.rank,
  source_model_id = EXCLUDED.source_model_id,
  model_name = EXCLUDED.model_name,
  vendor = EXCLUDED.vendor,
  score = EXCLUDED.score,
  score_unit = EXCLUDED.score_unit,
  model_url = EXCLUDED.model_url,
  payload_json = EXCLUDED.payload_json,
  observed_at = EXCLUDED.observed_at,
  updated_at = NOW();

-- 2) Backfill news_current from latest snapshot per (source_name, canonical_url)
WITH ranked_news AS (
  SELECT
    ne.*,
    ns.snapshot_at,
    ROW_NUMBER() OVER (
      PARTITION BY ne.source_name, ne.canonical_url
      ORDER BY ns.snapshot_at DESC, ne.created_at DESC
    ) AS rn
  FROM public.news_entries ne
  JOIN public.news_snapshots ns ON ns.id = ne.snapshot_id
)
INSERT INTO public.news_current (
  id, source_name, canonical_url, title, published_at, author_or_outlet,
  summary, topic_tags_json, importance_score, payload_json, observed_at
)
SELECT
  id, source_name, canonical_url, title, published_at, author_or_outlet,
  summary, topic_tags_json, importance_score, payload_json, snapshot_at
FROM ranked_news
WHERE rn = 1
ON CONFLICT (source_name, canonical_url) DO UPDATE SET
  title = EXCLUDED.title,
  published_at = EXCLUDED.published_at,
  author_or_outlet = EXCLUDED.author_or_outlet,
  summary = EXCLUDED.summary,
  topic_tags_json = EXCLUDED.topic_tags_json,
  importance_score = EXCLUDED.importance_score,
  payload_json = EXCLUDED.payload_json,
  observed_at = EXCLUDED.observed_at,
  updated_at = NOW();

COMMIT;

-- Validation helpers (run after deploy + one scheduler execution)
-- SELECT COUNT(*) FROM public.llm_current;
-- SELECT COUNT(*) FROM public.vlm_current;
-- SELECT COUNT(*) FROM public.tts_current;
-- SELECT COUNT(*) FROM public.stt_current;
-- SELECT COUNT(*) FROM public.embeddings_current;
-- SELECT COUNT(*) FROM public.news_current;

-- If validation passes, execute immediate legacy cleanup in same window:
-- BEGIN;
-- DROP TABLE IF EXISTS public.weekly_digest_items;
-- DROP TABLE IF EXISTS public.weekly_digests;
-- DROP TABLE IF EXISTS public.news_entries;
-- DROP TABLE IF EXISTS public.news_snapshots;
-- DROP TABLE IF EXISTS public.leaderboard_entries;
-- DROP TABLE IF EXISTS public.leaderboard_snapshots;
-- COMMIT;
