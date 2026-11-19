# Spike pipeline scan struk

Prototype terisolasi untuk Phase 1. Ini bukan pipeline production dan tidak memakai database, Flask, worker, atau API.

## Tujuan

Menguji preprocessing gambar, validasi kualitas, OCR lokal, parser aturan sederhana, dan validasi total/tanggal sebelum implementasi aplikasi.

## Menjalankan

```powershell
python spike\generate_dataset.py
python spike\run_spike.py
```

Perintah default memakai CPU dan merupakan baseline wajib. Jika PaddlePaddle
GPU yang kompatibel dengan driver/CUDA sudah terpasang, gunakan GPU NVIDIA:

```powershell
$env:SPIKE_OCR_DEVICE = "gpu:0"
python spike\run_spike.py
```

Jangan memasang wheel GPU ke environment baseline secara membabi buta. Ikuti
matriks versi resmi PaddlePaddle untuk Windows/CUDA, lalu verifikasi dengan
smoke test. Jika GPU gagal diinisialisasi, hapus variabel tersebut untuk
kembali ke CPU.

Output berada di `spike\artifacts\` dan `spike\dataset\` (keduanya tidak boleh masuk repo production).

## Tahap prototype

```text
gambar sintetis → resize/quality check → deskew/perspective opsional
→ OCR atau fixture → parser merchant/tanggal/item/total
→ validasi total dan tanggal
```

PaddleOCR bersifat opsional pada script: jika tersedia, `run_spike.py`
menjalankan satu smoke test pada device yang dipilih; evaluasi parser tetap
dapat berjalan dengan fixture deterministik. Preprocessing gambar tetap CPU.

Evaluasi OCR nyata pada seluruh 50 gambar bersifat opt-in karena model medium
berjalan sangat lambat pada CPU:

```powershell
$env:SPIKE_FULL_OCR = "1"
python spike\run_spike.py
```

Untuk benchmark OCR penuh pada GPU, gabungkan kedua variabel:

```powershell
$env:SPIKE_OCR_DEVICE = "gpu:0"
$env:SPIKE_FULL_OCR = "1"
python spike\run_spike.py
```

Benchmark waktu CPU/GPU pada sampel yang sama:

```powershell
$env:SPIKE_BENCHMARK_COUNT = "10"
$env:SPIKE_OCR_DEVICE = "gpu:0"
python spike\benchmark_ocr.py
```

`benchmark_ocr.py` menulis hasil JSON ke `spike\artifacts\`. Benchmark hanya
mengukur performa OCR dan bukan quality gate parser production.
