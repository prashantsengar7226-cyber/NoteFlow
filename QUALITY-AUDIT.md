# Summary quality, reliability and interface audit

Reviewed 25 October 2026 for https://note-flow-blue.vercel.app/. Functional tests used temporary local data and synthetic identities; no customer note or live account was changed. The supplied real video has now been audited: the complete ten-part candidate saved successfully after resume, but its frozen rubric scored **23 pass / 12 fail**. Factual accuracy and uninterrupted generation did not pass. See [VIDEO-QUALITY-AUDIT.md](VIDEO-QUALITY-AUDIT.md) for evidence and separate targeted retests, and [REFERENCE-ANALYSIS.md](REFERENCE-ANALYSIS.md) for the expanded public REA analysis.

## Findings and fixes

| Finding | Result and evidence |
| --- | --- |
| Plain-text extraction could discard text before an internal period, including a decimal point | Fixed the sentence parser to split at boundaries instead of matching only sentence suffixes. Regression covers decimals, URLs, abbreviations and Hindi text. This affects new imports; previously lost source text cannot be recovered from the database. Reimport the original affected text/PDF, then regenerate. |
| Long sources were summarized in much larger sections than short sources | New Detailed runs keep sections at 8,000 characters; Balanced/Concise use 16,000. Previously, sources over 60,000 characters used 32,000/60,000 respectively. Every character still reaches the model. Smaller sections and explicit extraction instructions reduce pressure to omit detail; they do not guarantee factual completeness. |
| Character counts underestimated multilingual request size | New version-3 runs also enforce a 3,500 estimated source-token budget, retaining every character, Unicode code point and original segment ID. This is a heuristic, not an exact provider tokenizer. The supplied Hindi lecture now uses ten sections rather than five. One HTTP 413 still occurred during the full live run; there is no universal provider-limit pass. |
| Parts changed language or confused event context | Added source-wide language/script instructions and bounded adjacent source context. A first context attempt biased later headings toward the opening topic; the final refinement keeps only a short language sample and explicitly separates it from topic context. Targeted retests corrected selected headings and numerical wording, but semantic errors remain. |
| A last provider's temporary gateway failure stopped saved work | Added one bounded retry for confirmed transient HTTP failures on the last compatible provider, within the existing attempt/deadline budget. No automatic retry for quota, authentication or ambiguous network outcomes. Tests verify count and deadline bounds. |
| Changing chunk boundaries could break old paused runs | Saved runs now record a chunk version. Legacy runs resume with their original boundaries; new runs use the improved strategy. Saved parts, leases and replay protection remain intact. Regenerate a completed summary to use the new strategy. |
| Groq sometimes returns HTTP 400 for a failed JSON generation | The specific `json_validate_failed` response now enters validated provider fallback. Other bad requests, authentication errors and refusals remain terminal. The live quality experiment exposed this distinction. No malformed output is saved. |
| Every request could hit an already rate-limited provider again | Cooldowns now persist in Turso's existing limits table, keyed by a hash of provider/model/credential. Subsequent requests skip the limited provider until its retry time; credential changes create a fresh key. When all are cooling down, return a retry time before spending a personal AI unit. |
| Slow providers consumed too much of the request budget | Summary calls now share a 90-second provider deadline, with an individual attempt capped at 60 seconds. Validated fallback uses the remaining budget. The exported function limit remains 180 seconds. This bounds waiting; it cannot make an overloaded service respond successfully. |
| Large runs could predictably exhaust the personal daily allowance midway | Show required operations and remaining allowance before generation. A new incremental run that cannot fit the current personal allowance is rejected before AI work. Saved incomplete runs can continue on later days. Shared/provider capacity can still interrupt an otherwise affordable run. |
| Coverage wording implied all facts had been captured | Display processed source length and actually cited segments. Processing every character is explicitly distinguished from retaining every fact. Partial coverage counts only saved parts. |
| Source context competed with an overly narrow note reader | Source/video and chat now sit on the left, notes and all study tabs on the right. Mobile stacks the panels. Updated import dashboard and public login/registration use NoteFlow branding and retain existing behavior. |

## Verification

| Check | Status | Scope |
| --- | --- | --- |
| Automated regression suite | Pass: 109 tests | Real route handlers and migrated local database with controlled provider/auth fixtures; includes all seven additional AI actions, annotations, persistence and owner isolation, plus multilingual sizing, language/context and transient retry checks. |
| Production build and TypeScript | Pass | Next.js production build on Node 24. |
| Login and registration browser checks | Pass: 22 | Desktop and 390px mobile; validation, duplicate submits, errors, timeout recovery and synthetic success. Supabase responses are mocked. |
| Workspace browser scenarios | Pass: 8 groups | Real local HTTP routes and temporary storage, two synthetic accounts, CRUD, exports, isolation, signout, all nine tabs, saved-summary recovery, rejected files, no horizontal overflow. Resume completion is mocked. |
| HTTP security checks | Pass: 19 | Signed-out routes, unsafe requests and error responses on the local production server. |
| Configured-secret scan | Pass | No private configured values in scanned source or 42 browser assets. Excluded environment files stay private. This is not an exhaustive secret audit. |
| Live synthetic quality experiment | Pass | Two-part English source with 24 distinct numeric anchors plus a final exception. All anchors and the exception appeared; the completed summary persisted. Groq completed both parts; Gemini's quota response was skipped on the second part through cooldown. |
| Supplied real video against frozen expected facts | Fail: 23 pass / 12 fail | All ten parts persisted after one resume, but semantic errors and missing details remain. Full result and subsequent targeted retests are kept separately in VIDEO-QUALITY-AUDIT.md. |
| Independent real transcript comparison | Pass for one MIT lecture | 7,288 normalized word units matched official captions exactly. Its interrupted AI summary is not a completeness pass. |
| Real-account deployed acceptance and staging | Unverified | Prior authorization was temporary local data; separate staging projects have not been created. |

The live synthetic experiment completed in 9,219 ms in one run. This is a single observation, not a performance SLA or a controlled before/after comparison. Numeric-anchor presence is a retention proxy; it does not establish correct relationships, absence of hallucinations, or real-video accuracy. The prior repetitive Hindi smoke test also passed but was not a completeness benchmark. Reproduce the new opt-in experiment with `node tests/run.mjs --quality-benchmark`; it uses configured provider quota and writes `audit/quality-benchmark.json`.

All extra tools remain: transcript/reference navigation, personal notes, insights, mind maps, flashcards and additional practice, quizzes, slides, translation, source chat, PDF/batch exports, library/favorites/collections and account/usage screens. Tool generation persistence is tested with fixtures; not every tool was exercised against every live provider. Existing limits remain, including 16,000 characters for translation and excerpt retrieval for chat. Audio and scanned-document OCR are not enabled.

## Public reference analysis

Inspected [NoteGPT's public home page](https://notegpt.io/) and [YouTube tool](https://notegpt.io/youtube-video-summarizer). The observed public flow uses compact navigation, a direct source composer and organized study tools. The redesign applies that workflow with NoteFlow's own layout, text and branding. No competitor assets or JavaScript were copied into the application.

Continued the requested [REA repository](https://github.com/morluto/rea) analysis through `rea-agents` CLI 6.8.0: 59 downloaded public assets across seven selected study routes; REA parsed 58 with zero syntax failures. The oversized entry still exceeded its fixed complete-fact ceiling and was independently parsed as inert TypeScript/JavaScript syntax with zero diagnostics. Semantic graphs remain partial. Raw evidence is local under `audit/reference/continuation/`; findings and limits are documented in REFERENCE-ANALYSIS.md. Public assets do not establish private prompts, model routing, databases, backend jobs or performance guarantees. No authenticated or private endpoints were probed.

## Remaining operating constraints

- YouTube summaries use the supplied transcript, not video frames. Facts visible only on slides/screens need to be provided as text; missing transcript material cannot be reconstructed reliably by a prompt.
- Current free-launch limits remain 20 AI operations per person/day and 100 shared AI operations/day, plus request throttling. A 300,000-character Detailed source can need at least 38 sections, exceeding a fresh daily allowance; multilingual text can need more. Balanced also obeys the source-token estimate and does not always reduce operations. The UI computes the actual number. Use shorter sources or Basic summaries, or deliberately provision and budget greater capacity later.
- Provider free tiers and strict-JSON model availability are external constraints. Cooldowns and fallback reduce wasted waiting; they do not remove external quotas. A funded compatible provider may be needed for sustained public usage.
- Processing is request-driven. Keep the tab open; interrupted summaries retain completed parts for manual resume. No unattended background worker or automatic continuation is claimed.
- Email verification remains disabled by the prior product decision. Password recovery and live staging/security checks remain as documented in `SECURITY-AUDIT.md`; this work is not enterprise certification.

## Release and rollback

No schema migration or new environment variable is required for these changes. Build, push the reviewed source, and let Vercel deploy the new commit. Verify the public login and `/api/health`, then use disposable content for authenticated acceptance. Existing notes and legacy paused runs are preserved. If rollback is needed, select the preceding Vercel deployment; do not delete data or reverse migrations.
