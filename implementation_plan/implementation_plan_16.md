# Tahap 16 — Evaluasi, Dokumentasi, Demo, dan Rilis Open Source

## Tujuan
Menyiapkan aplikasi yang dapat dievaluasi, dijalankan ulang, didemokan, dicadangkan, dan dirilis secara aman.

## Langkah
1. Jalankan evaluasi OCR pada dataset standar dan bandingkan baseline.
2. Buat data demo dengan `tasks.py demo`.
3. Uji backup dan restore.
4. Lengkapi README, setup Windows, firewall, privasi, operasi harian, dan known limitations.
5. Lakukan usability test 5–8 orang; ukur waktu, koreksi, task completion, dan SUS.
6. Uji setup README oleh minimal tiga orang.
7. Audit secret, storage, database lokal, fixture private, dan `.env` agar tidak masuk Git.
8. Selesaikan checklist Apache-2.0 dan laporan keterbatasan.

## Quality gate
- Total/tanggal ≥95%, F1 item ≥85%, failure ≤5% pada dataset cetak.
- Tanya AI ≥90% benar dan tidak ada angka tak cocok.
- Setup orang lain ≤15 menit.
- Seluruh required tests dan CI lulus.
- Dokumentasi menjelaskan tulisan tangan, HTTP lokal, fallback AI, dan batasan multi-foto.

## Dependensi
`implementation_plan_15.md`.

## Output
Release candidate, laporan evaluasi, data demo, dokumentasi operasional, backup test, dan checklist open source.

## Risiko terakhir
Regresi OCR, kebocoran data lokal, dokumentasi tidak dapat diikuti, atau hasil usability di bawah target. Semua harus dicatat sebagai blocker atau accepted limitation sebelum rilis.
