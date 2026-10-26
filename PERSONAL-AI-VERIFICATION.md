# Personal AI / queue verification — 26 October 2026

Implementation is prepared in source. This document does **not** assert that the production migration, Vercel environment settings or external scheduler have been activated.

| Check | Result and evidence |
| --- | --- |
| Automated regression suite | **Pass:** 132 tests; `node tests/run.mjs`. Includes existing auth, billing, exports, source processing and study features, plus private repair feedback, evidence-only retry without regeneration and bounded repeated review failure. |
| TypeScript and production build | **Pass:** Next.js production webpack build, including its TypeScript check. |
| Shared/personal allowance separation | **Pass:** shared operation 21 denied; personal context executes beyond 20 without consuming either shared AI counter. YouTube limits remain separate. No client mode/owner field grants a bypass. |
| Key storage and isolation | **Pass:** authenticated encryption binds ciphertext to owner/provider/model/revision; tampering rejected; parallel account contexts remain isolated; connection metadata excludes keys. |
| Authentication and CSRF | **Pass:** every new user endpoint requires the existing authenticated identity; writes enforce same origin; worker rejects invalid bearer credentials; cross-account job reads/cancellation denied. |
| Key validation/removal | **Pass with synthetic provider:** connection tested before save; provider failure cannot save or fall back to a shared key; removal cancels personal-key jobs. |
| Queue replay/concurrency | **Pass:** unique active job per note; leased claim prevents duplicate generation; one account AI lease protects against overlapping spending; completed steps are not repeated. |
| Recovery and quotas | **Pass:** timed-out reviews and invalid reviewer evidence reuse the private draft; cooldown schedules a retry; long shared jobs wait for UTC reset at 20 operations; repeated crashes/review failures stop safely. Content rejections carry bounded private feedback into regeneration. |
| Source-review enforcement | **Pass with fixtures:** rejects missing claim evidence, fabricated quotes, wrong citations, declared omissions and unsupported output. Rejected parts are not published. This is enforcement evidence, not a semantic-accuracy benchmark. |
| Browser integration | **Pass:** ten grouped checks using real local Next routes and a temporary libSQL database. Personal-key form works on desktop/mobile and clears the key field; authenticated external worker ticks complete a draft and review with the page away from NoteFlow. Key settings, queue, two-user access, sign-out, exports, legacy resume and nine study tabs checked. |
| Secret scan | **Pass within scan scope:** no configured private-secret matches in source or 45 built browser assets. Includes new encryption and worker secrets; pattern scanning is not exhaustive. |
| Real providers | **Mixed results:** all three connected. Gemini completed the initial synthetic queue. OpenRouter completed after a real evidence-review failure without regenerating the draft. Both retained the shared counter at 20 and rejected deliberately incorrect claims. Groq retried but failed completion because its reviewer rejected supported titles/overviews. Details below. |
| Supplied full-video quality | **Not passed:** the earlier failed full-video rubric is not reclassified as passed. One fresh Hindi source sample was blocked by invalid reviewer evidence. Automated source checking is fallible and cannot independently validate the source's facts or unseen visuals. |
| Live cron / production activation | **Pending:** configure the migration, Vercel server-only settings and scheduler using [PERSONAL-AI-SETUP.md](PERSONAL-AI-SETUP.md), then perform browser-closed staging acceptance. |

Local fixture evidence is in ignored `audit/byok-tests.log`, `audit/byok-build.log`, `audit/workspace-qa.json`, and the desktop/mobile screenshots. The latest regression/build evidence is `audit/live-verification-tests.log` (132 passing) and `audit/live-verification-build.log`. The latest configured-value scan found no private-secret matches in source or 45 browser assets; see `audit/secret-scan.json`.

## Live provider continuation — 26 October 2026

The user confirmed there is no separate staging environment and requested provider tests with temporary local data. These tests use existing configured provider credentials through the personal-key code path, synthetic identities and in-memory SQLite. They do not create Supabase accounts, change production notes, prove a separate user's provider quota, or activate the deployed feature. Provider calls consume the configured account's quota.

The first connection run saw Gemini return 429, while Groq and OpenRouter accepted requests. A later run accepted all three connections. This demonstrates that availability changes; it does not establish unlimited free capacity. The later Gemini queue completed a synthetic lesson while the shared counter stayed at 20. Its reviewer rejected an adversarial draft with invented medals and conflated event/location/year pairs. The lesson retained the weight/weight-class distinction, explicit sport correction, unstated medal counts and three-step method. Evidence: `audit/live-queue-initial.json` and `audit/live-queue-verification.json`.

The real Hindi sample was part 3 of 10 from the cached transcript of `slW0ZIXlXrY`. Gemini retried a 503 and generated a draft, but its reviewer changed the spelling of a quoted name; exact-source validation blocked publication. Manual inspection also found that the draft silently selected gold despite a conflicting silver-list heading, which the reviewer had overlooked. This is a failed quality sample, not proof of complete-video accuracy.

The initial Groq recovery test injected one local timeout before sending a review request. The queue waited for its recorded retry time and contacted Groq again. However, Groq then rejected supported headings/overviews because the source had no literal title/overview and ultimately exhausted the retry budget. This failure is preserved in `audit/live-queue-groq-before-fix.json`.

The resulting fixes distinguish `QUALITY_EVIDENCE` (keep and recheck the private draft without another generation charge) from `QUALITY_REVIEW` (regenerate with bounded private feedback). The reviewer now explicitly permits supported paraphrases, requires exact evidence quotes, and checks conflicting list headings. Neither failure type publishes a part. Repair feedback is excluded from public note responses and cleared after acceptance. Repeated failures still stop after the existing retry budget.

| Follow-up check | Observed result |
| --- | --- |
| Groq `openai/gpt-oss-120b` | **Failed completion.** The real retry ran after the injected local timeout; two factual reviews rejected otherwise supported titles/overviews, including after feedback-guided regeneration. The queue stopped at its failure budget with no published summary. Deliberately false claims were rejected. `audit/live-queue-groq.json`. |
| OpenRouter `openrouter/free` | **Passed this synthetic queue.** The returned generation model was `dots-studio/dots-3-note-preview:free`. The first reviewer omitted title evidence, triggering `QUALITY_EVIDENCE`. After the recorded 120-second delay, a second review accepted the identical saved draft. Exactly one generation and two reviews ran; the shared counter stayed at 20. Deliberately false claims were rejected. `audit/live-queue-openrouter.json`. |
| Gemini Hindi sample recheck | **Did not pass.** Three reviews declared the known ambiguous draft supported but supplied altered/nonexistent quotes, so exact-source validation blocked each attempt. Later 503 responses exhausted the bounded provider retry and stopped the test with `PROVIDER_BUSY`. No repaired or accepted sample resulted. `audit/live-source-review.json`. |

These are bounded, low-volume observations, not provider rankings or guarantees. OpenRouter may route another request to another model. Groq's false rejections and Gemini's missed source contradiction remain known limitations; the validation gate was not bypassed to produce a passing result. Exact quote validation caught the sampled reviews' evidence defects, but this does not prove that a supported verdict with valid quotes is semantically correct. Full-video factual acceptance remains failed/unverified as documented in the earlier audit.

Public deployment checks at 06:42 UTC returned 200 for health/login and 401 for unauthenticated workspace access; all three new AI/worker endpoints returned 404. Read-only metadata in the locally configured Turso database showed migrations 0000–0002 only and none of the new feature tables. That database's correspondence to Vercel production was not independently confirmed. See `audit/live-deployment.json`. No production migration or deployment was performed.

Rerun explicitly with Node 24 (network access and provider quota required):

```sh
node tests/run.mjs --live-queue --provider=groq --inject-review-timeout --skip-video
node tests/run.mjs --live-queue --provider=openrouter --skip-video
node tests/run.mjs --live-source-review
```

The last command requires the ignored cached transcript and baseline sample produced by the earlier live video/queue audit. Each script restricts outgoing provider hosts and request counts, keeps credentials out of reports, and uses temporary storage. Run these scripts sequentially because they share the generated test runtime. The timeout option injects a local failure; it is not evidence of an actual provider outage. Existing decisions about email verification and recovery are unchanged; unresolved real-account, staging, scheduler and full-video acceptance checks remain applicable.
