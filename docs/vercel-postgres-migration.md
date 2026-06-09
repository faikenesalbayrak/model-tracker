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

`vercel.json` içindeki tek günlük cron:

1. `0 6 * * *` -> `/api/monitoring/run?type=scheduled&lane=metadata&lane=leaderboard&lane=news&lane=maintenance` (UTC 06:00 / Istanbul 09:00)

`/api/monitoring/run` cron çağrılarında `Authorization: Bearer <CRON_SECRET>` bekler.

## Notlar

1. Postgres açıkken SQLite migration’ı kullanılmaz.
2. Postgres schema dosyası: `docs/postgres_monitoring_schema.sql`
3. Runtime seçimi öncelik sırası:
   - `MONITORING_DATABASE_URL`
   - `POSTGRES_URL`
   - `DATABASE_URL` yalnız production dışı fallback olarak veya `MONITORING_ALLOW_DATABASE_URL_FALLBACK=true` ile kullanılır.
4. Local dev için production DB kullanırken `MONITORING_READ_ONLY=true` önerilir.
5. Tek cron/gün setup için önerilen guardrail env:
   - `MONITORING_RUN_BUDGET_MS=260000`
   - `MONITORING_SOURCE_TIMEOUT_MS=8000`
   - `MONITORING_SOURCE_TIMEOUT_MAX_MS=15000`
   - `MONITORING_NEWS_MAX_SOURCES=18`
   - `MONITORING_SKILLS_ENRICHMENT_MAX=30`
6. Tek cron tüm lane'leri aynı 300s Vercel function içinde çalıştırır; lane sırası `metadata`, `leaderboard`, `news`, `maintenance` olduğu için budget aşılırsa sonraki lane'ler bilinçli olarak atlanabilir ve `source_health`/run summary üzerinden görünür olur.
7. Prod leaderboard reset için script dry-run varsayılanlıdır. Destructive Postgres reset yalnız `--apply --confirm=RESET_LEADERBOARD --confirm-prod-reset=<db-host-or-name>` ile çalışır; `--no-backup` production'da ayrıca `MONITORING_ALLOW_UNBACKED_RESET=true` istemelidir.
