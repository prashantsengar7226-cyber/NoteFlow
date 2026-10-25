# Free launch → one-time Pro

Release 14 keeps every currently available tool in the free launch. No recurring subscriptions, checkout charges, payment credentials or price are enabled by this release. Audio-file transcription and OCR remain unavailable. Existing personal and shared allowances remain in force.

## Policy and environment

| Setting | Launch default | Purpose |
| --- | --- | --- |
| `MONETIZATION_MODE` | `free_launch` | `one_time` restricts new AI operations and YouTube imports to verified Pro accounts. Basic summaries, saved work and exports remain available to free accounts. |
| `BILLING_ENABLED` | `false` | Must be exactly `true` to create a checkout. |
| `PRO_PRICE_PAISE` | blank | Server-owned integer INR price in paise, at least 100. No price is selected in the source. |
| `RAZORPAY_KEY_ID` | blank | Server setting; public key ID is sent to Checkout only when needed. |
| `RAZORPAY_KEY_SECRET` | blank | Server secret; never prefix with `NEXT_PUBLIC_`. |
| `RAZORPAY_WEBHOOK_SECRET` | blank | Separate webhook secret; never put in the browser. |

Keep all values in hosting environment settings or a git-ignored `.env.local`, never in chat or source control. Redeploy after changing them. Checkout also requires one-time mode, a valid price and all three Razorpay settings. Changing a database account's legacy `plan` field does not grant access. Verified captured purchase records determine access. Test and live orders are isolated by key mode; test purchases never confer live Pro access.

Pro currently uses the same personal daily allowances as the launch: **20 AI operations and 3 YouTube imports per UTC day**, up to 1,000 notes. A long summary consumes multiple operations. Shared caps are **100 AI operations and 20 imports/day** across the site. One operation can make up to three bounded provider attempts. One-time payment does not fund unlimited ongoing AI use. Decide sustainable pricing, included allowances and shared capacity before selling access; keep the published plan and policy constants consistent.

## Activate first in a separate test deployment

1. Use an isolated database and authentication environment. Apply all migrations; `0002` adds billing records, event receipts and unique order/payment constraints. Vercel uses `npm run db:migrate`; Sites applies its declared migrations during publication.
2. Configure a Razorpay test key pair, webhook secret and the chosen test price. Set `MONETIZATION_MODE=one_time` and `BILLING_ENABLED=true` only there. Configure automatic capture in the merchant dashboard. Authorized-only payments do not unlock tools.
3. Register the deployment's `/api/billing-webhook` URL for `payment.captured`, `refund.processed`, `payment.dispute.created` and `payment.dispute.lost`. Use the exact configured webhook secret. The endpoint is public but accepts payment changes only after raw-body HMAC verification and provider lookup.
4. Test a real Checkout flow in test mode with two separate signed-in accounts: success, dismissal, authorization without capture, interrupted callback, retry, duplicate webhooks, full refund and dispute. Verify that account B cannot refresh or read account A's purchase. Automated tests mock Razorpay; they do not replace this merchant end-to-end check.
5. Publish the final price, ongoing usage allowances, service duration/terms, privacy and refund/support policy before enabling live sales. Configure live credentials and the live webhook separately. Confirm database recovery, provider budgets and email delivery. Keep production in free launch until these decisions and checks are complete.

## Payment behavior and support

- Checkout creation uses the authenticated account and server price. One active order per account/environment is enforced by a partial unique database index. Retrying reuses an existing created order.
- Browser callbacks must match the saved order, pass signature verification and agree with the provider's amount, currency and captured status. A browser redirect or client-selected plan cannot grant access.
- Webhook event IDs are deduplicated. The event receipt and entitlement update commit together. Full refunds and disputes revoke paid access; delayed captured callbacks cannot undo those terminal states. Partial refunds retain access. Dispute reversal requires manual review; it does not automatically restore access.
- Purchase history's **Refresh status** retrieves the provider's current payment state for the account-owned order and can recover a missed callback. This is not a scheduled background reconciliation service.
- If order creation times out with an unknown outcome, the record remains `creating`. Do not repeatedly create replacement orders. An operator must search the merchant dashboard/API using the purchase UUID as the receipt, verify account/environment/amount/currency, and reconcile the provider order. If no order exists, confirm that outcome before closing the local reservation. No automated recovery can safely assume that a timed-out create request failed.
- Turning off checkout stops new sales; webhook verification still handles existing transactions when credentials remain configured. Keep old webhook credentials available through in-flight delivery and plan rotations carefully. Changing key mode switches which purchase environment is considered active.
- The app stores purchase references and amounts, not card details. Customer receipts/invoices and tax treatment are merchant responsibilities; there is no invoice or refund administration UI here.

## Growth and operating limits

The app has verified per-user identities, owner-scoped queries/exports, durable storage, atomic quota reservations, server-owned entitlements, unique purchase claims and resumable summary steps. Vercel uses stateless Next.js routes with Supabase authentication and remote libSQL storage. It does not use a local production database.

This is a bounded launch architecture, not a demonstrated high-volume service. The library loads up to its 1,000-note cap; add cursor-based database pagination/search before increasing that cap. Long jobs currently advance from an open browser tab; for unattended processing, add a durable queue, worker leases, retries and a status endpoint before removing that requirement. Run concurrency/load tests against the actual hosting/database plan, monitor latency and quota exhaustion, and validate backup/restore before a paid rollout. Shared launch caps must be revisited with real provider budgets; adding users does not automatically increase capacity. No throughput or uptime claim is implied by passing unit tests/builds.

Official payment references:
- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- https://razorpay.com/docs/webhooks/validate-test/
- https://razorpay.com/docs/api/orders/create/
- https://razorpay.com/docs/api/payments/fetch-with-id/
