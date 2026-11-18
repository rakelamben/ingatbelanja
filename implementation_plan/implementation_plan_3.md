# Tahap 3 — Database, Migrasi, dan Penyimpanan Berkas

## Tujuan
Menyediakan database SQLite dan protokol berkas yang konsisten serta aman terhadap crash.

## Langkah
1. Buat koneksi SQLite dengan WAL, foreign key, busy timeout, dan transaksi eksplisit.
2. Buat migration runner berbasis `PRAGMA user_version`.
3. Buat tabel inti: akun, buku, anggota, kategori, struk, gambar, item, pipeline, job, activity, budget, dan chat.
4. Seed 13 mata uang dan 7 kategori sistem.
5. Buat utilitas UUID, waktu UTC, normalisasi teks, integer uang, dan `qty_milli`.
6. Implementasikan penulisan atomik `storage/tmp` → `os.replace` → database.
7. Tambahkan pembersihan file yatim dan tes migrasi.

## Verifikasi
Migrasi database kosong dan snapshot lama lulus; `foreign_key_check` dan integrity check kosong.

## Dependensi
`implementation_plan_2.md`.

## Output
Skema database, migration runner, seed, storage protocol, dan tes integritas.
