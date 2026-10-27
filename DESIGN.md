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
