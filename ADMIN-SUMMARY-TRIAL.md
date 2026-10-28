# Admin summary trial

Production rollout setting: `SUMMARY_PIPELINE_TRIAL=admins`.

Only admins and superusers confirmed in `user_access` receive adaptive batches, targeted repair and source-bound review caching. Client metadata and personal API keys cannot grant eligibility. Ordinary users retain the non-trial path. The local-only `SUMMARY_LARGE_BATCHES` flag cannot enable the production trial.

Validation: 197 tests pass, including role forgery, demotion, disabled rollout, and rollback of an unchecked large draft; optimized production build succeeds. Local real-provider benchmark completed the 204-section transcript in 132.432 seconds with 28 requests. This does not guarantee live timing or 95% accuracy; completeness, browser recovery, and personal-key checks remain part of the limited trial.

## Disable safely

Set the Vercel Production environment variable `SUMMARY_PIPELINE_TRIAL=off` and redeploy this release. Environment changes require redeployment. This disables new trial processing and converts unfinished version-4 plans to smaller remaining batches when resumed, preserving checked prefixes. Unchecked drafts may be regenerated. Do not revert to a pre-version-4 binary while trial jobs exist; that binary does not understand the larger batch boundaries.

No database migration, authentication setting, role assignment, provider key, or scheduler credential is changed by this release.
