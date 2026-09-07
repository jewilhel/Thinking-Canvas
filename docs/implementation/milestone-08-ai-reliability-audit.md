# Document AI reliability audit

Date: 2026-09-07
Scope: the hosted document-comment AI path, its shared canvas AI infrastructure, and the reported suggestion/approval/retry failures.
Status: core document flows verified in Codex's browser; milestone acceptance remains separate.

## Architecture findings and repairs

| Boundary             | Failure found                                                                                                                      | Repair                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context projection   | Lists and links lost their nested text; real heading nodes were misread. Long conversations discarded their latest turns.          | Traverse nested semantic content, recognize heading tags, label/order speakers, retain recent conversation within explicit bounds.                                  |
| Intent and authority | A small keyword classifier withheld edits for valid conversational requests.                                                       | Derive available actions from persisted authority; let the model distinguish feedback, proposals, and requested edits. Keep server-side permission checks.          |
| Provider contract    | Earlier document calls mixed strict outer JSON with free-form nested argument JSON.                                                | Strict typed selected-range operations for both proposal and edit choices. No provider-generated CRDT updates or document IDs.                                      |
| Text execution       | The composer allowed multi-block selection, but the executor rejected it. Direct boundary manipulation merged adjacent paragraphs. | Apply structured selections through an isolated instance of the same Lexical/Yjs and Markdown configuration as the editor; normalize equivalent boundary positions. |
| Comment continuity   | Replacements deleted the nodes referenced by the comment. Undo restored text under new IDs but left old anchors.                   | Persist range relocation with the content update; include restored range references in inverse updates and semantic undo.                                           |
| Live updates         | Canvas and document consumers subscribed independently to the SDK's same channel.                                                  | One reference-counted channel owner with multiple listeners and bounded cleanup.                                                                                    |
| Failure feedback     | Background polling erased action errors. Expired Netlify edge access failed before the application handler.                        | Separate load/action errors, keep actionable failure messages visible, distinguish expired access from AI failures. Preview security remains enabled.               |

The retained design is a bounded semantic projection → typed provider request → authority/scope/schema validation → deterministic editor mutation → durable Yjs update → shared comment response. The AI supplies wording and semantic operations; it does not manufacture database writes or editor serialization. Existing run IDs, stable command IDs, revision checks, cancellation, and replay protection remain in place.

## Hosted evidence

All observations below used the real provider in Codex's built-in browser on the retained Milestone 8 canvas and document. A deploy reaching `ready` is not the evidence for these behavior claims.

- `59ecd97`: two consecutive four-bullet section edits preserved paragraphs and list structure. Clicking the edited highlight reopened its thread. Read-only feedback left content unchanged. Cancel reached cancelled; Retry produced substantive wording feedback. Reload retained Saved sequence 251 and the comment reopened after initial loading.
- `5408842`: generated a new two-sentence paragraph in Edit with undo mode, then restored the original content with the product Undo control (sequences 252–253). Its lost post-undo highlight was a failed check, leading to the next repair.
- `295dc14`: proposal-only request left sequence 253 unchanged. “I like it. Please make that change.” applied the proposal (254); Undo restored the content (255) and its clickable comment. A repeated edit using that restored context succeeded (256), followed by Undo (257). Generating a new paragraph succeeded (258), followed by Undo (259) and reopening the same restored comment. The original four-bullet section was retained.
- `7d170f9`, deploy `6a9e6960be30ee2185effe1d`: a polite “Could you please replace…” request applied the exact wording change (260). An explicit feedback-only question returned a substantive comparison of the two phrases without changing sequence 260. Final wording-restoration/reload verification is recorded in the milestone ledger.

## Local verification

- Complete final source/build gate: formatting, zero-warning lint, TypeScript, 367 tests in 74 files, and production build passed. The count dropped by nine when the obsolete keyword-classifier tests were removed, not because relevant execution tests were skipped.
- The eight semantic-edit tests also passed in the Node environment without a browser DOM.
- Coverage includes forward/backward and adjacent-paragraph selection boundaries, repeated edits from an original comment range, restored attachment after each undo, preservation of later human text, conflict-safe semantic undo, real heading representation, shared realtime consumers, bounded recent conversation, and typed multi-choice document calls.

## Limits and release boundaries

- Old comments whose referenced content was deleted before relocation support are not automatically reattached. Guessing a replacement target from similar wording would risk editing the wrong text. This audit does not claim a historical-anchor migration.
- Document context remains bounded; this is not a claim of unlimited document or conversation length, nor of support for arbitrary new operation families.
- Netlify preview access and app authentication are separate. Renewing existing preview access enabled failed requests; no authentication or protection setting was disabled.
- “Trusted editor” was the original canvas setting. Temporary lower-authority verification modes are restored afterward. Trusted replies no longer promise an undo control absent from that mode; Edit with undo was tested with its actual control.
- No production deploy, merge, milestone closure, or product-owner acceptance was performed. Exact-head hosted performance/multi-user/role acceptance remains governed by the milestone plan.
