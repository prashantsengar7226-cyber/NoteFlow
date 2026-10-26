# Vertex summaries and weekly allowances

Feature routing is controlled by `AI_FEATURE_ROUTING=true`. Migration 0004 must
be applied before enabling it. A live connection test proves model access, not
promotional-credit application; billing verification remains a separate check.

## Policy

- Site summaries and insights: 20 combined operations per week, Monday 00:00 IST.
- Summary chunks and reviews share one durable reservation. Retries reuse it.
- Completed requests retain their charge; terminal queue failures and cancellation
  release reservations. Active reservations count toward the allowance.
- Saved insights with the same language return without another generation.
- Small AI features: no daily user operation allowance. Existing per-minute
  throttling, account concurrency leases, source-size limits and provider cooldowns remain.
- Shared small tools use OpenRouter `openrouter/free` or a `:free` model, with
  zero input/output/request price ceilings. No automatic Vertex fallback exists.
  Shared Gemini/Groq routes are excluded in this mode because their account billing
  tier cannot be inferred from a key. Personal keys still support all three providers.
- Personal keys bypass site allowances and use the user's chosen model for all AI features.
- `AI_ADMIN_USER_IDS` is a server-only allowlist of Supabase Auth UUIDs. It bypasses
  the weekly user allowance only. It cannot bypass the global Vertex safety limits.
- Basic source notes, exports and PDF utilities do not invoke Vertex. AI summaries
  requested as part of a PDF batch are still summary operations, one per document.

## Google Cloud setup

For local testing only, an existing gcloud Application Default Credential can be
used with `VERTEX_ALLOW_LOCAL_ADC=true` and `VERTEX_LOCAL_ADC_PATH` pointing to its
JSON file. The file is read locally and its refresh token exchanged only with
Google's fixed OAuth endpoint. This mode is rejected on Vercel. Do not copy a
personal user credential into production; use the dedicated identity below.

1. Select the project linked to the credit shown in Billing. Expand the credit's
   usage scope and confirm coverage for first-party Gemini inference via Vertex.
   AI Studio's Gemini Developer API is a different billing path.
2. Enable `aiplatform.googleapis.com` in that project. Create a dedicated NoteFlow
   service account with the `roles/aiplatform.user` role on that project only.
   Do not grant Owner, Editor or billing administrator privileges.
3. This adapter uses service-account OAuth. Store its compact JSON as
   `VERTEX_SERVICE_ACCOUNT_JSON` in the ignored local env and Vercel's server-side
   environment. Never paste it in chat, commit it, or prefix it with NEXT_PUBLIC_.
   Rotate/revoke this credential if exposed. Workload Identity Federation is a
   preferable later improvement to avoid a long-lived private key.
4. Configure `VERTEX_PROJECT_ID`, `VERTEX_LOCATION` and a currently supported
   Gemini Flash `VERTEX_MODEL`. The model must be available in the chosen location.
   No model is selected implicitly. Global location may process across regions;
   use a supported regional endpoint if your data policy requires one.
5. Set `VERTEX_CREDIT_EXPIRES_AT` before the credit expiry and set positive
   `VERTEX_DAILY_REQUEST_CAP` and `VERTEX_TOTAL_REQUEST_CAP`. Every generation
   and source-review attempt counts, including provider failures and admin use.
   The total counter persists in the database and does not reset on deployment.
6. Set `AI_ADMIN_USER_IDS` to the intended administrator's Supabase Auth UUID.
   Email, display name and user-editable metadata never grant this privilege.
7. Apply `npm run db:migrate` to the intended database before running the new code.
8. Test locally against temporary storage, then set `VERTEX_ENABLED=true` and
   `AI_FEATURE_ROUTING=true` in the intended environment. Start with a small
   synthetic request, a low attempt cap, and inspect Google Billing to verify
   promotional-credit application before opening production traffic.

## Financial limits and release gate

The request caps are processing safeguards, **not a monetary billing guarantee**.
Request cost varies with input, output and model pricing. Credits may also be
consumed by other projects. Billing reports can lag. Use a verified eligible
Google Cloud spend-cap budget, a safety margin and monitoring before production;
ordinary alerts-only budgets do not stop spending. On an upgraded billing account,
uncovered usage may charge your payment method.

Do not claim live readiness until credit eligibility, IAM, model access, real-video
quality, observed costs and cron execution have been tested. The current automated
tests use synthetic content, mocked providers and temporary local databases.

Official references:
- https://docs.cloud.google.com/free/docs/free-cloud-features
- https://ai.google.dev/gemini-api/docs/billing
- https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/resources/throughput-quota
- https://openrouter.ai/docs/guides/routing/provider-selection

## Verification recorded October 26, 2026

- Full automated suite: 158 tests passed, including atomic weekly reservations,
  Monday IST boundaries, user isolation, admin allowance bypass, BYOK bypass,
  zero-price small-feature routing, fixed Vertex hosts, expiry/cap rejection,
  and a synthetic queue generation plus source review charged once.
- An additional rollout-preflight regression test passed (six preflight tests total).
- TypeScript and Next.js production build passed.
- Existing browser QA passed with feature routing enabled and external network
  blocked, using temporary local data. Desktop/mobile screenshots inspected.
- Live Vertex Gemini 3.8 Flash: synthetic summary and source review completed in
  two steps, using one weekly reservation in an in-memory database.
- Live OpenRouter small-tool probe returned valid structured output at reported
  cost zero. An earlier probe returned HTTP 404; free routing availability varies.
- Production migration 0004 applied; Vercel production environment configured with
  a dedicated service account, 100 Vertex attempts/day, 1,000 total attempts and
  a January 18, 2027 UTC shutdown time before the credit's January 19 expiry.
- Credit deduction and a monetary spend cap remain unverified. Request counters
  are not a guarantee of zero out-of-pocket charges.
- Local gcloud ADC is an authorized-user credential. Its file contents were not
  copied into the repository or deployment environment. Production uses the
  dedicated service account instead.
