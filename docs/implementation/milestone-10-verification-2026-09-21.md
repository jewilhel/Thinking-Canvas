# Milestone 10 verification — 2026-09-21

Status: Not ready for closure. Test execution only; no product fixes or production deployment in this pass.

## Environment

- Local branch ref: `codex/milestone-10-live-conversation`, `c3ff6191928d8e2dcde2edfe0d8c334a02a226c8` (read from Git metadata). Native Git status was unavailable: system Git requires Xcode license acceptance and the previously used CommandLineTools binary now reports incompatible CPU type. No license accepted or toolchain changes made.
- Hosted preview deploy: `6aab182a3706fa0007292cab`, ready, runtime `0bb75f645f080825e22cdd1c34dc4605502e18fa`. Later local commits contain verification documentation.
- Codex internal browser only. Isolated QA canvas: `0475e44b-8a0a-4521-820c-6251f42e5500`. Original owner canvas untouched.

## Automated results

| Check                                                                                | Result                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                          | 557 passed, 8 database-dependent cases skipped; 110 files passed, 1 skipped.                                                                                                                                                            |
| `RUN_VOICE_DB_TESTS=1 pnpm exec vitest run tests/integration/voice-creation.test.ts` | All 8 passed against local Supabase: transcript, shape, direct edit, clarification, voice organization, typed organization, document edit, transcript into existing document. Provider outputs in these integration tests are fixtures. |
| `pnpm typecheck`                                                                     | Passed.                                                                                                                                                                                                                                 |
| `pnpm lint`                                                                          | Passed.                                                                                                                                                                                                                                 |
| `pnpm format:check`                                                                  | Passed.                                                                                                                                                                                                                                 |
| `pnpm build`                                                                         | Passed.                                                                                                                                                                                                                                 |
| `pnpm exec supabase test db --local`                                                 | Failed overall: 15 suites completed successfully, 3 aborted; 18 files, 377 assertions emitted.                                                                                                                                          |

Database failures:

- `ai_trusted_canvas_execution.test.sql:35`: `AI settings changed since they were loaded.` The test assumes version 0 for the shared seed canvas.
- `story_narration_ai.test.sql:77`: same version-0 assumption and error.
- `rls_policy_matrix.test.sql:57`: duplicate `canvas_snapshots_canvas_id_version_key` when inserting version 1 for the shared seed canvas.

These failures are consistent with fixture/state assumptions; they do not establish an application authorization defect. They also do not count as passing security verification. No database reset was performed to hide the failure.

## Hosted checks

- Voice reached ready on two starts. The remembered confirmation did not recur. A captured provider greeting addressed Jason by name; no claim of judging its audible naturalness.
- Manual end returned the button to Voice off.
- Saved Greeting, Conversation instructions and Goodbye fields were populated after reopening.
- Mute changed the control to Voice microphone muted. Closing settings preserved the connection.
- Captions assembled a readable greeting, not one word per line.
- Explicit Save selected conversation created an ordinary Conversation transcript document at durable sequence 14. After reload, Object navigator listed it and opening it showed the same session date and greeting. Duplicate save button became disabled for the saved snapshot.
- Typed request during connected, muted voice: “Create a green rounded rectangle labelled Final QA. Leave the existing objects unchanged.” The comment saved, but the AI run failed. Run `3d8c5292-b68c-4380-8fd2-9d555d3a1dd0`, error `provider_run_failed`. No tool execution rows were recorded for that run. Voice remained connected. The recovery retry and corrected canvas-wide request are recorded below.

## Not established by this pass

- Spoken final-save-then-goodbye, natural interruption/pause quality, and accurate acoustic latency measurements: this tool session cannot feed a controlled spoken conversation into the browser microphone or hear/time the returned audio. Automated event/handoff tests are not substitutes for this acceptance.
- Real-provider ending fixture harness: no local OPENAI_API_KEY is available. No secret extraction or temporary production/preview test endpoint was introduced.
- Full multi-user and dropped-network browser matrix, mobile/200-percent accessibility matrix, and production smoke test were not run. The existing Playwright suite launches its own Chromium; this pass used the required Codex browser instead.
- Full source-grounded summary/brief content acceptance from a multi-turn voice session remains open. The short greeting-only transcript checks persistence/format, not comprehensive conversation coverage.

Raw command logs are local temporary files under `/tmp/m10-final-*.log`; this document retains the meaningful outcomes.

### Follow-up observations

- Idle warning appeared, then automatic shutdown returned the control to Voice off without a manual click. Server session `7a57a71c-1766-4212-aafb-24e812930f7d` ended at `2026-09-21T23:34:20Z`, reason `idle_limit`.
- The failed typed run's retry completed with a scope refusal: the first test comment had attached to an object and therefore could not create an unrelated shape. This is not evidence that creation is globally broken. The original provider error remains a separate failed attempt. A fresh request was submitted on visibly empty canvas space to test creation in the correct context; its outcome is recorded below.

- Correct canvas-wide creation passed: run `55201469-e333-4eb0-ac36-6be93ba54d92` completed on `gpt-5.6-luna` with recorded backend latency 2615 ms. UI reported the green Final QA shape and durable sequence 16 while voice remained connected. Undo then displayed Change undone and saved sequence 17, with voice still connected. This is typed-action/voice coexistence, not a spoken creation test or acoustic latency measurement.
- Final QA voice was ended manually and visibly returned to Voice off. Temporary QA tab closed; original tab preserved. The transcript document and test comments remain only on the isolated QA canvas; the test shape was undone.

## Conclusion

565 unit/integration cases passed in total. All static/build checks passed. Core hosted lifecycle, transcript persistence and typed canvas editing/undo with voice passed. Do not close the milestone: investigate the observed provider failure, reconcile the three failing database fixtures, and complete the remaining real spoken/recovery/accessibility/role acceptance evidence. No claim of complete milestone acceptance, merge or production readiness. This report is saved locally; no commit or push was performed because Git could not run with the installed toolchain.
