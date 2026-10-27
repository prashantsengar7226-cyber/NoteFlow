# Administration rollout — 27 October 2026

The administration workspace adds database-backed user, administrator and superuser roles. The initial superuser is the owner-approved Supabase account `d0f9df9a-0f17-498f-a81b-351194c73bcd`. No other account was promoted in production.

## Completed checks

- 173 automated tests passed, including authorization, stale role edits, CSRF, suspension, revocation, audit immutability and administrator allowances.
- Production Next.js build and local deployment configuration checks passed.
- Browser tests cover six administration sections, grant/revoke flows, restricted database access, desktop/mobile layouts, existing study tools and sign-out. They use synthetic accounts and temporary local storage.
- Private production backup restored successfully in an isolated database. The additive administration migration passed its rehearsal before application.
- Production migration `0005_administration.sql` applied successfully.
- Confirmed the approved account has an active superuser role and exactly one bootstrap audit record.

## Scope and remaining verification

Production deployment and signed-out endpoint verification are recorded below after publication. Authenticated production dashboard interaction still requires signing in as the approved superuser; local browser results do not establish that a live sign-in was tested.

Admins have no NoteFlow product usage allowances. Upstream quotas, request validation, abuse throttles, bounded recovery and credit expiry remain. The event feed contains sanitized application events, not raw infrastructure logs. Database management exposes approved schema/counts/migrations; private backups and schema mutations remain operator CLI tasks.

See [ADMINISTRATION.md](ADMINISTRATION.md) for role assignment, monitoring and recovery instructions.
