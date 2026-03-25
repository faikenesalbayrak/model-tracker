## Local-First Alert & Weekly Digest Plan (SQLite + Scheduler + Mail)

### Summary
Bu plan, projede tamamen local çalışan bir “veri toplama + top10 değişim alarmı + haftalık haber özeti” altyapısı kurar.  
AWS sadece host amaçlı kullanılacak; serverless/fonksiyon bağımlılığı yok.  
Kategori kaynakları için ilk üretim kararları bu dokümanda sabitlenmiştir ve yeni kaynaklar sonradan adapter eklenerek genişletilecektir.

### Generated Artifacts
- SQLite schema: `docs/sqlite_monitoring_schema.sql`
- Adapter contracts + source registry: `lib/monitoring/contracts.ts`

### Decision Lock (Bu Sprintte Sabit Kararlar)
1. **Haber veri kaynağı**
- Primary source: `https://llm-stats.com/ai-news` (mevcut `/api/ai-news` akışı).
- Haftalık “önemli 10 haber” seçimi bu kaynaktan gelen son 7 gün havuzundan yapılacak.
- Tekrarlı haberler canonical URL ile dedupe edilecek.

2. **Model leaderboard kaynakları (kategori bazlı)**
- `general_llm` -> Artificial Analysis Models (`https://artificialanalysis.ai/models`).
- `image_generation` -> LLM Stats Image Generation leaderboard kaynağı (adapter ile eklenecek).
- `video_generation` -> LLM Stats Video Generation leaderboard kaynağı (adapter ile eklenecek).
- `text_to_speech` -> LLM Stats Text-to-Speech leaderboard kaynağı (adapter ile eklenecek).
- `speech_to_text` -> LLM Stats Speech-to-Text leaderboard kaynağı (adapter ile eklenecek).
- `embeddings` -> LLM Stats Embeddings leaderboard kaynağı (adapter ile eklenecek).

2.1 **Source Expansion (Tamamı Eklenecek Kaynaklar)**
- **Genel LLM**
  - Artificial Analysis Models
  - Hugging Face Open LLM Leaderboard (`open-llm-leaderboard/contents`)
  - LM Arena leaderboard
- **Image Generation**
  - LLM Stats Image Generation leaderboard
- **Video Generation**
  - LLM Stats Video Generation leaderboard
- **Text-to-Speech**
  - LLM Stats Text-to-Speech leaderboard
- **Speech-to-Text**
  - LLM Stats Speech-to-Text leaderboard
  - Open ASR Leaderboard
- **Embeddings**
  - LLM Stats Embeddings leaderboard
  - MTEB Leaderboard
- **Model metadata/release zenginleştirme**
  - OpenRouter Models API
  - GitHub Releases API

2.2 **Haber Kaynakları (Tamamı Eklenecek)**
- LLM Stats AI News
- NewsAPI (`/v2/everything`)
- NewsCatcher API
- GDELT DOC 2.0
- Hacker News (Algolia)
- arXiv feed (research news lane)

3. **Her model için çekilecek normalize alanlar**
- `category`
- `source_name`
- `source_model_id` (kaynakta varsa)
- `canonical_model_key` (bizim stable eşleştirme anahtarımız)
- `model_name`
- `vendor`
- `rank`
- `score` (kaynaktaki ana sıralama skoru)
- `score_unit` (ör. index, points, composite)
- `model_url`
- `snapshot_at`
- `raw_payload_json`

3.1 **Haber için normalize alanlar**
- `source_name`
- `canonical_url`
- `title`
- `published_at`
- `author_or_outlet`
- `summary` (varsa)
- `topic_tags`
- `importance_score` (weekly selection için türetilmiş)
- `snapshot_at`
- `raw_payload_json`

4. **“Hepsini tek tabloda mı tutalım?” kararı**
- Karar: **Hayır**, tek tabloya yığmayacağız.
- Seçilen yapı: operasyonel olarak ayrılmış çok tablo (run/snapshot/entry/change/news/notification).
- Gerekçe: diff, idempotency, retry, weekly digest ve audit log ihtiyaçları tek tabloda sürdürülemez karmaşıklığa gider.

### Implementation Changes
1. **Kalıcı veri katmanı (SQLite)**
- `monitor_runs`: her scheduler çalışması (başlangıç/bitiş, status, hata özeti).
- `leaderboard_snapshots`: kategori+kaynak bazlı her run’ın normalize top10 snapshot’ı.
- `leaderboard_entries`: her snapshot içindeki 10 satırın normalize model kaydı.
- `leaderboard_changes`: top10 değişim event’leri (`entered`, `exited`, `moved`), rank before/after.
- `news_snapshots`: 12 saatlik haber snapshot’ları.
- `news_entries`: her snapshot içindeki normalize haber satırları.
- `weekly_digests`: haftalık seçilen 10 haberin kayıt/izleme tablosu.
- `notification_log`: gönderilen/alınamayan mail kayıtları (idempotency ve retry için).
- `source_health`: kaynak bazlı son başarılı çekim, hata oranı, son hata mesajı.

2. **Scheduler (local process içinde)**
- Zamanlama: **Europe/Istanbul** saat diliminde her gün **09:00** ve **21:00**.
- Haftalık digest: **Pazartesi 09:15**.
- Job sırası:
  1. Kaynaklardan leaderboard çek (kaynak adapter’ı hazır olan kategoriler)
  2. Normalize top10 üret
  3. Önceki top10 ile diff et
  4. Değişim varsa event yaz + alert mail hazırla/gönder
  5. AI news çek ve snapshot kaydet
  6. Pazartesi run’ında son 7 günden otomatik skorla 10 haber seçip weekly mail gönder

3. **Kategori/ kaynak orkestrasyonu (switch-case, genişlemeye açık)**
- Tek orchestrator dosyasında `switch(category)` yapısı.
- Kategori enum:
  - `general_llm`, `image_generation`, `video_generation`, `text_to_speech`, `speech_to_text`, `embeddings`
- Her case için adapter contract:
  - `fetchRaw() -> raw`
  - `normalizeTop10(raw) -> [{rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url}]`
- Bu sprintte canlı: `general_llm` (Artificial Analysis).
- Bu sprintte adapter backlog:
  - Model kaynakları: HF Open LLM, LM Arena, LLM Stats (Image/Video/TTS/STT/Embeddings), Open ASR, MTEB, OpenRouter, GitHub Releases
  - Haber kaynakları: NewsAPI, NewsCatcher, GDELT, HN Algolia, arXiv

3.1 **Kaynak önceliklendirme / birleşim kuralı**
- Her kategori için `primary_source` + `secondary_sources[]` tanımlanır.
- Top10 üretiminde öncelik:
  1. Primary source native rank
  2. Primary yoksa first healthy secondary source
  3. Kaynaklar çakışırsa `source_priority` sırasına göre seçim
- Aynı model birden çok kaynaktan gelirse `canonical_model_key` ile merge edilir, seçilen kaynağın rank’ı korunur.

4. **Top10 değişim kuralı**
- Bildirim tetikleyici: önceki snapshot vs yeni snapshot arasında
  - top10’a yeni giriş/çıkış
  - mevcut modelin rank değişimi
- Gürültü azaltma:
  - `model_id`/canonical key ile eşleşme
  - aynı run içinde duplicate event engeli
- Mail içeriği:
  - sabit subject/body formatı
  - kategori, önceki-yeni rank değişimleri, timestamp

5. **Mail + görsel pipeline**
- Gönderim: `nodemailer` + kurumsal SMTP (.env).
- Alert mail için python görsel üretimi:
  - Script input: JSON (`category`, `run_time`, `changes[]`, `top10[]`)
  - Script output: PNG (sabit template içine dinamik içerik basılmış)
- Mailde PNG inline attachment olarak gönderilir.
- Weekly digest mail:
  - son 7 gün snapshotlarından otomatik skorlanan 10 haber
  - başlık + kaynak + tarih + link + kısa özet

6. **Haber seçimi (otomatik skor)**
- Kaynak: çoklu haber kaynağı (LLM Stats + NewsAPI + NewsCatcher + GDELT + HN + arXiv) + snapshot tablosu.
- Skor sinyalleri:
  - recency (yeniye ağırlık)
  - source diversity (aynı kaynaktan yığılmayı azaltma)
  - başlık önem sinyalleri (model launch, funding, major release vb. keyword ağırlığı)
- dedupe (canonical URL + normalize title benzerlik kontrolü)
- Çıktı: haftalık sabit 10 haber.

### Test Plan
1. **Diff motoru**
- Rank swap, new entry, exit, no-change senaryoları.
- Aynı model farklı isimle gelirse canonical key doğrulaması.

2. **Scheduler**
- 09:00/21:00 tetik simülasyonu.
- Pazartesi 09:15 weekly run doğrulaması.

3. **Persistence**
- Snapshot insert/read, previous snapshot retrieval, event idempotency.
- Yarım kalan run sonrası recover.

4. **Notification**
- SMTP success/failure retry.
- Python görsel script’i input doğrulama + PNG üretim testi.
- Weekly digest’in 10 haber üretmesi ve boş veri durumunda fallback mesajı.

5. **Integration (dry-run mode)**
- Gerçek mail atmadan “render + log only” modunda uçtan uca test.

### Assumptions & Defaults
- AWS tarafında sadece host var; iş mantığı uygulama içinde çalışır.
- Orchestrator mimarisi kullanıcı tercihiyle **tek dosyada switch-case** olacak.
- Kaynaklar genişletilebilir adapter modeli ile artırılacak; karar verilen ilk kaynak haritası yukarıda sabit.
- Bu plan kapsamındaki tüm yeni kaynaklar adapter olarak eklenecek; işleyiş local process içinde kalacak.
- Zamanlama sabiti: **Europe/Istanbul**, günlük **09:00 + 21:00**, haftalık **Pazartesi 09:15**.
