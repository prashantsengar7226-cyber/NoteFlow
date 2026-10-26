# Vertex summary repair — 27 October 2026

The affected account's failing note was identified through its authenticated
browser session. Diagnosis was scoped to that note. No private source, account
credential, or production audit fixture is included in this repository.

## Changes

- Vertex response schemas now preserve enumerated IDs. Reviews select existing
  source passages; the server resolves the original Unicode text instead of
  requiring the model to retype evidence quotes.
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
  repaired review format, output settings and queue pacing. Full completion and
  live deployment results are recorded separately after verification.

## Accuracy boundary

These checks establish agreement with the supplied transcript. They do not
independently establish real-world truth, inspect unseen slides, or prove a
95% accuracy rate across videos. A credible percentage requires a representative,
human-labelled evaluation set measuring both supported claims and key-fact recall.
The interface must not describe copied excerpts or unchecked drafts as AI results.

Model configuration reference:
[Google's Gemini 3.5 Flash guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-5-flash).
