# IngatBelanjaan

Aplikasi lokal untuk mencatat pengeluaran dari foto struk atau input manual.

## Setup Windows

Prasyarat: Python 3.12, Node.js LTS, dan npm.

```powershell
python tasks.py setup
copy .env.example .env
python tasks.py doctor
python tasks.py migrate
```

## Quality checks

```powershell
python tasks.py lint
python tasks.py test
python tasks.py build
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

Struktur domain, database, autentikasi, dan worker akan ditambahkan pada tahap
implementasi berikutnya. Folder `spike/` tetap merupakan prototype OCR Phase 1
dan tidak digunakan sebagai pipeline production.
