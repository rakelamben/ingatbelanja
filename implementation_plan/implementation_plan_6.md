# Tahap 6 — Buku, Pelacak, Anggota, Undangan, dan Kategori

## Tujuan
Membangun domain ledger/tracker dan otorisasi terpusat.

## Langkah
1. Buat buku pribadi otomatis saat registrasi.
2. Buat CRUD pelacak dengan satu mata uang.
3. Implementasikan role owner/member dan `require_member`.
4. Buat invite code, expiry, max uses, join, leave, dan kick.
5. Buat kategori sistem dan kategori kustom maksimal 15 per buku.
6. Saat kategori custom dihapus, pindahkan item ke Belum dikategorikan.
7. Tulis activity log untuk perubahan kolaboratif.

## Verifikasi
Uji matriks owner/member/non-member, aturan 404/403, invite invalid, leave, kick, dan kategori.

## Dependensi
`implementation_plan_5.md`.

## Output
API ledger, tracker, membership, invitation, category, activity log, dan tes otorisasi.
