# NoteFlow
<!-- impeccable:product-schema 1 -->

## Platform
web

## Product Purpose
Turn videos, transcripts and documents into source-linked study notes. The current user priority is to preserve important information and make failures, limits and progress understandable.

## Operating Context
The app is live on Vercel, with Supabase authentication and private Turso storage. The user requested a NoteGPT-style start/login experience and a side-by-side study workspace, while keeping NoteFlow branding and every existing additional tool working.

## Capabilities and Constraints
YouTube, text, PDF and subtitle imports; revision guides, transcript, personal notes, chat, insights, mind maps, flashcards, quizzes, slides, translation and exports. Regular users use free AI routes with provider limits; paid Vertex summaries and insights remain admin-only. Personal provider connections and queued recovery are implemented. Import limits remain enforced. External AI availability cannot be guaranteed. No owned training model, visual video understanding or OCR is implemented. Email verification stays disabled by user choice.

## Evidence on Hand
Public NoteGPT page-family screenshots and bounded public-bundle REA evidence in ignored audit/reference; local application tests and isolated browser fixtures. No competitor server source or private prompts are available. User-supplied Hindi current-affairs videos have been used for provider diagnosis; no measured universal accuracy score is available. DESIGN.md specifies the current public site and workspace redesign.
