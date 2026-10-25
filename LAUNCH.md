# NoteFlow v0.6 first launch

Prepared 25 October 2026. The source is prepared for deployment to Vercel. It has not been publicly deployed or tested on a production URL in this review. Payments stay disabled. Email confirmation stays off by product decision; email recovery is unavailable.

## Deploy

1. Use a private GitHub repository containing the source files, or deploy the source with Vercel CLI. Never upload `.env.local`, `.env.staging.local`, `audit/`, local databases, `node_modules/`, or `.next/`. The release ZIP excludes these. `.vercelignore` also excludes local secrets and test artifacts from Vercel CLI uploads.
2. Import the repository at [Vercel New Project](https://vercel.com/new). Select Next.js, Node.js **24.x**, and the directory containing `package.json`. Keep the install/build commands from `vercel.json`: `npm ci` and `npm run build:deploy`. Leave Output Directory at the framework default.
3. Enter production values directly in Vercel's **Environment Variables**, using `.env.example` as the names list. Do not upload an environment file. Required: the Supabase public URL/publishable key and the Turso URL/token. Configure at least one selected AI provider, plus Supadata for YouTube imports. Use `AI_PROVIDER=router`, `AI_PROVIDER_ORDER=gemini,groq,openrouter`, `MONETIZATION_MODE=free_launch`, and `BILLING_ENABLED=false`. Leave all payment fields empty.
4. Use Production scope. Do not give preview deployments production database credentials. Preview builds without their own required configuration will intentionally fail the deployment preflight. Never set `NOTEFLOW_LOCAL_QA`, `NOTEFLOW_STAGING`, or load the QA auth preload in production.
5. Apply the checked-in migrations to the intended production Turso database before serving traffic: `npm run db:migrate` with its URL/token configured. Existing local project migrations were previously applied; the runner safely skips matching applied migrations. Do not edit old SQL files or point the command at an unverified database. Migrations are intentionally separate from deployment builds.
6. Deploy, then set Supabase's Site URL to the resulting HTTPS origin. Redeploy after changes to public environment variables. Keep Email signup enabled and Confirm email off to match the selected flow.

The deployment preflight checks configuration shape, selected provider availability by key presence, Node version, disabled billing and absence of QA settings. It prints no credentials and does not authenticate providers or verify Supabase policy.

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
