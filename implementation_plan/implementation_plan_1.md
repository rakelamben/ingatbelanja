# Tahap 1 — Validasi Keputusan dan Spike Teknis

## Tujuan
Memastikan lingkungan Windows 11, OCR, preprocessing, parser aturan, dan jalur worker layak sebelum fondasi aplikasi dibangun.

## Langkah
1. Catat keputusan terbuka: tenggat, OS demo, persetujuan pengiriman teks ke Groq, target tulisan tangan, dan peserta uji.
2. Buat struktur repo awal serta dokumen keputusan teknis.
3. Verifikasi Python 3.12, SQLite ≥3.35, OpenCV, Pillow/HEIC, PaddleOCR, dan worker.
4. Buat ±50 struk sintetis/nyata berlabel.
5. Jalankan pipeline minimal preprocessing → OCR → parser → validasi total/tanggal.
6. Kalibrasi threshold awal dan catat hasil.

## Quality gate
- Akurasi total dan tanggal minimal 90% pada dataset spike.
- OCR dapat berjalan di CPU Windows sebagai baseline wajib; GPU NVIDIA boleh dipakai sebagai akselerasi opsional.
- Jika GPU diuji, device dan hasil benchmark CPU-vs-GPU dicatat; kegagalan GPU tidak boleh menghalangi jalur CPU.
- Jalur `FakeOCR` dan parser aturan dapat berjalan tanpa Paddle.

## Output
Laporan spike, dataset berlabel, konfigurasi OCR terpilih, dan keputusan go/no-go.

## Risiko
Paddle tidak stabil, dataset terlalu kecil, atau akurasi struk Indonesia tidak memadai. Jangan lanjut ke pipeline penuh sebelum gate lulus.
