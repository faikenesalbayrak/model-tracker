# Model Tracker

Model Tracker, yapay zeka ekosistemini tek ekranda takip etmek için geliştirilmiş bir Next.js uygulamasıdır.

- Leaderboard görünümü
- AI News akışı
- Fiyat, release ve benchmark endpoint’leri
- Monitoring pipeline (source health, değişim takibi, alert log)

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- SQLite (local) / Postgres (prod)
- node-cron
- Nodemailer

## Hızlı Başlangıç

```bash
npm install
npm run dev
```

Uygulama varsayılan olarak `http://localhost:4000` adresinde açılır.

## Scriptler

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Proje Yapısı

```text
app/                Next.js app router + API route'lar
components/         UI bileşenleri
lib/                İş mantığı, normalize katmanı, monitoring
public/             Statik görseller, logo varlıkları
docs/               Teknik dokümanlar ve şema dosyaları
scripts/            Yardımcı scriptler (ör. alert görsel render)
```

## Öne Çıkan API Route'lar

- `/api/leaderboard`
- `/api/ai-news`
- `/api/pricing`
- `/api/releases`
- `/api/benchmarks`
- `/api/artificial-analysis`
- `/api/monitoring/*`

## Ortam Değişkenleri (Özet)

İhtiyaca göre `MONITORING_DATABASE_URL`, `CRON_SECRET`, SMTP ve ilgili provider anahtarları kullanılabilir.

Detaylı kurulum için:
- [docs/vercel-postgres-migration.md](docs/vercel-postgres-migration.md)
- [docs/postgres_monitoring_schema.sql](docs/postgres_monitoring_schema.sql)
- [docs/sqlite_monitoring_schema.sql](docs/sqlite_monitoring_schema.sql)

## Notlar

- Veri kaynakları üçüncü parti servislerden gelir; içerik ve erişim koşulları kaynağa göre değişebilir.
- Bu repo geliştirme ve ürün izleme amaçlıdır; kritik kararlar için tek başına kaynak olarak kullanılmamalıdır.
