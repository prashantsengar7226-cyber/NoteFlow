# NoteFlow v0.6 first launch

26 October production rollout: migration `0003_personal_ai_queue.sql` is applied and the personal-AI/queue release is deployed. A private backup passed an in-memory restore and migration rehearsal. All 134 automated checks and eight deployed HTTP checks pass. Real cron scheduling completed a Gemini summary and its source review without a browser. OpenRouter's automatic retries ran but repeated provider timeouts prevented its test from completing. The verified background-status setting is enabled for the final rollout redeployment. See [PRODUCTION-ROLLOUT.md](PRODUCTION-ROLLOUT.md) for evidence, cleanup and limitations.

Prepared 25 October 2026. The site is live at https://note-flow-blue.vercel.app/. Its public login has been inspected; authenticated acceptance remains local with synthetic users. The latest fixes and verification limits are in QUALITY-AUDIT.md. Payments stay disabled. Email confirmation stays off by product decision; email recovery is unavailable.

Audit continuation: the supplied real-video test failed factual-accuracy acceptance despite eventual persistence of every summary part. See VIDEO-QUALITY-AUDIT.md and REFERENCE-ANALYSIS.md. The newer source changes are a review candidate, not a verified complete-video release; do not interpret the automated infrastructure tests as a factual-quality pass.

Earlier first-launch verification: the original production build and 104 automated tests passed before the personal-AI feature was added. The current candidate passed its production build and now passes 134 tests. All four checked-in migrations are applied to the selected database; migration 0003 added tables and indexes without changing existing notes. Repeat database verification if a different database is selected for Vercel.

## Deploy

1. Import [prashantsengar7226-cyber/NoteFlow](https://github.com/prashantsengar7226-cyber/NoteFlow), branch `main`. Never upload `.env.local`, `.env.staging.local`, `audit/`, local databases, `node_modules/`, or `.next/`. The release ZIP excludes these. `.vercelignore` also excludes local secrets and test artifacts from Vercel CLI uploads.
2. Import the repository at [Vercel New Project](https://vercel.com/new). Select Next.js, Node.js **24.x**, and the directory containing `package.json`. Keep the install/build commands from `vercel.json`: `npm ci` and `npm run build:deploy`. Leave Output Directory at the framework default.
3. Enter production values directly in Vercel's **Environment Variables**, using `.env.example` as the names list. Do not upload an environment file. Required: the Supabase public URL/publishable key and the Turso URL/token. Configure at least one selected AI provider, plus Supadata for YouTube imports. Use `AI_PROVIDER=router`, `AI_PROVIDER_ORDER=gemini,groq,openrouter`, `MONETIZATION_MODE=free_launch`, and `BILLING_ENABLED=false`. Leave all payment fields empty.
4. Use Production scope. Do not give preview deployments production database credentials. Preview builds without their own required configuration will intentionally fail the deployment preflight. Never set `NOTEFLOW_LOCAL_QA`, `NOTEFLOW_STAGING`, or load the QA auth preload in production.
5. Apply the checked-in migrations to the intended production Turso database before serving traffic: `npm run db:migrate` with its URL/token configured. Existing local project migrations were previously applied; the runner safely skips matching applied migrations. Do not edit old SQL files or point the command at an unverified database. Migrations are intentionally separate from deployment builds.
6. Deploy, then set Supabase's Site URL to the resulting HTTPS origin. Redeploy after changes to public environment variables. Keep Email signup enabled and Confirm email off to match the selected flow.

The deployment preflight checks configuration shape, selected provider availability by key presence, Node version, disabled billing and absence of QA settings. It prints no credentials and does not authenticate providers or verify Supabase policy.

### Exact Vercel import settings

| Setting | Value |
| --- | --- |
| Git repository | `prashantsengar7226-cyber/NoteFlow` |
| Production branch | `main` |
| Project name | `noteflow` (or another available name) |
| Root Directory | `./` (the repository root, not `app/`) |
| Framework | Next.js |
| Node.js | 24.x, pinned in `package.json` |
| Install Command | `npm ci` |
| Build Command | `npm run build:deploy` |
| Output Directory | Framework default; do not set `out` |
| Function region | Mumbai (`bom1`), configured in `vercel.json` near the current Turso database |
| Fluid Compute | Enabled in `vercel.json`; keep enabled for the 180-second API route budgets |

### Production environment values

Copy each value from your local `.env.local` directly into Vercel's Production environment fields. This table contains names and safe defaults only. Leave Preview unchecked until separate test services exist. Do not paste credentials into GitHub, build commands or chat.

| Variable | Value / purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Current Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Current `sb_publishable_...` key |
| `TURSO_DATABASE_URL` | Current `libsql://...turso.io` database URL |
| `TURSO_AUTH_TOKEN` | Current database token; mark Sensitive |
| `AI_PROVIDER` | `router` |
| `AI_PROVIDER_ORDER` | `gemini,groq,openrouter` |
| `GEMINI_API_KEY` | Current Gemini key; mark Sensitive |
| `GEMINI_MODEL` | `gemini-3.6-flash` |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.5-flash-lite` |
| `GROQ_API_KEY` | Current Groq key; mark Sensitive |
| `GROQ_MODEL` | `openai/gpt-oss-120b` |
| `OPENROUTER_API_KEY` | Current OpenRouter key; mark Sensitive |
| `OPENROUTER_MODEL` | `openrouter/free` |
| `SUPADATA_API_KEY` | Current transcription key; mark Sensitive |
| `MONETIZATION_MODE` | `free_launch` |
| `BILLING_ENABLED` | `false` |

At least one configured AI provider is required; adding all currently configured keys preserves fallback. Omit all `RAZORPAY_*`, `PRO_PRICE_PAISE`, `NOTEFLOW_*` and `NODE_OPTIONS` fields. Do not add `NEXT_PUBLIC_` to private provider/database credentials. Changes to environment values apply to new deployments; redeploy after correcting a value.

### After the first successful deployment

1. Copy the stable production URL from Vercel (not a temporary preview URL).
2. In Supabase **Authentication → URL Configuration**, set **Site URL** to that exact HTTPS origin. For this password-based flow, no OAuth callback or wildcard preview redirect is required. Preserve any existing unrelated redirect entries.
3. Keep the previously selected email-confirmation setting unchanged. Run the smoke checklist below using disposable content before announcing the site.
4. If the build says `Missing ...`, add that variable to Production and redeploy. If it reports QA/staging or payment settings, remove those from the deployment environment. Never bypass `build:deploy` to silence a failed preflight.
5. If an AI request times out, verify Fluid Compute is enabled and the function has the exported 180-second duration; provider quota failures still require fallback or resuming later. If `/api/health` returns 503, check the Turso URL/token and deployment logs without sharing credentials.

Configuration references: [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Fluid Compute and region configuration](https://vercel.com/docs/project-configuration/vercel-json), [function duration limits](https://vercel.com/docs/functions/configuring-functions/duration).

Use `GROQ_MODEL=openai/gpt-oss-120b` for this release. The previous Llama default was not available to the configured account. The replacement and OpenRouter fallback passed a six-part detailed Hindi summary using synthetic text and temporary local storage. Strict output schemas and server validation now protect every saved part. [Groq's current model catalog](https://console.groq.com/docs/models) lists the available model families; account access and provider limits can change. Existing paused summaries keep their saved parts and can be resumed after deployment. Free-provider quota limits can still delay or pause generation; the live test saw OpenRouter requests lasting up to 85 seconds.

## Local release checks

With Node 24 selected:

```powershell
npm ci
npm run launch:check
npm test
npm run build
node scripts/security-scan.mjs
npm run start -- --hostname 127.0.0.1
```

Use `npm run launch:check` locally; the deployment check reads the platform's environment directly before Next loads any local files. Keep the lockfile committed. No account creation or paid API request is performed by preflight.

## First deployed smoke test

- [ ] `/login` opens over HTTPS and `/` redirects signed-out visitors to login.
- [ ] Register a disposable account; sign out, sign in again, and verify incorrect credentials show an error. Verify the server-side password minimum and auth/session limits in Supabase when dashboard access is available.
- [ ] Import a short text, generate a Basic summary, refresh and confirm the saved note persists.
- [ ] Download a PDF and open it. Test one small AI summary and one public YouTube import; these use provider quota and may incur provider charges.
- [ ] A second account cannot see, export or change the first account's note. Test only disposable content.
- [ ] After signout, `/api/notes` returns 401 and private pages no longer display notes.
- [ ] `/api/health` returns 200 with `status: ok`; confirm no secret files are accessible. Health checks database availability only.
- [ ] Check the app on an actual phone and inspect deployment logs for errors without recording passwords, cookies, tokens or note content.

## First-launch limits and operation

The full staging exercise and Supabase private-setting verification were deferred at the user's request. No passing status is claimed for them. Email ownership is not verified. Read `SECURITY-AUDIT.md` for remaining evidence gaps; `STAGING-READINESS.md` remains available for the later staging rollout.

Keep the free-launch per-user and shared service limits enabled. Configure provider spending caps, monitor health/5xx/429 responses and preserve a database backup before expanding usage. Keep the last working deployment for rollback. Do not undo migrations by deleting production data. Real restore, load and live payment tests remain pending; do not enable checkout until `BILLING-SETUP.md` is completed.

Official deployment references: [environment variables](https://vercel.com/docs/environment-variables), [deployment exclusions](https://vercel.com/docs/deployments/vercel-ignore), [function duration](https://vercel.com/docs/functions/configuring-functions/duration). Routes request up to 180 seconds; confirm the selected hosting configuration supports them.
