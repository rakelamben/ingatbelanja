# Tahap 11 — Tanya AI Read-only

## Tujuan
Menambahkan Tanya AI yang hanya membaca data pengguna dengan angka terverifikasi.

## Langkah
1. Buat `LLMClient`, `GroqClient`, `FakeLLM`, dan `NoneLLM`.
2. Buat chat thread/message storage.
3. Buat tools read-only dengan otorisasi repository yang sama.
4. Tambahkan consent, rate limit, kuota, batas token, timeout, dan circuit breaker.
5. Lindungi dari prompt injection dan jangan mengirim gambar/catatan/ID internal.
6. Buat verifikator angka dan fallback tabel server.
7. Jalankan evaluasi 30 pertanyaan standar.

## Verifikasi
Uji data kosong, luar topik, angka salah, buku ilegal, quota, busy, LLM unavailable, dan consent belum diberikan.

## Dependensi
`implementation_plan_10.md`.

## Output
Chat API, adapter LLM, tools read-only, verifier, dan evaluasi.
