# Summary and study-tool audit — 28 October 2026

## Findings

1. A summary requires a drafting call and a separate source-review call for each part. The worker previously processed only one stage per invocation and imposed a further 15-second delay. Browser polling and cron frequency added more idle time.
2. A single per-account lease serialized summaries and every interactive study tool. Quiz, chat and flashcards could return `AI_BUSY` while a summary was running.
3. Most small tools sent the entire transcript, despite generating only a small set of items. Long multilingual sources could exceed practical free-provider input/response limits.
4. Shared free routing currently uses OpenRouter's free models. The configured key reported 50 requests per day, 33 already used at the initial inspection. No application change can remove this upstream quota. A 20-part summary needs at least 40 generation/review calls, excluding repairs.
5. Recent aggregate operational events included 17 timeouts, four busy errors and two provider-limit errors. This is a snapshot, not a complete historical incident count.

## Changes

- A worker advances multiple checkpointed stages within a 140-second budget, stopping before another long call cannot fit. Each step retains durable leases, cancellation checks, ownership checks, saved drafts and source review. Provider failures retain backoff.
- Successful stages are immediately eligible for their next stage. No mandatory wait is inserted between successful drafting and review.
- Separate summary and interactive leases permit one of each per account. Concurrent interactive calls remain serialized; this is not unlimited parallel inference.
- Small-tool inputs are bounded to an estimated 4,500 source tokens. Selections span the transcript; practice sets prefer uncited passages. The interface explicitly describes selected-passages coverage. Full summaries and translations are not silently sampled. Translation retains its explicit size limit.
- Shared free calls disable optional reasoning to preserve output capacity. An exact provider rejection saying reasoning is mandatory triggers one compatible retry within the original deadline. Unknown 400 responses, quota failures and ambiguous timeouts do not trigger this settings retry.
- Automatic shared routing uses the tested named Dots free endpoint instead of choosing an arbitrary model per request. `FREE_AI_MODEL` can override this with another `:free` endpoint or explicitly restore `openrouter/free`. Explicit named site models and personal model selections are preserved; zero-price constraints remain enforced.
- Paid Vertex remains admin-only. Authentication, data isolation and zero-price constraints on shared free calls remain enforced.
- Quiz generation returns an explicit correct answer and three distractors; the server creates the option index and rejects duplicate choices. This removes model-supplied answer-index mismatches. The prompt avoids inferred arithmetic and ambiguous relative comparisons; semantic accuracy still requires source verification.
- Explicit output language now overrides the boundary language sample. Hindi summary output without Devanagari is rejected rather than silently saved as Hindi.

## Live evidence and limits

Synthetic Hindi sample: the random free router returned an output-limit response without usable JSON in 24.4 seconds. Two alternative free models returned 429. A direct request to the selected Dots model with optional reasoning disabled returned valid Hindi notes in 12.4 seconds, preserving the proposed-versus-approved distinction, dates, counts and loan rules. The token budgets differed, so this is diagnostic evidence, not a controlled speedup benchmark.

The production-shaped test exposed a mandatory-reasoning rejection from a different router-selected endpoint. This motivated the bounded compatibility retry. Do not infer that all free models are fast or available from the successful small sample. Large-video completion time and accuracy remain source- and provider-dependent; no universal 95% accuracy claim is supported.

Provider reference: https://github.com/OpenRouterTeam/docs/blob/main/api_reference/limits.mdx and https://github.com/OpenRouterTeam/docs/blob/main/guides/best-practices/reasoning-tokens.mdx

Detailed test outputs are local under `audit/`; secrets, user transcripts and account records are excluded from the release.

## Final implementation checks

181 automated tests passed. Browser regression covers 19 groups, including all study-tool interfaces, persistence, private access, queue completion without an open tab and administration. External calls are fixtures in that browser suite; they do not certify every provider response.

A subsequent real call through the application pipeline using `dots-studio/dots-3-note-preview:free` completed the Hindi summary and source review in 25.6 seconds, then generated five quiz items in 9.3 seconds. All storage for this run was temporary. Manual inspection found one ambiguous comparison question, motivating the stricter question wording instruction; no claim of perfect quiz accuracy is made. This is a short synthetic source, not a full-video performance benchmark.
