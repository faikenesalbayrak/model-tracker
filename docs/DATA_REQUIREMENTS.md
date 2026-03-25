# Data Requirements (Decision Draft)

Bu doküman, **hangi datalara ihtiyacımız olduğunu** karar vermek için hazırlanmıştır.
İki ayrı tablo içerir:
1. Ana sayfa için özet (8 sütun)
2. Detay karşılaştırma için detailed sütun seti

## 1) Homepage Summary Table (8 Columns)

Amaç: Teknik boğulma olmadan, hızlı ürün/pazar karşılaştırması.
Gösterim: **Top 20**, yatay gezinme için sağ/sol ok (carousel/pager).

| # | Column | Neden Gerekli | Kaynak | Mevcut Durum |
|---|---|---|---|---|
| 1 | Model | Kullanıcının karar birimi modelin kendisi | artificial-analysis | Hazır |
| 2 | Provider (Lab) | Satın alma ve güven kararını etkiler | artificial-analysis | Hazır |
| 3 | Intelligence Index | Genel kaliteyi tek sayıda özetler | artificial-analysis | Hazır |
| 4 | Code Index | Kod üretim/use-case kararında kritik | artificial-analysis | Hazır |
| 5 | Agentic Index | Tool/agent senaryolarında doğrudan değerli | artificial-analysis | Hazır |
| 6 | Context Window | Uzun belge/çoklu bağlam işlerinde ana metrik | artificial-analysis | Hazır |
| 7 | Speed (Tok/s) | Kullanıcı deneyimi ve operasyon süresi için kritik | artificial-analysis (`median_output_speed`) | Hazır |
| 8 | Model Meta (Release Date + Knowledge Cutoff + Open Source) | Güncellik, erişim modeli ve veri tazeliği tek alanda görülsün | Release: artificial-analysis / Open Source: artificial-analysis (`is_open_weights`) / Cutoff: henüz yok | Kısmi |

### Homepage için notlar
- `Model Meta` tek sütunda badge/etiket seti olarak render edilecek:
1. `Release: 2026-..`
2. `Cutoff: 2025-..` (varsa)
3. `Open Source: Yes/No`
- `Knowledge Cutoff` şu an aktif pipeline’da normalize edilmediği için **boş gelebilir**.
- Sıralama varsayılanı: `Intelligence desc`, alternatif hızlı sort: `Code`, `Agentic`, `Tok/s`, `Context`.

## 2) Deep Comparison Table (Detailed)

Amaç: Ürün, araştırma ve procurement kararlarında “tam görünürlük”.

| Group | Column | Açıklama | Kaynak | Mevcut Durum |
|---|---|---|---|---|
| Identity | Model | Model adı/short name | artificial-analysis | Hazır |
| Identity | Provider (Lab) | Üretici/organizasyon | artificial-analysis | Hazır |
| Identity | Model URL | Model/hosts linki | artificial-analysis | Hazır |
| Identity | Open Weights | Açık ağırlık durumu | artificial-analysis | Hazır |
| Identity | Reasoning Model | Reasoning bayrağı | artificial-analysis | Hazır |
| Freshness & Governance | Release Date | Model çıkış tarihi | artificial-analysis | Hazır |
| Freshness & Governance | Knowledge Cutoff | Eğitim/veri cutoff tarihi | (planlanan yeni alan) | Eksik |
| Freshness & Governance | Open Source Status | Open source mu kapalı mı bilgisi | artificial-analysis (`is_open_weights`) | Hazır |
| Core Quality | Intelligence Index | Genel kalite indeksi | artificial-analysis | Hazır |
| Core Quality | Code Index | Kod kalitesi | artificial-analysis | Hazır |
| Core Quality | Agentic Index | Agentic görev başarımı | artificial-analysis | Hazır |
| Benchmarks | GPQA | Graduate-level QA | artificial-analysis / leaderboard | Hazır |
| Benchmarks | MMLU-PRO | Genel bilgi benchmark | artificial-analysis / leaderboard | Hazır |
| Benchmarks | TerminalBench Hard | Terminal görevleri | artificial-analysis | Hazır |
| Benchmarks | AIME 2025 | İleri matematik/olimpiyat seviyesi ölçüm | artificial-analysis (varsa) | Planlı/Kısmi |
| Benchmarks | AIME 2024 | Geçmiş yıl AIME karşılaştırması | artificial-analysis (varsa) | Planlı/Kısmi |
| Benchmarks | SWE-Bench | Gerçek repo üzerinde yazılım hata çözme | artificial-analysis (varsa) / harici benchmark feed | Planlı/Kısmi |
| Benchmarks | SWE-Bench Verified | Daha güvenilir SWE-Bench alt kümesi | artificial-analysis (varsa) / harici benchmark feed | Planlı/Kısmi |
| Benchmarks | LiveCodeBench | Güncel kodlama benchmark serisi | harici benchmark feed | Planlı |
| Benchmarks | HumanEval | Kod üretim doğruluğu | benchmarks route (metric/humaneval) | Hazır |
| Benchmarks | MBPP | Python problem çözme benchmarkı | harici benchmark feed | Planlı |
| Benchmarks | MATH (genel) | Matematik çözüm başarımı | leaderboard (`MATH Lvl 5` türevi) | Hazır/Kısmi |
| Benchmarks | BBH | Big-Bench Hard | leaderboard | Hazır |
| Benchmarks | MATH Lvl 5 | Zor matematik benchmark | leaderboard | Hazır |
| Benchmarks | MUSR | Multi-step reasoning | leaderboard | Hazır |
| Benchmarks | IFEval | Instruction following | leaderboard | Hazır |
| Benchmarks | ARC | Akıl yürütme / çoktan seçmeli genel bilgi | benchmarks route (metric/arc) | Hazır |
| Benchmarks | HellaSwag | Commonsense completion | benchmarks route (metric/hellaswag) | Hazır |
| Benchmarks | MT-Bench | Diyalog/yardımcı model kalitesi | benchmarks route (metric/mtbench) | Hazır |
| Benchmarks | GSM8K | Temel matematik muhakeme | harici benchmark feed | Planlı |
| Benchmarks | MATH-500 | Matematik benchmark alt seti | harici benchmark feed | Planlı |
| Benchmarks | Humanity's Last Exam | Sınır seviye genel akıl yürütme | harici benchmark feed | Planlı |
| Benchmarks | TruthfulQA | Halüsinasyon/doğruluk eğilimi | harici benchmark feed | Planlı |
| Benchmarks | Winogrande | Dilsel muhakeme | harici benchmark feed | Planlı |
| Benchmarks | DROP | Okuduğunu anlama + sayısal muhakeme | harici benchmark feed | Planlı |
| Benchmarks | AGIEval | Çok alanlı sınav benzeri değerlendirme | harici benchmark feed | Planlı |
| Benchmarks | MMLU (legacy) | MMLU klasik metrik | harici benchmark feed | Planlı |
| Cost | Input $/M | 1M input token maliyeti | artificial-analysis / pricing | Hazır |
| Cost | Output $/M | 1M output token maliyeti | artificial-analysis / pricing | Hazır |
| Cost | Blended $/M | Harman maliyet (3:1 vb.) | artificial-analysis / pricing | Hazır |
| Cost | Price/Performance Score | Kalite başına maliyet | derived | Planlı |
| Performance | Tok/s | Üretim hızı | artificial-analysis | Hazır |
| Performance | TTFT (s) | İlk token gecikmesi | artificial-analysis | Hazır |
| Performance | End-to-End (s) | Toplam yanıt süresi | artificial-analysis | Hazır |
| Capacity | Context Window | Token pencere kapasitesi | artificial-analysis / pricing | Hazır |
| Capacity | Params (B) | Parametre büyüklüğü | leaderboard | Hazır |
| Reliability | Data Freshness | Snapshot age (last_success_at) | internal envelope | Hazır |
| Reliability | Source Coverage | Satır bazında hangi kaynaklar dolu | derived | Planlı |

## UI/Interaction Kararı (bu turda netleşen)
- Ana sayfa: **Top 20**
- Gezinme: sağ/sol ok ile ileri-geri (carousel veya pager)
- Sütun etkileşimi: başlığa tıklayınca sıralama
- Yardım: soru işareti hover tooltip

## Uygulama İçin Kısa Teknik Not
- `Knowledge Cutoff` için yeni normalize alanı eklenmeli (önce kaynaktan doğrulanacak).
- `Open Source Status` doğrudan `artificial-analysis.is_open_weights` alanından beslenecek.
- Özet tabloda 8 sütun sınırını korumak için `Release/Cutoff/Open Source` tek birleşik `Model Meta` sütununda tutulacak.
- Deep Comparison benchmark stratejisi:
1. Mevcut pipeline'daki metrikler (`GPQA`, `MMLU-PRO`, `TerminalBench Hard`, `BBH`, `MATH Lvl 5`, `MUSR`, `IFEval`, `HumanEval`, `ARC`, `HellaSwag`, `MT-Bench`) anında gösterilir.
2. Yeni eklenmek istenen metrikler (`AIME 2025`, `SWE-Bench`, `LiveCodeBench`, vb.) için önce normalize alanları açılır, sonra tabloya aktif sütun olarak alınır.

## Monitoring & Notification Requirements (Yeni)

### 1) Top-10 Rank Change Alerts
Amaç: Aşağıdaki kategorilerde top-10 sıralama değiştiğinde bildirim göndermek.

Kategoriler:
1. `general_llm`
2. `image_generation`
3. `video_generation`
4. `text_to_speech`
5. `speech_to_text`
6. `embeddings`

Tetikleyici olaylar:
1. `entered`: Yeni model top-10’a girdi
2. `exited`: Model top-10’dan çıktı
3. `moved`: Model rank değiştirdi

Kalite kuralları:
1. Model eşleştirme `canonical_model_key` ile yapılır.
2. Aynı olay tekrarını engellemek için `event_fingerprint` kullanılır.
3. Kaynak önceliklendirme: `primary_source`, ardından sağlıklı `secondary_sources`.

### 2) Weekly Important AI News Digest
Amaç: Haftalık olarak 10 önemli AI haberini tek e-posta halinde göndermek.

Kurallar:
1. Zaman penceresi: son 7 gün
2. Kaynak havuzu: LLM Stats + NewsAPI + NewsCatcher + GDELT + HN Algolia + arXiv
3. Seçim: recency + source diversity + keyword importance
4. Dedupe: canonical URL ve normalize başlık benzerliği
5. Çıktı: sabit 10 haber

### 3) Scheduler Requirements
1. Local process içinde çalışmalı (serverless yok)
2. Timezone: `Europe/Istanbul`
3. Run saatleri:
   - günlük `09:00` ve `21:00` (top-10 monitoring)
   - haftalık `Pazartesi 09:15` (weekly digest)

### 4) Persistence Requirements (SQLite)
Gerekli tablolar:
1. `monitor_runs`
2. `leaderboard_snapshots`
3. `leaderboard_entries`
4. `leaderboard_changes`
5. `news_snapshots`
6. `news_entries`
7. `weekly_digests`
8. `weekly_digest_items`
9. `notification_log`
10. `source_health`

### 5) Notification Requirements
1. Mail gönderimi: kurumsal SMTP (`nodemailer`)
2. Top-10 alert mail: python script ile üretilen görsel (PNG) e-posta içinde
3. Weekly digest mail: 10 haber başlık/özet/link listesi
4. Tüm gönderimler `notification_log` ile izlenmeli (sent/failed)
