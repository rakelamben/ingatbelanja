# IngatBelanjaan — Audit UI/UX Frontend Rev. 1

**Status:** audit read-only, usulan perbaikan, dan eksekusi sebagian Sprint A (2026-11-19)
**Tanggal:** 2026-11-19
**Acuan:** `uiux_plan/ui-ux-design.md`, frontend React saat ini, dan skill `ui-ux-pro-max`
**Platform:** mobile-first web app pada browser mobile; desktop hanya sebagai fallback/development

## 1. Ringkasan eksekutif

Frontend sudah memiliki fondasi visual yang konsisten: palet hijau, kartu dengan radius besar, bottom navigation, halaman autentikasi, scan, riwayat, laporan, anggaran, tracker, dan chat. Namun implementasi saat ini masih lebih dekat ke **vertical slice prototype** daripada sistem aplikasi mobile yang matang.

Kelemahan terbesar berada pada:

1. konteks buku aktif belum menjadi sumber kebenaran URL;
2. bottom navigation terlalu padat dan tidak mengikuti batas jumlah item mobile;
3. hierarki komponen masih monolitik dan banyak pola UI digandakan;
4. beberapa warna teks sekunder gagal mencapai kontras WCAG untuk body text;
5. alur scan belum memiliki review/confirm yang lengkap;
6. beberapa route masih placeholder atau menggunakan data buku pribadi secara hardcoded;
7. error, loading, retry, dan state kosong belum memiliki pola bersama;
8. target sentuh dan struktur aksesibilitas belum diaudit secara menyeluruh.

## 2. Metode audit

Audit dilakukan tanpa mengubah kode dengan memeriksa:

- `frontend/src/main.tsx`
- `frontend/src/components/AppShell.tsx`
- seluruh page di `frontend/src/pages/`
- `frontend/src/styles/app.css`
- `frontend/src/lib/api.ts`
- rancangan awal `uiux_plan/ui-ux-design.md`
- hasil pencarian `ui-ux-pro-max` untuk mobile-first, contrast, navigation, React error handling, dan responsive behavior

Prinsip yang dipakai:

- mobile-first dan pengujian 320/375/414/768/1024/1440 px;
- minimum touch target 44 px untuk web mobile;
- body text normal minimal 4.5:1;
- satu konteks buku aktif yang eksplisit;
- state server menjadi sumber kebenaran;
- setiap aksi async memiliki loading, success, error, dan retry yang jelas.

## 3. Temuan prioritas

### P0 — Harus diperbaiki sebelum release kandidat berikutnya

| ID    | Area          | Temuan                                                                                                                                                | Dampak                                                                            | Bukti                                                                             |
| ----- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| P0-01 | Data context  | `/app/ledger/:ledgerId` merender `HistoryPage`, tetapi page selalu memanggil `session.personal_ledger_id`; URL ledger tidak menjadi sumber data | Tracker dapat menampilkan data buku pribadi atau konteks yang salah               | `main.tsx`, `HistoryPage.tsx`                                                 |
| P0-02 | Navigation    | `LedgerSwitcher` memakai `window.location.href`, sehingga navigasi melakukan full reload dan berpotensi kehilangan state/fokus                    | Pengalaman mobile terasa patah; back behavior dan loading tidak konsisten         | `LedgerSwitcher.tsx`                                                            |
| P0-03 | Navigation    | Bottom nav berisi 7 item termasuk logout                                                                                                              | Label menyusut, target sentuh padat, prioritas navigasi tidak jelas               | `AppShell.tsx`, `app.css`                                                     |
| P0-04 | Accessibility | Teks sekunder utama berada di bawah ambang kontras body text                                                                                          | Pengguna low vision sulit membaca status, helper text, dan label sekunder         | `app.css`; pengukuran `#718078/#f4f7f1 ≈ 3.84:1`, `#829087/#fff ≈ 3.34:1` |
| P0-05 | User flow     | Scan hanya upload dan polling; belum ada layar review, koreksi, dan confirm yang lengkap                                                              | Tujuan utama aplikasi—memeriksa OCR sebelum menyimpan—belum tercapai end-to-end | `ScanPage.tsx`, route `ledger/:ledgerId`                                      |
| P0-06 | Reliability   | Beberapa request async tidak memiliki error state yang konsisten atau cleanup request                                                                 | Loading dapat menggantung, error hilang, dan request lama bisa menimpa state baru | `HistoryPage.tsx`, `ReportsPage.tsx`, `BudgetPage.tsx`, `ChatPage.tsx`    |

### P1 — Harus diperbaiki sebelum usability test

| ID    | Area                     | Temuan                                                                                                                             | Dampak                                                                            |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| P1-01 | Component hierarchy      | Page ditulis sebagai JSX satu baris yang sangat panjang; form/card/list/error state belum menjadi primitives                       | Sulit direview, diuji, dan dipelihara tanpa regresi visual                        |
| P1-02 | Responsive               | `.quick-grid` default dua kolom lalu diubah menjadi satu kolom pada `max-width: 560px`; ini desktop-first untuk komponen utama | Risiko overflow pada perangkat kecil dan aturan breakpoint tidak terprediksi      |
| P1-03 | Touch target             | Avatar 40 px; tombol kecil dan item nav tidak menetapkan tinggi minimum 44 px                                                      | Tap lebih sulit pada layar kecil                                                  |
| P1-04 | Iconography              | Navigasi memakai glyph Unicode seperti `⌂`, `◷`, `◎`, `✦`, dan `↗`                                                  | Bentuk dan baseline berubah antar-browser/platform; visual hierarchy tidak stabil |
| P1-05 | Information architecture | Akun masih `PlaceholderPage`; reports dan budget tidak terhubung kuat dari shell; activity/settings belum tersedia               | Pengguna tidak menemukan pengelolaan akun, buku, dan audit trail                  |
| P1-06 | Search                   | Search mengubah URL dan request pada setiap karakter tanpa debounce                                                                | Beban request tinggi dan UI dapat terasa lambat pada jaringan lokal/HP            |
| P1-07 | Chat                     | Thread baru dibuat setiap mount, message history tidak dimuat, status `verified` belum ditampilkan                               | Percakapan tidak terasa persisten dan tingkat kepercayaan jawaban tidak terlihat  |
| P1-08 | Data visualization       | Grafik harian menampilkan banyak batang tanpa agregasi atau alternatif ringkas di layar kecil                                      | Label dan batang sulit dibaca pada 320–375 px                                    |
| P1-09 | Mobile table             | Tabel chat tidak dibungkus dengan overflow horizontal atau alternatif card                                                         | Tabel berpotensi memecahkan lebar viewport                                        |
| P1-10 | Feedback                 | Scan tidak memiliki client-side quality feedback, cancel, retry terarah, atau progress tahap                                       | Pengguna tidak tahu apakah perlu menunggu, foto ulang, atau input manual          |

### P2 — Penyempurnaan kualitas

- CSS masih berupa banyak selector satu baris dan warna hardcoded per screen.
- Tidak ada semantic design token untuk surface, text, border, action, danger, warning, dan focus.
- Tidak ada dark mode; bila dark mode belum menjadi scope, dokumentasikan sebagai keputusan eksplisit.
- Tidak ada skip link menuju `main`.
- Root error hanya menampilkan reload tanpa opsi recovery yang kontekstual.
- Empty state belum membedakan “belum ada data”, “filter tidak menemukan data”, dan “request gagal”.
- Bottom navigation fixed sudah memiliki padding bawah global, tetapi tinggi aktual nav dan safe-area perlu diuji pada perangkat dengan gesture bar.
- `aria-live` pada seluruh chat log berpotensi membacakan ulang konten terlalu banyak; gunakan live region khusus untuk pesan baru.

## 4. Audit layout dan mobile-first

### Kondisi sekarang

- `body` memakai `min-width: 320px`, tetapi belum ada bukti pengujian layout pada 320 px.
- Konten menggunakan `width: min(100% - 2rem, 960px)`, sesuai untuk gutter dasar tetapi belum membedakan ukuran phone, tablet, dan desktop.
- Bottom navigation selalu fixed, termasuk pada desktop.
- Quick action baru turun menjadi satu kolom pada `max-width: 560px`; default seharusnya satu kolom lalu dinaikkan ke dua kolom pada breakpoint yang lebih besar.
- Grafik dan tabel belum memiliki strategi overflow mobile.

### Aturan layout yang disarankan

```text
Default: 1 kolom, padding-inline 16px, gap 16px
≥ 480px: tetap 1 kolom, card dapat memakai padding 20px
≥ 768px: dua kolom untuk quick actions dan form independen
≥ 1024px: shell desktop/side navigation atau DesktopGate sesuai keputusan produk
```

Tambahkan aturan berikut:

- semua fixed/sticky UI harus memiliki kompensasi inset yang terukur;
- gunakan `padding-bottom: calc(nav-height + env(safe-area-inset-bottom))`;
- gunakan `overflow-x: auto` pada tabel yang memang tabular;
- gunakan card/list alternatif jika tabel tidak penting untuk dibandingkan kolom per kolom;
- uji portrait dan landscape pada 320, 375, 414, 768, 1024, dan 1440 px;
- jangan mengandalkan `window.location.href` untuk perpindahan konteks aplikasi.

## 5. Audit hierarki komponen

### Struktur saat ini

`AppShell` sudah menjadi shell utama, tetapi setiap page memuat banyak tanggung jawab sekaligus:

- fetch data;
- transform data;
- state loading/error;
- layout;
- typography;
- form behavior;
- navigasi;
- feedback.

### Struktur yang disarankan

```text
src/
├── components/
│   ├── layout/
│   │   ├── AppShell
│   │   ├── PageHeader
│   │   └── BottomNav
│   ├── primitives/
│   │   ├── Button
│   │   ├── Card
│   │   ├── Field
│   │   ├── Alert
│   │   ├── StatusBadge
│   │   └── Icon
│   ├── states/
│   │   ├── LoadingState
│   │   ├── EmptyState
│   │   ├── ErrorState
│   │   └── RetryButton
│   └── ledger/
│       ├── LedgerSwitcher
│       ├── ReceiptRow
│       ├── ReceiptStatus
│       └── BudgetMeter
├── pages/
└── context/
    └── LedgerContext
```

Setiap page sebaiknya menjadi komposer data dan section, bukan tempat seluruh markup dan styling ditulis inline.

## 6. Audit visual dan design token

### Kelemahan visual

- Palet hijau sudah memiliki identitas, tetapi secondary text terlalu pucat.
- Transparansi kartu (`rgba(..., .75)` dan `.52`) mengurangi pemisahan surface dengan background.
- Radius 15–28 px digunakan hampir di semua komponen sehingga semua elemen memiliki bobot visual yang mirip.
- Heading besar dengan letter-spacing negatif cukup kuat, tetapi belum ada type scale formal untuk label, body, metadata, dan angka.
- Ikon berbasis karakter tidak memiliki konsistensi stroke, ukuran, atau alignment.

### Token yang disarankan

```css
:root {
  --color-bg: #f4f7f1;
  --color-surface: #ffffff;
  --color-surface-subtle: #edf4e8;
  --color-text: #18352a;
  --color-text-secondary: #53645a;
  --color-text-muted: #5f7066;
  --color-border: #c8d8c1;
  --color-primary: #18352a;
  --color-accent: #5f8d2f;
  --color-danger: #a83b2c;
  --color-focus: #356fce;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
}
```

Nilai final harus diverifikasi dengan contrast checker pada surface nyata. Target minimum:

- body text dan helper text: ≥4.5:1;
- large text: ≥3:1;
- icon, border kontrol, dan focus indicator: ≥3:1 terhadap area bersebelahan;
- jangan menjadikan warna satu-satunya indikator status.

## 7. Audit user flow

### Daftar dan masuk

Yang sudah baik:

- input memakai `autocomplete` yang sesuai;
- error umum ditampilkan melalui `role="alert"`;
- redirect setelah autentikasi sudah tersedia.

Perbaikan:

- tambahkan `id` dan `htmlFor` eksplisit pada semua field;
- pertahankan error per-field jika backend mengembalikan detail validasi;
- tambahkan error summary dan fokus ke error pertama setelah submit gagal;
- tampilkan state “koneksi terputus” terpisah dari kredensial salah;
- pastikan password manager dan paste tetap berfungsi.

### Scan → review → confirm

Flow target:

```text
Pilih/foto → quality check → upload → processing → review draft
→ koreksi merchant/tanggal/item/total/FX → confirm → riwayat
```

Implementasi saat ini berhenti di upload/polling dan mengarahkan ke riwayat. Perlu ditambahkan:

- preview foto dan quality issue;
- progress tahap yang nyata;
- review route berdasarkan `receiptId`;
- field editor dengan dirty state;
- issue badge dan penjelasan;
- total serta FX panel;
- confirm, retry, foto ulang, dan fallback manual;
- pencegahan kehilangan perubahan saat back navigation.

### Ledger dan tracker

Ledger aktif harus ditentukan oleh route:

```text
/app/ledger/:ledgerId
/app/ledger/:ledgerId/history
/app/ledger/:ledgerId/scan
/app/ledger/:ledgerId/reports
```

Jangan mengambil ledger ID dari session untuk page yang sudah memiliki route parameter. `LedgerContext` dapat membaca parameter, memuat detail ledger, dan menyediakan permission untuk seluruh child route.

### Tanya AI

- Buat thread hanya ketika pengguna memulai percakapan atau load thread yang ada.
- Render badge “Terverifikasi dari data aplikasi” hanya jika `verified === true`.
- Gunakan live region khusus untuk respons terbaru.
- Tambahkan loading bubble, quota state, unavailable state, dan retry.
- Sediakan contoh pertanyaan sebagai quick actions yang tetap dapat diakses keyboard.

## 8. Mobile app design pattern

### Yang sesuai

- bottom navigation;
- CTA scan sebagai aksi utama;
- safe-area inset sudah mulai digunakan;
- halaman dibatasi lebar dan memakai pola card/list;
- reduced-motion media query sudah tersedia.

### Yang belum sesuai

- bottom nav terlalu banyak item;
- logout berada di primary navigation;
- akun dan pengaturan buku belum mengikuti pola menu sekunder;
- avatar dan kontrol kecil belum memenuhi target sentuh;
- tidak ada feedback pressed state yang jelas pada semua card/link;
- tidak ada pola back hierarchy yang konsisten pada halaman detail;
- tidak ada strategi keyboard mobile untuk search debounce dan input angka selain manual total;
- fixed bottom nav belum diuji bersama browser chrome dan gesture area;
- penggunaan glyph Unicode menggantikan icon system.

Rekomendasi navigasi mobile:

```text
Beranda | Riwayat | Scan | Pelacak | AI
```

`Akun`, `Keluar`, `Pengaturan buku`, dan `Aktivitas` masuk ke header/menu sekunder sesuai konteks.

## 9. Roadmap implementasi

### Sprint A — Context dan navigation

1. Tambahkan route ledger-aware untuk seluruh page utama.
2. Buat `LedgerContext` dan permission model.
3. Ganti `window.location.href` dengan `useNavigate`/`Link`.
4. Kurangi bottom nav menjadi maksimal 5 item.
5. Pindahkan logout ke account menu.

### Sprint B — UI primitives dan accessibility

1. Buat semantic tokens.
2. Buat primitives Button/Card/Field/Alert/StatusBadge/Icon.
3. Standarkan min-height kontrol ke 44 px.
4. Tambahkan skip link dan `main` id.
5. Tambahkan explicit label, error summary, focus management, dan live region terarah.

### Sprint C — Receipt review

1. Buat receipt detail/review route.
2. Tambahkan preview, issue badge, item editor, total, dan FX panel.
3. Tambahkan confirm/retry/reprocess/manual fallback.
4. Tambahkan E2E scan → review → confirm.

### Sprint D — State dan performance

1. Tambahkan shared loading/error/empty/retry states.
2. Debounce search 250–300 ms dan batalkan request lama.
3. Persist/load chat thread dengan jelas.
4. Optimalkan chart untuk mobile.
5. Ukur LCP, INP, CLS, dan bundle size.

## 10. Acceptance criteria

- [X] Ledger aktif pada URL selalu sama dengan data yang ditampilkan.
- [X] Tidak ada full reload saat berpindah ledger.
- [X] Bottom navigation maksimal 5 item dan semua target sentuh ≥44 px.
- [X] Semua body text normal lulus kontras ≥4.5:1.
- [X] Semua icon berasal dari satu sistem SVG dan memiliki semantic label yang tepat.
- [X] Semua page API memiliki loading, empty, error, dan retry state.
- [X] Search memakai debounce dan tidak menampilkan hasil request yang stale.
- [X] Scan dapat mencapai review, koreksi, confirm, retry, dan fallback manual.
- [X] Chat menampilkan status verifikasi dan tidak membuat thread baru tanpa alasan.
- [X] Tidak ada tabel atau chart yang overflow pada 320 px.
- [X] Keyboard flow, skip link, focus state, screen reader label, dan reduced motion lulus audit.
- [X] E2E mencakup ledger switching, scan review confirm, dan dua authenticated tracker contexts.

## 11. Kesimpulan

Fondasi frontend sudah cukup untuk iterasi produk berikutnya, tetapi belum layak disebut selesai sebagai mobile-first app sebelum konteks ledger, receipt review, navigation density, kontras, dan state handling diperbaiki. Prioritas tertinggi bukan menambah visual decoration, melainkan memastikan pengguna selalu berada di buku yang benar, dapat menyelesaikan scan sampai confirm, dan menerima feedback yang jelas pada setiap keadaan aplikasi.
