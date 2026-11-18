# Phase 1 Spike Report

**Tanggal eksekusi:** 19 November 2026  
**Lingkungan:** Windows, Python 3.12.0, Node.js 26.12.0  
**Status:** fondasi spike lulus; CPU menjadi baseline wajib dan GPU NVIDIA tersedia sebagai mode opsional. Evaluasi akurasi OCR 50 gambar penuh masih opt-in karena durasi CPU sangat panjang.

## Environment

| Komponen | Hasil |
|---|---|
| Python | 3.12.0 — PASS |
| Pillow | 11.3.0 — PASS |
| NumPy | 2.2.6 — PASS |
| OpenCV headless | 4.12.0.88 — PASS |
| PaddlePaddle | 3.2.0 — PASS |
| PaddleOCR | 3.7.0 — PASS |
| pillow-heif | 1.1.1 — PASS |
| `pip check` | PASS; tidak ada dependency rusak |
| `python -m compileall -q spike` | PASS |

## Prototype yang dibuat

- `generate_dataset.py` membuat 50 fixture struk sintetis deterministik dengan seed tetap.
- `run_spike.py` melakukan resize, quality check, deteksi kertas, perspective correction, deskew residual, dan thumbnail.
- `parser.py` menguji parser nominal IDR, tanggal, total, dan validasi hasil.
- PaddleOCR dijalankan sebagai smoke test pada device terpilih terhadap gambar hasil preprocessing; default `cpu`, GPU NVIDIA memakai `SPIKE_OCR_DEVICE=gpu:0`.

## Hasil terakhir

```text
dataset_size=50
total_accuracy_fixture=1.0
date_accuracy_fixture=1.0
quality_gate_target=0.9
quality_gate_passed=true
paddle_smoke=PASS (default: CPU)
paper_detected=50/50
perspective_corrected=50/50
low_quality=0/50
```

Fixture parser 50/50 bukan klaim akurasi OCR nyata karena memakai baris OCR deterministik dari manifest. Smoke test PaddleOCR berhasil menginisialisasi model PP-OCRv6 medium CPU dan menghasilkan output OCR; satu gambar juga terbukti mengembalikan teks yang benar.

GPU tidak mengubah kontrak aplikasi: preprocessing tetap CPU, CPU tetap jalur fallback, dan environment GPU harus menggunakan wheel PaddlePaddle yang cocok dengan driver/CUDA. Uji GPU dijalankan terpisah dengan `$env:SPIKE_OCR_DEVICE = "gpu:0"`.

## Batasan dan tindak lanjut

Evaluasi OCR nyata seluruh 50 gambar membutuhkan waktu sangat panjang pada CPU laptop ini. Untuk menjalankannya secara eksplisit:

```powershell
$env:SPIKE_FULL_OCR = "1"
python spike\run_spike.py
```

Hasil evaluasi OCR nyata 50 gambar wajib ditambahkan sebelum quality gate akurasi final dianggap selesai. Dataset fase berikutnya juga harus menambahkan foto nyata, blur, gelap, bayangan, lipatan, dan tulisan tangan.
