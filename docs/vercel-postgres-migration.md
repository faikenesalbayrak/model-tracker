# Vercel Postgres Migration (Monitoring)

Bu proje artık `monitoring` pipeline için iki backend destekler:

1. Local geliştirme: SQLite (`data/monitoring.db`)
2. Vercel/Serverless: Postgres (`MONITORING_DATABASE_URL` veya `POSTGRES_URL`)

## Zorunlu Env (Vercel Production)

1. `MONITORING_DATABASE_URL` (veya `POSTGRES_URL`)
2. `CRON_SECRET`
3. `MONITORING_ALERT_RECIPIENTS`
4. SMTP ayarları (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, opsiyonel `SMTP_FROM`)

## Opsiyonel Env

1. `MONITORING_MANUAL_RUN_ENABLED=true`
2. `MONITORING_MANUAL_TOKEN=...`

## Otomatik Çalıştırma

`vercel.json` içindeki günlük cron:

1. `0 6 * * *` -> `/api/monitoring/run?type=scheduled` (Istanbul 09:00)

`/api/monitoring/run` cron çağrılarında `Authorization: Bearer <CRON_SECRET>` bekler.

## Notlar

1. Postgres açıkken SQLite migration’ı kullanılmaz.
2. Postgres schema dosyası: `docs/postgres_monitoring_schema.sql`
3. Runtime seçimi öncelik sırası:
   - `MONITORING_DATABASE_URL`
   - `POSTGRES_URL`
   - `DATABASE_URL`
4. Local dev için production DB kullanırken `MONITORING_READ_ONLY=true` önerilir.
5. Tek cron/gün setup için önerilen guardrail env:
   - `MONITORING_RUN_BUDGET_MS=260000`
   - `MONITORING_SOURCE_TIMEOUT_MS=8000`
   - `MONITORING_NEWS_MAX_SOURCES=18`
   - `MONITORING_SKILLS_ENRICHMENT_MAX=30`
