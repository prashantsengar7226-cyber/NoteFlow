# NoteFlow v0.6 deployment candidate - 2026-10-25

- Current Node 24 automated suite: **104 passed, 0 failed**. Includes deployment checks, full structured-output requests, validation before fallback success, refusal handling, unavailable-model fallback, separate AI/transcription errors, deadline allocation and paused-summary recovery.
- Production Next.js build with TypeScript: passed. Local deployment configuration preflight: passed without displaying credentials.
- Authentication browser QA: 22 checks; HTTP security: 19 checks; latest fixture workspace QA: eight scenario groups. Workspace checks were rerun after the summary and sidebar fix; provider responses/identities are mocked where recorded in `SECURITY-AUDIT.md`.
- `vercel.json` now runs `npm run build:deploy`, blocking missing required credentials, invalid selected AI configuration, private browser-key settings, local QA/staging settings and enabled checkout for this free-launch profile.
- `.vercelignore` excludes environment files, local databases, audit output and QA fixture entrypoints from CLI uploads. The source release package uses an explicit file/directory selection and excludes local state.
- `LAUNCH.md` is the current deployment and smoke-test guide. Broader staging work and dashboard checks were deferred by the user. The user deployed https://note-flow-blue.vercel.app/; its public login was inspected. Real-account acceptance and enterprise certification are not claimed.

## Latest quality and interface verification

Source parser loss, long-source overcompression, Groq generation-error classification, cross-request provider cooldowns, upfront summary allowance checks and honest coverage reporting are addressed. All extra study tools have generation/persistence/isolation fixture checks, and all nine tabs are reachable in the browser. The public login, import dashboard and source/notes reader were redesigned with NoteFlow branding. No schema migration or new environment variable is needed.

A two-part live synthetic experiment retained 24/24 numeric anchors and its final exception in 9,219 ms, then verified persistence. This is not a guarantee for real videos or a controlled performance comparison. See **QUALITY-AUDIT.md** for evidence, reference-analysis limitations and operating constraints.

## Summary recovery fix

Root cause of the format failure: compatible providers received JSON-object mode without the complete output schema, and HTTP success was recorded before parsing/schema/citation validation. Supported Groq models and OpenRouter now receive strict JSON schemas; OpenRouter requires endpoints that support them. All providers are validated inside the bounded fallback loop. Malformed, incomplete, oversized, truncated or invalidly cited output is rejected before any summary part is saved. Authentication errors, invalid requests and provider refusals remain terminal.

Live regression passed: all six parts of a detailed Hindi summary of synthetic educational text completed and persisted through the real note/action handlers in an in-memory database. Gemini and Groq quota responses exercised the OpenRouter fallback twice; Groq and both selected OpenRouter models returned valid output. The final saved summary matched the result, retained the entire source and cleared paused progress. See `audit/live-summary.json`; rerun explicitly with `node tests/run.mjs --live-summary` (uses provider quota). No private note or real account was used. Some OpenRouter requests took 67–85 seconds; provider capacity and factual summary quality are not guaranteed by this check.

The previous unavailable Groq default was replaced with `openai/gpt-oss-120b`. Saved legacy transcription errors are corrected on read, and short-screen sidebar navigation no longer collapses. See `audit/provider-catalog.json`, `audit/provider-smoke.json`, and workspace QA evidence.

## Historical release 14 verification

The results below describe the earlier hosted export, not the latest local verification totals.

- Hosted and Vercel test suites: 55 passing tests in each edition.
- Hosted TypeScript and Worker production build: passed.
- Native Vercel Next.js production build, including TypeScript: passed.
- Billing tests use real migrated SQLite storage and mocked provider responses: free-launch entitlement, checkout disabled by default, owner isolation, same-origin guards, server price checks, captured-only access, signature validation, duplicate events, full refunds, disputes, terminal revocations, interrupted callback reconciliation and uncertain create outcomes.
- Vercel suite includes the real libSQL adapter transaction and foreign-key tests. Hosted suite includes the Worker provider transport regression.
- Desktop and 390px phone UI reviewed with isolated fixture data: dashboard, plans, account, usage and disabled checkout. Checked library list view, title sorting, URL prefill into the import dialog and arrow-key source tabs. Responsive review is not a real-device installation test.
- Existing 47 application checks cover quotas, concurrent generation, private exports, document/PDF completeness, provider failures and offline privacy boundaries.

## Limits of verification

No live payment or merchant test-mode Checkout was performed. Production remains free launch; no price or payment secrets are configured by this release. Razorpay order/capture/webhook calls are mocked in tests. Merchant configuration, email delivery, payment capture, refund operations and real multi-user login require deployment-specific verification before paid sales. The historical UI/billing release made no new AI provider request; the latest quality audit adds the opt-in synthetic benchmark described below. Existing source limits and quotas remain.

No high-volume load test, unattended queue, cursor-based library pagination, invoice/refund administration or database restore exercise is claimed. BILLING-SETUP.md describes activation, uncertain-order reconciliation and capacity work.

Hosted source commit: e41f1e1599f7d787c40ac2ed62a86386e56436d8. This download is the corresponding native Vercel export; Supabase and Turso replace Sites identity and D1. It starts a separate workspace and does not migrate existing hosted users or notes.
