# Tahap 13 — Frontend Receipt, Buku, Pelacak, dan Riwayat

## Tujuan
Membangun UI P0 untuk buku, scan, review, manual entry, tracker, dan history.

## Langkah
1. Buat beranda buku dan `LedgerSwitcher`.
2. Buat daftar receipt, draft list, filter, search, pagination, dan thumbnail.
3. Buat scan flow, kompresi, quality check, dan idempotency key.
4. Buat polling processing dan worker warning.
5. Buat review reducer, item editor, bbox overlay, issue badge, total, dan FX panel.
6. Buat manual entry.
7. Buat tracker list, create/join, member, invite, category, dan settings.
8. Terapkan izin aksi pada UI dan error recovery.

## Verifikasi
Component tests, accessibility tests, dan E2E daftar → scan → review → confirm serta tracker dua konteks.

## Dependensi
`implementation_plan_12.md`, tahap backend 6–10, dan OpenAPI generated types.

## Output
Frontend P0 lengkap untuk receipt dan tracker.
