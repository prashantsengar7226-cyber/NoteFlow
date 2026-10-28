# Gemini routing and Vertex spending

## Regular users: one Gemini model

Shared AI uses one Gemini Developer API model, with no automatic provider or model fallback. Summary drafting and source review use that same model. All transcript parts must be processed before a summary is marked complete; existing checkpoints, citation checks and queued recovery remain. Personal connections remain an explicit user choice. Vertex remains restricted to database-authorized admins and superusers.

Configure a separate Google AI Studio project that shows **Free** under its plan. Do not reuse a billing-enabled Vertex project's key and call it free.

```dotenv
GEMINI_FREE_API_KEY=<server-only key from that Free-tier project>
GEMINI_FREE_MODEL=gemini-3.6-flash
GEMINI_FREE_TIER_CONFIRMED=true
```

Set the confirmation flag only after checking the project. The flag is an operator attestation, not a Google API guarantee; recheck if project billing changes. A missing key or confirmation disables shared inference. NoteFlow never falls back to a paid key to bypass the free quota. Gemini's request/token limits still apply; API access and model availability depend on the project. Existing `GEMINI_API_KEY`, Groq and OpenRouter settings are not used for shared inference when `AI_FEATURE_ROUTING=true`.

Google describes free and paid projects in its [billing documentation](https://ai.google.dev/gemini-api/docs/billing) and model availability in [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing). Free-tier data handling differs from paid service terms; review those terms before sending sensitive sources.

## Cost access and metering

Open **Administration → Vertex costs**. An admin can see only their own usage and attributed charges. A superuser can see all recorded requests, totals, model breakdowns and per-account spending. Role and suspension checks run server-side on every request. There are no usage caps or spending cutoffs in this feature.

Apply `0006_vertex_costs.sql` with `npm run db:migrate` before deploying. New Vertex requests write a durable attempt record before contacting Google. On a response, NoteFlow records input, cached-input, output and thinking tokens. Invalid generated content can still cost money, so metering occurs before semantic validation. Requests with missing usage or unknown outcomes are shown as unpriced. Unpriced requests are excluded from estimates, never presented as free.

Estimates use standard text-generation list prices in USD, with per-request pricing versions and the request's region. Supported rate entries are in `lib/vertex-costs.ts`, sourced from [Google's pricing page](https://cloud.google.com/vertex-ai/generative-ai/pricing), checked 28 October 2026. Output includes thinking tokens; cached tokens are removed from ordinary input before applying cached-input rates. Unknown models remain unpriced. Discounts, credits, tax, negotiated prices and future rate changes can differ from the estimate. Keep this table reviewed as models change.

Old attempt counts contain no token metadata and cannot be retroactively converted to accurate costs. Tracking starts with this release. Historical per-admin attribution cannot be recovered when requests lacked labels.

## Actual charges: Google Cloud Billing export

Actual reported charges are a separate data source. Never add them to the token estimate. The dashboard reports Vertex usage in the configured project; it is not the entire Google billing account or a final invoice.

1. In Google Cloud Billing → Billing export → BigQuery export, enable **Standard usage cost** export for the billing account attached to NoteFlow. Choose a dedicated dataset in the desired location.
2. Enable the BigQuery API in the dataset project. Google creates a table named `gcp_billing_export_v1_<BILLING_ACCOUNT_ID>` after export starts. Initial data can be delayed. Follow [Google's export setup instructions](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-setup).
3. Prefer a separate read-only billing service account. Grant **BigQuery Job User** on the query/dataset project, and **BigQuery Data Viewer** only on the billing export dataset. It does not need Owner, billing-management, or Vertex-inference permissions. Its JSON can be stored in server-only `CLOUD_BILLING_SERVICE_ACCOUNT_JSON`. If omitted, the existing Vertex identity must have these limited query permissions.
4. Add these server-only settings locally and to Vercel Production, then deploy:

```dotenv
CLOUD_BILLING_EXPORT_TABLE=your-project.your_dataset.gcp_billing_export_v1_ACCOUNT_ID
CLOUD_BILLING_EXPORT_LOCATION=US
CLOUD_BILLING_SERVICE_ACCOUNT_JSON=<optional dedicated service-account JSON>
```

Use the actual dataset location, for example `US`, `EU`, or `asia-south1`. Do not paste credential contents into chat or Git.

5. As superuser, choose a usage month and click **Sync billing export**. Sync replaces that month's snapshot atomically; repeated syncs never add duplicate charges. An incomplete query leaves the previous snapshot intact. Other admins can read their own imported charges but cannot trigger queries.

Requests carry `app=noteflow` and a stable hashed `noteflow_owner` label. No email, transcript or secret is sent in labels. Google forwards supported request labels into billing exports. Export rows without a matching label are shown as **unattributed / older project usage** only to the superuser. See [Google's label documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/add-labels-to-api-calls).

The query filters the configured project, Vertex service ID and UTC usage month. Credits are aggregated without multiplying usage rows. Currencies stay separate; there is no invented exchange rate. Gross charges, credits and net reported costs are shown separately. Export time and sync time are visible. Recent usage may be absent, and Google can apply later adjustments. No data does not mean zero cost.

BigQuery storage and queries can incur their own charges. Queries are manual, rate-limited, parameterized and capped at 1 GB processed per query; normal dashboard refreshes read the local snapshot and do not query BigQuery. Large exports may need a reviewed query-limit change. The integration does not change Cloud Billing budgets, payments, services or administrator allowances.

## Verification

Automated tests cover free-key routing, no paid fallback, token calculations, missing metadata, admin isolation, CSRF, superuser-only sync, credits/currencies, idempotent imports and incomplete-result preservation. Browser checks use temporary data. Real Gemini inference requires a confirmed Free-tier key. Actual billing verification requires the export and read/query permissions above; a configured service account alone does not establish a working billing export.

### Release status — 28 October 2026

- Local automated suite: 187 passing tests. The multi-part summary test verifies the final transcript section is processed, and a Gemini quota response cannot trigger another provider.
- The production build and 20 browser check groups pass, including admin cost isolation and header refresh with automatic updates paused. Browser verification uses two synthetic accounts and temporary local storage; it does not certify live Google inference or billing. A configured-secret scan of 85 changed-source/browser-asset files found no matches.
- The additive `0006_vertex_costs.sql` migration has been applied after a verified backup and migration rehearsal. Existing notes and access roles are preserved.
- A dedicated API-restricted key was created in the existing billing-disabled Gemini project and saved locally and to Vercel Production. Billing status was checked through Cloud Billing API. Application rollout is being verified; no fallback to the old paid-project key is allowed.
- BigQuery is enabled and the private `noteflow_billing` dataset (US) is ready. The server identity has dataset read access and query-job permission. The operator confirmed Standard billing export activation. Server-identity dataset access and a zero-data query both passed (HTTP 200). Google has not created the export table yet; actual billed totals remain unverified until export data arrives. Token estimates begin with new metered requests; earlier spending cannot be reconstructed from old request counts.

After configuring the Free-tier key, run `node tests/run.mjs --live-free-performance` using Node 24. This opt-in test sends synthetic text to Gemini, allows at most six generation requests, and verifies summary persistence and quiz generation in temporary storage. A passing result is a bounded smoke test, not a guarantee of unrestricted quota or video accuracy.

Live setup checks on 28 October 2026: a synthetic Gemini summary and source review completed in 11.8 seconds; a later run received HTTP 503 and retained retry state. A separate one-request Vertex test recorded 17 input, 1 output and 59 thinking tokens, with a USD 0.0005655 list-price estimate in temporary local storage. This verifies token metering, not an invoice.

The queued Gemini test recovered from a 503 and completed the summary/source review in 27.6 seconds within six upstream calls. Its quiz step was blocked by the test request ceiling (not a provider quota). A separate one-call quiz retest completed in 4.4 seconds with four correctly scoped questions, including the distinction between 2025 purchases and the cumulative book total. These are synthetic checks, not a real-video accuracy certification.
