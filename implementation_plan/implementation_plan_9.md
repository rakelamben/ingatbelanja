# Tahap 9 — Worker, Job Queue, Retry, dan Ketahanan

## Tujuan
Memastikan pekerjaan ekstraksi asynchronous dapat diklaim, dicoba ulang, dipulihkan, dan tidak menggandakan data.

## Langkah
1. Buat worker satu proses dan atomic job claim.
2. Implementasikan lease, heartbeat, retry, dead job, dan backoff.
3. Buat sweeper untuk lease dan receipt `processing` yang menggantung.
4. Buat cleanup, purge soft-delete, purge file, dan orphan cleanup.
5. Tangani shutdown/restart aman.
6. Pastikan retry upload memakai idempotency key.

## Verifikasi
Uji dua claimant, database busy, lease expiry, retry transient/permanent, restart worker, timeout 10 menit, dan upload putus.

## Dependensi
`implementation_plan_8.md`.

## Output
Worker, job lifecycle, scheduler, cleanup, retry, dan tes konkurensi.
