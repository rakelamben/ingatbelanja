# IngatBelanjaan — Rancangan UI/UX

**Status:** rancangan awal untuk ditinjau  
**Acuan:** `IngatBelanjaan_prd.md` v1.0 dan `IngatBelanjaan_technical_design.md` v1.0  
**Bahasa:** Bahasa Indonesia  
**Target:** tampilan mobile pada browser; laptop/desktop hanya melalui `DesktopGate` atau `?desktop=1` untuk pengembangan.

> PRD dan TDD masih draf. Dokumen ini menerjemahkan requirement menjadi keputusan UX tanpa menambah scope produk.

## 1. Tujuan dan prinsip desain

### Tujuan

1. Pengguna dapat memfoto, memeriksa, dan menyimpan satu struk dalam median maksimal 30 detik.
2. Pengguna selalu memahami buku aktif: buku pribadi atau pelacak bersama.
3. Hasil OCR/AI selalu diperlakukan sebagai draf yang dapat diperiksa.
4. Setiap kegagalan memiliki pemulihan yang jelas: foto ulang, isi manual, koreksi, coba lagi, atau simpan hasil dasar.
5. Nominal, tanggal, mata uang, pengunggah, dan status selalu dapat ditelusuri.
6. Fitur AI transparan dan tidak menghalangi pencatatan tanpa AI.

### Prinsip

- **Cepat:** Scan adalah tindakan utama.
- **Review sebelum simpan:** struk foto tidak menjadi entri final sebelum pengguna menyimpan/mengonfirmasi.
- **Server sebagai sumber kebenaran:** data dimuat melalui React Router loader/action dan direvalidasi setelah mutasi.
- **Tanpa kejutan angka:** mismatch, kurs, mata uang ambigu, dan konversi selalu terlihat.
- **Scope jujur:** pelacak bukan split bill; Tanya AI hanya membaca; aplikasi berjalan lokal.
- **Mobile-first dan aksesibel:** dapat digunakan dengan satu tangan, keyboard, pembaca layar, zoom, dan reduced motion.

## 2. Persona dan kebutuhan

| Persona | Kebutuhan utama | Risiko UX | Ukuran berhasil |
|---|---|---|---|
| Rani, 22, mahasiswa | Mencatat cepat dan melihat kategori | Enggan mengetik; melewati hasil OCR yang salah | Median ≤30 detik dan ≤1 koreksi |
| Dimas, 24, koordinator trip | Mengelola pelacak dan total bersama | Menganggap fitur sebagai split bill | Buku aktif dan total diberi label jelas |
| Sinta, 21, bendahara | Menelusuri pengunggah dan ekspor | Membutuhkan audit trail | Pengunggah, riwayat, dan ekspor mudah ditemukan |

## 3. Arsitektur informasi

```text
Akun lokal
└── Aplikasi
    ├── Buku pribadi (otomatis)
    │   ├── Beranda, Riwayat, Scan, Catat manual
    │   ├── Ringkasan, Anggaran, Tanya AI
    ├── Pelacak bersama (0..n)
    │   ├── Beranda, Riwayat, Scan, Catat manual
    │   ├── Ringkasan, Anggaran, Aktivitas, Pengaturan
    └── Akun
```

- Buku pribadi dibuat saat pendaftaran.
- Pelacak adalah buku terpisah dengan pemilik dan anggota.
- Setiap pengeluaran tepat berada di satu buku.
- Total pribadi tidak mencampur transaksi pelacak.
- Beranda pribadi boleh menampilkan kartu terpisah **Kontribusi saya di pelacak**.
- Jangan memakai istilah utang, saldo anggota, atau tagihan ke teman.

### Navigasi utama

Bottom navigation selalu konsisten:

1. **Beranda** — `/l/{ledgerId}`
2. **Riwayat** — `/l/{ledgerId}/receipts`
3. **Scan** — `/l/{ledgerId}/scan`, tombol utama di tengah
4. **Pelacak** — `/trackers`
5. **Tanya AI** — `/chat`, disembunyikan jika LLM tidak tersedia

Akun ada di menu header. Buku aktif ditentukan URL, bukan state global.

## 4. Peta rute

| Rute | Layar | Aksi/isi utama |
|---|---|---|
| `/` | Pengarah | Arahkan ke buku terakhir atau pribadi |
| `/login` | Masuk | Login, error umum, lockout |
| `/register` | Daftar | Akun lokal dan buku pribadi |
| `/l/:ledgerId` | Beranda buku | Total, anggaran, draf, struk terbaru |
| `/l/:ledgerId/receipts` | Riwayat | Cari, filter, thumbnail, buka detail |
| `/l/:ledgerId/receipts/:receiptId` | Detail/review | Koreksi, simpan, konfirmasi, proses ulang, hapus |
| `/l/:ledgerId/scan` | Scan | Kamera/galeri, kualitas, upload |
| `/l/:ledgerId/new` | Catat manual | Entri tanpa foto |
| `/l/:ledgerId/reports` | Ringkasan | Periode, kategori, tren, perbandingan |
| `/l/:ledgerId/budget` | Anggaran | Status dan pengaturan anggaran |
| `/l/:ledgerId/activity` | Riwayat perubahan | Audit pelacak |
| `/l/:ledgerId/settings` | Pengaturan buku | Anggota, undangan, kategori, keluar/hapus |
| `/trackers` | Daftar pelacak | Buat dan gabung dengan kode |
| `/chat` dan `/chat/:threadId` | Tanya AI | Chat baca-saja |
| `/account` | Akun | Password, consent AI, hapus akun, logout |
| `*` | Tidak ditemukan | Pesan umum tanpa membocorkan resource |

### DesktopGate

Pada `(pointer: fine) and (min-width: 1024px)` tampilkan:

- judul **Buka IngatBelanjaan di HP**;
- QR dari `/api/v1/meta/access-qr.svg`;
- alamat teks yang dapat disalin;
- instruksi memakai Wi-Fi yang sama;
- peringatan bahwa HTTP lokal hanya cocok untuk jaringan tepercaya.

`?desktop=1` hanya untuk pengembangan dan pengujian.

## 5. Shell dan layout

Urutan `AppShell`:

1. Skip link.
2. Header: nama aplikasi, `LedgerSwitcher`, menu akun, `WorkerBanner`.
3. `main` dengan satu `h1`.
4. Bottom navigation dengan safe-area inset.
5. `ToastHost`.

Konten memiliki lebar maksimum ponsel, padding horizontal 16 px, dan ruang bawah untuk bottom navigation. `LedgerSwitcher` menampilkan nama buku, badge **Pribadi/Pelacak**, mata uang, role, dan jumlah anggota.

## 6. User flow

### 6.1 Daftar dan masuk

**Daftar:** username → password → konfirmasi → submit → buku pribadi → beranda.

- Username 3–32 karakter; unik tanpa membedakan huruf besar/kecil.
- Password minimal 10 karakter; izinkan paste dan password manager.
- `USERNAME_TAKEN` muncul pada field username.

**Masuk:**

- `INVALID_CREDENTIALS`: **Username atau password salah.**
- Setelah lima kegagalan: **Akun dikunci sementara. Coba lagi dalam 15 menit.**
- Tidak ada pemulihan otomatis; tampilkan **Reset password dilakukan oleh admin lokal.**

### 6.2 Pelacak

1. Buka Pelacak.
2. Pilih **Buat pelacak** atau **Gabung dengan kode**.
3. Form buat berisi nama dan mata uang.
4. Setelah dibuat, pengaturan menampilkan tombol **Salin kode undangan**.
5. Kode invalid, kedaluwarsa, dicabut, atau habis memakai pesan yang sama.
6. Pemilik mengelola anggota; anggota non-pemilik dapat keluar tanpa menghapus entri lama.

### 6.3 Scan struk

```text
idle → picked → checking → lowQuality? → uploading → processing → done | error
```

1. Pilih **Ambil foto** atau **Pilih dari galeri**.
2. Browser mengompres foto dan memeriksa buram/kecerahan.
3. Jika rendah, pilih **Foto ulang** atau **Lanjutkan**.
4. Tandai **Tulisan tangan** bila relevan.
5. Upload memakai `Idempotency-Key` yang sama saat retry.
6. Tampilkan polling 1,5 detik lalu melambat sampai 3 detik; berhenti saat tab tersembunyi.
7. Status selesai mengarahkan ke halaman review.

Copy status:

- **Diproses:** “Struk sedang dibaca. Anda dapat kembali ke sini nanti.”
- **Siap diperiksa:** “Hasil siap diperiksa.”
- **Perlu dicek:** “Beberapa bagian perlu Anda periksa sebelum disimpan.”
- **Gagal:** “Pembacaan otomatis gagal. Isi data secara manual; foto tetap tersimpan.”

### 6.4 Review dan koreksi

Urutan layar mobile:

1. Status dan daftar isu.
2. Gambar `processed` yang dapat diperbesar.
3. Merchant, tanggal, mata uang, total.
4. Daftar item editable.
5. Pajak, biaya, diskon, dan kurs.
6. Total sticky.
7. Aksi **Simpan**, **Konfirmasi**, **Proses ulang**, **Hapus**.

Menekan/fokus `ItemRow` menyorot bbox terkait pada `ImagePane`. Bbox relatif 0–1 terhadap gambar yang sama. Confidence rendah diberi badge dan teks **Perlu diperiksa**, bukan warna saja.

`useReducer` menyimpan draf lokal. `PATCH` hanya dilakukan saat Simpan/Konfirmasi. `TOTAL_MISMATCH` adalah peringatan; `CURRENCY_AMBIGUOUS` dan `FX_RATE_NEEDED` harus diselesaikan sebelum konfirmasi. `STALE_EDIT` menawarkan **Muat ulang data terbaru**.

### 6.5 Catat manual

Urutan form: nominal, tanggal, merchant opsional, kategori opsional, mata uang opsional, catatan. Nominal dan tanggal wajib. Entri langsung confirmed setelah server berhasil.

### 6.6 Riwayat

- Kelompokkan berdasarkan tanggal pembelian.
- Tampilkan merchant, total mata uang buku, jumlah item, status, thumbnail, dan pengunggah untuk pelacak.
- Filter tanggal, kategori, nominal minimum/maksimum, dan pencarian item disimpan di URL search params.
- Pencarian debounce 300 ms.
- Gunakan tombol **Muat lagi**.
- Hapus menampilkan undo toast; pemulihan mengikuti izin dan masa 30 hari.

### 6.7 Ringkasan dan anggaran

Ringkasan menampilkan periode, total, jumlah struk, kategori terbesar, merchant teratas, grafik SVG sederhana, dan perbandingan periode sebelumnya.

Anggaran menampilkan terpakai vs batas, nominal, persentase, dan status:

- **Aman** — di bawah 80%
- **Mendekati batas** — 80% sampai kurang dari 100%
- **Melewati batas** — 100% atau lebih

### 6.8 Tanya AI

- Sembunyikan tab jika `LLM_PROVIDER=none` atau layanan tidak tersedia.
- Tampilkan consent sebelum penggunaan pertama.
- Jelaskan bahwa gambar, username, catatan, dan ID internal tidak dikirim.
- Jawaban hanya membaca; tidak ada tombol edit dari chat.
- Render tabel dari blok terstruktur server, bukan Markdown.
- Tampilkan **Angka diverifikasi dari data tersimpan** jika `verified=true`.
- Data kosong dijawab apa adanya; pertanyaan di luar keuangan ditolak singkat.

## 7. Sistem komponen

| Komponen | Ketentuan |
|---|---|
| `Button` | Primary/secondary/quiet/danger; loading; target minimal 44 px |
| `Field` | Label, hint, error, `aria-describedby`, `aria-invalid` |
| `MoneyInput` | Format `id-ID`, integer minor unit, mata uang jelas |
| `DateInput` | Nilai `YYYY-MM-DD`, tanpa pergeseran timezone |
| `Sheet`/`Dialog` | Native `<dialog>`, focus trap, Escape, focus return |
| `Toast` | `role=status` untuk info/sukses, `role=alert` untuk error |
| `EmptyState` | Judul, alasan, satu aksi utama |
| `ErrorState` | Ringkasan, pemulihan, request ID di detail bantuan |
| `Spinner` | Selalu disertai label teks |
| `IssueBadge` | Kode diubah menjadi pesan pengguna |
| `Money`/`DateText` | Formatter terpusat |
| `WorkerBanner` | Worker tidak siap; tidak memblokir jalur manual |

Komponen fitur: `ReceiptList`, `FilterBar`, `DraftList`, `ScanFlow`, `ManualForm`, `ReceiptReviewPage`, `ImagePane`, `BBoxOverlay`, `ItemList`, `FxPanel`, `TotalsBar`, `TrackerList`, `InviteManager`, `CategoryManager`, `ActivityFeed`, `SummaryCards`, `BudgetMeter`, `ChatThread`, dan `BlockTable`.

## 8. Visual direction dan design tokens

Gaya visual harus tenang, praktis, dan tepercaya. Gunakan ruang putih, kontras kuat, dan aksen hijau/teal secukupnya; hindari dashboard dekoratif.

| Token | Nilai awal | Fungsi |
|---|---|---|
| Canvas | `#F8FAFC` | Latar |
| Surface | `#FFFFFF` | Card/form/dialog |
| Text | `#172033` | Teks utama |
| Muted | `#526174` | Teks sekunder |
| Primary | `#087F5B` | Aksi/link/status aman |
| Warning | `#9A6700` | Isu dan 80% |
| Danger | `#B42318` | Gagal/hapus/100% |
| Info | `#175CD3` | Status informasi |
| Radius | 8/12/16 px | sm/md/lg |
| Spacing | kelipatan 4 px | Gap/padding |
| Touch | minimum 44 px | Kontrol interaktif |

Kontras teks normal minimal 4,5:1; teks besar dan komponen UI minimal 3:1. Status tidak boleh hanya dibedakan dengan warna.

## 9. Status, isu, dan error recovery

### Status struk

| Status | Tampilan | Aksi |
|---|---|---|
| `processing` | Spinner, pesan proses, durasi | Tunggu atau kembali |
| `ready` | Badge siap | Buka review |
| `needs_attention` | Peringatan dan daftar isu | Koreksi |
| `failed` | Error dan foto tetap tersedia | Isi manual/proses ulang |
| `confirmed` | Tersimpan | Edit/hapus sesuai izin |

### Issue copy

| Kode | Pesan | Pemulihan |
|---|---|---|
| `LOW_QUALITY_IMAGE` | Foto buram atau terlalu gelap | Foto ulang/lanjutkan |
| `LOW_OCR_CONF` | Sebagian teks kurang yakin | Periksa field bertanda |
| `TOTAL_MISMATCH` | Total berbeda dari item | Periksa item, pajak, diskon |
| `CURRENCY_AMBIGUOUS` | Mata uang tidak pasti | Pilih mata uang |
| `FX_RATE_NEEDED` | Kurs belum tersedia | Isi kurs manual/ubah mata uang |
| `DUPLICATE_SUSPECT` | Struk mirip dengan entri lain | Buka pembanding; tetap boleh simpan |
| `LLM_UNAVAILABLE`/`LLM_FALLBACK` | Pembacaan lanjutan tidak tersedia | Koreksi hasil dasar |
| `HANDWRITTEN` | Tulisan tangan perlu diperiksa | Koreksi field penting |
| `PROCESSING_TIMEOUT` | Pembacaan terlalu lama | Proses ulang/isi manual |
| `EXTRACTION_FAILED` | Data tidak berhasil dibaca | Isi manual |

### Pemetaan HTTP

| Kondisi | Perilaku UI |
|---|---|
| 401 | Arahkan ke login dengan `next` aman |
| 403 CSRF | Ambil ulang `/auth/me`, ulang sekali |
| 404 | Halaman tidak ditemukan tanpa membedakan resource |
| 409 `STALE_EDIT` | Muat ulang atau batalkan perubahan lokal |
| 409 `NEEDS_RESOLUTION` | Fokus ke isu wajib |
| 422 | Error per field dan ringkasan di atas form |
| 429/503 | Pesan coba lagi dan countdown `Retry-After` |
| Timeout/jaringan | Tombol coba lagi; tidak ada antrean offline |
| Tak terduga | Pesan umum dan `request_id` |

Sediakan empty state untuk buku kosong, riwayat kosong, filter tanpa hasil, laporan kosong, chat baru, belum ada budget, dan activity log kosong.

## 10. Mata uang dan angka

- Nominal utama memakai mata uang buku.
- Detail mata uang asing menampilkan nilai asli, mata uang asli, kurs, tanggal kurs yang sebenarnya dipakai, sumber kurs, dan hasil konversi.
- Jangan mengganti kurs diam-diam ke tanggal lain.
- `MoneyInput` memakai integer minor unit; tidak memakai float.
- Total sementara di client hanya untuk tampilan; server tetap otoritas.

## 11. Aksesibilitas dan responsive behavior

- Gunakan HTML semantik, `lang="id"`, heading berurutan, label form eksplisit, skip link, dan `aria-current`.
- Icon-only button wajib memiliki accessible name.
- Dialog mengelola fokus, dapat ditutup Escape, dan mengembalikan fokus.
- Error diumumkan lewat `role=alert`/`aria-live`; fokus ke error pertama.
- Target interaktif minimal 44×44 px dan tidak ada aksi yang hanya membutuhkan drag.
- Bbox memiliki alternatif daftar item dan deskripsi teks.
- Grafik SVG memiliki ringkasan teks/tabel.
- Hormati `prefers-reduced-motion`.
- Uji keyboard, NVDA/TalkBack, zoom 200%, High Contrast, portrait, dan layar 320 px.

## 12. Privacy UX dan kendali data

Pemberitahuan sebelum fitur AI:

> **Tentang fitur AI**  
> Sebagian teks OCR dan data pengeluaran yang relevan dapat dikirim ke layanan Groq untuk membantu membaca struk dan menjawab pertanyaan. Foto struk, username, catatan, dan ID internal tidak dikirim. Jika tidak setuju, Anda tetap dapat memakai pembacaan dasar dan pencatatan manual.

Tombol: **Saya mengerti dan setuju** / **Gunakan tanpa AI**.

- Hapus struk menjelaskan bahwa foto dan data terkait ikut masuk proses penghapusan.
- Hapus akun meminta password dan menjelaskan dampak buku pribadi/pelacak.
- Akun tidak boleh dihapus bila masih menjadi pemilik pelacak dengan anggota lain.
- Logout menghapus sesi dan kembali ke login.
- Foto hanya dapat diakses anggota buku melalui endpoint terotorisasi.
- HTTP lokal diberi peringatan untuk memakai jaringan tepercaya.

## 13. Requirement mapping

| Requirement | Cakupan UI/UX |
|---|---|
| R1 Akun lokal | Login, daftar, logout, lockout, reset admin, error umum |
| R2 Buku/pelacak | LedgerSwitcher, buat/gabung kode, anggota, keluar/hapus |
| R3 Scan | Kamera/galeri, kompresi, quality check, polling, fallback |
| R4 Review | Edit field/item, bbox, confidence, mismatch, confirm |
| R5 Manual | `/new`, validasi nominal/tanggal, confirmed langsung |
| R6 Kategori | Picker, manager, kategori custom, fallback belum dikategorikan |
| R7 Mata uang | FxPanel, kurs, tanggal kurs, input manual |
| R8 Riwayat | Search/filter URL, detail foto, pagination, soft delete/restore |
| R9 Pelacak | Uploader, role action, visibilitas, kontribusi terpisah |
| R10 Ketahanan | Worker banner, rules/manual fallback, retry, timeout, idempotensi |
| R11 Privasi | Consent, informasi data, hapus struk/foto/akun |
| P1 Tanya AI | Chat read-only, quota, unavailable, verified number |
| P1 Anggaran | Meter dan ambang 80%/100% |
| P1 Ringkasan | Period picker, kategori, tren, perbandingan |
| P1 Ekspor | CSV/PDF, success/error, limit 5.000 baris |
| P1 Activity | Actor, action, waktu pada pelacak |
| P2 | Layout tidak menghalangi dark mode, multi-bahasa, multi-foto, copy ke pribadi |

## 14. Acceptance checklist

### P0

- [ ] Daftar membuat buku pribadi dan mengarahkan ke beranda.
- [ ] Login gagal memakai pesan umum; lockout aktif setelah lima kegagalan.
- [ ] Pelacak dapat dibuat, dibagikan melalui kode, dan diikuti anggota.
- [ ] Scan mendukung kamera/galeri dan memberi pilihan saat kualitas rendah.
- [ ] Retry foto yang sama tidak membuat duplikasi.
- [ ] Semua status struk terlihat tanpa bergantung pada warna.
- [ ] Review dapat mengedit semua field, menambah/menghapus item, dan menyorot bbox.
- [ ] Total mismatch tidak diubah diam-diam.
- [ ] Mata uang ambigu dan kurs kosong memiliki jalur penyelesaian.
- [ ] Catat manual dapat disimpan tanpa foto.
- [ ] Riwayat memiliki pencarian, filter, detail, hapus sementara, dan pulihkan.
- [ ] Pengunggah terlihat di pelacak; draf pribadi tidak terlihat anggota lain.
- [ ] Pencatatan tetap berjalan tanpa AI/internet.
- [ ] Consent AI tampil sebelum pengiriman data.
- [ ] Alur utama lulus keyboard, screen reader, zoom 200%, dan layar 320 px.

### P1

- [ ] Tanya AI tidak memunculkan angka di luar hasil tool.
- [ ] Tab Tanya AI tersembunyi saat LLM tidak tersedia.
- [ ] Anggaran membedakan aman, 80%, dan 100%.
- [ ] Ringkasan dan laporan memakai angka dari server.
- [ ] Ekspor CSV/PDF memberi feedback dan menangani limit.
- [ ] Activity feed menampilkan pelaku, aksi, dan waktu.

## 15. Usability testing

Uji 5–8 peserta dengan HP nyata dan jaringan lokal. Amati strategi, bukan hanya apakah tugas selesai.

| Tugas | Yang diamati |
|---|---|
| Daftar dan scan satu struk | Waktu, koreksi, kebingungan status |
| Perbaiki total mismatch | Pemahaman warning dan aksi simpan |
| Catat parkir tanpa foto | Penemuan Catat manual dan validasi |
| Buat pelacak dan gabung | Pemahaman kode, role, bukan split bill |
| Cari pengeluaran makan bulan ini | Pemahaman search/filter |
| Tanya total kopi | Consent, read-only, kepercayaan angka |

Ukur waktu foto sampai tersimpan, jumlah koreksi, task completion, error recovery, pemahaman buku vs pelacak, dan SUS. Target PRD: median ≤30 detik, koreksi ≤1, task completion ≥90%, SUS ≥70.

## 16. Risiko dan keputusan terbuka

1. Tenggat dan format penilaian kuliah belum diketahui.
2. Versi Python dan ketersediaan OCR di mesin demo perlu diverifikasi pada fase spike.
3. Perlu keputusan apakah peserta usability menyetujui pengiriman teks ke Groq atau pengujian memakai `LLM_PROVIDER=none`.
4. Target akurasi tulisan tangan belum ditetapkan.
5. Groq, Frankfurter, dan worker dapat gagal; fallback manual wajib diuji.
6. Karena PRD/TDD masih draf, perubahan scope harus memperbarui mapping dan checklist.

## 17. Catatan implementasi frontend

- Gunakan React Router data mode: `loader`, `action`, `errorElement`, dan lazy route.
- Jangan menambah global state/cache runtime untuk data keuangan.
- Filter/periode berada di URL search params.
- Token CSRF hanya di memori; jangan simpan token/data finansial di storage browser.
- Pusatkan copy di `frontend/src/lib/strings.ts`.
- Grafik dibuat sebagai SVG sendiri dengan alternatif teks.
- Jangan gunakan `dangerouslySetInnerHTML`; AI berupa teks polos dan blok tabel.
- Sebelum implementasi visual, lakukan spike foto nyata dan verifikasi kontrak OpenAPI.
