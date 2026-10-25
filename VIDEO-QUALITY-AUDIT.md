# Real-video quality audit

Reviewed 25 October 2026. **Quality gate: FAIL.** The complete transcript can be imported and all summary parts can be persisted after resume. This is not evidence of a fully accurate or uninterrupted summary. Live generation still produced omissions, unsupported claims, incorrect associations and provider interruptions.

Video: [Asian Games & Asian Para Games 2026 — Kumar Gaurav Sir](https://www.youtube.com/watch?v=slW0ZIXlXrY), supplied by the user. Public player duration: 47:25. The lecture covers Commonwealth Games, Asian Games and Asian Para Games. The rubric assesses fidelity to the supplied lecture, not independent verification of its sports claims.

## Method

- Used the actual YouTube-import route, Supadata transcript service, summary action route and configured AI services with a synthetic identity and a migrated in-memory database. Production Supabase and Turso hosts were blocked in the audit harness. No customer account or note was modified.
- Imported 103 transcript segments, 38,755 characters; the final segment begins at 47:22.7. This establishes timeline extent, not word-perfect transcription of the audio. Direct YouTube caption retrieval returned an empty response. Only the separate MIT sample has an independent transcript comparison.
- Wrote a 35-item rubric before inspecting generated summaries. An item passes only when all specified relationships are retained without contradictory event context. A correct number under the wrong event heading is a failure. Names inherit transcription spelling unless an independent source was checked.
- Preserved the original five-part run and its failures. The initial ten-part candidate used smaller multilingual sections and shared context. Six parts completed, then a Groq HTTP 413 followed by an OpenRouter timeout paused generation. Resuming with Groq completed parts 7–10. All ten parts persisted and read back exactly; the completed progress marker cleared.
- Requests were deliberately spaced by 65 seconds for quality testing. The ten successful route calls totaled 81.6 seconds; the failed route call took 60.7 seconds. Deliberate waits and a manual resume are additional. **This is not a seamless latency or availability pass.**

Local evidence: `audit/real-video/slW0ZIXlXrY/` contains the frozen rubric, original baseline, transcript, checkpoint, full generated summary, pipeline report and numbered part exports. P/K/C below mean part/key point/chapter. Copyrighted transcript/output evidence is excluded from Git and the release archive; these reports contain analysis and short factual references.

## Frozen-rubric review of the complete ten-part candidate

**35 reviewed: 23 pass, 12 fail.** This is a sample of lecture facts, not a percentage of the video's total information. It does not include every erroneous extra claim.

| ID | Required content | Result | Evidence / failure |
| --- | --- | --- | --- |
| cwg-host | Edition, Glasgow/Scotland, dates, duration | Pass | P1 K1–2 |
| cwg-size | Nations, sports, para events, mascot | Pass | P1 K3–5 |
| cwg-delegation | 122 athletes, opening flag/baton bearers | Pass | P1 K6–8 |
| cwg-next | Closing flagbearer and Ahmedabad 2030 | Pass | P1 K10–11 |
| cwg-medals | 39 = 13/17/9, fourth | Pass | P1 K14–15 |
| cwg-first-medal | Jhandu Kumar, bronze, 190 kg lifted, Nalanda | Fail | P1 K16 changes weight lifted into a weight class. |
| cwg-first-gold | Mirabai, 48 kg, first gold, third consecutive | Pass | P2 K3/K8 |
| cwg-boxing | Athletics largest delegation; boxing seven golds | Pass | P1 K12, P2 K1 |
| cwg-gulveer | 10,000 m silver and 5,000 m bronze | Pass | P2 K6 |
| cwg-paras | Seven para medals = 3/2/2 | Pass | P2 K7 |
| cwg-table | Australia 70/171; country ranking order | Pass | P4 K2–4; separate tie-break explanation is erroneous. |
| cwg-history | 1930/Hamilton, original name, 1978, Delhi 2010 | Pass | P4 K5–8/K13; separate first-woman gold claim is erroneous. |
| asian-host | 20th, Aichi-Nagoya, dates, 43 sports | Pass | P5 K1–4 |
| asian-six-sports | All six named additions | Pass | P5 K5 |
| asian-mascot | Honohon, flame meaning | Pass | P5 K7 |
| asian-flags | Opening pair, replacement and closing flagbearer | Pass | P5 K8–10 |
| asian-theme | Imagine One Asia; Japan's third hosting | Pass | P5 K11–12 |
| asian-medals | 85 = 21/27/37, fourth | Pass | P5 K15–16 |
| asian-first-gold | Women's cricket, beating Sri Lanka | Fail | P6 K1 retains it, but its heading/overview incorrectly say Commonwealth. |
| asian-most | Archery most golds; athletics 24 medals | Fail | P7 K10–11 under the wrong Commonwealth heading/overview. |
| asian-records | Vithya/PT Usha; hockey after 44 years | Fail | P7 K13–14; duplicate/misread name and wrong event context. |
| asian-gender | Women 11, men 7, mixed 3 | Fail | P7 K15 under conflicting event context. |
| asian-history | Delhi 1951/1982, ninth edition, Appu, next Doha | Fail | P8 retains some history but omits the complete Delhi/1982/ninth-edition relationship. |
| para-host | Fifth, dates/location, first Japan, theme/mascot | Pass | P8 K6–9 |
| para-size | 18 sports, 45 countries, 3000+, India 281/168 | Pass | P8 K10/K12 |
| para-flags | Opening and closing pairs | Pass | P8 K11/K13 |
| para-medals | 114 = 30/35/49, fourth vs 111/fifth | Pass | P8 K14–15 |
| para-table | China 435 = 207/117/111; ranking order | Fail | P8 retains counts; P9 falsely labels the ranking as Commonwealth in Scotland. |
| para-mona | First 10 m SH1 gold and second 50 m three-position gold | Fail | P9 K3/K28 omit the first-gold relationship and second event details. |
| para-deepti | Women's 400 m T20 gold | Fail | P9 K7 retains the event but its overview assigns the section to Commonwealth. |
| para-nishad-correction | Later high-jump T47 correction | Fail | P9 K4/C3 keep the earlier long-jump wording and ignore the correction. |
| para-nitesh | Bihar, men's singles SL3 badminton gold | Fail | P9 K24 retains details under contradictory Commonwealth context. |
| para-athletics | 22 gold and 65 total medals | Pass | P10 K4 |
| para-history | Committee date/place/HQ; Doha 2030 | Fail | P10 K8/C4 substitute 2026 for 2030. |
| revision-priorities | Starred athletes and own-state medalists | Pass | P10 K10/C5 |

Additional failures outside the rubric include imprecise source citations, inferred bronze medals for unnamed remaining athletes, a spurious 1958 women's-gold assertion, a reversed medal-table tie-break explanation, and repetitive points. Existing schema checks validate structure, bounds and whether citation IDs exist; they do not prove that a cited segment entails a claim.

## Changes and retests

- Added a multilingual source-size heuristic while preserving every character and original segment ID. New runs keep a 3,500 estimated source-token ceiling in addition to character bounds. This is not an exact provider tokenizer or a guarantee of fitting every account limit. Older paused runs retain their original boundaries.
- Added stable source-language/script instructions and bounded neighboring source context. The initial context contained too much opening material and biased later headings toward the first topic. Reduced the language-only sample to 160 characters, separated its purpose explicitly, and prohibited carrying the opening topic into later sections.
- Added instructions to preserve numerical relationships, distinguish historical comparisons, retain corrections, avoid inferred records/generalizations and copy supporting citation IDs precisely. These are mitigations, not semantic validation.
- Distinguished oversized AI requests from video/transcription failures. Added one bounded retry for a final provider's confirmed transient HTTP failure; no retry for authentication, quota or ambiguous network outcomes. Regression tests cover the retry deadline and count.
- Six targeted live retests (parts 1, 3, 6, 7, 9, 10) all returned structured output using Groq, in 5.1–9.4 seconds per call, with deliberate pacing. They are recorded separately in `targeted-retest.json`, not substituted into the complete candidate or presented as a fresh end-to-end pass.

| Targeted check after context refinement | Result |
| --- | --- |
| Weight lifted and nearby references, part 1 | Improved: 190 kg is now described as lifted; Hydro Arena, closing flagbearer and next host point to their actual supporting segments. |
| Unsupported residual bronze claims, part 3 | Those generalizations disappeared, but the title still incorrectly groups the whole mixed-sport section as parasports and a category is interpreted as kilograms. Overall fidelity still fails. |
| Event identity, parts 6–7 | Headings/overviews now identify Asian Games. Athlete-name duplication and some medal associations remain incorrect. |
| Para results and correction, part 9 | Commonwealth/Scotland wording disappeared, but Asian and Para totals are conflated; the explicit high-jump correction is still missed. Mona's second event is retained, but the transcript's SA1 spelling differs from the inspected SH1 slide. |
| Final history, part 10 | Still assigns Doha to 2026 instead of retaining Aichi 2026 and Doha 2030 separately. |

These retests demonstrate specific improvements and continuing failures. **The final refinement has not passed a fresh full-video rubric.** No updated aggregate accuracy score is claimed.

## Independent transcript and visual checks

For [MIT 6.006 Lecture 1](https://www.youtube.com/watch?v=HtSuA80QTyo), the imported transcript's normalized word sequence matched [MIT's official captions](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/resources/lecture-1-algorithmic-thinking-peak-finding/) exactly: 7,288 word units and 100% normalized five-gram recall. Its original AI run stopped after a provider gateway failure, so it does not establish summary completeness.

The supplied lecture explicitly refers to silver/bronze lists on screen without reading every entry around 44:10–44:34. A successfully rendered public-player frame at 43:50 confirms Mona Agarwal's 50 m three-position SH1 slide, while the transcript spells the later category differently. Attempts to inspect the complete medal tables did not yield reliable frames. Only that one successful frame is treated as visual evidence; the full visual track remains unverified. NoteFlow currently processes transcripts, not video frames, so prompt changes cannot recover all screen-only information.

## Release decision and next acceptance criteria

Do not claim complete-video coverage or production-quality factual accuracy from this audit. The report closes the earlier evidence gap by testing the supplied video and identifying concrete failures. A release that promises complete study notes needs a fresh full-route run of the final implementation, correction-aware claim verification, accurate citations, and a measured plan for provider capacity. Visual-only coverage additionally needs a tested frame/OCR or supplied-slide ingestion path. Increasing retry counts or changing UI alone does not address those gaps.

Reproduce the full opt-in audit with `node tests/run.mjs --real-video-audit --video "https://www.youtube.com/watch?v=slW0ZIXlXrY" --pace-ms 65000`. A checkpoint resumes saved work. `--fresh-summary` preserves a baseline and clears only the synthetic summary state, retaining counters. Live runs consume provider quota. Targeted retests use `--verify-video-parts --video URL --parts 1,3,6,7` and are explicitly separate from full-route checks.
