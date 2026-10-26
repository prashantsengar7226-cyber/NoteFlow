# Source notes and AI recovery

When an AI summary starts, NoteFlow saves a small, deterministic set of source
excerpts before making the first provider request. Users can start reading while
AI enhancement runs separately. On a quota limit, timeout, unavailable model or
source-review failure, those notes remain available instead of a blank summary.

The user explicitly approved automatic labelled source notes on 26 October 2026.

## What users receive

- A **Source notes · no AI** label, a reason for the fallback and a full-transcript
  link. Excerpts retain the transcript language; they are not translations.
- Up to 12 original excerpts distributed across the source, including its first
  and last sections. Each carries its original source reference. Excerpts longer
  than 1,200 Unicode code points are visibly shortened with an ellipsis.
- Private PDF/Markdown export. Batch exports accept these labelled notes even
  while a separate AI enhancement is unfinished.
- Background AI recovery within the existing limits. When every AI part passes
  source checks, the complete AI result replaces the source-note fallback.

These excerpts are **not a complete AI summary or an independent fact check**.
The full transcript remains the complete source. Speech-recognition errors and
information shown only on video slides are not corrected by this feature.

## Safeguards

- Source-note creation uses no external AI request or AI allowance. An AI request
  started alongside it still follows the normal accounting rules.
- Shared users retain the 20-operation daily cap; personal connections retain
  provider limits. Provider cooldowns and the bounded retry policy are unchanged.
- A rejected draft stays private. Checked AI parts, repair feedback and the
  current provider/model/key remain intact. Existing completed AI summaries are
  never replaced by the fallback.
- Writes require the owning job's active lease, matching owner, matching source
  and matching prior summary. Cancellation or a newer write wins the race.
- Source text renders as text, with existing authenticated access and export
  checks. No new public route or authentication exception is introduced.
- No database migration or new environment variable is required.

## Verification

- 149 automated tests passed, including quota exhaustion, early availability
  during a pending provider call, cancellation, evidence failure, completed-AI
  preservation, owner isolation and bounded Unicode excerpts.
- Production webpack build and type checking passed.
- Eleven isolated browser QA groups passed using real Next routes and a temporary
  database. These covered missing-provider fallback, desktop/mobile layouts,
  private batch export, transcript navigation, authentication and all nine study
  tabs. External provider traffic was blocked; Supabase identities were fixtures.
- No new real-video AI accuracy claim is made. This change guarantees a local
  source-note path when the application/database and saved transcript are
  available; it cannot remove external quotas or guarantee an AI result.

Private runtime evidence is under ignored `audit/`. Do not publish those files.
