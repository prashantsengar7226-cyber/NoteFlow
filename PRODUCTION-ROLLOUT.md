# Production rollout: personal AI and durable recovery

Status: 26 October 2026. Release `b901295` deployed successfully; real cron-driven generation and source review passed with Gemini. The final rollout commit applies the verified background-status setting on redeployment. OpenRouter recovery ran correctly but its repeated provider timeouts prevented completion. This is an execution record, not a claim of complete video accuracy.

## Completed

- [x] Candidate production build passed; feature branch Vercel build succeeded at `db66a07`.
- [x] All 134 automated checks passed, including authorization, personal-key isolation, retry behavior, source-review evidence and backup validation.
- [x] Selected Turso database matched the database previously chosen for NoteFlow.
- [x] Private SQL snapshot restored into in-memory SQLite; integrity and foreign-key checks passed. Pending migration rehearsed without changing existing row counts.
- [x] Migration `0003_personal_ai_queue.sql` applied; migration ledger and `ai_credentials`, `ai_jobs`, `ai_owner_leases` verified. Existing note data was not changed by the migration.
- [x] Stable encryption and worker secrets prepared in ignored local configuration. Neither is published in this document or Git.

Private backup and migration evidence are under ignored `audit/production/`. Keep the backup protected: it contains application data. Do not attach it to a GitHub issue, public artifact or deployment.

## Remaining deployment steps

- [x] Authenticate to the correct Vercel team/project; explicitly configure the selected migrated database using its existing local credentials. Vercel's sensitive values cannot be read back for comparison. The live worker's fixture progress confirms it reaches the intended database.
- [x] Add server-only `BYOK_ENCRYPTION_KEY` and `QUEUE_WORKER_SECRET` to Production; initially set `QUEUE_SCHEDULER_ENABLED=false`. Preserve existing encryption material. Imported production settings are now scoped only to Production; future previews require their own configuration.
- [x] Publish the tested feature to `main` and deploy `b901295`. New private routes respond on the stable production domain.
- [x] Eight public HTTP checks passed: login/health available, signed-out root redirects, private notes/connection/jobs denied, and missing/invalid worker credentials rejected with 401.
- [x] Configure cron-job.org job `8724961` to POST every minute to the canonical `/api/queue-worker` URL. The user explicitly approved storing its worker secret in the Authorization header. Response-body storage is off; failure/recovery/disable notifications use the account email only.
- [x] Observe actual scheduled execution history and progress of disposable queued sources with no browser-driven or authenticated manual worker calls. Gemini completed generation and review; scheduler history confirms HTTP 202 deliveries.
- [x] Confirm the accepted Gemini summary has `sourceChecks={checkedParts:1,totalParts:1}` and covers all four source sections. Remove both disposable notes/jobs, encrypted operator test keys, leases, accounts and allowance rows after work settled; explicit cleanup queries returned zero remaining fixture records.
- [x] Set `QUEUE_SCHEDULER_ENABLED=true` only after scheduled completion was verified. The final rollout commit triggers the redeployment; its active alias and health are checked separately after the build finishes.

Worker processing is bounded to one generation or review step per trigger. Provider cooldowns, global launch budgets and quality failures can still delay or stop work. Do not bypass them to make verification pass.

## Live results

| Check | Result |
| --- | --- |
| Production build and alias | Release `b901295` reached READY; `note-flow-blue.vercel.app` serves the new routes. |
| Public access controls | Eight checks passed, including private route denial and worker rejection of absent/invalid bearer credentials. |
| Real external scheduling | Existing cron-job.org job `8724961` configured for authenticated POST every minute. Actual scheduled deliveries returned 202 and advanced persisted jobs. Schedule timing can vary; one observed delivery was delayed by about a minute. |
| Gemini unattended completion | **Pass:** one generated part saved, separately reviewed, and published. All four source sections / 502 characters processed. No browser or manual worker request drove the job. |
| Personal-key allowance behavior | **Pass for operator fixtures:** both started with the shared user counter at 20 and retained 20. The existing operator provider credentials were encrypted and used through the personal-key path; this does not prove a separate end user's provider allowance. |
| OpenRouter automatic recovery | **Pass for recovery, fail for completion:** the first generation timed out; a later scheduled attempt saved a draft. Two scheduled review attempts then timed out. The same draft hash survived both review failures; the job stopped at three failures, with no unchecked summary published. |
| Test cleanup | **Pass:** both synthetic identities' application records were removed and checked. No Supabase account was created and no customer note was used. |

Private evidence: `audit/production/fixture-gemini.json`, `fixture.json`, `cron-history.json`, `http-check.json`, `release-status.json`, and `vercel-configuration.json`. These files are excluded from Git and deployment uploads. Cron notifications monitor trigger HTTP failures; a 202 can still be followed by a provider failure recorded in the queue. Monitor queued-job states and sanitized worker logs as well.

## Rollback

Keep the prior working Vercel deployment available. If the rollout fails, restore its production alias and pause the external cron job. Leave the additive database tables intact; do not delete user keys, notes or jobs to roll back application code. Keep the encryption key stable for a later redeployment.

## Evidence limits

Local automated tests use isolated data and synthetic provider responses. Opt-in live provider outcomes are in [PERSONAL-AI-VERIFICATION.md](PERSONAL-AI-VERIFICATION.md). Full-video factual acceptance remains unverified; the earlier supplied video failed its factual-accuracy audit. No separate staging projects exist. Email confirmation remains disabled by product decision. A worker fixture test does not verify real-account signup, login or cross-account isolation in production.
