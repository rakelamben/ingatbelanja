# Tahap 5 — Akun Lokal dan Manajemen Sesi

## Tujuan
Mengimplementasikan autentikasi lokal yang aman tanpa email.

## Langkah
1. Registrasi username unik case-insensitive dan password minimal 10 karakter.
2. Hash password menggunakan Argon2id.
3. Implementasikan login, logout, sesi bergeser, pencabutan sesi, dan `/auth/me`.
4. Kunci akun setelah lima kegagalan selama 15 menit.
5. Implementasikan ubah password dan reset password admin.
6. Implementasikan hapus akun sesuai aturan buku bersama.
7. Cegah enumerasi akun dengan pesan login yang sama.

## Verifikasi
Tes registrasi, login, logout, lockout, session expiry, CSRF, reset admin, penghapusan akun, dan enumerasi akun.

## Dependensi
`implementation_plan_4.md`.

## Output
Endpoint dan service akun lengkap beserta tes keamanan.
