# Release Candidate Checklist

Tanggal pemeriksaan: 2026-11-19

## Automated gates

- [x] Backend tests: 36 passed
- [x] Frontend Vitest: passed
- [x] Ruff and ESLint: passed
- [x] TypeScript/Vite production build: passed
- [x] SQLite migration and integrity check: schema version 5
- [x] Playwright Chromium: 2 passed
- [x] Playwright WebKit mobile profile: 2 passed
- [x] Apache-2.0 `LICENSE` present
- [x] `.env`, database, storage contents, and test artifacts ignored by Git

## Manual or pending evidence

- [ ] OCR evaluation on an annotated printed-receipt dataset
- [ ] Tanya AI evaluation with the 30-question fixture
- [ ] Usability test with 5–8 people and SUS score
- [ ] Three-person clean-machine setup rehearsal under 15 minutes
- [ ] Lighthouse mobile and Core Web Vitals baseline
- [ ] E2E photo scan → review → confirm and two authenticated tracker contexts

Pending items are release evidence gaps, not claims of passing quality targets.
