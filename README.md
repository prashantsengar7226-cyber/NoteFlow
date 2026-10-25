# NoteFlow v0.6

Start with **[LAUNCH.md](LAUNCH.md)** for the current Vercel deployment steps. **[SECURITY-AUDIT.md](SECURITY-AUDIT.md)** records local verification and the live checks that remain unverified. The current live site is https://note-flow-blue.vercel.app/. Read [QUALITY-AUDIT.md](QUALITY-AUDIT.md) for the latest summary fixes, public reference analysis, test evidence and remaining limits.

## Product workspace

A professional blue-and-slate interface with compact navigation, direct source input, real usage indicators, grid/list library views, sorting, account details and a dedicated Plans page. Responsive layouts, keyboard controls and reduced-motion support remain available.

All available tools stay free during the launch, with existing daily limits. The planned Pro upgrade is a **one-time payment**, not a recurring subscription. Checkout is disabled by default and no price is set. Server-verified Razorpay orders, captured payments, signed webhooks, refund/dispute revocation and account-owned purchase history are implemented. Read **BILLING-SETUP.md** before enabling payments; live merchant checkout has not been exercised.

# Noteflow — Vercel source edition

## Provider routing

The server routes across configured Gemini, Groq and OpenRouter providers in `AI_PROVIDER_ORDER`. Quota, availability, network, timeout and invalid-output failures can fall through within the request deadline. Full output schemas are supplied to providers; supported Groq models and OpenRouter use strict structured output. Parsing, field bounds and source references must pass before accepting a provider response or saving a part. Authentication errors, invalid requests and provider refusals stop the request. Gemini transient failures have bounded retries and can use its configured fallback model. Only configured providers participate.

Saved summary parts are not regenerated when resuming the same language/detail. New summary parts record the actual responding model, and the summary UI lists recorded model names; earlier parts may lack this metadata. A successful recovery uses one personal generation allowance. Shared limits count generation operations, each of which can make bounded provider attempts; provider-side quotas and any applicable costs remain separate. Persistent outages still require waiting and resuming. Rate-limited providers are now skipped across requests until their cooldown expires. New Detailed summaries use fixed 8,000-character sections; the UI estimates operations before starting and preserves legacy paused runs.

Groq and OpenRouter are integrated. Model names in `.env.example` are application defaults; availability and usage limits depend on your provider accounts. Validate them with the deployed connection test before inviting users.


## Multiple PDFs → one summary PDF

Open **PDF & documents**, then select several PDFs at once or choose **Multiple PDFs → one summary PDF**. Select up to 10 PDFs (20 MB and 150 pages each, 100 MB total), select language/detail or Basic summary, and generate. When every selected document is complete, click **Download one PDF**. The download contains a document list, separate titled summaries, key points, chapter notes and source references, with each document starting on a new page.

Files are extracted one at a time. Imported text and summaries remain in the private library. Progress is shown for each file; failed files can be retried without regenerating completed summaries. Pause waits for the active request to save. Keep the tab open during processing. After a reload, use **Use saved notes** to select imported documents and resume or combine existing summaries. Files that failed before import must be selected again. A missing or unfinished summary blocks the combined download; no selected document is silently omitted. Removing a file explicitly excludes it from the collection, without deleting its saved note.

AI calls count per document/part against the existing allowances. Basic summaries are extractive and retain the original language. Existing completed summaries are reused, including their saved language and detail. Scanned PDFs need OCR outside the app. The combined report contains summaries, not the complete source PDFs.


A mobile-friendly private study workspace for YouTube transcripts, documents and text. Built with Next.js, Gemini, Supadata, Supabase Auth and Turso/libSQL. This is an independent application, not a NoteGPT subscription or an unlocked copy of NoteGPT.

## Start here

You can manage Vercel in your phone browser. A computer is easier for the one-time code upload and database setup.

1. Unzip this folder. The project root is the folder containing **package.json**.
2. Create a Supabase project at https://supabase.com/dashboard. Under **Authentication → Sign In / Providers**, enable Email and allow new user signups, then turn **Confirm email** off and save. The app uses email and password for registration and sign-in, with no SMTP setup required. Email addresses are not verified and email password resets are unavailable. Keep Auth rate limits enabled. Set your production Site URL after Vercel gives you one.
3. Create a **libSQL** database at https://turso.tech. Copy its `libsql://…` URL and an authentication token. This adapter is for libSQL databases, not Turso's new native-engine API.
4. In the project root, copy `.env.example` to `.env.local`. Fill in the values below. Never upload `.env.local` or commit real keys.
5. Install Node.js 24, open a terminal in this folder, then run:

```sh
npm ci
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Create an account with your email and a password, or sign in with an existing password. Migrations are transactional and recorded with checksums; they can be rerun safely. Do not edit an already-applied migration.

## Put it live on Vercel

1. Create a private GitHub repository and upload the **contents of this folder**, including `package.json`, `package-lock.json`, `app/`, `lib/`, `public/`, `drizzle/` and the configuration files. Do not upload `node_modules`, `.next`, or `.env.local`.
2. In https://vercel.com/new, import the repository. Framework: **Next.js**. Node.js: **24.x**. Root directory: the folder containing `package.json` (leave blank if at repository root).
3. In **Settings → Environment Variables**, add each value from `.env.local` to Production. Add separate test credentials for Preview if you use preview deployments. Do not connect untrusted preview code to your production database.
4. Run `npm run db:migrate` once against the production Turso database before your first deployment. This command is deliberately separate from the build; multiple builds should not compete to migrate a database.
5. Deploy. This project uses `npm ci` and `npm run build:deploy`, which validates the platform environment before building. Add the resulting URL to Supabase's Site URL setting. See `LAUNCH.md` for the exact free-launch configuration.
6. Open the app, sign in, then **Settings → Test AI connection**. It reports the model that actually answered and the short test's latency. Import a short transcript, generate a summary, and check its source references. Test YouTube with a public completed video.

You can alternatively deploy the same folder with the Vercel CLI. No Cloudflare account or ChatGPT login is needed for this edition.

## Where to put each key

| Variable | Where to get it | Visibility |
| --- | --- | --- |
| `GEMINI_API_KEY` | https://aistudio.google.com/api-keys | Server secret |
| `GEMINI_MODEL` | Default: `gemini-3.6-flash` | Server setting |
| `GEMINI_FALLBACK_MODEL` | Default: `gemini-3.5-flash-lite` | Server setting |
| `AI_PROVIDER` | `router` | Server setting |
| `AI_PROVIDER_ORDER` | `gemini,groq,openrouter` | Server setting |
| `GROQ_API_KEY` | Groq Cloud API keys | Server secret |
| `OPENROUTER_API_KEY` | OpenRouter API keys | Server secret |
| `GROQ_MODEL` / `OPENROUTER_MODEL` | Selected model identifiers from `.env.example` | Server settings |
| `SUPADATA_API_KEY` | https://supadata.ai | Server secret; YouTube import |
| `TURSO_DATABASE_URL` | Turso database connection | Server setting |
| `TURSO_AUTH_TOKEN` | Turso database token | Server secret |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project Connect dialog | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key | Public; never use a secret/service-role key here |

In Vercel, enter keys in the Environment Variables screen. Locally, enter them in `.env.local` beside `package.json`. Changing `NEXT_PUBLIC_` values requires a rebuild. Redeploy after changing production settings. Keys are not included in this download; the hosted app's secrets cannot be exported in plaintext.

## Included features

- Public YouTube link imports through Supadata, including asynchronous jobs and safe retry handling.
- Text, Markdown, subtitles and selectable-text PDF imports; up to 300,000 characters with no silent truncation.
- Concise, balanced and detailed summaries in 11 language choices, citations, chapter notes and resumable long-document generation.
- Source-grounded chat, mind maps, translations and presentation outlines.
- Flashcards and quizzes: add 5/10/20 at a time, difficulty settings, source-coverage controls, Anki TSV export and retry missed questions.
- **New Insights:** cited glossary, practical steps explicitly supported by the source, and source qualifications. Included in full PDF study packs.
- Search, folders, favorites, personal annotations, Markdown/text/JSON/SRT downloads, multilingual study-pack PDFs, text-to-speech where the browser supports it.
- Mobile installation (PWA). Offline mode shows a reconnect page; it deliberately does not cache private notes or authentication responses.
- **New model diagnostics:** short live test reports the responding model and latency.
- Private accounts: all API access verifies the Supabase session and scopes database queries to the verified user ID.

## AI reliability and limits

The server validates provider output, field limits and source IDs before saving. Router fallback and bounded retries follow the rules above. Fallback can change response quality; diagnostics and new summary parts record the model identifier returned by the provider when available. This is provider-reported metadata, not independent verification of model identity.

Accuracy and speed depend on the source, model, provider quota and network. Citation validation checks reference IDs, not the factual truth of every sentence. Check important claims against the transcript. Provider quotas and charges remain in effect. During the free launch all available tools are included, but this does not make Gemini, transcription, email, hosting or storage unlimited or free.

Default safeguards remain: 20 AI calls and 3 YouTube imports per account/day; shared site caps of 100 AI calls and 20 imports/day. Each summary part uses one call. Diagnostics uses one call. Basic extractive summaries and PDF creation do not call AI. Failed generation refunds personal allowance; shared attempted-call caps remain charged to limit cost. Edit `lib/plans.ts` and the shared-cap settings in `lib/server.ts` deliberately if your budget supports more.

Vercel routes request a 180-second maximum duration. Use a Vercel plan/configuration supporting that duration; long summaries save completed parts and resume. No local filesystem database is used in production. Choose a Vercel region close to your Turso database. Browser PDF extraction can take time on a phone, especially for large files; scanned PDFs need OCR outside this app.

## What is not included

Recurring subscriptions, audio/video upload transcription, OCR, channel subscriptions, voice cloning, AI video/image creation and generated podcasts are not implemented. Speaker-note slides export as PDF/Markdown, not editable PowerPoint. This release does not claim all NoteGPT features or an independent security/load audit.

## Existing hosted notes

This Vercel installation starts with a new Turso database and Supabase identities. It does **not** automatically move the hosted app's D1 records or map ChatGPT user IDs to Supabase accounts. Export important notes from the hosted app before a migration. The existing public hosted version remains available. A full multi-user migration needs an explicit identity mapping and a verified backup/restore process.

## Verification and maintenance

```sh
npm test
npm run typecheck
npm run build
```

Tests cover owner isolation, quotas, malformed provider responses, source references, incremental summaries, import idempotency, PDFs, PWA cache privacy and the real libSQL adapter's transactions/foreign keys. Tests use mocked AI/transcription services; run the in-app connection test with your own deployed credentials. Build/test results do not establish provider availability for your account.

Before wider public use: verify auth limits and provider quotas, set provider spending limits, configure database backups, perform a restore rehearsal, and monitor `/api/health` (database health only). Email confirmation and recovery are not part of the selected first-launch flow. Avoid logging request bodies, cookies, tokens or private source text. Keep dependencies updated. Font licenses are included in `public/fonts`.

## Official references

- Gemini model: https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash
- Structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Supabase SSR: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Email codes: https://supabase.com/docs/guides/auth/auth-email-passwordless
- libSQL client: https://docs.turso.tech/sdk/ts/reference
- Vercel duration: https://vercel.com/docs/functions/configuring-functions/duration

## AI router (v0.6)

NoteFlow can route generation across three server-side providers: Gemini, Groq, and OpenRouter. Set `AI_PROVIDER=router` and control priority with `AI_PROVIDER_ORDER=gemini,groq,openrouter`. Only providers with configured keys are included. Availability, quota, network, and timeout failures fall through to the next configured provider; authentication and invalid-request errors do not, so configuration mistakes remain visible.

The default Groq model is `openai/gpt-oss-120b`. The prior Llama default was absent from this account's live model catalog; the replacement passed a small synthetic JSON generation test. The default OpenRouter model is `openrouter/free`, allowing OpenRouter to select an eligible free model. All credentials are server-only environment variables. Router logs contain provider/model/latency/error-code metadata but never keys, prompts, source text, response bodies, or authorization headers. Each provider receives a share of the remaining deadline so a timeout does not consume all fallback time. Model availability errors can fall through; AI errors never use transcription-specific guidance.

Required/optional server settings:

- `GEMINI_API_KEY` — Gemini credential
- `GROQ_API_KEY` — Groq credential
- `OPENROUTER_API_KEY` — OpenRouter credential
- `AI_PROVIDER=router` — enables multi-provider routing
- `AI_PROVIDER_ORDER=gemini,groq,openrouter` — ordered fallback priority
- `GROQ_MODEL` and `OPENROUTER_MODEL` — optional model overrides

Do not prefix any provider key with `NEXT_PUBLIC_` and never commit `.env` files containing real keys.
