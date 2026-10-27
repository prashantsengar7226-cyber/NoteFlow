# NoteFlow
<!-- impeccable:product-schema 1 -->

## Platform
web

## Product Purpose
Turn videos, transcripts and documents into source-linked study notes. The current user priority is to preserve important information and make failures, limits and progress understandable.

## Operating Context
The app is live on Vercel, with Supabase authentication and private Turso storage. The user requested a NoteGPT-style start/login experience and a side-by-side study workspace, while keeping NoteFlow branding and every existing additional tool working.

## Capabilities and Constraints
YouTube, text, PDF and subtitle imports; revision guides, transcript, personal notes, chat, insights, mind maps, flashcards, quizzes, slides, translation and exports. Regular users use free AI routes with provider limits; paid Vertex summaries and insights remain admin-only. Personal provider connections and queued recovery are implemented. Import limits remain enforced. External AI availability cannot be guaranteed. No owned training model, visual video understanding or OCR is implemented. The intended policy is email verification for new accounts while existing confirmed accounts retain access. With no SMTP sender/domain available, verification and recovery delivery remain prepared, not activated or verified in production; signup currently retains Supabase's existing auto-confirm policy.

## Evidence on Hand
Public NoteGPT page-family screenshots and bounded public-bundle REA evidence in ignored audit/reference; local application tests and isolated browser fixtures. No competitor server source or private prompts are available. User-supplied Hindi current-affairs videos have been used for provider diagnosis; no measured universal accuracy score is available. DESIGN.md specifies the current public site and workspace redesign.

## Authentication and administration extension — 27 October 2026

Account forms now include name/email validation, signup password confirmation and a 12–128-character passphrase rule; existing login passwords retain their original handling. Confirmation, resend and recovery states, a restricted PKCE callback and session-checked password reset are implemented. These application flows do not establish working production mail delivery. AUTHENTICATION.md records activation prerequisites and the current rollout state.

Administration remains an Operate workspace. Overview shows actual note activity across 7 or 30 UTC calendar days, including zero-count dates; all-time source distribution and task-state bars; 24-hour error-code drilldowns; and service configuration and identity/email setup state. These are recorded activity and configuration signals, not accuracy, uptime or cost measurements. Account UUID and role remain visible on desktop and mobile. Existing server-authorized roles and private data boundaries remain in force; this extension makes no claim that production schema cleanup or an exhaustive RLS audit has been applied.
