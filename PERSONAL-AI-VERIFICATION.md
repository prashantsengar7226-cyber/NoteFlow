# Personal AI / queue verification — 26 October 2026

Implementation is prepared in source. This document does **not** assert that the production migration, Vercel environment settings or external scheduler have been activated.

| Check | Result and evidence |
| --- | --- |
| Automated regression suite | **Pass:** 129 tests; `node tests/run.mjs`. Includes existing auth, billing, exports, source processing and study features. |
| TypeScript and production build | **Pass:** Next.js production webpack build, including its TypeScript check. |
| Shared/personal allowance separation | **Pass:** shared operation 21 denied; personal context executes beyond 20 without consuming either shared AI counter. YouTube limits remain separate. No client mode/owner field grants a bypass. |
| Key storage and isolation | **Pass:** authenticated encryption binds ciphertext to owner/provider/model/revision; tampering rejected; parallel account contexts remain isolated; connection metadata excludes keys. |
| Authentication and CSRF | **Pass:** every new user endpoint requires the existing authenticated identity; writes enforce same origin; worker rejects invalid bearer credentials; cross-account job reads/cancellation denied. |
| Key validation/removal | **Pass with synthetic provider:** connection tested before save; provider failure cannot save or fall back to a shared key; removal cancels personal-key jobs. |
| Queue replay/concurrency | **Pass:** unique active job per note; leased claim prevents duplicate generation; one account AI lease protects against overlapping spending; completed steps are not repeated. |
| Recovery and quotas | **Pass:** timed-out reviews reuse the private draft; cooldown schedules a retry; long shared jobs wait for UTC reset at 20 operations; repeated crashes/review failures stop safely. |
| Source-review enforcement | **Pass with fixtures:** rejects missing claim evidence, fabricated quotes, wrong citations, declared omissions and unsupported output. Rejected parts are not published. This is enforcement evidence, not a semantic-accuracy benchmark. |
| Browser integration | **Pass:** ten grouped checks using real local Next routes and a temporary libSQL database. Personal-key form works on desktop/mobile and clears the key field; authenticated external worker ticks complete a draft and review with the page away from NoteFlow. Key settings, queue, two-user access, sign-out, exports, legacy resume and nine study tabs checked. |
| Secret scan | **Pass within scan scope:** no configured private-secret matches in source or 45 built browser assets. Includes new encryption and worker secrets; pattern scanning is not exhaustive. |
| Real provider and supplied full-video quality | **Unverified for this change:** provider responses in the new tests are synthetic. The earlier failed real-video factual rubric is not reclassified as passed. Automated source checking is fallible and cannot independently validate the source's facts or unseen visuals. |
| Live cron / production activation | **Pending:** configure the migration, Vercel server-only settings and scheduler using [PERSONAL-AI-SETUP.md](PERSONAL-AI-SETUP.md), then perform browser-closed staging acceptance. |

Local evidence is in ignored `audit/byok-tests.log`, `audit/byok-build.log`, `audit/workspace-qa.json`, `audit/secret-scan.json`, and the desktop/mobile screenshots. No live customer account, note, API credential or production database was used as test data. Existing decisions about email verification and recovery are unchanged; the prior security audit's unresolved items remain applicable.
