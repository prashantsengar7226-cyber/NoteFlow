# NoteFlow administration

Open `/admin` after signing in. The workspace sidebar and Account screen show the dashboard link and your current role. Account also shows the Supabase UUID, so similarly named accounts can be distinguished.

## Roles

| Capability | User | Administrator | Superuser |
| --- | --- | --- | --- |
| Own notes and study tools | Yes | Yes | Yes |
| Paid Vertex summaries/insights | No | Yes | Yes |
| Product operation allowances | Regular policy | None | None |
| Operations dashboard, jobs, events and audit | No | Yes | Yes |
| Appoint/remove admins; suspend/restore users | No | No | Yes |
| Read database schema, counts and migrations | No | No | Yes |

Initial superuser approved by the owner: `d0f9df9a-0f17-498f-a81b-351194c73bcd`. This is an existing Supabase identity, not a new password-based account. No password is created or stored by this feature. The previous `AI_ADMIN_USER_IDS` environment setting no longer grants permissions.

In **People & roles**, locate the account by verified email or UUID, choose **Manage access**, select Administrator or User, enter a reason, and confirm. Accounts appear after using the workspace; existing records without a recent login may show UUID only. This directory does not claim to list every Supabase registration. Ordinary admins cannot change roles. Superuser accounts cannot be changed in the dashboard; database triggers protect the last active superuser from removal or suspension.

## Operations and data

Overview shows actual account/note/job counts, a seven-day note trend, recorded error codes, Vertex request counts and scheduler heartbeat. Connection badges report configuration, not provider uptime. Live events refresh every ten seconds while the page is visible; updates can be paused. Events include accepted requests, safe error codes, summary transitions, scheduler requests and Vertex responses. No raw headers, tokens, provider responses, passwords or transcripts are stored in these logs. Request acceptance is not proof of completion. This is an application event feed, not a Vercel or Supabase infrastructure log drain.

Administrative mutations require same-origin authenticated requests, a reason, schema validation and server-side role checks inside the write transaction. Role revisions prevent stale edits. Successful mutations and audit records commit together. Audit rows are append-only through database triggers. Operational events are pruned after 30 days when the scheduler runs; administrative audit history is retained.

Retry and cancel actions preserve saved content. Retry refuses an active lease or a newer job on the same note. Cancellation invalidates the job lease; an already-sent provider request may still finish upstream. Revocation is checked on subsequent API calls, queued AI execution and again before paid Vertex requests. It cannot recall a request already sent to a provider.

Database view is limited to approved schema, counts and migration names. It excludes credential tables and arbitrary SQL. Visible-page JSON exports contain only displayed management data. The CLI handles private backups, restores and migrations. This dashboard does not grant access to other users' transcript content, Supabase passwords, provider billing consoles or deployment secrets.

## Administrator allowances

Admins and superusers bypass daily AI/YouTube allowances, note-count capacity, queued-job count and NoteFlow Vertex attempt caps. Vertex attempts remain metered. Provider quotas, account billing/credit expiry, content/file-size validation, network timeouts, per-minute abuse throttles, worker leases and bounded retries still apply. These protect request integrity and service operation. Unavailable audio transcription is not enabled by a role change.

## Deployment and recovery

1. Run `node scripts/backup-database.mjs` with Node 24. It saves a private ignored SQL dump, verifies an in-memory restore and rehearses pending migrations.
2. Run `node scripts/migrate.mjs` before deploying code that requires migration `0005_administration.sql`.
3. Run `node scripts/bootstrap-superuser.mjs <confirmed Supabase UUID>`. It permits only the first superuser bootstrap, records it atomically, and is idempotent for that same active superuser. It cannot create additional superusers once one exists.
4. Deploy and verify anonymous administration API requests are rejected. Sign in as the confirmed account to use the dashboard.

For recovery of a lost superuser account, use a separately authenticated database operator and verify the replacement Supabase identity first. Never expose a public bootstrap route or trust user-editable auth metadata. Keep existing role rows and audit history when rolling application code back; older releases that trusted the environment allowlist do not honor these new role decisions.

## Verification

The automated suite covers anonymous/regular-user denial, superuser-only grants, CSRF rejection, malformed roles, stale changes, demotion, suspension, paid-routing revocation, database audit protection, administrator allowance bypass, safe event recording and lease-aware job control. Browser fixtures cover all six sections, role assignment/revocation, database restrictions and desktop/mobile interactions. Fixtures use temporary local data and mocked identity verification; no live users are promoted for tests.
