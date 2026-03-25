# Responsive / No-px Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tüm bileşenlerdeki px tabanlı sabit değerleri kaldırıp her breakpoint'te tutarlı çalışan, mobile-first responsive bir layout sistemi kurmak.

**Architecture:** Sabit px değerleri üç kategoriye ayrılır: (1) tablo min-width'leri — overflow-x-auto wrapper içinde kalıp touch scroll indicator eklenir, (2) sabit yükseklikler — `clamp()` veya Tailwind responsive sınıflarıyla değiştirilir, (3) font ve spacing — Tailwind scale'e veya CSS token'a taşınır. Hiçbir yerde `style={{ height: "Npx" }}` veya `h-[Npx]` kalmaz.

**Tech Stack:** Next.js 15, Tailwind CSS v4, React, TypeScript

---

## Kapsam & Değişmeyecekler

**Değişecek (px → fluid/rem/vw/clamp):**
- Chart yükseklikleri: `h-[360px]`, `h-[340px]`, `h-[320px]`, `h-[280px]`
- News scroll cap: `max-h-[600px]`
- Tier cell min height: `min-h-[50px]`
- Stat card min-width: `min-w-[120px]`
- Tooltip max-width: `max-w-[260px]`
- Meta truncate max-width: `max-w-[220px]`
- Skeleton heights

**Değişmeyecek (tablolar — scroll container içinde kalmak şartıyla):**
- `min-w-[860px]`, `min-w-[900px]`, `min-w-[1080px]`, `min-w-[1280px]`, `min-w-[1800px]`
  — Bu değerler veri tablosunun okunabilirliği için gerekli. Scroll wrapper zaten var.
  — Tek yapılacak: mobile'da "kaydırın" scroll hint eklemek.

---

## Dosya Haritası

| Dosya | Ne Değişir |
|---|---|
| `app/globals.css` | CSS token'ları: `--radius-panel`, `--radius-card`, `--radius-item`; chart yükseklik token'ı |
| `components/SectionFrame.tsx` | `rounded-2xl` → `var(--radius-card)` ile token; padding responsive |
| `components/DashboardApp.tsx` | Stat card `min-w-[120px]` → kaldır; meta `max-w-[220px]` → rem |
| `components/ModelExplorer.tsx` | Chart div heights `h-[320px]` `h-[280px]` → clamp; tablo scroll hint; `max-h-[600px]` → `max-h-[min(600px,60vh)]`; filter panel mobile wrap |
| `components/CapabilityTierBoard.tsx` | `min-h-[50px]` → `min-h-[3rem]` |
| `components/HeroReleases.tsx` | Zaten iyi, sadece rounded token |
| `components/PricePerformance.tsx` | `h-[360px]` → clamp; skeleton height |
| `components/SotaChart.tsx` | `h-[340px]` → clamp; skeleton height |
| `components/LeaderboardTable.tsx` | Scroll hint ekle; `rounded-[1.75rem]` → token |
| `components/ColumnTooltipLabel.tsx` | `max-w-[260px]` → `max-w-[16rem]` |
| `components/ArtificialAnalysisExplorer.tsx` | Scroll hint |

---

## Task 1: CSS Token Sistemi — Radius & Spacing

**Hedef:** `rounded-[2rem]`, `rounded-[1.75rem]` gibi arbitrary değerleri merkezi CSS token'larla yönet. Böylece gelecekte tek yerden değiştirilebilir.

**Files:**
- Modify: `app/globals.css`
- Modify: `components/SectionFrame.tsx`
- Modify: `components/LeaderboardTable.tsx`
- Modify: `components/PricePerformance.tsx`
- Modify: `components/SotaChart.tsx`

- [ ] **Step 1: `globals.css`'e radius token'larını ekle**

`:root` bloğuna şu satırları ekle:
```css
/* Radius tokens */
--radius-panel: clamp(1rem, 2.5vw, 2rem);   /* büyük panel: 16px → 32px */
--radius-card: clamp(0.75rem, 2vw, 1.75rem); /* kart: 12px → 28px */
--radius-item: 0.75rem;                       /* liste öğesi: 12px sabit */
```

Ve `@theme inline` bloğuna:
```css
--rounded-panel: var(--radius-panel);
--rounded-card: var(--radius-card);
--rounded-item: var(--radius-item);
```

- [ ] **Step 2: `ModelExplorer.tsx` içindeki `rounded-[2rem]` class'larını değiştir**

Grep: `grep -n "rounded-\[2rem\]\|rounded-\[1.75rem\]" components/ModelExplorer.tsx`

Her `rounded-[2rem]` → `rounded-[var(--radius-panel)]`
Her `rounded-[1.75rem]` → `rounded-[var(--radius-card)]`

- [ ] **Step 3: Diğer bileşenlerde aynı değişiklik**

```
components/CapabilityTierBoard.tsx  : rounded-[2rem] → rounded-[var(--radius-panel)]
components/HeroReleases.tsx         : rounded-[1.75rem] → rounded-[var(--radius-card)]
components/PricePerformance.tsx     : rounded-[1.75rem] → rounded-[var(--radius-card)]
components/SotaChart.tsx            : rounded-[1.75rem] → rounded-[var(--radius-card)]
components/LeaderboardTable.tsx     : rounded-[1.75rem] → rounded-[var(--radius-card)]
```

- [ ] **Step 4: Tarayıcıda mobile (375px) ve desktop'ta rounded köşelerin doğru ölçeklendiğini doğrula**

```bash
npm run dev
```
Chrome DevTools → 375px genişlikte köşelerin 16px, 1440px'te 32px olduğunu kontrol et.

- [ ] **Step 5: Commit**
```bash
git add app/globals.css components/
git commit -m "refactor: replace arbitrary rounded values with fluid CSS radius tokens"
```

---

## Task 2: Sabit Yükseklikleri Fluid Değerlerle Değiştir

**Hedef:** `h-[Npx]` ve `min-h-[Npx]` değerlerini viewport veya rem tabanlı değerlerle değiştir.

**Files:**
- Modify: `components/PricePerformance.tsx`
- Modify: `components/SotaChart.tsx`
- Modify: `components/ModelExplorer.tsx`
- Modify: `components/CapabilityTierBoard.tsx`

**Dönüşüm tablosu:**
| Eski | Yeni | Açıklama |
|---|---|---|
| `h-[360px]` | `h-[clamp(200px,40vh,360px)]` | chart yüksekliği |
| `h-[340px]` | `h-[clamp(200px,38vh,340px)]` | chart yüksekliği |
| `h-[320px]` | `h-[clamp(180px,35vh,320px)]` | chart yüksekliği |
| `h-[280px]` | `h-[clamp(160px,30vh,280px)]` | chart yüksekliği |
| `min-h-[32rem]` | `min-h-[20rem]` | latest models panel |
| `min-h-[50px]` | `min-h-[3rem]` | tier hücre |
| `max-h-[600px]` | `max-h-[min(600px,60vh)]` | news scroll cap |

- [ ] **Step 1: `PricePerformance.tsx` — chart ve skeleton yükseklikleri**

Dosyayı oku: `components/PricePerformance.tsx`

- Chart wrapper div: `h-[360px]` → `h-[clamp(200px,40vh,360px)]`
- Skeleton div: `h-[360px] animate-pulse rounded-[1.75rem]...` → `h-[clamp(200px,40vh,360px)] animate-pulse rounded-[var(--radius-card)]...`

- [ ] **Step 2: `SotaChart.tsx` — chart ve skeleton yükseklikleri**

- Chart wrapper: `h-[340px]` → `h-[clamp(200px,38vh,340px)]`
- Skeleton: `h-[340px]` → `h-[clamp(200px,38vh,340px)]`

- [ ] **Step 3: `ModelExplorer.tsx` — chart divleri ve panel min-height**

Grep: `grep -n "h-\[" components/ModelExplorer.tsx`

- `h-[320px]` → `h-[clamp(180px,35vh,320px)]`
- `h-[280px]` → `h-[clamp(160px,30vh,280px)]`
- `min-h-[32rem]` (latest models panel) → `min-h-[20rem]`
- `max-h-[600px]` (news scroll) → `max-h-[min(600px,60vh)]`

- [ ] **Step 4: `CapabilityTierBoard.tsx` — tier hücre min-height**

`min-h-[50px]` → `min-h-[3rem]` (2 yerde)

- [ ] **Step 5: Mobile'da chart'ların okunabilir kaldığını doğrula**

375px genişlikte chart yüksekliklerinin en az 160-200px olduğunu kontrol et.

- [ ] **Step 6: Commit**
```bash
git add components/PricePerformance.tsx components/SotaChart.tsx components/ModelExplorer.tsx components/CapabilityTierBoard.tsx
git commit -m "refactor: replace fixed px heights with fluid clamp/rem values"
```

---

## Task 3: Stat Card & Tooltip — Küçük px Değerleri

**Hedef:** `DashboardApp`'teki stat card min-width ve meta truncate, `ColumnTooltipLabel`'daki tooltip max-width.

**Files:**
- Modify: `components/DashboardApp.tsx`
- Modify: `components/ColumnTooltipLabel.tsx`

- [ ] **Step 1: `DashboardApp.tsx` — stat card**

Dosyayı oku: `components/DashboardApp.tsx`

Satır ~335: `panel-interactive flex min-w-[120px] flex-1 flex-col rounded-xl px-5 py-4`
→ `panel-interactive flex min-w-0 flex-1 flex-col rounded-xl px-4 py-3 sm:px-5 sm:py-4`

`min-w-[120px]` kaldırılır — `flex-1` zaten eşit dağılımı sağlar, min-width gereksiz.

- [ ] **Step 2: `DashboardApp.tsx` — meta truncate**

Satır ~356: `max-w-[220px] truncate text-[11px]`
→ `max-w-[14rem] truncate text-[11px]`

- [ ] **Step 3: `ColumnTooltipLabel.tsx` — tooltip**

`max-w-[260px]` → `max-w-[16rem]`

rem tabanlı değerler px'ten daha responsive'dir çünkü kullanıcının font boyutuna göre ölçeklenir.

- [ ] **Step 4: Commit**
```bash
git add components/DashboardApp.tsx components/ColumnTooltipLabel.tsx
git commit -m "refactor: replace px-based width constraints with rem equivalents"
```

---

## Task 4: Tablo Scroll Hint — Mobile UX

**Hedef:** `min-w-[Npx]` tablo değerlerini değiştirmiyoruz (veri okunabilirliği için gerekli) ama mobile kullanıcıya "sağa kaydır" ipucu veren bir görsel gösterge ekliyoruz.

**Files:**
- Modify: `components/ModelExplorer.tsx`
- Modify: `components/LeaderboardTable.tsx`
- Modify: `components/ArtificialAnalysisExplorer.tsx`
- Modify: `components/PricePerformance.tsx`
- Modify: `components/SotaChart.tsx`

**Scroll hint pattern (her overflow-x-auto container'ına):**

```tsx
{/* Tablo scroll wrapper */}
<div className="relative">
  <div className="overflow-x-auto overscroll-x-contain rounded-[var(--radius-card)]">
    <table className="min-w-[Npx] ...">
      ...
    </table>
  </div>
  {/* Mobile scroll hint — sadece touch cihazlarda görünür */}
  <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white/60 to-transparent dark:from-slate-950/60 md:hidden" />
</div>
```

`md:hidden` sayesinde desktop'ta görünmez, mobile'da sağ kenarda soluk bir gradient "daha içerik var" hissi verir.

- [ ] **Step 1: `LeaderboardTable.tsx` — scroll hint ekle**

Mevcut `overflow-x-auto rounded-[1.75rem]...` div'ini `relative` bir wrapper ile sar, sağ gradient'ı ekle.

- [ ] **Step 2: `ModelExplorer.tsx` — summary ve LLM tablosu**

Summary table wrapper (satır ~1173) ve LLM table wrapper (satır ~1505) için aynı pattern.

- [ ] **Step 3: `ArtificialAnalysisExplorer.tsx`, `PricePerformance.tsx`, `SotaChart.tsx`**

Her birindeki `overflow-x-auto` container'ına `relative` wrapper + `md:hidden` gradient ekle.

- [ ] **Step 4: Mobile'da (375px) tabloların sağ kenarında gradient'ın göründüğünü doğrula**

- [ ] **Step 5: Commit**
```bash
git add components/
git commit -m "feat: add mobile scroll hint gradient to all horizontal scroll containers"
```

---

## Task 5: Filter Panel & ModelExplorer Mobile Layout

**Hedef:** ModelExplorer'daki filtre paneli mobile'da 6 kolon grid yerine iyi wrap etmeli; section header ve sayfa geneli mobile padding doğru olmalı.

**Files:**
- Modify: `components/ModelExplorer.tsx`

- [ ] **Step 1: Filter grid'ini incele**

```bash
grep -n "grid gap-3\|grid-cols-" components/ModelExplorer.tsx | head -20
```

Filtre kolonları şu an `md:grid-cols-2 xl:grid-cols-5` veya `xl:grid-cols-6` formatında. Mobile'da (sm altı) tek kolon olması gerekiyor.

- [ ] **Step 2: Filter grid'i düzelt**

`grid gap-3 md:grid-cols-2 xl:grid-cols-5`
→ `grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5`

`grid gap-3 md:grid-cols-2 xl:grid-cols-6`
→ `grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6`

- [ ] **Step 3: `DashboardApp.tsx` — stat card satırı mobile wrap**

Stat cards satırı: `flex flex-wrap justify-end gap-3` zaten var mı kontrol et.
Eğer yoksa: `flex flex-nowrap` → `flex flex-wrap` değişikliğini uygula.

```bash
grep -n "flex.*gap-3\|flex.*stat" components/DashboardApp.tsx | head -10
```

- [ ] **Step 4: `SectionFrame.tsx` — responsive padding**

Mevcut `padding: "1.5rem"` inline style → `className="p-4 sm:p-6"` Tailwind sınıfına taşı.
(Inline style kaldırılır, `style={}` prop'dan padding çıkarılır)

- [ ] **Step 5: Mobile'da (375px) filter panelin tek kolon, büyük ekranda 5 kolon göründüğünü doğrula**

- [ ] **Step 6: Commit**
```bash
git add components/ModelExplorer.tsx components/DashboardApp.tsx components/SectionFrame.tsx
git commit -m "feat: mobile-first responsive filter grid and section padding"
```

---

## Task 6: Arbitrary Font Size'ları Standartlaştır

**Hedef:** `text-[0.6rem]`, `text-[0.65rem]`, `text-[0.68rem]`, `text-[0.7rem]` gibi değerler Tailwind'in `text-[10px]` → `text-[11px]` değil, bunun yerine `text-xs` (12px) veya özel token kullanmalı. Çok küçük fontlar mobile'da okunamaz.

**Kural:**
- `text-[0.6rem]` (9.6px) → mobile'da `text-[10px]`, ekran büyüyünce `sm:text-xs`
- `text-[0.65rem]` (10.4px) → `text-[10px] sm:text-xs`
- `text-[0.68rem]` (10.9px) → `text-xs` (12px — yeterince küçük, doğrudan geç)
- `text-[0.7rem]` (11.2px) → `text-xs` (12px)

**Files:**
- Modify: `components/ModelExplorer.tsx`
- Modify: `components/DashboardApp.tsx`
- Modify: `components/HeroReleases.tsx`
- Modify: `components/SectionFrame.tsx`
- Modify: `components/LeaderboardTable.tsx`
- Modify: `components/ColumnTooltipLabel.tsx`
- Modify: `components/ArtificialAnalysisExplorer.tsx`

- [ ] **Step 1: Tüm arbitrary font size'ları listele**
```bash
grep -rn "text-\[0\." components/ --include="*.tsx"
```

- [ ] **Step 2: Tablo header font'larını değiştir**

`ModelExplorer.tsx` ve `LeaderboardTable.tsx` içindeki thead class'larında:
`text-[0.7rem]` → `text-xs`
`text-[0.68rem]` → `text-xs`
`text-[0.65rem]` → `text-[10px] sm:text-xs`

- [ ] **Step 3: Badge/pill font'larını değiştir**

`HeroReleases.tsx`, `DashboardApp.tsx`, `SectionFrame.tsx` içindeki:
`text-[0.6rem]` → `text-[10px]`
`text-[0.65rem]` → `text-[10px] sm:text-xs`

- [ ] **Step 4: Mobile'da (375px) tüm metinlerin okunabilir olduğunu doğrula**

10px altına inmemeli, hiçbir metin kırpılmamalı.

- [ ] **Step 5: Commit**
```bash
git add components/
git commit -m "refactor: replace arbitrary rem font sizes with Tailwind scale equivalents"
```

---

## Test Protokolü (Her Task Sonrası)

Her task tamamlandığında şu kontrolleri yap:

```bash
# 1. Build hatasız geçmeli
npm run build

# 2. Lint temiz olmalı
npm run lint
```

**Tarayıcı kontrolleri:**
- Chrome DevTools → Device Toolbar → iPhone SE (375px): hiçbir yatay scroll olmamalı (tablo dışında)
- iPad (768px): iki kolon layout düzgün olmalı
- Desktop (1440px): hiçbir şey bozulmamalı

---

## Tamamlandığında Beklenen Durum

- `grep -rn "h-\[[0-9]*px\]\|w-\[[0-9]*px\]\|min-w-\[[0-9]*px\]\|max-h-\[[0-9]*px\]" components/` → yalnızca tablo `min-w-[Npx]` değerleri kalır (intentional)
- Tüm paneller `rounded-[var(--radius-panel)]` veya `rounded-[var(--radius-card)]` kullanır
- Font boyutları `text-xs` veya üzeri (12px+), mobile'da okunabilir
- Tablo scroll container'larında mobile scroll hint gradient'ı var
- `npm run build` temiz geçiyor
