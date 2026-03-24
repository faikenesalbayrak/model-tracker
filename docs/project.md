# AI Intelligence Dashboard — Proje Tanımı

**Proje Adı:** AI Intelligence Dashboard  
**Repo:** github.com/faikenesalbayrak/model-tracker (private)  
**Deploy Hedefi:** Vercel  
**Versiyon:** 0.2 — Spec revizyonu  

---

## 1. Amaç

Yapay zeka alanındaki gelişmeleri (yeni model release'leri, benchmark skorları, fiyat/performans verileri, viral haberler) tek bir ekrandan, güncel ve otomatik olarak takip etmeyi sağlayan dahili bir dashboard.

Hedef kitle: THY Teknoloji ekibi ve yönetim. Haftalık kullanım frekansı esas alınmıştır.

---

## 2. Teknik Yığın

| Katman | Teknoloji |
|---|---|
| Framework | Next.js 14 (App Router) |
| Stil | Tailwind CSS |
| Grafik | Recharts |
| Tablo | TanStack Table v8 |
| Tema | next-themes (dark/light toggle) |
| İkonlar | Lucide React |
| Deploy | Vercel |
| Dil | TypeScript |

---

## 3. Mimari

### 3.1 Klasör Yapısı

```txt
model-tracker/
├── app/
│   ├── layout.tsx                  → Genel layout, tema toggle
│   ├── page.tsx                    → Ana sayfa, bölümleri birleştirir
│   └── api/
│       ├── leaderboard/route.ts    → HuggingFace leaderboard verileri
│       ├── releases/route.ts       → Yeni model release'leri
│       ├── benchmarks/route.ts     → Papers With Code SOTA verileri
│       └── pricing/route.ts        → Fiyat/performans verileri
├── components/
│   ├── HeroReleases.tsx            → Son 7 günde çıkan modeller
│   ├── LeaderboardTable.tsx        → Sıralanabilir/filtrelenebilir tablo
│   ├── SotaChart.tsx               → SOTA zaman çizelgesi
│   └── PricePerformance.tsx        → Fiyat-performans scatter plot
├── lib/
│   ├── labs.ts                     → 19 lab tanımları, metadata
│   ├── sources.ts                  → API URL'leri, revalidate süreleri
│   ├── canonical-map.ts            → Model alias/canonical eşleme tablosu
│   └── i18n.ts                     → TR/EN çeviri stringleri
└── style/
    ├── enterprise-colors.md        → Kurumsal renk referansı
    ├── logos/                      → Kurumsal logo varlıkları
    └── fonts/                      → Kurumsal font dosyaları
```

### 3.2 Veri Akışı

Next.js sunucu tarafı `fetch` mekanizması kullanılır. Her API route bağımsız çalışır ve Vercel ISR (Incremental Static Regeneration) ile cache'lenir. ISR nedeniyle çoğu istekte hazır veri sunulur; cache miss, cold start ve upstream gecikmelerinde yanıt süresi artabilir.

| Route | Kaynak | Revalidate |
|---|---|---|
| `/api/leaderboard` | HuggingFace Open LLM Leaderboard | 12 saat |
| `/api/releases` | HuggingFace Model Hub API | 6 saat |
| `/api/benchmarks` | Papers With Code API | 12 saat |
| `/api/pricing` | Artificialanalysis.ai API | 24 saat |

### 3.3 Ortak Veri Sözleşmesi

Tüm route çıktıları, UI katmanına gitmeden önce aşağıdaki normalize sözleşmeye çevrilir.

```ts
type Source = "hf_hub" | "hf_leaderboard" | "pwc" | "pricing_feed";
type Metric = "mmlu" | "humaneval" | "arc" | "hellaswag" | "mtbench" | "price_per_1m";
type Confidence = "high" | "medium" | "low";

type NormalizedRecord = {
  id: string;               // canonical format: lab:model:variant
  lab: string;              // labs whitelist ile uyumlu
  source: Source;
  metric: Metric;
  value: number | string;   // metric türüne göre ham değer
  timestamp: string;        // ISO-8601 UTC
  confidence: Confidence;   // parse/kaynak güven seviyesi
  last_success_at: string;  // ilgili kaynak için ISO-8601 UTC
};
```

Ek kurallar:
- Model tekilleştirme `canonical-map.ts` üzerinden yapılır.
- Metrikler normalize edilmez; ham değer + metrik etiketi gösterilir.
- Kaynaklar arası skorlar birleştirilmez.

---

## 4. Takip Edilen Lablar

### Tier 1 — Zorunlu (7)
OpenAI, Anthropic, Google DeepMind, Meta AI, Mistral AI, xAI (Grok), Cohere

### Tier 2 — Zorunlu (9)
Alibaba (Qwen), DeepSeek, Baidu (ERNIE), ByteDance (Doubao), Zhipu AI (GLM), Moonshot AI (Kimi), 01.AI (Yi), Minimax, Baichuan

### Ek (3)
Perplexity (Sonar), NVIDIA (Nemotron), Microsoft (Phi)

**Toplam: 19 lab**

---

## 5. Dashboard Bölümleri

### 5.1 Hero — Yeni Release'ler

Sayfanın en üstünde yer alır. Son 7 günde yayımlanan modelleri kart formatında gösterir.

Her kartta:
- Model adı ve versiyonu
- Lab adı + logo
- Yayımlanma tarihi
- Kısa açıklama (model kartından çekilir)
- HuggingFace model sayfasına dış link

**Veri kaynağı:** HuggingFace Model Hub API (`sort=lastModified`, lab whitelist filtresi).

### 5.2 Leaderboard Tablosu

Tüm takip edilen labların modellerini benchmark skorları ile yan yana gösteren interaktif tablo.

**Sütunlar:**
- Model adı
- Lab
- Parametre sayısı
- MMLU (%)
- HumanEval (%)
- MT-Bench (puan)
- ARC (%)
- HellaSwag (%)
- Çıkış tarihi

**Özellikler:**
- Sütun bazlı sıralama
- Lab bazlı filtre (checkbox)
- Open source / closed source filtresi
- Benchmark bazlı sütun göster/gizle

**Veri kaynağı:** HuggingFace Open LLM Leaderboard dataset (`open-llm-leaderboard/results`).  
**Kaynak politikası:** Bu bölüm yalnız HuggingFace skorlarını kullanır.

### 5.3 SOTA Zaman Çizelgesi

Seçilen bir benchmark'ta skor rekorlarının zaman içinde değişimini gösteren çizgi grafik.

**Özellikler:**
- Benchmark seçici: MMLU, HumanEval, ARC, HellaSwag, MT-Bench
- Hover: model adı, lab, skor, tarih
- Rekor kıran modeller farklı renkte
- Zaman aralığı filtresi: 6 ay / 1 yıl / tümü

**Veri kaynağı:** Papers With Code API (`/api/v1/sota/`).  
**Kaynak politikası:** Bu bölüm yalnız Papers With Code skorlarını kullanır.

### 5.4 Fiyat / Performans Scatter Plot

X ekseni: 1M token başı fiyat (USD)  
Y ekseni: Seçilen benchmark skoru  

**Özellikler:**
- Benchmark seçici
- Nokta boyutu parametre sayısını temsil eder
- Hover: model adı, lab, fiyat, skor
- Lab bazlı renk kodlaması

**Veri kaynağı:** Artificialanalysis.ai API.  
**Fallback politikası:** API erişilemezse en son başarılı cache verisi gösterilir (manuel `pricing.json` fallback yok).

---

## 6. UI / UX Gereksinimleri

- **Tema:** Dark / Light toggle (varsayılan sistem temasını takip eder)
- **Dil:** TR / EN toggle (tüm statik metinlerde)
- **Tasarım:** Minimal / clean, bilgi yoğun ama gürültüsüz
- **Responsive:** Masaüstü öncelikli, tablet desteği ikincil
- **Font:** Kurumsal fontlar `style/fonts/` altından yüklenir (öncelik `Gilmer`, fallback `sans-serif`)
- **Stale görünürlüğü:** Veri 7 günü geçtiğinde ilgili widget üzerinde stale banner gösterilir
- **Last updated:** Her widget veri kaynağı için `last_success_at` bilgisi gösterilir

---

## 6.1 Kurumsal Tasarım Uyum Sözleşmesi

Kurumsal görsel kimlik zorunludur. Dashboard UI, `style/enterprise-colors.md`, `style/logos/` ve `style/fonts/` dizinlerine tam uyumlu olmalıdır.

### Renk Politikası (Zorunlu)

- Uygulamada yalnız aşağıdaki kurumsal HEX renkleri kullanılabilir:
  - `#C90C0F` (tt-red)
  - `#000000` (tt-black)
  - `#FFFFFF` (tt-white)
  - `#000C54` (tt-navy)
  - `#1C1D52` (tt-deep-navy)
  - `#0035D6` (tt-blue)
  - `#1E122F` (tt-purple)
  - `#CB29AC` (tt-pink)
- Yeni renk türetme (rastgele hex, harici palette geçiş) yasaktır.
- Tüm renkler CSS variable olarak merkezi bir token dosyasında tanımlanır (ör. `:root --tt-*`).
- Mavi palet (`tt-navy`, `tt-deep-navy`, `tt-blue`) yalnız dijital kullanım bağlamında kullanılacaktır.

### Logo Politikası (Zorunlu)

- Logo varlıkları yalnız `style/logos/` klasöründen alınır.
- Header, footer ve giriş/hero alanlarında kurumsal logo kullanımı zorunludur.
- Logo üzerinde renk değiştirme, distort/stretch, gölge/efekt ekleme veya oran bozma yapılmaz.
- Koyu zeminlerde açık/uygun varyant, açık zeminlerde koyu/uygun varyant kullanılır.
- Uygulama içinde üçüncü parti marka logoları yalnız veri kaynağı bağlamında (ör. model sağlayıcı etiketi) gösterilebilir; kurumsal kimliğin yerine geçmez.

### Tipografi Politikası

- Birincil font: `Gilmer` (Light/Regular/Medium/Bold/Heavy)
- Fallback font: `sans-serif`
- Sistemde `Gilmer` yüklenemezse otomatik fallback `sans-serif` uygulanır.
- Uygulamada kullanılacak kurumsal font dosyaları `style/fonts/` altında tutulur.

---

## 7. Veri Kaynakları ve API Referansları

### HuggingFace Model Hub API
- **Base URL:** `https://huggingface.co/api/models`
- **Parametreler:** `sort=lastModified`, `limit=100`, `filter=text-generation`
- **Kimlik doğrulama:** API key (ücretsiz, kayıt gerekli)
- **Dokümantasyon:** https://huggingface.co/docs/hub/api

### HuggingFace Open LLM Leaderboard Dataset
- **Dataset ID:** `open-llm-leaderboard/results`
- **Erişim:** Python `datasets` kütüphanesi veya REST API
- **CORS:** Destekler, browser'dan direkt çağrılabilir
- **Dokümantasyon:** https://huggingface.co/datasets/open-llm-leaderboard/results

### Papers With Code API
- **Base URL:** `https://paperswithcode.com/api/v1/`
- **İlgili endpoint:** `/sota/` (benchmark bazlı SOTA)
- **Kimlik doğrulama:** Public
- **CORS:** Destekler
- **Dokümantasyon:** https://paperswithcode.com/api/v1/docs/

### Artificialanalysis.ai
- **URL:** https://artificialanalysis.ai
- **API:** Kayıt gerekli, tier'a göre kısıtlı
- **Not:** V0.2 itibarıyla manuel `pricing.json` fallback kaldırılmıştır.

---

## 8. Hata ve Bozulma Davranışı

Hata sınıfları:
- `timeout`: upstream belirtilen sürede dönmedi
- `429`: rate limit aşıldı
- `5xx`: upstream servis hatası
- `parse_error`: veri formatı beklenen şemaya uymuyor

UI mesaj standardı:
- `timeout`: "Kaynak geç yanıt veriyor. Son başarılı veri gösteriliyor."
- `429`: "Kaynak limitine ulaşıldı. Son başarılı veri gösteriliyor."
- `5xx`: "Kaynakta geçici hata var. Son başarılı veri gösteriliyor."
- `parse_error`: "Kaynak verisi işlenemedi. Son başarılı veri gösteriliyor."

Davranış:
- `stale-while-visible` uygulanır.
- Veri 7 günü geçerse stale banner görünür.
- Kullanıcıya boş ekran yerine son başarılı veri gösterilir.
- Leaderboard ve SOTA skorları kaynaklar arasında birleştirilmez.

---

## 9. Rate Limit / Retry Politikası

- Her dış API çağrısı timeout: **15 saniye**
- Retry: **2 retry** (toplam 3 deneme)
- Backoff: exponential backoff + jitter
- `429` için `Retry-After` header varsa öncelikle ona uyulur
- Retry yapılmayacak durumlar: 4xx validation hataları ve `parse_error`

---

## 10. Gözlemlenebilirlik

- Hata izleme stack'i: **yalnız Vercel logs**
- Her route çağrısında aşağıdaki log alanları standarttır:
  - `level`
  - `route`
  - `source`
  - `error_type`
  - `request_id`
  - `duration_ms`
  - `last_success_at`
- Her kaynak için son başarılı fetch zamanı saklanır ve UI'da "last updated" olarak gösterilir.

---

## 11. Deploy Süreci

1. `main` branch'e push yapılır
2. Vercel preview build (PR/branch) otomatik tetiklenir
3. Preview doğrulaması sonrası production deploy tetiklenir
4. Build başarılıysa production URL güncellenir
5. ISR revalidation otomatik çalışır

---

## 12. Environment Variables ve Güvenlik/Operasyon

```env
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxxxxxxxxx
```

Kurallar:
- Local geliştirme için `.env.local` kullanılır.
- Vercel `Preview` ve `Production` env değerleri ayrı yönetilir.
- Secret rotasyonu "gerektikçe" yapılır; incident sonrası ilgili key derhal yenilenir.
- API key'ler loglanmaz ve client bundle'a gönderilmez.

---

## 13. Test ve Kabul Kriterleri

Unit testler:
- normalize fonksiyonları
- canonical mapping doğrulaması
- metric parser doğrulaması

Integration testler:
- `/api/releases`, `/api/leaderboard`, `/api/benchmarks`, `/api/pricing`
- timeout / 429 / 5xx senaryoları
- fallback olarak son başarılı verinin dönmesi

UI testler:
- stale banner görünürlüğü (7 gün kuralı)
- `last updated` etiketi görünürlüğü
- kaynak ayrıştırma kuralı (Leaderboard=HuggingFace, SOTA=Papers With Code)

Kabul kriteri:
- Veri doğruluğu önceliklidir.
- UI polish ikincil önceliktir.

---

## 14. Veri Lisans/Kullanım ve Atıf

- Global footer'da kısa atıf metni gösterilir: "Data sources: Hugging Face, Papers With Code, Artificial Analysis."
- Ayrı bir "Sources & Usage" sayfasında kaynak bazlı kullanım/lisans notları ve resmi dokümantasyon linkleri bulunur.
- Kaynak sağlayıcıların kullanım koşulları değiştiğinde ilgili sayfa güncellenir.

---

## 15. Kapsam Dışı (v0.1)

Aşağıdakiler ilk versiyona dahil değildir, sonraki iterasyonlara bırakılmıştır:

- Kullanıcı girişi / auth
- Kişiselleştirilmiş favori listesi
- E-posta / Slack bildirimleri (yeni model çıkınca)
- Model detay sayfası
- Karşılaştırma modu (2 modeli yan yana)
- Mobil uygulama
