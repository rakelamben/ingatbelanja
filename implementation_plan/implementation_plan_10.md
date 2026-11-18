# Tahap 10 — Review, Koreksi, Riwayat, Pencarian, dan Ekspor

## Tujuan
Menyelesaikan lifecycle receipt dari draf sampai confirmed serta fitur pelaporan P1.

## Langkah
1. Buat detail receipt, PATCH koreksi, correction log, dan optimistic locking.
2. Buat confirm dengan validasi field wajib dan isu blocking.
3. Buat soft delete dan restore.
4. Buat riwayat cursor pagination, filter, dan pencarian aman.
5. Buat laporan kategori, hari, merchant, periode pembanding, dan kontribusi tracker.
6. Buat budget dengan status 80% dan 100%.
7. Buat CSV UTF-8 BOM dengan formula injection protection dan PDF.
8. Lengkapi activity history tracker.

## Verifikasi
Acceptance test untuk R4, R6, R7, R8, R9, laporan, anggaran, ekspor, konflik edit, dan soft delete.

## Dependensi
`implementation_plan_9.md`.

## Output
Receipt lifecycle, history/search, reports, budget, export, activity API, dan tes.
