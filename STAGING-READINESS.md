# NoteFlow staging and enterprise readiness

Prepared 25 October 2026. **Status: staging tooling prepared; external staging services not created or tested.** “MNC grade” is treated as a request for disciplined enterprise release practices, not a certification. See `SECURITY-AUDIT.md` for the evidence and remaining gaps.

## 1. Create separate services

Create a **new Supabase project named `noteflow-staging`** and a **new Turso libSQL database named `noteflow-staging`**, with a token scoped to that database. Do not copy real users or notes into staging. Keep existing `.env.local` unchanged.

Fill the four blank fields in `.env.staging.local` directly in your editor:

| Setting | Staging value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | New Supabase project's HTTPS URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | New project's `sb_publishable_...` key |
| `TURSO_DATABASE_URL` | New database's `libsql://...turso.io` URL |
| `TURSO_AUTH_TOKEN` | New database-scoped token |

Do not paste secrets into chat or screenshots. `.env.staging.local` is covered by `.gitignore`. The shareable template is `deployment/staging.env.example`. A Git repository/history is still needed to inspect what has been tracked previously.

In staging Supabase, enable Email and new signups. Keep Confirm email OFF to match the user's current decision. Set the local Site URL to `http://127.0.0.1:3200` for local staging; use its own HTTPS URL when a staging deployment exists. Do not label these accounts' email addresses verified. Password reset remains unavailable.

Start with AI and Supadata keys blank and use Basic summaries. When testing external providers, provision separate limited test credentials and use synthetic source text. This staging profile keeps payments disabled; it refuses payment secrets and enabled checkout. Payment-provider test mode is a separate qualification step, not a reason to add live keys here.

## 2. Run local staging with Node 24

From the project root, with Node 24 selected:

```powershell
node scripts/staging.mjs check
node scripts/staging.mjs migrate
node scripts/staging.mjs build
node scripts/staging.mjs start
```

Open `http://127.0.0.1:3200`. `migrate` writes only after the staging comparison passes. The `check` action is offline and prints field names, never values; it does not establish credential validity or ownership.

The runner rejects the current Supabase/Turso endpoints and matching current credentials, blank required fields, unexpected fields, inappropriate URL schemes, secret browser keys and enabled billing. It explicitly supplies all known application settings, preventing fallback to the corresponding `.env.local` values. It removes inherited QA preload settings. The comparison baseline is `.env.local`; this is not an inventory of every production service in the organization.

Staging builds use `.next-staging`; the normal app uses `.next`. A public-configuration fingerprint prevents starting a build against changed Supabase browser settings without rebuilding. Do not run `next start` directly for staging: use the runner. Do not set `NOTEFLOW_LOCAL_QA`, load `qa-auth-preload.mjs`, or run the synthetic QA server as a deployment.

The current normal app can stay on port 3000. Stop either server with Ctrl+C in its terminal. No database deletion is required to stop it.

The staging build has not yet been run with real credentials. The underlying normal production build and the isolation helper tests have been verified locally. Next supports a separate [`distDir`](https://nextjs.org/docs/app/api-reference/config/next-config-js/distDir); configuration parsing uses Node's [`parseEnv`](https://nodejs.org/api/util.html#utilparseenvcontent).

## 3. Live staging acceptance record

Use two disposable accounts A and B in the new project. Choose credentials locally; never reuse personal passwords. Keep only synthetic content in these accounts. Keep evidence free of cookies, access/refresh tokens, passwords, and private source text. Record date, build, environment, steps, observed status and result for each check. Do not upgrade a Pending item merely because a corresponding mock test passed.

| Scenario | Expected evidence | Current status |
|---|---|---|
| Service separation | Project and database differ from current environment; scoped token; preflight passes | Pending projects |
| Signup/signin | A and B can register and sign in with real Supabase sessions | Pending |
| Wrong credentials | No session, actionable error, no account detail disclosed | Pending live; mocked UI passed |
| Signed-out protected APIs | Every supported private method returns 401 | Passed local HTTP; repeat deployed |
| A/B isolation | B cannot read/edit/delete/generate/export A's notes or inspect A's purchases | Passed fixture identities; pending real identities |
| Logout | Cookies cleared; subsequent protected requests denied; other-session behavior matches selected scope | Passed fixture identities; pending real identities |
| JWT expiry/refresh | Inspect only expiry timestamps; expired access without valid refresh denied; valid refresh works; old-refresh replay behavior follows policy | Pending |
| Revocation | Revoked refresh token cannot mint a new session; document access-token expiry window | Pending |
| Login throttling | Staging limit recorded; bounded failed-login burst reaches documented throttling; no production account affected | Pending |
| Session policy | Maximum lifetime/inactivity/refresh settings documented or unavailable on chosen plan explicitly noted | Pending dashboard review |
| File import | Small PDF/text/subtitles, malformed PDF, 20 MB boundary and 150-page boundary; no stale content on rejection | Partial local coverage; pending actual PDF boundary fixtures |
| AI/transcription | Small synthetic examples, actual responding model, citation validation, quota and timeout recovery | Local mocks passed; live test pending separate keys |
| Payments | Separate Razorpay test environment: signature, amount mismatch, duplicate delivery, refund, dispute and server entitlements | Local mocks passed; live test pending |
| Deployment | HTTPS, origin checks, cookies, cache headers, env isolation, no secret files accessible | Local checks passed; deployed test pending |
| Recovery | Staging backup restored into another isolated DB; restored records and ownership verified | Pending |

For rate-limit tests, first inspect the project's configured limits. Use one disposable account, cap request count and duration, stop at first 429, and record Retry-After. Do not run an unlimited brute-force test or alter limits in the current project.

## 4. Additional enterprise release controls

These are readiness gates, not claims that the current personal app implements enterprise features:

- **Identity risk:** email ownership is unverified by explicit product decision. It must not be used as authorization evidence, account recovery proof or an organization-membership signal. If customers require verified email, SSO or MFA, design and test that before onboarding them.
- **Repository/change control:** create a private repository, verify ignored/tracked secret files, enable secret scanning and dependency updates, require reviewed changes and passing tests before release. Audit previous source history if it becomes available.
- **Environment access:** separate development/staging/production service accounts and credentials; minimize dashboard access; record credential owners, rotation and revocation procedures. No real customer data in tests.
- **Observability:** monitor availability, auth failures, API latency, 429/5xx responses and shared AI budget usage. Logs must omit request bodies, tokens and source documents. Establish alert recipients and an incident owner; no alerts have been configured here.
- **Recovery and rollback:** define acceptable recovery time/data-loss targets, test database restores, retain a known-good deploy, and rehearse rollback. Never reverse data migrations by deleting production data to match old code.
- **Privacy/vendor processing:** document retention/deletion behavior and the providers receiving source content. Confirm contracts, region and data-handling requirements for the intended customers before accepting sensitive work documents.
- **Capacity:** test a bounded realistic workload in staging; measure error rates and p95 latency; set agreed limits before claiming capacity. No load capacity or SLA has been certified.
- **Payments:** checkout stays disabled until separate merchant test-mode qualification passes. Never replay events against a live merchant account during QA.

## 5. Release decision

Current decision: **HOLD for public/enterprise launch.** Local checks are strong evidence for tested behavior, but they do not replace the pending live checks above. No deployment, real test-account creation, emails, payment transactions, or external staging changes were performed by the staging preparation work.

Next handoff: create the new Supabase/Turso projects and fill `.env.staging.local`. Then run `check` and, once it passes, proceed through migrations, staging build and real-account verification. Keep email verification's exception visible in the final release record.
