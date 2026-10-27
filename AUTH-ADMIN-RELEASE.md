# Authentication and administration release

## Scope

Signup validation, confirmation and password recovery screens, a restricted PKCE callback, confirmed-identity checks, and graphical administration analytics. Existing account IDs and roles are preserved. No production user records or database tables are deleted or rewritten.

## Verification

- Production build completed successfully.
- Automated suite: 177 tests passed, zero failures.
- Final browser suite: 19 groups passed, zero failures, including signup validation, password reset/global sign-out, all six admin sections, role revocation, user isolation and study tools.
- Browser verification uses a real Next.js server and temporary local Turso-compatible database, with synthetic Supabase identities. It does not establish live email delivery.
- Visual review covers desktop and mobile forms and dashboard. Low-count axis labels, mobile chart readability, account identification, and stale form feedback were corrected.

## Activation boundary

Production Supabase currently auto-confirms signups. The owner has no configured email sender. Confirmation and password-reset delivery remain pending SMTP setup and an actual inbox test; they are not advertised as operational. Existing confirmed users retain access.

`supabase/inspect-structure.sql` is a read-only inspection plan, not an executed production schema audit. Supabase owns authentication; application records and roles remain in Turso. No duplicate identity database was introduced.

See [AUTHENTICATION.md](AUTHENTICATION.md) for sender setup, redirect configuration, policy activation, and live verification steps. The configuration script defaults to a plan and requires explicit delivery verification before activation.
