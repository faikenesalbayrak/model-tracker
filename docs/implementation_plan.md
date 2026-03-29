# Monitoring Implementation Plan (Current)

## Summary
Bu doküman, monitoring sisteminin güncel üretim mimarisini özetler.

- Çalışma modu: local process scheduler + API route tetikleme
- Zamanlama: Europe/Istanbul, günlük `09:00` ve `21:00`
- Persistence modeli: domain bazlı `current/history`
- Weekly digest: kaldırıldı

## Normalize Alanlar

### Leaderboard Entry
- `category`
- `source_name`
- `source_model_id`
- `canonical_model_key`
- `model_name`
- `vendor`
- `rank`
- `score`
- `score_unit`
- `model_url`
- `observed_at`
- `payload_json`

### News Entry
- `source_name`
- `canonical_url`
- `title`
- `published_at`
- `author_or_outlet`
- `summary`
- `topic_tags`
- `importance_score`
- `observed_at`
- `payload_json`

## Persistence Model

### Core tablolar
- `monitor_runs`
- `leaderboard_changes`
- `notification_log`
- `source_health`

### Domain tabloları
- `llm_current`, `llm_history`
- `vlm_current`, `vlm_history`
- `tts_current`, `tts_history`
- `stt_current`, `stt_history`
- `embeddings_current`, `embeddings_history`
- `news_current`, `news_history`

## Run Akışı
1. Kaynaklardan fetch + normalize
2. `current` ile diff (top10 değişim)
3. `current` upsert + stale cleanup
4. Değişen kayıtları `history`’ye append
5. Bildirim (yalnız `top10_alert`)
6. Retention purge (`*_history`: 30 gün)

## News Kuralları
- Ingest penceresi: 14 gün
- AI relevance filtresi: başlık/özet bağlam skoru + noise elemesi
- Dedupe: canonical URL ve kaynak bazlı unique
- Frontend sıralama: en yeni yayın tarihi üstte

## Cache ve Dayanıklılık
- Snapshot cache path önceliği:
  1. `MONITORING_CACHE_DIR`
  2. production/serverless: `/tmp/model-tracker`
  3. local: `./data`
- Disk yazımı başarısız olursa endpoint memory cache ile devam eder.
- Cache yoksa endpoint uygun durumda `503` dönebilir.

## Test Plan
1. Diff motoru: entered/exited/moved/no-change
2. Scheduler: `09:00` ve `21:00` tetik doğrulaması
3. Persistence: upsert, dedupe, retention purge
4. Notification: SMTP sent/failed log doğrulaması
5. Cache resilience: read-only filesystem senaryosu

## Operational Notes
- Prod şema kaynağı: `docs/postgres_monitoring_schema.sql`
- Local şema kaynağı: `docs/sqlite_monitoring_schema.sql`
- Big-bang migration runbook: `docs/monitoring_big_bang_postgres.sql`
