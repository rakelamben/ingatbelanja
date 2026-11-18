# Tahap 4 — Fondasi API, Error, Logging, dan Keamanan Dasar

## Tujuan
Menyediakan API `/api/v1` dengan kontrak konsisten, error terstruktur, logging aman, dan pemeriksaan keamanan dasar.

## Langkah
1. Buat application factory Flask dan blueprint API.
2. Integrasikan Pydantic v2 dan SpecTree.
3. Buat format `application/problem+json`, error code, dan `request_id`.
4. Buat sesi, CSRF, pemeriksaan Origin, rate limit, dan penanganan `DB_BUSY`.
5. Tambahkan header keamanan dan JSON logging tanpa password, token, OCR, nominal, atau isi chat.
6. Buat `/health`, `/health/ready`, dan OpenAPI.

## Verifikasi
Tes error contract, status HTTP, CSRF, Origin, rate limit, header keamanan, dan OpenAPI lulus.

## Dependensi
`implementation_plan_3.md`.

## Output
API foundation yang dapat diuji dan menjadi dasar domain berikutnya.
