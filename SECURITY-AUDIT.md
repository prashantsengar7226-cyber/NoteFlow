# NoteFlow pre-launch security and QA audit

Reviewed: 25 October 2026 (Asia/Calcutta). Scope: this extracted NoteFlow v0.6 source, local production build, temporary local databases, synthetic users, and read-only Supabase public settings. No live customer data was modified. The later summary fixes used a small live Groq probe and a complete six-part Hindi summary of synthetic educational text through live Groq/OpenRouter providers, consuming provider quota. The latter used only an in-memory test database; see `audit/provider-smoke.json` and `audit/live-summary.json`.

**25/25 checks reviewed (100% review coverage): 14 Pass, 1 Fail, 5 Unverified, 5 Not Applicable. This is not a 100% security pass. Public-launch approval is withheld pending the release gates below.**

Pass means the described evidence passed within its stated scope. Unverified means evidence is unavailable, not a confirmed vulnerability. N/A applies to the current implementation only. Payment passes use mocked provider responses and must not be interpreted as merchant integration certification.

## Checklist

| # | Check | Result | Evidence and limits |
|---|---|---|---|
| 1 | No hardcoded secrets | **Unverified (history)** | Source pattern scan and exact matches against configured private credentials found no leaks. This extracted folder has no `.git`; history cannot be inspected. See `audit/secret-scan.json`. |
| 2 | No secrets in frontend code | **Pass** | Scanned 42 built browser assets for configured private credentials; no matches. Only public Supabase configuration is deliberately bundled. No secret values are printed by the scan. |
| 3 | Environment variables configured separately | **Unverified** | Local required configuration exists and Supabase/Turso connections were checked. Staging tooling is prepared, but separate services have not been verified. Gemini/Groq/OpenRouter keys are present in the latest local scan; presence does not establish validity. Billing is disabled. |
| 4 | Environment files excluded from Git | **Unverified (tracking)** | `.gitignore` excludes `.env*` and allows `.env.example`; HTTP `.env.local` request returns 404. No Git index/history exists to prove files were never tracked. |
| 5 | Passwords securely hashed | **Pass (managed service)** | Passwords are handled by Supabase Auth, not stored in application/Turso tables. Supabase documents bcrypt storage. Provider database internals were not inspected. |
| 6 | Sessions and tokens expire per policy | **Unverified** | Server uses Supabase `getUser`, not unchecked JWT decoding. Cookie-based signout works in local fixture tests. Actual JWT lifetime, inactivity/max-session settings, refresh rotation, and expiration were not tested against live accounts; no project session policy supplied. |
| 7 | Strong JWT signing configuration | **Pass (managed service)** | Live public JWKS advertises ES256, EC P-256. Private key material is managed by Supabase and not in the source. Rotation/legacy-key inventory needs dashboard review. See `audit/auth-settings.json`. |
| 8 | Reset tokens expire and are single-use | **N/A** | No password-reset flow is implemented. Email recovery is unavailable. If enabled later, expiry/replay testing is required. |
| 9 | Email verification enforced | **Fail — intentionally disabled** | Live `mailer_autoconfirm=true`; registration does not prove email ownership. User explicitly selected this setup. No automatic change made. Do not treat the address as verified for identity-sensitive actions. |
| 10 | OAuth state validated | **N/A** | Only email provider enabled; no application OAuth callback/flow. Re-audit before adding OAuth. |
| 11 | Every protected API authenticates | **Pass** | All implemented methods on nine protected API routes reject signed-out calls, including forged identity headers. Local HTTP and route tests verify 401. Health and HMAC webhook are intentionally public. |
| 12 | Users access only their own data | **Pass (local)** | Two synthetic users with real browser cookies, real Next routes and isolated libSQL storage: foreign read/update/delete/export return 404; other library is empty. Unit tests additionally cover generation, artifacts, chat and batch export. Live Supabase identities were mocked. |
| 13 | Admin routes are admin-only | **N/A** | No admin routes or admin roles implemented; `/admin` and `/api/admin` return 404. |
| 14 | Multi-tenant data isolated | **Pass (personal-account model)** | Ownership comes from server-verified identity. Queries bind owner; child-table access follows owner checks. Two-user tests pass. No organizations/membership model exists. Turso token remains privileged server-side; this is application-enforced isolation, not database RLS. |
| 15 | Database queries parameterized | **Pass** | Values use `.bind(...)`; dynamic update column names are application-selected. SQL payload in title persists as text, malicious record ID returns 404, tables remain usable. Migrations execute trusted checked-in SQL only. |
| 16 | File type and size limits | **Pass (current architecture)** | Binary documents stay in the browser for extraction; server accepts bounded JSON, not file uploads. Invalid media type returns 415; >300,000 extracted characters rejected; streaming body checks actual bytes despite false Content-Length. PDF client limits 20 MB/150 pages. Audio route disabled. No server binary-file scanning is claimed. |
| 17 | User HTML cannot execute | **Pass (tested surfaces)** | React text rendering; no raw HTML execution sinks found in app/lib. Stored `<img ... onerror>` title rendered literally in real workspace; no injected image or script execution. Screenshots and browser assertions retained. This is not an exhaustive XSS proof across every browser/export consumer. |
| 18 | Login attempts rate-limited | **Unverified (live)** | Supabase documents rate limits; UI correctly handles mocked HTTP 429. No repeated live login burst or bypass testing performed against the non-staging service. Dashboard limit values not available. |
| 19 | Password reset requests rate-limited | **N/A** | No application reset-request flow. Provider reset behavior must be tested if enabled. |
| 20 | AI endpoints usage-limited | **Pass (local)** | Database-backed personal/shared quotas and per-minute limits tested, including concurrency and refunds. Basic summaries use no AI. Provider attempt quotas/costs remain separate. Six-part synthetic live generation passed; no load or quota-bypass test against live providers was performed. |
| 21 | Webhook signatures verified | **Pass (local)** | Raw-body HMAC-SHA256 verification rejects invalid/missing signatures before processing; local billing tests use test fixture secrets. Live webhook is disabled/unconfigured and rejects requests. |
| 22 | Payment events idempotent | **Pass (local)** | Duplicate signed event produces no duplicate fulfillment/provider work. Local migrated database tests cover refund-before-capture, late capture and disputes. Razorpay test-mode delivery not exercised. |
| 23 | Paid access verified server-side | **Pass (one-time purchase)** | No subscriptions. Server price, captured-payment verification, owner-bound order, environment separation and refund/dispute revocation tested. Client price/plan injection rejected. Checkout remains disabled. |
| 24 | Supabase RLS configured | **N/A (application tables)** | Supabase is used for Auth only; notes/accounts/billing data live in Turso. Anonymous Supabase schema probe returned 401, but this does not prove all grants/RLS settings. Any separately created Supabase tables require their own review. |
| 25 | Errors hide internal details | **Pass** | Unknown-error tests confirm response contains no SQL, filesystem paths, stack, or secret fixture. Structured error logging also omits secret message. Validation errors are generic; protected endpoints disclose no records. |

## Fixes completed and retested

- Updated Next.js and `@next/env` from 16.3.4 to 16.4.3, Sharp to 0.35.5, and Zod to 4.6.7. Initial npm audit found 1 critical and 2 high vulnerable packages. Final audit reports zero known advisories. Adapted Zod record definitions and output typing; validation/billing tests pass.
- API write guard now rejects missing Origin as well as foreign/null origins. Signout still compares the browser's incoming Host and rejects cross-site requests.
- Corrected two legacy hosted sign-in links to `/login`.
- Corrected AI privacy disclosure to list configured router providers, including OpenRouter's selected model provider, rather than incorrectly claiming OpenAI.
- Updated obsolete model/provider test fixtures to match the router implementation; no safety assertions were removed.
- Added repeatable API, SQL injection, body size, identity spoofing, error redaction, two-user browser and login-state checks.
- Added temporary QA database files to Git exclusions. Fixture auth preload is a separate explicit test-process module, never imported by application code, and requires an isolated file database. It blocks external calls in the test server. Never add this preload to a deployed startup command.

## Verification results

- Automated application/security suite: **104 passed, 0 failed on Node 24.22.1** (`audit/test-results-node24.log`). Includes launch configuration, signup validation, server identity rejection, payments, owner isolation, AI routing/retries/deadline allocation, quotas, PDF report generation, PWA privacy, database transactions, signout and staging configuration isolation. `audit/test-results.log` retains the earlier 72-test run; the Node 24 log is the latest full suite.
- TypeScript and optimized production build: passed on the required Node 24 line (24.22.1). An isolated npm-cached runtime was used; system Node 22 was not replaced. Local app now runs on Node 24 as well.
- HTTP security checks: **19 passed** (`audit/http-security.json`).
- Login browser QA: **22 checks passed** at 1440px and 390px (`audit/browser-qa.json`). Empty/malformed credentials, signup minimum with native validation bypassed, invalid login, mocked rate limit, network failure/retry, password mismatch, server weak-password rejection, ten simultaneous submits producing one request, missing session, successful synthetic signup navigation, no horizontal overflow or uncaught JS errors. Supabase responses are intercepted; these do not prove live provider policy or throttling.
- Workspace browser QA: **8 scenario groups passed** (`audit/workspace-qa.json`): two fixture accounts, private CRUD/basic summary/export, stored XSS text rendering, paused-summary recovery display and mocked resume, all nine study tabs and responsive source reader, rejected file replacement, signout/session removal, malformed session rejection. Real routes and temporary database; Supabase authentication and the browser resume completion are mocked. Reviewed desktop/mobile and short-desktop screenshots. Navigation no longer collapses into a one-row scrolling area on short screens.
- Secret scan: no configured private secrets or key-pattern findings in scanned source/browser assets. Does not inspect excluded local secrets, dependency sources or absent Git history.
- Dependency scan: zero known vulnerabilities (`audit/dependency-audit.json`). A clean advisory scan is not a guarantee of security.

## Release gates — do not call this production-certified

1. Establish separate staging/production configuration and inspect Git history/index before uploading. Confirm HTTPS, deployment headers, environment access controls and backups/restore procedure.
2. Decide whether to retain the explicit unverified-email product exception or enable verification. The supplied checklist remains failed while verification is disabled. Password recovery remains unavailable.
3. In staging with two real accounts, verify signup/login/logout, expiration/refresh/revocation, live throttling and cross-account API access. Check Supabase session limits and password policy in its dashboard.
4. Keep checkout disabled until Razorpay test-mode signature, duplicate delivery, payment/amount mismatch, refund and dispute tests succeed end-to-end.
5. Node 24 release build is now verified locally. Still run a deployed-device smoke test and exercise live AI and YouTube imports with non-sensitive sample content and configured spending limits; live synthetic multi-part AI generation now passes, but deployed AI and real YouTube import acceptance remain pending.
6. Re-audit if organizations, admin endpoints, OAuth, password reset, Supabase data tables or binary uploads are introduced.

No known critical dependency finding remains after updates. Several operational controls remain unverified; these are not silently marked Pass. This audit is not a penetration-test certification or exhaustive load/accessibility/browser-compatibility assessment.

## Deeper review — 25 October 2026

Confirmed and fixed three additional defects:

1. **Signout failure reported as success:** the handler previously ignored the SDK's returned error and redirected to login even when revocation failed. It now returns a non-cacheable 503 with an explicit warning that the session may remain active. Returned errors and thrown exceptions are tested; provider details are not disclosed. Successful signout still redirects and clears the browser session. This does not assert immediate invalidation of every issued access token; Supabase access tokens can remain valid until expiry.
2. **Stale document text after invalid replacement:** choosing an oversized replacement left the previous document source in state. Selection now clears old source first and rejects unsupported extensions explicitly. Browser regression tests load valid text, select an unsupported/oversized replacement, submit, and prove the outgoing source is empty and no new note is created.
3. **Incorrect model attribution:** OpenRouter routing aliases were stored instead of the responding model. Valid bounded model identifiers from provider response metadata now populate saved model attribution after schema/citation validation. Missing or malformed metadata falls back to the requested identifier. This is provider-reported metadata, not independent proof of model identity. Router transport logs still describe the requested model.

Expanded tests cover Groq/OpenRouter quota/server/network/timeout fallback, credential separation, redirects/auth/bad-request rejection without fallback, insufficient remaining deadline, response byte limits, secret-free logs and response-model metadata. Payment tests cover missing/tampered signatures, simultaneous duplicate events, partial/full refunds and mismatched provider identities. The bundled PDF worker is byte-identical to the installed PDF.js 6.4.299 worker.

The checklist totals are unchanged: deeper local evidence does not replace missing live session-policy, login-abuse, Git-history or staging evidence. Unverified email signups also allow multiple accounts; shared site caps limit aggregate AI usage but do not establish verified human identities.

Staging preparation is documented in `STAGING-READINESS.md`. A separate env template, isolated build/start/migration runner, and six isolation guard tests are implemented. The user confirmed separate staging projects do not yet exist; local preflight correctly blocks blank staging credentials. These preparations do not change the live checklist statuses or constitute enterprise certification.

## First-launch authentication review - 25 October 2026

The user requested completion of the initial version and deferred broader improvements. Email confirmation remains deliberately disabled. This decision does not turn unverified external controls into passing checks; no public deployment was performed.

- Signup validates an email address of at most 254 characters, at least eight password characters, and exact password confirmation. Native browser validation and explicit submit validation both apply. Passwords are never trimmed or normalized; existing login passwords are not subjected to new signup rules.
- A synchronous submit lock prevents concurrent duplicate requests. Failure releases the lock and preserves the user's input. Provider errors do not disclose raw provider details or confirm that an email already has an account.
- The server authorizes only identities returned successfully by Supabase `getUser`; missing identities, anonymous users, provider errors and exceptions do not grant access. User-editable metadata cannot replace the verified ownership ID. Successful authentication still does not prove email ownership while autoconfirm is enabled.
- Rebuilt and reran the 87-test suite, 22 browser checks, 19 HTTP checks and six fixture workspace scenarios. Source and browser secret scans found no configured private credentials. Refreshed public Supabase settings confirm email signup enabled, autoconfirm enabled and ES256 signing metadata.

**Still required in the Supabase dashboard before public signup:** verify a server-enforced minimum password length of at least eight, inspect the chosen password requirements, review login/signup rate limits and session expiry/refresh policy. The form's minimum length is not a server-side security boundary: clients can call the public Supabase Auth endpoint directly. These private project settings cannot be established from the publishable key/public settings endpoint and were not changed here. Follow the linked Supabase password-security, rate-limit and session documentation below. Email recovery is still unavailable by the selected product scope.

## Reproduce

Deployment preparation: the user deferred external Supabase dashboard checks and requested a first-launch candidate. `LAUNCH.md` records the handoff and deployed smoke tests. The local launch configuration check and 91-test suite passed. Vercel builds now validate supplied platform configuration; `.vercelignore` and the release packaging allowlist exclude local secret files and test data. These changes do not upgrade unverified live checklist items to Pass.

Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`, then start the application with `npm.cmd run start -- --hostname 127.0.0.1` in an environment that permits Supabase/Turso connectivity.

- `node scripts/security-scan.mjs` — redacted source/browser secret scan.
- `node scripts/http-security-qa.mjs` — non-authenticated HTTP checks on port 3000.
- `node scripts/browser-qa.mjs` — isolated Edge login tests with intercepted auth requests.
- `node scripts/workspace-qa.mjs` — separate port 3100 fixture server and new temporary database. No live account creation or paid requests.
- `node scripts/auth-settings-audit.mjs` — read-only external Supabase settings/JWKS/schema checks; requires network access.
- `npm.cmd audit --json` — current registry vulnerability data.

## Primary references

- [Supabase password hashing](https://supabase.com/docs/guides/auth/password-security)
- [Supabase sessions and lifetime policy](https://supabase.com/docs/guides/auth/sessions)
- [Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys)
- [Supabase rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Next.js advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)
- [Sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
- [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)

## Structured-output summary regression

The latest format failure was caused by missing full schemas on compatible providers and validation occurring after the router had already accepted HTTP 200. Schema-constrained requests and validation now run within the bounded fallback process. The 98-test suite covers exact schema requests, invalid JSON, missing/oversized fields, truncation, invented citations, all-provider failure without saving/coercion, and terminal provider refusals. Six live synthetic Hindi summary parts completed through the real route handlers; the final result was reloaded from temporary storage and matched the saved summary with all source text retained. Two OpenRouter fallbacks succeeded after quota responses, taking 67?85 seconds. No customer source, live Turso data or Supabase account was used. These checks do not change unverified authentication/staging checklist statuses.
