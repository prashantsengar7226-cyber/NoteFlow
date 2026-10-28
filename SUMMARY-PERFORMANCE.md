# Summary performance investigation

Status: local-only performance investigation, 28 October 2026. The user cancelled remote staging preparation in favour of localhost. Production remains unchanged; the release checkout is on `staging/summary-performance`. No experimental release has been published. Local tests use temporary data; localhost must not be assumed to isolate a production database configured in `.env.local`.

## Evidence

- `lib/study.ts` limits multilingual summary chunks to a conservative estimate of 3,500 tokens. Hindi text consequently creates many parts even though the provider context window may be much larger. Increasing the input size must be tested against output length and factual coverage, not merely context capacity.
- `lib/summary-progress.ts` checkpoints drafting and source review separately. Fourteen parts require at least 28 provider calls before repairs. This preserves recoverability but magnifies latency and quota pressure.
- Baseline `lib/ai-jobs.ts` stopped draining when less than 65 seconds remained, capped each invocation at 12 steps, and applied a minimum delay to worker-yield errors. The local patch now permits up to 64 steps within the same 140-second wall-clock budget, starts a step only with at least 35 seconds remaining, reserves five seconds for persistence, and makes WORKER_YIELD immediately eligible for the next invocation. Provider quota and transport backoff remain unchanged.
- `lib/queue-client.ts` polls at ten-second intervals. Returning a source fallback can end the foreground loop, leaving continuation to other workers. Verify the full browser/background lifecycle before changing polling.
- The personal-key connection test uses the same structured generation path as other AI operations. User-reported model: `gemini-3.5-flash-lite`. Known invalid-key and API-restriction error identifiers now receive safe authentication messages instead of a generic model-settings message. This is diagnostic improvement, not proof the user's connection failure is fixed.
- Live synthetic baseline: dedicated free Gemini `gemini-3.6-flash` returned HTTP 429 / RESOURCE_EXHAUSTED in 1,455 ms. The separately configured Gemini key with the same model and request format returned HTTP 200 in 1,199 ms. This is not evidence that the second key is free or that arbitrary personal keys work. No application database was accessed. Redacted results: `audit/staging/connection-baseline.json`.

## Staging isolation

Deferred by the user. The following remains reference information only; no remote staging provisioning is currently needed.

Required: separate Supabase authentication project, Turso database, encryption secret, queue-worker secret, Vercel staging project and scheduler. Use synthetic accounts and sources. Do not copy production notes or saved personal keys. Keep production cron pointed at production.

Supabase and Turso staging endpoints/credentials are currently absent from `.env.staging.local`. Supabase integration has been suggested but not confirmed connected. Account-management access is needed to provision remote resources. Existing database credentials do not authorize creating new projects.

Same feature configuration means Gemini for free users, Vertex for authorized admins, and encrypted personal-provider connections. Reusing a provider project also shares its quota and billing; prefer separate keys/projects for clean benchmarks. Never silently route free users into paid Vertex.

## Experiment sequence

1. Establish timings for queue wait, provider latency, drafting, review, repairs, persistence and completion. Report request counts, input/output/thinking tokens, throttles, first checked result and total completion time.
2. Diagnose personal-key connection using the reported model. Classify provider errors without logging keys, source text or raw upstream messages. Filter incompatible model types; preserve server validation and encrypted storage.
3. Remove unnecessary worker-handoff delays while retaining leases, idempotency, cancellation and provider Retry-After. Test server termination and browser closure.
4. Compare current chunks with larger token-aware chunks on identical full Hindi and English transcripts. Keep source boundaries and every source character. Do not alter the plan of an existing partially completed job.
5. Evaluate compact evidence-linked outputs and fewer redundant overview/chapter repetitions. Measure completeness and unsupported claims against a fixed answer key. Do not equate successful JSON parsing with factual quality.
6. Introduce bounded concurrency only when account/project limits permit it. Shared free quota must not be amplified by concurrent users; a rate-limited project should pause visibly instead of repeatedly consuming requests.
7. Run admin Vertex, shared free Gemini and personal-key paths independently. Compare normal, throttled, invalid-key, incompatible-model, timeout, repair, cancellation and stale-credential scenarios.

## Release gate

Keep changes local until measured improvement and no regression in source coverage, citations, role restrictions, cost attribution, account isolation or cancellation are demonstrated. Keep quality checks. No guaranteed duration or accuracy percentage is claimed before benchmark results exist. Production deployment is not part of this local experiment.

## Local verification and remaining gaps

- 189 automated tests passed; TypeScript `--noEmit` passed. New regressions verify completion beyond six parts in one invocation, end-of-source coverage, use of remaining execution time, immediate deadline handoff without failure charges, and safe Gemini key error classification. Existing tests cover roles, owner isolation, cancellation, quota backoff and reviewed output publication.
- Synthetic Flash Lite probes: configured Gemini key returned one successful structured response in 14,615 ms; dedicated free key timed out at 20,016 ms. A separate minimal-thinking probe timed out at 20,097 ms. Do not infer a speed improvement from thinking settings; none was applied.
- These are scheduling tests and tiny live probes, not a full-video before/after benchmark. Larger chunks, fewer review calls, concurrent generation and connection-timeout changes remain unproven and have not been enabled.
- The 3,500-token chunk budget and independent source review still imply at least 28 calls for a 14-part job. Increasing throughput cannot remove an exhausted provider quota. Never bypass rate limits or silently charge Vertex for free users.

## Live local verification — 28 October 2026

Executed the updated pipeline with real providers and synthetic text in temporary in-memory SQLite. Production application data, credentials configuration and deployment were not changed.

| Path | Result | Time | Provider calls |
| --- | --- | --- | --- |
| Shared free Gemini | HTTP 429 RESOURCE_EXHAUSTED on initial request and scheduled retry; job remains recoverable | 61.332 seconds including roughly 60 seconds of retry wait | 2 |
| Admin Vertex, configured gemini-3.5-flash | Completed generation and independent source review | 7.047 seconds total | 2 successful calls: 5.147s draft, 1.595s review |

Vertex's short-source result preserved all supplied facts: 120 books in 2024, 30 additional books in 2025 and total 150; 50 proposed books explicitly not approved; 14-day borrowing; 2 rupees per late day. All three source sections were cited and reviewed. This is a manually inspected smoke test, not a representative accuracy percentage or a 14-part video speed benchmark. The free path could not generate output while its quota was exhausted. Personal-key connection and full-video browser behaviour were not tested by this run.

Artifacts: `audit/live-gemini-performance.json`, `audit/local-live-vertex.json`. Re-run the bounded admin smoke test with Node 24: `node tests/run.mjs --live-local-speed`. It permits at most four Vertex inference requests, uses the configured model, and never forces a queued retry before its due time.

## Initial larger-batch experiment — failed before recovery changes

Implemented opt-in `SUMMARY_LARGE_BATCHES=true` for new jobs only (persisted chunk version 4). Balanced batches use a conservative 10,500-token / 42,000-character ceiling; detailed batches use 7,000 / 28,000. Version 3 retains its original boundaries. Compact presentation reduces repeated chapter prose; independent review remains required. The flag defaults off. No parallel provider calls were introduced: quota failures occurred even with sequential execution.

Live comparison on the previously authorized 204-section, 78,087-character Hindi transcript, configured Vertex `gemini-3.5-flash`, temporary memory-only database:

| Plan | Parts | Checked before stop | Elapsed | Requests | Outcome |
| --- | --- | --- | --- | --- | --- |
| Larger batches | 7 | 1 | 112.822s | 8 | QUALITY_REVIEW after bounded repairs |
| Existing smaller batches | 20 | 4 | 171.141s | 15 | One HTTP 429 and repeated QUALITY_REVIEW |

Neither run completed. These figures are NOT a speedup comparison: the amount of reviewed source differs and the baseline included a quota wait. The large-batch hypothesis did not pass its completion gate. Keep the experiment disabled pending further work.

The baseline's final review issue concerned inconsistent interpretations of a garbled Hindi chess title/name. Generation now explicitly preserves unclear source spellings as quotations with uncertainty instead of silently expanding them into guessed official titles. A focused live retest is recorded separately; this prompt change is not evidence of full-video reliability or independently verified factual accuracy.

Benchmark reports are `audit/full-video-v4.json` and `audit/full-video-v3.json`. `tests/live-batch-benchmark.mjs` is explicitly opt-in; provider retries obey due times, all notes/roles/metering remain temporary, and the runner bounds inference requests and scheduling time.

Focused retest of baseline section five completed after two repair cycles: 69.172 seconds, six successful provider requests. Report: `audit/problem-part-v3.json`. This does not demonstrate a speed improvement; the full source has not passed end-to-end. Do not promote larger batches or claim the speed objective achieved from this experiment. The next design needs to reduce repeated drafting of already-supported claims and evaluate reviewer consistency against annotated source examples, rather than simply removing checks.

## Targeted repair implementation

The semantic reviewer now persists an explicit repair plan containing rejected claim IDs and whether substantive omissions exist. Instead of regenerating the whole draft, repairs return bounded patches for exactly those IDs and optional omitted points. Code copies all other fields from the saved draft, validates schema and citations, and rejects edits outside the plan. Accepted points cannot be silently rewritten by a repair response. The patched draft is checkpointed and must pass the normal independent review before publication. Legacy saved tasks without a repair plan retain their existing recovery path.

This changes correction granularity, not authentication or provider policy. Ownership checks, credential revision checks, leases, compare-and-swap writes, cancellation, quota backoff, and paid-provider boundaries remain in place. It does not bypass provider quotas or establish independent real-world truth. Large batches remain disabled by default.

The previously failing section completed in 11.314 seconds on a short retest with two provider calls and no repair. Because that run did not exercise repair, it cannot demonstrate a repair speedup; model variability remains a confounder. The full-transcript run is required to evaluate targeted corrections under actual failure conditions.

## Targeted repair full-video result

The same 204-section Hindi transcript completed all 20 parts with independent source review in **340.748 seconds**, using 47 provider requests. One request returned HTTP 429 and the queue respected its retry wait. This run kept the original 15-second content-repair scheduling waits; the subsequent local patch makes structured targeted repairs immediately eligible inside the worker's remaining deadline, without changing transport/quota backoff or the three-failure bound.

This is one successful completion, not proof of a guaranteed duration or a 95% real-world accuracy score. The previous baseline failed after four parts, so a successful-run speed ratio cannot be computed. Report: `audit/targeted-full-video-result.json`. Independent review agreement and full source processing are not independent verification of all facts in the video.

193 automated tests and TypeScript checks pass after the scheduling adjustment, including targeted-edit boundaries, invalid citations, forbidden additions, preservation of accepted fields, durable patch checkpointing and no publication before review.

## Review stability and adaptive recovery

Accepted claim verdicts and source-passage selections are now saved privately with a SHA-256 digest of the exact source, boundary context and detail setting. A repair reuses a verdict only if the claim ID and text are unchanged and every selected passage still exists. Changes to source/context invalidate the cache; changed/new claims receive fresh semantic review. The reviewer continues checking the entire candidate for omissions. Final publication still validates evidence for every claim, including reused decisions. This avoids repeated rejudging of unchanged, already-accepted statements; it does not make the initial AI reviewer infallible.

For experimental version-4 plans, a second quality rejection causes a one-way fallback: retain the checked large-batch prefix verbatim, discard the unaccepted draft and its review cache, and partition only the remaining source using version-3 sizes. No source characters are dropped. Normal retry limits remain on the smaller batches. Large batching remains opt-in pending end-to-end validation.

195 regression tests pass. Added tests cover exact patch scope, immutable accepted fields, invalid citations, disallowed additions, checkpointed patch review, prefix-preserving fallback, and cache invalidation after claim/source/boundary changes. Production has not been modified.

## Final local benchmark and activation

The adaptive run completed the same transcript in **132.432 seconds**, with **28 provider requests** and **10 checked batches** (five accepted large batches followed by smaller remaining batches). All 204 source sections and 78,087 characters were processed; every final batch passed source review. Saved report: `audit/adaptive-final-result.json`.

The earlier completed targeted-repair run took 340.748 seconds and 47 requests, including a quota wait. The observed elapsed-time reduction is approximately 61%, but it is not a controlled throughput guarantee: provider load, quota waits, model sampling and output size differ. The adaptive result contains 115 key points versus 182 in the smaller-batch result. Processing coverage and AI review do not establish identical factual recall or 95% independent accuracy; a manually annotated completeness evaluation is still outstanding.

`SUMMARY_LARGE_BATCHES=true` is enabled in ignored `.env.local` only. Restart the local server to load it; new jobs use the adaptive plan, while existing saved runs retain their version. Deployment templates remain false and production has not been changed. Authentication, ownership, source validation, encrypted credentials and provider quota backoff remain enforced. 195 regression tests and the final TypeScript check pass.

## Documentation links

- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini optimization: https://ai.google.dev/gemini-api/docs/optimization
- Supabase management authentication: https://supabase.com/docs/reference/api/introduction
- Turso management authentication: https://docs.turso.tech/api-reference/authentication
