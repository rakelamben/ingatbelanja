# Tahap 15 — Integrasi End-to-End dan Quality Gate

## Tujuan
Membuktikan seluruh sistem berjalan lintas backend, worker, frontend, dan browser.

## Langkah
1. Jalankan backend integration tests dengan FakeOCR, FakeLLM, dan stub Frankfurter.
2. Jalankan frontend unit/component tests.
3. Jalankan Playwright Chromium dan WebKit dengan emulasi ponsel.
4. Uji daftar → scan → review → confirm.
5. Uji dua browser context untuk tracker bersama.
6. Uji session expiry, CSRF, 404 resource asing, worker mati, retry, dan error 409/429/503.
7. Jalankan lint, type check, build, migration test, security test, dan OpenAPI no-diff.
8. Perbaiki regresi sampai semua gate lulus.

## Verifikasi
Semua required CI jobs hijau dan laporan test menyertakan jalur kritis PRD.

## Dependensi
`implementation_plan_14.md` dan seluruh backend/frontend phase sebelumnya.

## Output
Laporan quality gate dan daftar isu tersisa yang disetujui.
