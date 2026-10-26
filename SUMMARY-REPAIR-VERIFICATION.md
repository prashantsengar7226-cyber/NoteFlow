# Summary repair verification — 26 October 2026

## Confirmed failure

Production logs showed three Gemini source-review responses rejected with Zod
`too_big` at `issues[]`. Correction prose longer than 300 characters was treated
as `INVALID_AI_OUTPUT`. The queue retained the draft and repeated its review,
instead of passing the corrections to regeneration. A subsequent user retry
also reached the provider's quota. These are separate failures.

## Changes

- Accept verbose textual rejection feedback inside the existing bounded provider
  response. Store/send at most 12 issues of 2,000 characters each. Non-text issues
  remain invalid. Any reported issue still rejects the draft.
- Retry content repairs after 15 seconds, within the existing three-failure
  budget. Preserve transport backoff, quota cooldowns, leases and owner isolation.
- Preserve a draft after invalid evidence and pass specific missing-claim or
  invalid-quote feedback to the next review. Clear feedback after acceptance.
  Require the complete evidence set again; never accept partial review output.
- Clarify that reviewer findings must be unresolved source discrepancies, not
  retracted reasoning, harmless source spelling differences or outside knowledge.
  Questions, predictions and possibilities must retain their uncertainty.
- Distinguish provider quota, correction work, invalid output, source-check
  failures and timeouts in queue messages.

## Checks and limits

- 143 automated checks passed, including verbose Hindi correction feedback,
  bounded private feedback, missing-evidence retry without another generation
  charge, rejected invented quotes, quota enforcement and cross-owner isolation.
- Production webpack build passed with type checking.
- Synthetic Hindi live test rejected invented claims, regenerated the draft and
  accepted it only after complete exact-source evidence. This is a narrow test,
  not an accuracy guarantee.
- Six explicitly approved live requests tested the reported first source section
  with the configured site key and isolated local storage. Generations took about
  7–11 seconds. Two drafts failed semantic review; the third failed evidence
  validation. **That section and the full video are not verified complete.**
  Final prompt clarification followed this finding; no further real-section
  requests were made under the six-request authorization.
- Production notes, personal keys, model selection and provider cooldowns were
  not modified by diagnostic tests. No database migration is required.

Private diagnostic fixtures and provider responses live under ignored `audit/`.
Never publish them. `node tests/run.mjs --live-repair --synthetic` uses only an
invented fixture; omitting `--synthetic` sends the explicitly prepared private
sample and requires authorization. Both modes use operator credentials and
in-memory application storage, with a six-request limit.
