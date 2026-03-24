# AI Intelligence Dashboard — Implementation Checklist (v0.2)

Bu checklist, `docs/project.md` içinde tanımlanan v0.2 spec'in uygulanmasını takip etmek için hazırlanmıştır.

## 1. Proje İskeleti

- [ ] Next.js 14 App Router + TypeScript projesi oluşturuldu
- [ ] `app/api/{releases,leaderboard,benchmarks,pricing}/route.ts` dosyaları açıldı
- [ ] `lib/labs.ts`, `lib/sources.ts`, `lib/canonical-map.ts`, `lib/i18n.ts` dosyaları oluşturuldu
- [ ] `components/{HeroReleases,LeaderboardTable,SotaChart,PricePerformance}.tsx` oluşturuldu

## 2. Veri Sözleşmesi ve Normalizasyon

- [ ] `NormalizedRecord` type'ı tek kaynak olarak tanımlandı
- [ ] `Source` enum seti uygulandı: `hf_hub | hf_leaderboard | pwc | pricing_feed`
- [ ] `Metric` enum seti uygulandı: `mmlu | humaneval | arc | hellaswag | mtbench | price_per_1m`
- [ ] `confidence` alanı (`high | medium | low`) üretim kuralları yazıldı
- [ ] `timestamp` ve `last_success_at` ISO-8601 UTC olarak standartlaştırıldı
- [ ] Canonical eşleme (`lab:model:variant`) `lib/canonical-map.ts` içinde uygulandı
- [ ] Metriklerin normalize edilmediği (ham değer) kuralı kodda korundu

## 3. Kaynak Entegrasyonu

- [ ] `/api/releases` Hugging Face Hub'dan veri çekiyor
- [ ] `/api/leaderboard` HF leaderboard dataset verisini normalize ediyor
- [ ] `/api/benchmarks` Papers With Code SOTA verisini normalize ediyor
- [ ] `/api/pricing` pricing feed verisini normalize ediyor
- [ ] Pricing tarafında manuel `pricing.json` fallback kullanılmıyor
- [ ] API erişilemezse son başarılı cache verisi döndürülüyor
- [ ] Leaderboard ve SOTA skorları kaynaklar arasında birleştirilmiyor

## 4. Hata, Retry ve Stale Davranışı

- [ ] Her dış API çağrısında timeout `15s`
- [ ] Retry politikası: `2 retry` (toplam 3 deneme)
- [ ] Exponential backoff + jitter uygulanıyor
- [ ] `429` için `Retry-After` varsa kullanılıyor
- [ ] `4xx validation` ve `parse_error` non-retriable olarak işaretlendi
- [ ] Hata sınıfları üretildi: `timeout`, `429`, `5xx`, `parse_error`
- [ ] Her sınıf için standart UI mesajı tanımlandı
- [ ] Stale-while-visible uygulanıyor
- [ ] Veri yaşı `7 gün` üzerindeyse stale banner görünüyor

## 5. UI Gereksinimleri

- [ ] Hero bölümü son 7 gün release kartlarını listeliyor
- [ ] Leaderboard tablosu sıralama + filtre + kolon görünürlük özelliklerini destekliyor
- [ ] SOTA chart benchmark seçimi ve zaman filtresi destekliyor
- [ ] Price/Performance scatter benchmark seçici ile çalışıyor
- [ ] TR/EN toggle aktif
- [ ] Dark/Light toggle aktif
- [ ] Her widget'ta `last updated` (`last_success_at`) görünüyor

## 6. Kurumsal Tasarım Uyum

- [ ] `style/enterprise-colors.md` paleti UI tokenlarına işlendi
- [ ] Yalnız kurumsal HEX seti kullanılıyor (`#C90C0F`, `#000000`, `#FFFFFF`, `#000C54`, `#1C1D52`, `#0035D6`, `#1E122F`, `#CB29AC`)
- [ ] Merkezi CSS variable seti tanımlandı (`--tt-*`)
- [ ] Birincil font `Gilmer`, fallback `sans-serif` olarak tanımlandı
- [ ] `style/fonts/` altındaki font dosyaları uygulamaya bağlandı
- [ ] `Gilmer` font ailesinin (Light/Regular/Medium/Bold/Heavy) varlık envanteri doğrulandı
- [ ] Logo dosyaları yalnız `style/logos/` klasöründen kullanılıyor
- [ ] Header/footer/hero alanlarında kurumsal logo kullanımı doğrulandı
- [ ] Logo distorsiyonu/renk manipülasyonu yapılmadığı kontrol edildi

## 7. Gözlemlenebilirlik

- [ ] Hata izleme yalnız Vercel logs ile yapılıyor
- [ ] Log şeması standartlaştırıldı:
  - [ ] `level`
  - [ ] `route`
  - [ ] `source`
  - [ ] `error_type`
  - [ ] `request_id`
  - [ ] `duration_ms`
  - [ ] `last_success_at`
- [ ] Her kaynak için son başarılı fetch zamanı saklanıyor

## 8. Güvenlik ve Operasyon

- [ ] `.env.local` local geliştirme için kullanılıyor
- [ ] Vercel Preview ve Production env'leri ayrı yönetiliyor
- [ ] `HUGGINGFACE_API_KEY` yalnız server tarafında kullanılıyor
- [ ] API key loglanmıyor
- [ ] Secret rotasyonu "gerektikçe" kuralı dokümante edildi
- [ ] Incident sonrası key yenileme runbook notu eklendi

## 9. Lisans / Atıf

- [ ] Global footer'a kısa atıf metni eklendi
- [ ] Ayrı `Sources & Usage` sayfası oluşturuldu
- [ ] Kaynak bazlı lisans/kullanım notları işlendi
- [ ] Kaynak dokümantasyon linkleri eklendi

## 10. Test Planı

### Unit
- [ ] Normalize fonksiyon testleri
- [ ] Canonical mapping testleri
- [ ] Metric parser testleri

### Integration
- [ ] `/api/releases` timeout/429/5xx/fallback
- [ ] `/api/leaderboard` timeout/429/5xx/fallback
- [ ] `/api/benchmarks` timeout/429/5xx/fallback
- [ ] `/api/pricing` timeout/429/5xx/fallback

### UI
- [ ] Stale banner (7 gün kuralı)
- [ ] Last updated etiketi
- [ ] Kaynak ayrıştırma kuralı doğrulaması

### Smoke
- [ ] Vercel Preview deploy başarılı
- [ ] Route sağlık kontrolleri başarılı
- [ ] Production deploy sonrası temel ekran kontrolleri tamam

## 11. Release Gate (Done Definition)

- [ ] Tüm kritik route'lar veri döndürüyor
- [ ] Veri doğruluğu örneklem kontrolü geçildi
- [ ] Hata/fallback akışları testte doğrulandı
- [ ] Gözlemlenebilirlik alanları loglarda görüldü
- [ ] Lisans/atıf metinleri canlıda görünür durumda
