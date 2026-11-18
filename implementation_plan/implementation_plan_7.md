# Tahap 7 — Pencatatan Manual, Mata Uang, dan Kurs

## Tujuan
Menyediakan jalur pencatatan yang selalu berjalan tanpa OCR/LLM serta konversi uang yang akurat.

## Langkah
1. Buat endpoint manual receipt dengan satu item.
2. Implementasikan `parse_amount` berbasis `Decimal`.
3. Gunakan integer minor unit dan `ROUND_HALF_UP`.
4. Integrasikan cache kurs Frankfurter.
5. Tangani kurs unavailable, kurs manual, dan tanggal kurs aktual.
6. Larang perubahan mata uang buku setelah memiliki struk.
7. Tampilkan nilai asli, kurs, tanggal, sumber, dan nilai buku.

## Verifikasi
Tes nominal IDR/desimal, pembulatan, cache, timeout, fallback manual, kurs akhir pekan, dan aturan mata uang buku.

## Dependensi
`implementation_plan_6.md`.

## Output
Manual receipt service, currency service, FX client/cache, dan tesnya.
