# Production rollout: personal AI and durable recovery

Status: 26 October 2026. Deployment is authorized; authenticated Vercel and scheduler access is pending. This is an execution record, not a launch approval or a claim of complete video accuracy.

## Completed

- [x] Candidate production build passed; feature branch Vercel build succeeded at `db66a07`.
- [x] All 134 automated checks passed, including authorization, personal-key isolation, retry behavior, source-review evidence and backup validation.
- [x] Selected Turso database matched the database previously chosen for NoteFlow.
- [x] Private SQL snapshot restored into in-memory SQLite; integrity and foreign-key checks passed. Pending migration rehearsed without changing existing row counts.
- [x] Migration `0003_personal_ai_queue.sql` applied; migration ledger and `ai_credentials`, `ai_jobs`, `ai_owner_leases` verified. Existing note data was not changed by the migration.
- [x] Stable encryption and worker secrets prepared in ignored local configuration. Neither is published in this document or Git.

Private backup and migration evidence are under ignored `audit/production/`. Keep the backup protected: it contains application data. Do not attach it to a GitHub issue, public artifact or deployment.

## Remaining deployment steps

- [ ] Authenticate to the correct Vercel team/project and confirm production database configuration matches the migrated target.
- [ ] Add server-only `BYOK_ENCRYPTION_KEY` and `QUEUE_WORKER_SECRET` to Production; initially set `QUEUE_SCHEDULER_ENABLED=false`. Preserve existing encryption material.
- [ ] Merge the tested feature into `main`, deploy, and verify the stable production alias points to that commit.
- [ ] Verify `/login`, `/api/health`, protected API denials, and worker rejection of missing/invalid authentication on the deployed release.
- [ ] Configure cron-job.org to POST to the canonical `/api/queue-worker` URL every minute using the worker secret in its Authorization header.
- [ ] Observe actual scheduled execution history and progress of a disposable queued source without browser-driven or manual worker calls. An HTTP 202 alone does not prove completion.
- [ ] Confirm accepted summary parts have source-review evidence; remove only the explicitly created disposable fixtures after worker activity settles.
- [ ] Set `QUEUE_SCHEDULER_ENABLED=true` only after scheduled progress is verified, then redeploy and confirm the resulting deployment.

Worker processing is bounded to one generation or review step per trigger. Provider cooldowns, global launch budgets and quality failures can still delay or stop work. Do not bypass them to make verification pass.

## Rollback

Keep the prior working Vercel deployment available. If the rollout fails, restore its production alias and pause the external cron job. Leave the additive database tables intact; do not delete user keys, notes or jobs to roll back application code. Keep the encryption key stable for a later redeployment.

## Evidence limits

Local automated tests use isolated data and synthetic provider responses. Opt-in live provider outcomes are in [PERSONAL-AI-VERIFICATION.md](PERSONAL-AI-VERIFICATION.md). Full-video factual acceptance remains unverified; the earlier supplied video failed its factual-accuracy audit. No separate staging projects exist. Email confirmation remains disabled by product decision. A worker fixture test does not verify real-account signup, login or cross-account isolation in production.
