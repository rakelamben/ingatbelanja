# IngatBelanjaan — Product Requirements Document (PRD)

Versi 1.0 (draf untuk ditinjau) · 18 November 2026 · Dokumen ini membahas sisi pengguna dan bisnis. Rancangan teknis ada di TDD yang dibuat terpisah.

## 1. Ringkasan

IngatBelanjaan adalah aplikasi web dengan tampilan mobile yang mengubah foto struk atau kuitansi menjadi catatan pengeluaran yang rapi dan mudah dibaca, baik untuk keuangan pribadi maupun pengeluaran kelompok (trip, proyek kuliah, kepanitiaan). Pengguna cukup memfoto, memeriksa hasil bacaan, lalu menyimpan.

Proyek ini adalah **tugas kuliah sekaligus portofolio**, bersifat open source, dan berjalan di komputer lokal. Tidak ada rencana rilis publik. Karena itu ukuran keberhasilannya bukan pendapatan atau jumlah pengguna, melainkan: sistem benar-benar berjalan dengan andal, hasilnya bisa didemokan, dan repositori bisa dijalankan ulang oleh orang lain.

## 2. Pernyataan masalah

Orang usia produktif ingin tahu uangnya habis ke mana, tetapi mencatat pengeluaran secara manual melelahkan sehingga catatan sering berhenti setelah beberapa hari. Untuk pengeluaran kelompok masalahnya bertambah: struk tersebar di banyak orang dan tidak ada satu tempat bersama untuk melihat total pengeluaran trip atau acara. Struk fisik juga mudah hilang atau pudar.

Akibatnya pengeluaran tidak terpantau, anggaran jebol tanpa disadari, dan bendahara kelompok harus merekap manual.

*Catatan bukti:* belum ada riset pengguna maupun data kuantitatif. Uraian di atas adalah hipotesis yang akan divalidasi lewat uji kegunaan kecil (bagian 9).

## 3. Pengguna sasaran

Usia produktif (kira-kira mahasiswa hingga pekerja awal karier) yang mengatur uang sendiri atau bersama kelompok. Tiga persona fiktif:

| Persona | Konteks | Kebutuhan utama |
| --- | --- | --- |
| **Rani**, 22, mahasiswa | Mengatur uang bulanan pribadi | Mencatat cepat tanpa mengetik; tahu pengeluaran per kategori |
| **Dimas**, 24, koordinator trip | Mengelola pengeluaran trip 8 orang | Satu tempat bersama untuk semua struk; total terkini; tanpa hitung utang di aplikasi |
| **Sinta**, 21, bendahara kepanitiaan atau proyek kuliah | Merekap pengeluaran acara dan tugas kelompok | Anggota bisa mengunggah sendiri; bisa ditelusuri siapa mengunggah apa; ekspor untuk laporan |

## 4. Tujuan

**Tujuan pengguna**

1. Mencatat satu struk cetak dari foto sampai tersimpan dalam median ≤ 30 detik, dengan median ≤ 1 koreksi per struk.
2. Melihat pengeluaran bersama kelompok di satu tempat yang sama bagi semua anggota, tanpa konsep utang atau pembagian biaya.
3. Mendapat jawaban atas pertanyaan tentang pengeluaran sendiri dalam bahasa sehari-hari, dengan angka yang selalu cocok dengan data tersimpan.

**Tujuan proyek (akademik dan portofolio)** 4. Sistem berjalan end-to-end dan lolos seluruh tes otomatis; evaluasi akurasi ekstraksi terdokumentasi. 5. Orang lain dapat menjalankan repositori dari nol dalam ≤ 15 menit dengan mengikuti README. 6. Keterbatasan sistem (misalnya tulisan tangan) tercatat jujur beserta angka terukurnya.

## 5. Bukan tujuan (non-goals)

- **Split bill dan utang-piutang.** Konsepnya hanya melacak pengeluaran bersama. Alasan: keputusan produk, dan kompleksitasnya besar serta di luar masalah inti.
- **Rilis publik, hosting, atau layanan multi-pengguna skala besar.** Aplikasi hanya berjalan lokal.
- **Aplikasi native, PWA, notifikasi push, dan email.** Cukup web dengan tampilan mobile.
- **Integrasi bank, e-wallet, atau impor mutasi.** Sumber data hanya foto dan input manual.
- **Pembacaan tulisan tangan yang akurat.** Didukung sebatas upaya terbaik dan dicatat sebagai keterbatasan.
- **Struk panjang multi-foto dan tampilan selain Bahasa Indonesia.** Ditunda.

## 6. Gambaran produk

**Konsep inti: buku.** Setiap pengguna punya satu buku pribadi. Pelacak (trip, proyek, kepanitiaan) adalah buku terpisah yang dibagi dengan anggotanya. Setiap pengeluaran milik tepat satu buku. Total pribadi tidak otomatis menyertakan pengeluaran di pelacak; halaman pribadi menampilkan kartu terpisah bertuliskan pengeluaran yang diunggah pengguna di pelacak.

Alur fitur: akun lokal → buku (pribadi dan pelacak) → scan struk → review dan koreksi → catat manual → kategori → mata uang → riwayat dan pencarian → anggaran → ringkasan → Tanya AI → ekspor.

## 7. Cerita pengguna

**Rani — pengeluaran pribadi**

1. Sebagai Rani, aku ingin memfoto struk dan melihat isinya terbaca otomatis agar tidak perlu mengetik tiap barang.
2. Sebagai Rani, aku ingin memeriksa dan memperbaiki hasil bacaan sebelum disimpan agar catatanku akurat.
3. Sebagai Rani, aku ingin mencatat pengeluaran tanpa struk (parkir, sumbangan, tips) agar semua pengeluaran tercatat.
4. Sebagai Rani, aku ingin melihat pengeluaran per kategori dan per bulan agar tahu ke mana uangku pergi.
5. Sebagai Rani, aku ingin bertanya berapa pengeluaran kopiku bulan ini agar tidak perlu menelusuri daftar. (P1)
6. Sebagai Rani, aku ingin menetapkan anggaran bulanan agar tahu kapan hampir melampauinya. (P1)

**Dimas — koordinator trip** 7. Sebagai Dimas, aku ingin membuat pelacak Trip Bali dan mengundang teman dengan kode agar semua mencatat di satu tempat. 8. Sebagai Dimas, aku ingin memilih mata uang pelacak agar struk berbahasa asing dikonversi otomatis. 9. Sebagai Dimas, aku ingin menghapus entri yang keliru milik siapa pun di pelacakku agar catatan tetap bersih. 10. Sebagai Dimas, aku ingin melihat riwayat perubahan agar tahu siapa mengubah apa. (P1)

**Sinta — bendahara** 11. Sebagai Sinta, aku ingin melihat siapa yang mengunggah tiap pengeluaran agar bisa menelusuri asalnya. 12. Sebagai Sinta, aku ingin mengekspor pengeluaran pelacak ke CSV atau PDF agar bisa masuk laporan. (P1) 13. Sebagai anggota, aku ingin keluar dari pelacak kapan saja tanpa merusak entri yang sudah kukirim agar catatan kelompok tetap utuh.

**Kasus tepi (semua pengguna)** 14. Saat foto buram atau gelap, aku ingin diberi tahu dan diminta foto ulang atau mengisi manual. 15. Saat layanan AI atau internet tidak tersedia, aku ingin tetap bisa menyimpan struk dengan hasil dasar atau manual. 16. Saat struk yang sama diunggah dua kali, aku ingin diperingatkan tanpa dilarang. 17. Saat simbol mata uang ambigu (misalnya $), aku ingin diminta mengonfirmasi mata uangnya.

## 8. Persyaratan

### P0 — Wajib

**R1. Akun lokal.** Daftar dengan username dan password, masuk, dan keluar.

- [ ] Username unik tanpa membedakan huruf besar dan kecil
- [ ] Setelah 5 kali gagal masuk, akun terkunci 15 menit
- [ ] Keluar mengakhiri sesi
- [ ] Tidak ada email dan tidak ada pemulihan otomatis; reset password dilakukan admin

**R2. Buku dan pelacak.** Buku pribadi dibuat otomatis. Pengguna dapat membuat pelacak (nama, mata uang), mengundang lewat kode, dan keluar dari pelacak.

- Given pelacak sudah dibuat, When pemilik membagikan kodenya, Then pengguna lain yang punya akun dapat bergabung dan melihat seluruh entri.
- [ ] Kode undangan punya masa berlaku
- [ ] Anggota bisa keluar dan entri yang sudah dikirim tetap ada di pelacak
- [ ] Hanya pemilik yang dapat menghapus pelacak atau mengeluarkan anggota

**R3. Scan struk cetak.** Foto dari kamera atau galeri; sistem membaca merchant, tanggal, item (nama, jumlah, harga), pajak atau diskon, dan total.

- Given struk cetak yang jelas, When pengguna mengunggah foto, Then dalam median ≤ 10 detik muncul layar review berisi hasil bacaan.
- [ ] Status proses terlihat: diproses, siap diperiksa, perlu dicek, gagal
- [ ] Kegagalan total menawarkan isi manual dengan foto tetap terlampir
- [ ] Foto buram atau gelap memunculkan saran foto ulang

**R4. Review dan koreksi.**

- [ ] Semua field dapat diedit; item dapat ditambah dan dihapus
- [ ] Field berkeyakinan rendah ditandai
- [ ] Mengetuk item menyorot area terkait pada foto
- [ ] Total yang tidak cocok dengan jumlah item diberi peringatan dan tidak diubah diam-diam
- [ ] Struk baru tersimpan hanya setelah pengguna menekan Simpan

**R5. Catat manual.** Jumlah, tanggal, kategori (opsional), dan catatan, tanpa foto.

**R6. Kategori.** Tujuh kategori baku: Bahan makanan; Makan dan minum; Kesehatan; Transportasi; Pakaian; Peralatan dan perawatan rumah; Pengalaman hiburan. Ditambah status Belum dikategorikan. Pengguna dapat menambah kategori di buku pribadi, dan pemilik pelacak dapat menambah kategori milik pelacak.

- [ ] Kategori baku tidak bisa dihapus
- [ ] Menghapus kategori kustom memindahkan entrinya ke Belum dikategorikan
- [ ] Pengeluaran yang tidak cocok kategori mana pun tidak dipaksa masuk kategori yang salah

**R7. Mata uang.** Satu buku memakai satu mata uang. Struk bermata uang lain dikonversi dengan kurs pada tanggal pembelian; kurs dapat dikoreksi manual; simbol ambigu wajib dikonfirmasi.

- [ ] Detail entri menampilkan nilai asli, mata uang asli, kurs, dan hasil konversi
- [ ] Bila kurs tidak tersedia, pengguna diminta mengisinya manual (tidak diganti diam-diam dengan tanggal lain)

**R8. Riwayat dan pencarian.** Daftar per tanggal, filter (tanggal, kategori, rentang nominal), pencarian nama item, dan foto struk dapat dibuka.

**R9. Pelacak bersama.** Anggota mengunggah, semua anggota melihat, tiap entri menampilkan pengunggahnya.

- Given Dimas dan Sinta anggota pelacak yang sama, When Sinta mengunggah struk, Then Dimas melihatnya di pelacak dan total pribadi Sinta tidak berubah.
- [ ] Pengunggah mengedit dan menghapus entri miliknya; pemilik pelacak dapat menghapus entri apa pun; anggota lain hanya melihat
- [ ] Penghapusan bersifat sementara dan tercatat siapa yang menghapus
- [ ] Tidak ada fitur utang, pembagian biaya, atau saldo

**R10. Ketahanan.** Tanpa layanan AI atau internet, aplikasi tetap bisa menyimpan hasil dasar atau input manual.

- [ ] Struk tidak menggantung selamanya di status diproses
- [ ] Unggah ulang akibat koneksi putus tidak membuat entri ganda

**R11. Privasi dan kendali data.** Data dan foto tersimpan di komputer lokal. Pengguna diberi tahu bahwa teks struk dikirim ke layanan AI pihak ketiga untuk ekstraksi dan Tanya AI.

- [ ] Pemberitahuan tampil saat pertama kali memakai fitur AI
- [ ] Pengguna dapat menghapus struk beserta fotonya, dan menghapus akunnya
- [ ] Entri pengguna yang dihapus di pelacak bersama tetap ada dengan pengunggah tertulis pengguna dihapus

### P1 — Sebaiknya (dibangun setelah P0 stabil, tetap dalam lingkup proyek)

**Tanya AI (hanya membaca).** Pertanyaan bahasa alami tentang pengeluaran pengguna.

- Given Rani punya 12 entri kopi bulan ini, When ia menanyakan total kopi bulan ini, Then jawaban memuat total yang persis sama dengan jumlah entri tersebut.
- [ ] Jika data tidak ada, jawabannya tidak ada; sistem tidak mengarang
- [ ] Pertanyaan di luar topik keuangan pengguna ditolak dengan sopan
- [ ] Tidak ada kemampuan mengubah data
- [ ] Ada batas penggunaan harian

**Anggaran.** Per buku per bulan; peringatan di dalam aplikasi pada 80% dan 100%.

**Ringkasan dan laporan.** Ringkasan per kategori dan periode, perbandingan dengan periode sebelumnya, narasi singkat yang angkanya sama dengan data.

**Ekspor.** CSV dan PDF untuk buku pribadi maupun pelacak.

**Riwayat perubahan terlihat anggota.** Siapa mengubah atau menghapus apa, dan kapan.

**Peringatan duplikat** dan **data demo** agar orang lain langsung bisa mencoba.

### P2 — Pertimbangan masa depan (tidak dibangun sekarang, tapi tidak boleh dihalangi oleh desain)

- Salin pengeluaran pelacak ke buku pribadi
- Struk panjang multi-foto
- Tautan ringkasan agregat tanpa transaksi individual
- Cadangan pembacaan visual untuk foto yang buruk
- Tema gelap dan tampilan multi-bahasa

## 9. Metrik keberhasilan

Target di bawah adalah hipotesis awal, bukan patokan industri; kalibrasi ulang setelah fase spike.

| Metrik | Target (sukses) | Stretch | Cara ukur | Kapan |
| --- | --- | --- | --- | --- |
| Waktu foto sampai tersimpan (median) | ≤ 30 dtk | ≤ 20 dtk | Uji kegunaan 5–8 orang dengan stopwatch | Setelah UI jadi |
| Koreksi per struk (median) | ≤ 1 | 0 | Pencatatan koreksi di sistem + uji kegunaan | Sama |
| Akurasi struk cetak: total persis, tanggal | ≥ 95% | ≥ 98% | Evaluasi pada set struk uji (sintetis + sampel nyata) | Tiap perubahan pipeline |
| Akurasi item (nama + nominal, F1) | ≥ 85% | ≥ 90% | Set struk uji yang sama | Sama |
| Kegagalan total pada struk cetak | ≤ 5% | ≤ 2% | Set struk uji | Sama |
| Penyelesaian tugas uji | ≥ 90% | 100% | 6 tugas berskrip pada uji kegunaan | Setelah UI jadi |
| Kebenaran Tanya AI | ≥ 90% dari 30 pertanyaan baku, 0 angka tak cocok data | 95% | Set pertanyaan baku | Setelah P1 |
| Skor kegunaan (SUS) | ≥ 70 | ≥ 80 | Kuesioner SUS setelah uji | Akhir uji kegunaan |
| Setup oleh orang lain | ≤ 15 menit, minimal 3 orang berhasil | ≤ 10 menit | Uji README dengan 3 orang | Sebelum rilis open source |
| Tes otomatis | Seluruhnya lulus | Cakupan jalur kritis terdokumentasi | Hasil CI | Tiap perubahan |

## 10. Risiko dan asumsi

- **Akurasi pembacaan struk Indonesia belum terbukti.** Mitigasi: fase spike dengan gerbang lanjut (total dan tanggal ≥ 90% pada 50 struk).
- **Tulisan tangan kemungkinan tidak memenuhi target.** Mitigasi: dicatat sebagai keterbatasan dengan angka terukur, selalu masuk ke layar review.
- **Ketergantungan pada layanan AI pihak ketiga** (internet, batas gratis, privasi). Mitigasi: mode fallback dan pemberitahuan ke pengguna.
- **Berjalan di satu mesin lokal.** Demo multi-pengguna butuh perangkat lain di jaringan yang sama.
- **Masalah belum divalidasi dengan pengguna nyata.** Mitigasi: uji kegunaan kecil.

## 11. Pertanyaan terbuka

| # | Pertanyaan | Penjawab | Jenis |
| --- | --- | --- | --- |
| 1 | Apa kriteria penilaian dan tenggat tugas kuliah (format laporan, ada demo langsung atau tidak, batas lingkup)? | Dosen atau pembimbing | Blocking |
| 2 | OS dan versi Python di mesin demo; apakah paket OCR tersedia untuk platform itu? | Teknis (fase spike) | Blocking |
| 3 | Siapa 5–8 peserta uji kegunaan dan kapan dilaksanakan? | Pemilik produk | Non-blocking |
| 4 | Apakah peserta uji menerima teks struk dikirim ke layanan AI pihak ketiga, atau perlu mode tanpa AI sepenuhnya? | Pemilik produk | Non-blocking |
| 5 | Apakah tulisan tangan perlu target akurasi minimum, atau cukup dicatat apa adanya setelah ada data? | Pemilik produk | Non-blocking |
| 6 | Apakah PRD ini dilampirkan di laporan kuliah dan perlu format tertentu? | Dosen | Non-blocking |

## 12. Pertimbangan jadwal dan fase

Belum ada tenggat pasti (pertanyaan terbuka 1). Fase yang diusulkan:

- **Fase 0 — Spike:** uji pembacaan struk, layanan AI, dan penyimpanan lokal pada 50 struk. Gerbang lanjut: total dan tanggal ≥ 90%.
- **Fase 1 — Inti backend dan API (P0),** tanpa tampilan.
- **Fase 2 — P1:** Tanya AI, anggaran, ringkasan, ekspor, riwayat perubahan.
- **Fase 3 — Lapisan tampilan mobile dan uji kegunaan.**
- **Fase 4 — Rilis open source:** README, lisensi, data demo, dokumentasi keterbatasan.

Ketergantungan: tenggat kuliah (belum diketahui), ketersediaan paket OCR di mesin demo, dan batas layanan AI gratis. Urutan backend dulu dan tampilan belakangan sudah menjadi keputusan.

## Lampiran — Keputusan produk yang sudah ditetapkan

- Aplikasi web dengan tampilan mobile, berjalan lokal, tanpa publikasi, PWA, atau aplikasi native
- Akun lokal (username dan password), tanpa email
- Pelacak adalah buku terpisah; tanpa split bill; setiap entri milik satu buku; pengunggah mengelola entrinya dan pemilik dapat menghapus apa pun; anggota yang keluar tidak menghapus entrinya
- Satu buku satu mata uang; kurs pada tanggal pembelian; kurs boleh dikoreksi manual
- Tujuh kategori baku ditambah kategori kustom; status kosong untuk yang tidak cocok
- Tulisan tangan menjadi keterbatasan sistem yang didokumentasikan
- Tanya AI hanya membaca data
- Backend dan API lebih dulu, tampilan belakangan
- Open source dengan lisensi Apache-2.0