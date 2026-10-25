# Public reference analysis continuation

Reviewed 25 October 2026. Reference: [NoteGPT](https://notegpt.io/youtube-video-summarizer). Analyzer: [REA](https://github.com/morluto/rea), published `rea-agents` CLI 6.8.0. This continues the earlier entry-bundle analysis; it does not assert access to the competitor's private implementation.

## Coverage and evidence

Selected seven publicly linked routes: notes, PDF summary, video summarizer, quiz generator, flashcard maker, YouTube summarizer and transcript generator. Downloaded 59 public JavaScript assets from the observed NoteGPT CDN, including direct imports and selected transcript/transport helpers. Downloads were treated as inert text. No downloaded code was executed, authenticated route entered, or competitor API invoked.

Four REA passes parsed 58 distinct files with zero syntax failures. Semantic analysis remains partial: dynamic calls/imports, node-retention budgets and unresolved relationships are explicitly recorded in its evidence. The original 876,887-byte entry still exceeds REA's fixed 8 MiB complete-fact checkpoint. A separate TypeScript syntax pass parsed that file with zero diagnostics, inspecting 231,172 AST nodes and inventorying imports. This fallback establishes readable syntax and route/import evidence, not a completed semantic graph.

Local, excluded evidence lives in `audit/reference/continuation/`: URL/hash manifests, four REA summaries and evidence bundles, progress logs, and `coverage-report.json`. `scripts/reference-audit.mjs` collects the selected public assets; `scripts/reference-coverage.mjs` consolidates saved analysis results. REA results depend on the downloaded snapshot; the live site may change.

## Findings compared with NoteFlow

| Area | Observed in public client code | NoteFlow result / remaining gap |
| --- | --- | --- |
| Source acquisition | `C0oCZHqZ2.js` and `CKwRs4bx2.js` contain source-specific transcript/conversion wrappers, task status polling and cancellation handling. | NoteFlow imports YouTube transcripts, polls provider jobs, and supports text/PDF/subtitles. It does not infer content from video frames. Audio transcription and scanned-document OCR remain outside the current enabled features. |
| Conversion jobs | Client wrappers include media conversion start/status, transcript generation/status and document conversion routes. | Transcript jobs are polled. Summary parts persist with leases, replay protection and manual resume. Summary generation remains request-driven, not an unattended job queue. |
| Answer delivery | `CjWeWVAs2.js` constructs streamed completion/question requests and reads model configuration by business context. | NoteFlow returns validated structured study artifacts and progress after each saved summary part. It does not stream unvalidated partial JSON into a saved artifact. |
| Model choices | Client code exposes model configuration and a default model name. | NoteFlow uses configured server-side candidates, strict schema/citation-ID validation, bounded fallback and shared cooldowns. Public client names do not reveal the competitor's actual server routing or private prompts. |
| Input bounds | A public client path slices source text at a fixed length for some model choices. | NoteFlow summary chunking preserves every source character, with character and multilingual token-estimate bounds for new runs. Processing all source text still does not prove retention of every fact. |
| Study tools | `CvgVhQWz2.js` contains flashcard creation/status and learning-test helpers; selected route modules expose quizzes and flashcards. | Existing NoteFlow insights, mind maps, flashcards/practice, quiz, slides, translation and source chat remain available. Local route tests cover persistence and owner isolation; the browser suite exercises all nine tabs and exports. Live model quality is not verified for every tool. |
| Batch work | `B6Q6AWJE2.js` includes batch task/status, export and abort/progress handling. | NoteFlow has PDF batch import/summary/export. Its visible progress is based on saved operations. No parity claim is made for the competitor's batch capacity, scheduling or reliability. |
| Workspace | Public routes separate source ingestion, notes and study tools. | The existing NoteFlow source-left/notes-right workspace keeps NoteFlow branding and additional tools. No competitor assets, branding or implementation code were placed in the application. |

Endpoint names and request shapes are observations of client intent, not evidence that an endpoint works as expected or that the backend implements a particular architecture.

## Still unverified

- Private prompts, model routing, queues, databases, authorization and server-side limits.
- Authenticated and paid workflows, dynamic imports outside the selected snapshot, and behavior under load.
- Competitor summary completeness, latency or factual accuracy on the supplied video. No controlled head-to-head generation was performed.

The analysis now covers substantially more public evidence than the earlier single-bundle attempt. It is not complete reverse engineering of the whole service. The real-video tests and remaining NoteFlow quality failures are recorded separately in `VIDEO-QUALITY-AUDIT.md`.
