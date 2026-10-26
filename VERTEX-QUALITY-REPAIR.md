# Vertex summary repair — 27 October 2026

The affected account's failing note was identified through its authenticated
browser session. Diagnosis was scoped to that note. No private source, account
credential, or production audit fixture is included in this repository.

## Changes

- Vertex response schemas now preserve enumerated IDs. Reviews select existing
  source passages; the server resolves the original Unicode text instead of
  requiring the model to retype evidence quotes.
- Evidence lists must be non-empty, and every claim must have exactly one verdict.
  The provider emits evidence and its brief comparison before the final verdict.
  Full cardinality is validated server-side; large nested schema bounds are
  omitted because live Vertex rejected them with HTTP 400.
- Each summary claim receives a source-fidelity verdict. Missing claims,
  unsupported claims, substantive omissions and invalid evidence still prevent
  publication. Citation metadata can be corrected only after a positive review;
  the server does not rewrite or silently accept unsupported claim text.
- Gemini 3.5 Flash uses LOW thinking, a 16,384-token output ceiling and a bounded
  120-second inference deadline. Diagnostic requests retain their shorter limit.
  The generation and review stages remain separate durable queue steps.
- Automatic source excerpts appear in a collapsed section of Transcript.
  Summary shows an honest pending state or checked AI output. A fallback no
  longer hides already checked partial output.
- Settings and the connection diagnostic identify the actual summary provider
  and model. Diagnostics now exercise the summary route, including Vertex.
- Existing ownership checks, per-user weekly reservations, global Vertex
  request caps, retry budgets and provider cooldowns remain enforced.

## Verification

- Automated suite: 163 passed, zero failed.
- Browser QA: 12 scenarios passed using temporary local data, including two-user
  isolation, private exports, sign-out, XSS handling, all study tabs, queue recovery,
  and source/result separation at 1440px and 390px widths.
- Next.js production build passed.
- Real Vertex authentication and inference succeeded. A synthetic Hindi fixture
  completed generation and review; its explicit numerical correction and proposal
  qualifications were retained on manual inspection.
- The authorized long Hindi transcript test preserves checked progress across
  retries. Initial runs reproduced evidence-format errors, output truncation,
  false source-review objections and a provider 429. Subsequent runs use the
  repaired review format, output settings and queue pacing. The complete test
  finished 20/20 parts, processed 204/204 source segments (78,087 characters), and
  saved 198 key points and 77 chapters. The saved result is AI output, with no
  extractive fallback. This was a resumed test; earlier checked parts were retained.
- The production summary diagnostic returned HTTP 200 using Vertex AI / Gemini
  3.5 Flash in 1,561 ms. Live desktop/mobile checks confirmed that source excerpts
  are under Transcript and checked partial AI output is visible in Summary.
- Production subsequently exhausted its repair budget on a section containing
  transcription errors. That exact section passed generation and review in a
  temporary test after correcting verdict order (about 4.7s and 5.4s per call).
  Deployment and the selected production task must be monitored independently;
  temporary completion does not prove that a production job has completed.

## Accuracy boundary

These checks establish agreement with the supplied transcript. They do not
independently establish real-world truth, inspect unseen slides, or prove a
95% accuracy rate across videos. A credible percentage requires a representative,
human-labelled evaluation set measuring both supported claims and key-fact recall.
The interface must not describe copied excerpts or unchecked drafts as AI results.

Model configuration reference:
[Google's Gemini 3.5 Flash guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-5-flash).
