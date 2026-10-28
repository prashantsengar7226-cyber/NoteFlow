# NoteFlow — source-first study workspace

Design specification, 27 October 2026. Written before this interface implementation.

## Intent and reference

Recreate the useful layout and interaction patterns of NoteGPT with NoteFlow branding, original copy, and NoteFlow's actual capabilities. Paste or upload a source, create a revision guide, check the evidence, then practise. Premium means readable typography, consistent spacing, responsive controls and clear states.

Evidence: ignored `audit/reference/design-review/`. Reviewed public pages: home, AI Note Taker, YouTube Video Summarizer, PDF Summary, AI Quiz Generator, AI Flashcard Maker, AI Mind Map Generator, AI Slide Generator, My Notes, Pricing, FAQ, Privacy and Terms. `/text-summarizer`, `/youtube-transcript`, `/about` and `/contact` returned 404. Private notes, checkout and authenticated competitor workflows were not accessed. This covers relevant public page families, not every model-specific or editorial URL.

## Product inventory

Preserve YouTube transcripts; PDF/text extraction; multiple PDFs in one note; Hindi and English; source references; revision topics and recall; personal notes; quizzes and flashcards; mind maps and slides; source chat; queued recovery; private workspaces and exports.

Regular users receive transcript-based guides through free providers, subject to provider capacity. Vertex summaries and insights stay restricted server-side to the existing admin UUID. Personal API connections retain provider/model selection. No universal accuracy or instant-completion claims. Source excerpts stay in Transcript and never impersonate an AI result. Unsupported audio transcription, image/video generation and OCR are not advertised.

## Page map

| Reference pattern | NoteFlow destination | Behaviour |
| --- | --- | --- |
| Home / AI Note Taker | Public home and Overview | Source tabs, central composer, study shortcuts |
| YouTube / PDF tools | Public tool pages | Supported inputs; continue into authenticated importer |
| Quiz / Flashcards / Mind map / Slides | Public tool pages and note tabs | Generate from saved source |
| My Notes | Library / Favorites / Collections | Existing search, sort, grid/list, organization and exports |
| Pricing | Access and Plans & access | Free access, provider limits, personal keys, admin-only Vertex; no fake checkout |
| FAQ | Help | Sources, queues, limits, accuracy |
| Account | Sign-in / Settings / account | Preserve validation, sessions, key privacy and permissions |
| Reading workspace | Existing note view | Source/chat left; broad reading sheet and wrapping tabs right |

No competitor logos, thumbnails, testimonials or plan claims are copied. Public preview is a clearly labelled illustrative study example with working Notes / Flashcards / Quiz, not purported output from a user's video.

## Visual system

- Canvas `#f7f9fc`, paper `#ffffff`, text `#182337`, secondary `#526176`, divider `#e2e8f0`.
- Primary blue `#245cf5`, hover `#1746c4`, selected fill `#edf3ff`; warm warnings and restrained green success.
- Local Noto Sans supports Latin/Devanagari. Body 14–16px, reading 15–16px / 1.8 line-height, public heading 42px desktop / 30px phone, page heading 28–32px.
- Desktop rail 224px, navigation targets 44px, thin border and compact groups. Mobile labelled menu, dismissible drawer and backdrop.
- Content max 1180px; public composer max 880px. Spacious title, source tabs, white input and clear blue action. Reading uses a 290–330px source column.
- Radius 8px controls, 12px panels, 16px composer. Shadows only on raised inputs/dialogs. No decorative gradients or invented statistics.
- Spacing 4/8/12/16/24/32/48/64. Borders/whitespace instead of boxing every paragraph.

The design-taste draw selected `page-is-the-object`: the actual study sheet and source composer are the object. The pinned NoteGPT reference overrides physical ticket/scallop/photo treatments that would obstruct the app. The example is HTML, not an inaccessible screenshot.

## Interactions and states

Public tabs change input instructions and source type. Public text may pass through same-origin session storage, never URL query strings; storage failure cannot block navigation. Files are selected in the authenticated importer. Links carry allowlisted tool identifiers only. Login preserves validation and accepts no arbitrary redirect destination.

Signed-in home: central composer, study shortcuts, recent notes. Library retains filters/actions. Note view retains every tool and distinguishes source status, progress, partial AI output, recovery and errors. Paid controls remain server-authorized.

Every control must work. Tabs support arrows; navigation marks current page. Existing dialogs keep focus traps/Escape. Preview flashcards flip, quiz answers give feedback. Help uses native details. Persistent labels, visible focus, announced errors, busy states and reduced motion are required.

## Responsive acceptance

1440px: rail plus centred composer, no competing promotional panel. 768px: collapsed navigation and adaptive columns. 390px: one column, no document overflow, 44px targets, wrapped tabs, stacked source/reading/chat and full-width actions. Long Hindi, URLs and errors wrap.

## Verification and release

Run production build and regressions. Browser-check public home, all supported tool routes, access, help, login validation, navigation, source handoff, library, settings, importer, reading tabs, revision guide and source-only state. Check desktop/phone, keyboard and console errors. Preserve authentication, routing, quotas and data boundaries. Record evidence and limitations; do not claim untested pages or unmeasured AI accuracy.

Implementation and browser evidence will be recorded in `DESIGN-RELEASE.md`.

## Reader replacement — user correction, 27 October 2026

The earlier reader is rejected: excessive margins, a narrow isolated source card, chat far below the source, and a wrapping cloud of 68 topic links made a long note difficult to use. Replace its structure, not just its colors.

Reference: NoteGPT's official workplace guide, https://notegpt.io/blog/how-to-use-the-notegpt-workplace, especially its AI Notes screenshot. It shows a broad source/video/transcript column beside a notes/chat working pane. Use that organization with NoteFlow's full tool set. Retain NoteFlow branding; the annotated reference image is research only, not a shipped asset.

Desktop reader: compact document header; approximately 42% source and 58% tools; video directly above a searchable transcript; notes/chat in the right pane; independent bounded pane scrolling. No unused grid row. All existing tools stay in a consistent tab bar, with Chat added there. Compact progress notices retain their truthful partial/queued state.

Revision guide: overview, compact search/recall toolbar, collapsed searchable contents list, and six topics per page. The contents list is vertical, numbered and bounded; it must never become a wall of inline links. Page controls and an optional read-all mode preserve access to every saved topic/fact and all citations. A real 68-topic Hindi fixture is required for QA; a one-topic sample is insufficient.

Phone: source/video and transcript inside an expandable source section, then the tool pane. No fixed-height reading pane on a phone; the document scrolls naturally. Tool tabs remain keyboard-accessible and wrap. Chat becomes a first-class tool, not a distant floating column. Existing source import, export, authentication, paid routing and generated content remain unchanged.

## Administration workspace

Mode: Operate. A dedicated `/admin` workspace uses a narrow dark navigation rail, white working canvas, compact tables and restrained blue actions. Sections: Overview, People & roles, Summary jobs, Live events, Audit history, and superuser-only Database. Current account UUID and role remain visible. Tables scroll horizontally on phones; navigation becomes a wrapping toolbar. Metrics describe real windows and unknown/unavailable states without invented activity.

Only the superuser grants or removes admins and suspends accounts. Access changes require a reason and explicit confirmation in a focus-contained native dialog. Protected superusers have no editable role control. Jobs offer state-aware retry/cancel actions. Logs refresh every ten seconds while visible and support pause/search/pagination. Event records contain safe codes and IDs, never credentials or transcript content. Database management exposes approved schema, counts and migration names, with no browser SQL console or credential rows. Provider limits and request safety limits are distinguished from administrator product allowances.

### Authentication and overview extension — 27 October 2026

Continue the established visual system in Operate mode: dark administration rail, white working surfaces, local Noto Sans, restrained blue controls and border-led grouping. This is an extension of the existing interface, not a new visual identity. Preserve the existing document structure and unrelated design decisions.

Overview pairs a broad daily-activity plot with source bars, followed by task-state and error panels and service/identity status. The activity selector explicitly offers 7 or 30 UTC days; zero-count dates stay present. A blue line, labelled totals and an expandable daily-values table make the plot readable without relying on color. Source and task bars retain text labels and counts. Task states open the matching queue filter; error codes open matching live events. Empty and unavailable states use factual text. Configuration status must remain distinct from provider uptime, and email setup must remain visibly pending until enabled.

Keep the existing responsive rail-to-toolbar behavior and stack analytical panels as space narrows. Account UUID and role stay visible on phones, with long identifiers wrapping. Preserve horizontal table scrolling, readable chart labels, visible focus, and mobile action targets of at least 44px.

Authentication extends the existing white form card with persistent labels, blue primary actions, password visibility control, passphrase guidance and confirmation fields. Neutral status, warm error and restrained green success feedback use text as well as color; busy states prevent duplicate submissions. Confirmation/resend, recovery and reset screens must explain unavailable delivery and invalid or expired sessions without promising an email that the current setup cannot send. The reset card uses the same form language. Product policy and deployment prerequisites remain in PRODUCT.md and AUTHENTICATION.md.

Evidence for this extension: `app/admin/overview.tsx`, `app/admin/dashboard.tsx`, `app/admin/admin.css`, `app/login/page.tsx`, `app/login/auth.css`, and `app/auth/reset-password/page.tsx`. These source observations document implemented presentation and interaction decisions; they do not establish production mail delivery or completed database cleanup.

### Implemented interface refinements — 28 October 2026

The existing visual system continues. `app/visual-refinement.css`, imported after the other root styles in `app/layout.tsx`, refines library cards and revision reading. YouTube cards use actual source thumbnails for valid video IDs, with lazy loading and failed images hidden. Titles, source labels and metadata remain readable; card hover movement respects reduced-motion and the application motion-off setting.

Revision topics keep key facts visible and place supporting explanations inside a nested native disclosure, initially closed. A search matching the explanation opens that disclosure; explanation-only topics remain directly readable. Citations remain attached to their content. Reading spacing and line height favor long Hindi and English text without replacing the existing reader structure.

Vertex costs retain the Operate dashboard's dark rail, white surfaces, local Noto Sans and blue emphasis. A compact metric strip highlights the estimate beside request and unknown-cost counts. Tracking history/calculation and billing methodology use native disclosures; unknown-cost warnings and the distinction between estimates and reported charges remain visible in the main report. Responsive panels and tables retain their existing behavior.

Evidence: `app/workspace.tsx`, `app/revision-guide.tsx`, `app/visual-refinement.css`, `app/admin/costs.tsx` and `app/admin/admin.css`. The production build and 20 isolated browser QA groups passed. Desktop/mobile captures were reviewed for the cost dashboard, workspace and revision reader; the fixtures do not demonstrate loaded YouTube thumbnails. No MotionSites research or integration is claimed: its connection was blocked by automatic approval review's usage limit.

### Collapsible navigation
Workspace and administration provide a desktop header toggle to hide or restore the sidebar. Preferences are stored separately in local storage and tolerate unavailable storage. The toggle exposes its expanded state and controlled region, remains keyboard accessible, and stays outside the hidden sidebar. At 760px and below, the existing workspace drawer and administration navigation remain available regardless of the desktop preference.
