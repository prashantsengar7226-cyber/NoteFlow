# Administration rollout — 27 October 2026

The administration workspace adds database-backed user, administrator and superuser roles. The initial superuser is the owner-approved Supabase account `d0f9df9a-0f17-498f-a81b-351194c73bcd`. No other account was promoted in production.

## Completed checks

- 173 automated tests passed, including authorization, stale role edits, CSRF, suspension, revocation, audit immutability and administrator allowances.
- Production Next.js build and local deployment configuration checks passed.
- Browser tests cover six administration sections, grant/revoke flows, restricted database access, desktop/mobile layouts, existing study tools and sign-out. They use synthetic accounts and temporary local storage.
- Private production backup restored successfully in an isolated database. The additive administration migration passed its rehearsal before application.
- Production migration `0005_administration.sql` applied successfully.
- Confirmed the approved account has an active superuser role and exactly one bootstrap audit record.
- All 18 browser test groups passed in the final run. The isolated SQLite fixture uses WAL and a bounded busy timeout for its direct setup connections after one fixture-preparation lock was observed.

## Scope and remaining verification

Release `c79645c` was pushed to `main` and verified at https://note-flow-blue.vercel.app on 27 October 2026 at 11:16 UTC. All six administration GET views and an anonymous mutation returned HTTP 401 without management data. `/admin` redirected signed-out visitors to `/login`. Seven existing public pages returned HTTP 200 with no browser errors. The private verification report is `audit/production/admin-live.json`.

Authenticated production dashboard interaction still requires signing in as the approved superuser; local browser results do not establish that a live sign-in was tested.

Admins have no NoteFlow product usage allowances. Upstream quotas, request validation, abuse throttles, bounded recovery and credit expiry remain. The event feed contains sanitized application events, not raw infrastructure logs. Database management exposes approved schema/counts/migrations; private backups and schema mutations remain operator CLI tasks.

See [ADMINISTRATION.md](ADMINISTRATION.md) for role assignment, monitoring and recovery instructions.
