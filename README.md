# IngatBelanjaan

Aplikasi lokal untuk mencatat pengeluaran dari foto struk atau input manual.

## Setup Windows

Prasyarat: Python 3.12, Node.js LTS, dan npm.

```powershell
python tasks.py setup
copy .env.example .env
python tasks.py doctor
python tasks.py migrate
python tasks.py demo
```

## Quality checks

```powershell
python tasks.py lint
python tasks.py test
python tasks.py build
python tasks.py quality
```

Migrasi database memakai `PRAGMA user_version` dan aman dijalankan ulang:

```powershell
python tasks.py migrate
python tasks.py cleanup
```

Reset password dari operator lokal:

```powershell
python tasks.py admin reset-password <username> [password-baru]
```

## Menjalankan fondasi

Backend API:

```powershell
python tasks.py api
```

Frontend development server, pada terminal lain:

```powershell
cd frontend
npm run dev
```

Health check backend tersedia di `http://localhost:8000/api/health`.

## Demo lokal

`python tasks.py demo` membuat dua akun sintetis, satu buku bersama, dan 20 struk
terkonfirmasi. Akun demo menggunakan password `demo-password-123`; jangan gunakan
password tersebut untuk data pribadi.

## Backup dan restore

Backup aman saat aplikasi berjalan karena memakai SQLite online backup:

```powershell
python tasks.py backup
python tasks.py restore .\storage\backups\ingatbelanjaan-YYYYMMDDTHHMMSSZ
```

Restore harus dijalankan setelah API dan worker dihentikan. Backup berisi salinan
database, arsip foto receipt, dan manifest schema. Jumlah backup yang dipertahankan
diatur oleh `BACKUP_KEEP` (default 7).

## Privasi, jaringan, dan batasan

- Data disimpan lokal di `storage/`; folder tersebut diabaikan Git dan tidak boleh
  diunggah ke issue, pull request, atau layanan eksternal.
- OCR default berjalan dengan provider fake untuk development; pipeline produksi
  memakai CPU sebagai baseline dan GPU NVIDIA hanya akselerasi opsional.
- Tanya AI bersifat read-only, memakai provider fake secara default, dan hanya
  membaca ringkasan yang diizinkan setelah persetujuan pengguna.
- Untuk akses dari HP di jaringan rumah, izinkan Python pada profil Windows
  Firewall **Private** saja dan jangan membuka server ke jaringan publik.
- Foto multi-halaman, tulisan tangan, dan akurasi OCR harus dianggap perlu review;
  hasil ekstraksi bukan bukti akuntansi otomatis.

## Known limitations release candidate

- Evaluasi OCR pada dataset cetak beranotasi dan usability test pengguna belum
  dijalankan di lingkungan ini; angka kualitas tidak boleh diklaim sebelum laporan
  evaluasi tersedia.
- E2E saat ini mencakup register → input manual → riwayat serta guard tracker;
  alur scan foto/review/confirm dan dua sesi tracker masih perlu diperluas.
- Lighthouse mobile dan pengukuran Core Web Vitals belum menjadi gate otomatis.

Struktur domain, database, autentikasi, dan worker akan ditambahkan pada tahap
implementasi berikutnya. Folder `spike/` tetap merupakan prototype OCR Phase 1
dan tidak digunakan sebagai pipeline production.
