# Authentication and data structure

## Ownership

| System | Responsibility | Authority |
| --- | --- | --- |
| Supabase `auth.users`, identities, sessions | Password hashes, confirmation, recovery, sessions | Supabase Auth API; never app SQL writes |
| Turso `user_directory` | Verified identity cache and last workspace activity | Server refresh from Supabase `getUser()` |
| Turso `user_access` | User/admin/superuser and suspension | Audited superuser actions; never editable auth metadata |
| Turso notes, artifacts, messages, jobs | Private study content and processing | Owner-scoped server queries |
| Turso `admin_audit`, `operational_events` | Role audit and sanitized application activity | Server only |

The same Supabase UUID identifies an owner across both systems. There is no cross-database foreign key. Do not duplicate passwords or role authority in Supabase public tables. Do not delete accounts or modify managed `auth.*` schema to make the dashboard look tidy. User deletion requires a separate approved retention/deletion workflow.

`supabase/inspect-structure.sql` is a read-only structure/grants/RLS/count audit for the Supabase SQL Editor. It does not expose individual auth records. It has not been run against production; the public API inspection does not prove all RLS policies are correct. No unnecessary public schema or destructive migration was introduced.

## Current rollout state — 27 October 2026

Public Supabase settings confirm `mailer_autoconfirm=true`: existing signup auto-confirms email. The owner has no custom SMTP service/domain yet. Therefore real email verification and reset delivery are **prepared, not activated or verified in production**. The application displays this status honestly. Existing confirmed accounts keep access. The server refuses identities whose `email_confirmed_at` is absent; it does not trust a cookie payload or editable user metadata.

New signup form: name (1–80 characters), email validation, exact password confirmation, 12–128 character passphrase, visibility toggle, duplicate-submit protection and bounded network waits. Existing login passwords are not trimmed or subjected to new signup-length rules. The frontend rule is not a substitute for the Supabase password policy; the production minimum is not audited until management access is available.

Confirmation-required signups show an inbox state. Resend and recovery requests use neutral responses, a 60-second UI cooldown and Supabase's server rate limits. The cooldown is usability, not an abuse-security boundary. `/auth/callback` exchanges a PKCE code, checks the confirmed user and allows only `/` or `/auth/reset-password`. Invalid/expired/reused/missing codes return a safe error without echoing tokens. Open emailed links in the same browser used to request them. Password reset checks the user session and updates through Supabase, then requests global refresh-session revocation; issued access tokens remain valid until expiry.

## Activation once an email sender is available

1. Configure a verified sender and custom SMTP in Supabase Authentication → Email/SMTP. Store credentials there, never in browser variables or Git. Verify sender/domain ownership and delivery to an address you control.
2. Set Site URL to `https://note-flow-blue.vercel.app`. Allow redirect URLs `https://note-flow-blue.vercel.app/auth/callback` and `https://note-flow-blue.vercel.app/auth/callback?next=/auth/reset-password`. Keep development URLs confined to the intended local/staging setup; don't add blanket wildcards.
3. Keep the default confirmation/recovery templates using `{{ .ConfirmationURL }}`. This application supports the PKCE callback, not an unconfigured token-hash template.
4. Enable Confirm email for new signups, set minimum password length to 12, keep secure email change on, and limit email token validity to one hour. Existing confirmed users are not rewritten or required to re-register.
5. Optional operator automation: place a temporary `SUPABASE_ACCESS_TOKEN` in your ignored local environment. Run `node scripts/configure-auth.mjs` for a redacted plan. After delivery is actually verified, run with `--apply --delivery-verified`. It refuses activation without configured SMTP, preserves existing redirect entries and touches no users. Do not deploy the management token; remove it locally after setup.
6. Test one disposable signup, confirmation, invalid/expired/replayed link, login, reset, new-password login and sign-out. Use an inbox you own. Check Supabase logs for delivery errors and confirm existing users still sign in.

No SMTP service or billing subscription was created. No production test emails were sent.

## Dashboard

Overview now includes UTC daily activity (7/30 days with zero-filled dates), source distribution, task-state bars, error drill-downs, service configuration and email-confirmation readiness. Counts are actual records, not sample analytics. Other totals are all-time. No chart is an AI-accuracy, uptime, or cost claim. Role grants, audit immutability, suspension, safe logs and limited database inspection remain unchanged.

References: https://supabase.com/docs/guides/auth/passwords · https://supabase.com/docs/guides/auth/auth-smtp · https://supabase.com/docs/guides/auth/server-side/creating-a-client · https://supabase.com/docs/reference/api/v1-update-auth-service-config
