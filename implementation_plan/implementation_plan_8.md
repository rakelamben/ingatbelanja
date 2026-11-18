# Tahap 8 — Upload Foto dan Pipeline Ekstraksi Dasar

## Tujuan
Membangun jalur foto → preprocessing → OCR → parser aturan → hasil draf.

## Langkah
1. Validasi tipe, ukuran, dimensi, metadata, HEIC, dan piksel.
2. Implementasikan upload dengan `Idempotency-Key` dan status receipt.
3. Simpan `original.jpg`, `processed.jpg`, dan `thumb.jpg` secara atomik.
4. Buat `OcrEngine`, `FakeOCR`, fixture, dan lazy-loaded PaddleOCR.
5. Implementasikan resize, quality check, deteksi kertas, perspective correction, deskew, CLAHE, dan bbox relatif.
6. Implementasikan pengelompokan baris OCR.
7. Buat parser merchant, tanggal, mata uang, nominal, item, pajak, diskon, dan total.
8. Implementasikan grounding, `TOTAL_MISMATCH`, confidence, duplicate warning, dan fallback manual.

## Verifikasi
Uji upload berbahaya, HEIC, metadata GPS, foto buruk, OCR fake, parser, bbox, status, dan fallback.

## Dependensi
`implementation_plan_7.md` dan hasil spike tahap 1.

## Output
Upload endpoint, preprocessing, OCR adapter, parser aturan, receipt draft, dan tes dasar.
