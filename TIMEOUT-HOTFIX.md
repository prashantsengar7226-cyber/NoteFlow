# Legacy summary timeout recovery — 26 October 2026

The reported live note stopped after one of three summary parts. Its personal allowance was not exhausted. A timeout leaves the source and finished parts saved, but the previous resume path retried the same large legacy section indefinitely.

This focused hotfix adds character-preserving multilingual chunk sizing and upgrades only the unfinished suffix of a legacy run after a saved timeout or input/output-size failure. The completed prefix, summary contents and run ID are retained. The displayed total can increase because remaining text is now processed in smaller requests. Reopening, replay and another failed provider attempt retain the new plan; failed generation is refunded according to the existing quota policy.

Validation: 106 automated tests pass, including the three-part legacy reproduction, a second timeout, refund, reopen, replay and exact source-suffix delivery through completion. The production build and browser-secret scan are checked before pushing. Tests use fixture providers and temporary local data; no customer note was changed during testing.

This does not guarantee provider availability or resolve the separate factual-accuracy failures. No experimental language/context prompts, provider retries or competitor code are included. No environment changes or SQL migration are required.

After deployment, refresh the site and use Resume summary. There is no need to delete the note or switch to Basic to recover this old run. Do not roll back to a version that ignores the stored `legacyPrefix` plan while upgraded runs are pending; preserve this reconstruction code in any rollback build. Sources and completed summaries remain stored.
