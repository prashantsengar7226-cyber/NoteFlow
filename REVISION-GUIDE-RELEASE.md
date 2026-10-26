# Transcript revision guides — 27 October 2026

## Current behavior

- With `AI_FEATURE_ROUTING=true`, regular accounts use zero-price OpenRouter models for summaries, insights and smaller study tools. No NoteFlow daily or weekly AI allowance applies. Provider quotas, request throttles, source limits and account leases remain enforced.
- Vertex summaries and insights require an authenticated owner in the server-only `AI_ADMIN_USER_IDS` allowlist. The final Vertex inference function also checks this policy before authentication or spending. Queue workers use the job owner's identity; the worker secret does not confer admin privileges. Admin small tools still use the free route. A personal connection continues to use that user's selected provider.
- The existing admin allowlist is unchanged. The currently signed-in test account has not been promoted.
- Shared OpenRouter requests require zero input/output/request pricing, constrained structured output, throughput routing and low reasoning effort. No paid fallback is introduced. A catalog listing does not guarantee an available endpoint.
- Every transcript chunk is preserved. Drafts are checked against source passages before publication. Rejected drafts and concrete feedback are retained privately for targeted repair; accepted parts are not rewritten on retries.
- The revision guide organizes the saved key points into source-ordered topics. Search and recall mode work locally with no extra model calls. Names, numbers, dates, definitions, caveats and explicit corrections are requested in the generation prompt. Citations remain available beside notes.
- Extracted source notes remain in Transcript and are not presented as a completed AI result. Partial AI guides are explicitly labelled. PDF/Markdown exports retain all saved summary content.

## Verification

- Production build and typecheck passed.
- 166 automated checks passed, including the final paid boundary, free queued generation/review, all feature routing, source evidence, repair context, lossless topic organization, isolation and PDF content.
- 12 isolated browser scenarios passed with real local application routes and a temporary database: desktop/mobile revision guide, search, recall, nine study tabs, source separation, personal model connection, queue recovery, imports, private export, two-account isolation, XSS and sign-out. External providers and Supabase identities were mocked for these scenarios.
- Live free-only synthetic Hindi test: automatic router generated a draft in 41.3 seconds, but its source review exceeded the 60-second attempt deadline. It remained queued and unpublished. A specific NVIDIA free endpoint returned 404; a specific Xing free endpoint returned 429. No paid Vertex requests were made by these tests. Local evidence: `audit/free-revision-router-result.json`, `audit/free-revision-nvidia-result.json`, `audit/free-revision-live.json`.

## Limits that remain

Free-provider end-to-end completion is **not verified** in this release. Generation is subject to free service availability; the application cannot promise unlimited upstream capacity. Existing queues persist checked progress and honor retry delays. Do not present provider unavailability as successful summarization.

No 95% accuracy claim is established. Source checks measure agreement with transcript passages, not real-world truth, visual content or exhaustive factual recall. The new free path still needs a completed full-video test and a human-scored fact/omission benchmark before making a numerical quality claim. Earlier Vertex temporary-data successes do not validate this free path.

No database migration, credential rotation or admin-account change is needed. Keep `AI_FEATURE_ROUTING=true`, the existing administrator allowlist, and Vertex spending/expiry caps. Production deployment and read-only browser confirmation are recorded in the task handoff.
