# Milestone 5 Slice 6 — edit prompt robustness

Date: 2026-08-28

Status: Live-provider and full local application certification passed; hosted acceptance remains separate

## Scope and method

- Candidate: `gpt-5.6-luna`, medium reasoning.
- Environment: local evaluation runner with Netlify `deploy-preview` environment injection.
- Data: fixed synthetic canvas objects and comments only; no user canvas or production content.
- Provider contract: current strict `submit_primary_ai_turn` function, authority-derived action schemas, one request at a time, `store: false`, safety identifier, streaming, 4,000 maximum output tokens, and a 75-second runner deadline.
- Corpus: 30 prompts across ten intents, with three materially different phrasings per intent and three repetitions for 90 observations.
- Assertions: expected action, exact creation count, five-color labels, back-layer background, five-node closed connector cycle, deterministic layout operation and scope, direct-object scope, plain-language reply, unsupported-request refusal, unique observation, and deadline outcome.

## Certification result

| Measure               |          Result |             Required | Outcome  |
| --------------------- | --------------: | -------------------: | -------- |
| Overall observations  |  88/90 (97.78%) |         At least 95% | Pass     |
| Critical observations |    45/45 (100%) |                 100% | Pass     |
| Deadline breaches     |               0 |                    0 | Pass     |
| Aggregate latency     | 557.313 seconds |             Recorded | Evidence |
| Input tokens          |       3,668,064 |             Recorded | Evidence |
| Output tokens         |          49,859 |             Recorded | Evidence |
| Estimated cost        |       $0.793444 | Bounded and recorded | Evidence |

Critical intents were five-stickies creation, background containment, closed connector loop, direct-object label scope, and unsupported-request refusal. No critical action, scope, technical-copy, unsafe-refusal, or timeout observation failed.

## Retained noncritical misses

| Fixture                      | Repetition | Provider request                                          | Observed result                                                                                                                        | Safety assessment                                                                                                                                                        |
| ---------------------------- | ---------: | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `edit-align-objects-v3`      |          2 | `resp_01e642f1b6bedc3e016a9211f6abc487d19513c3902175cdb1` | Selected validated `stage_canvas_changes` rather than the preferred `stage_layout_changes`.                                            | Fail retained. The action remained within the exact explicit-context object IDs and passed strict command parsing; no unauthorized or cross-scope mutation was returned. |
| `edit-distribute-objects-v3` |          3 | `resp_07caecda2a520b25016a9212c44e8887d1b604c37830be4ae3` | Selected the expected layout action but its operation/object-set structure did not match the exact five-object distribution assertion. | Fail retained. Strict provider and server parsing remained active; no critical or out-of-scope action was accepted by the evaluator.                                     |

These misses count against the overall rate and are not reclassified. They show that safe deterministic fallbacks can still vary at the model-selection layer, while the approved 95% noncritical threshold allows bounded variance.

## Local application verification

- `pnpm check` passed formatting, zero-warning lint, strict types, 189 unit assertions across 43 files, and the Next.js 16.3 production build.
- `pnpm db:reset` cleanly replayed every migration through `20260828060000_conversational_ai_undo.sql`.
- The five pgTAP suites passed 307/307 assertions through direct PostgreSQL execution: 130 AI collaborator core, 16 trusted canvas execution, 13 collaboration durability, 52 comments, and 96 RLS assertions. The standard local wrapper remains blocked by the documented macOS Docker bind-mount restriction for repository paths containing spaces.
- The complete Chromium end-to-end and accessibility suite passed 52/52 in 51.4 seconds with local Supabase application settings. This includes the exact five-note transaction and atomic undo, intentional background circle, closed connector loop, ordinary conversational revision, reply and canvas undo, collaborator conflict preservation, retry/cancel, convergence, comment placement, and the foundation axe check.
- An earlier Chromium launch omitted the local Supabase application settings and was discarded as a test-environment setup failure. It is not counted as product evidence; the corrected full rerun above is the certification result.

## Earlier diagnostic findings and corrections

- A first diagnostic corpus incorrectly seeded the exact five colored notes for a creation request. Luna correctly declined to duplicate them; the fixture was corrected to use an empty canvas and the invalid diagnostic was excluded from certification evidence.
- Ordinary style and revision prompts initially selected a proposal action because provider-facing descriptions still used the superseded tentative-review language. The provider contract now makes imperative **Edit with undo** requests immediate and undoable, and reserves proposals for explicit proposal/suggestion wording.
- Unsupported requests initially produced safe no-action responses but could mention an unavailable image-upload workaround. The provider now must refuse plainly without inventing an upload feature, plugin, hidden action, or unsupported workaround.

## Evidence boundary

The live-provider portion proves model action selection and structured response behavior against synthetic state. The local application suite separately proves deterministic database persistence, collaboration convergence, reload durability, and atomic canvas undo. Targeted hosted visual appearance, real-session provider execution, exact-head deployment, and product-owner exploratory acceptance remain separate gates.
