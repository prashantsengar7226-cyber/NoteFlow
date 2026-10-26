# Personal AI and automatic summary recovery

## What changes

- **NoteFlow AI:** 20 operations per user per UTC day, also subject to the existing shared provider budget. An operation is one study action or one summary-part generation. A queued part includes a separate source review; regenerating a rejected part spends another operation.
- **Personal AI:** no NoteFlow daily AI-operation cap. The selected provider's quotas, billing and availability apply. One active AI operation per account and API request-rate limits still apply. Source size, storage and YouTube-import limits are unchanged.
- Users connect Gemini, Groq or OpenRouter in **Settings → Choose your AI connection**, with a model available on their own account. A key alone does not improve model accuracy. A small connection test and later retries/reviews may incur provider charges.
- Personal keys are encrypted with AES-256-GCM, bound to account/provider/model/revision. Responses contain connection metadata only. Requests use fixed provider hosts, and provider failures never fall back to NoteFlow's key in personal mode.
- Summary jobs save each generated draft before a separate source-review invocation. Only accepted parts enter the summary. A timeout or invalid reviewer quote retains that private draft for another review without another NoteFlow generation charge. Unsupported content is regenerated with bounded private reviewer feedback. Cooldowns and retry times survive browser closure and worker restarts. Three failed attempts per part stop the job; expired jobs stop after seven days. Cancellation stops future steps; an already submitted provider call may finish.
- Existing summaries and legacy API output are not retrospectively verified. The displayed source-review count distinguishes checked parts. Automated reviews compare source text and claims; they cannot certify real-world correctness, resolve every ASR error, inspect slides or guarantee complete coverage.

## Deployment order

1. Back up the database and run `npm run db:migrate` against the intended environment. Migration `0003_personal_ai_queue.sql` creates only new tables/indexes; it does not alter existing notes. Never point local QA at the live database.
2. Run `node scripts/prepare-ai-queue.mjs` locally. It adds missing values to the ignored `.env.local` and prints no credentials.
3. In Vercel, add **server-only** `BYOK_ENCRYPTION_KEY` and `QUEUE_WORKER_SECRET` from that file, scoped to the intended environment. Do not prefix either with `NEXT_PUBLIC_`. Use different secrets and databases for staging. Keep the encryption key backed up securely and stable across deployments; changing it makes stored keys unreadable and requires users to reconnect.
4. Initially set `QUEUE_SCHEDULER_ENABLED=false`. Build/deploy with the normal launch checks. Personal AI is unavailable if secure key storage has not been configured. The browser can drive queued work while open.
5. Configure the external scheduler below, test it, then set `QUEUE_SCHEDULER_ENABLED=true` and redeploy. This flag is a declaration by the operator, not a scheduler health check. Do not enable it merely because the endpoint exists.

## Free cron setup (cron-job.org)

Create an account at https://cron-job.org/ and add a job:

| Setting | Value |
| --- | --- |
| URL | `https://note-flow-blue.vercel.app/api/queue-worker` |
| Method | `POST` |
| Schedule | Every minute |
| Custom request header | `Authorization: Bearer <QUEUE_WORKER_SECRET>` |
| Body | Empty |
| Redirects | Disabled, if configurable |
| Notifications | Enable failure notifications |

Use the canonical production domain. Keep the secret in a request header, never a URL, job title, screenshot or repository. The scheduler receives no personal API key or transcript. Restrict access to its account: its secret can trigger bounded processing of queued jobs.

Run the scheduler's test request: expect **202**. The route returns promptly and uses Next.js `after()` to process one due generation or review step within the 180-second function budget. Next.js/Vercel's supported continuation mechanism keeps that work alive after the HTTP response. A 202 only acknowledges the trigger; verify actual task progress and check sanitized `summary_queue_step`/`summary_worker_failed` logs.

Enqueue a short disposable source, close the tab, and reopen after a few minutes. Verify that the task completed and its source-review count is correct. Check the scheduler's execution history, including notifications, before enabling the background flag. One cron tick processes one step globally; this deliberately small launch configuration may queue slowly under load. Scale to a proper queue/worker service when traffic grows, without relaxing provider quotas or owner leases.

For a local manual tick: `node scripts/queue-tick.mjs http://127.0.0.1:3000`. For production, pass the exact HTTPS origin after securely configuring the matching worker secret. This command does not schedule future ticks.

References: [cron-job.org scheduling documentation](https://docs.cron-job.org/creating-cron-jobs.html), [Next.js after lifecycle](https://nextjs.org/docs/app/api-reference/functions/after).

## Required staging verification

Use two disposable accounts and a separate database. Verify connect/remove, unsupported model/key errors, cross-account denial, shared operation 21 rejection, personal-key usage beyond 20, provider cooldown and restart recovery, cancellation, key rotation, and browser-closed completion. Confirm secrets are absent from browser assets and logs. Do not use a live customer's account for these tests.

The default automated suite uses synthetic provider responses and isolated databases. Separate opt-in live provider checks and their limitations are recorded in [PERSONAL-AI-VERIFICATION.md](PERSONAL-AI-VERIFICATION.md). Neither local tests nor a successful provider connection establish actual free-tier capacities, deployed account/scheduler behavior or complete-video factual accuracy.
