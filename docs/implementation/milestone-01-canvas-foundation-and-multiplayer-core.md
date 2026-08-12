# Milestone 1 — Canvas foundation and multiplayer core

Status: Approved for implementation

Master plan: [`thinking-canvas-implementation-plan.md`](../../thinking-canvas-implementation-plan.md)

Plan owner: Product owner

Last updated: 2026-08-11

## Goal and user-visible outcome

Turn the Milestone 0 evidence harness into the first real Thinking Canvas workspace.

When this milestone is complete, an authenticated participant can create a named canvas, reopen it after signing out and back in, and use one general-purpose spatial surface to create and manipulate shapes, text, connectors, and tables. Objects support the applicable visual styles, connectors stay attached while shapes move or resize, and the same primitives can be arranged as a mind map, procedure, mood board, or storyboard without changing modes.

Two authenticated humans can work in the same canvas while a deterministic simulated AI identity issues commands through the same mutation boundary. Durable canvas content converges after concurrent work, temporary disconnection, reconnect, and reload. Collaborator cursors and selections remain ephemeral. The product clearly distinguishes saved, saving, reconnecting, unsynced, and failed states.

The Milestone 0 `/spikes` route remains evidence tooling. Milestone 1 delivers the product routes and interaction model under `/app`.

## Requirements covered

This plan covers the exact Milestone 1 requirements and supporting work in the master ledger:

- **FR-001 — Create canvas.** A participant can create a canvas and reopen the same persisted canvas after signing out and back in.
- **FR-002 — Manipulate essential objects.** A participant can create, select, move, resize, and delete shapes, text, connectors, and tables; end-to-end tests cover every object/action combination.
- **FR-003 — Shape connection points.** Selecting or hovering an eligible shape exposes usable connection points.
- **FR-004 — Persistent connector attachment.** Attached connector endpoints follow their shapes during movement and resize without visual detachment.
- **FR-005 — Object styling.** Applicable objects expose fill, outline, typography, and text-size controls and persist the selected values.
- **FR-006 — General-purpose primitives.** A user can construct representative mind-map, procedure, mood-board, and storyboard arrangements without entering a dedicated creation mode.
- **FR-007 — Simultaneous collaborators.** At least two humans and one simulated AI identity can edit the same canvas concurrently and converge on one state.
- **Supporting work:** implement camera pan, pointer-centered zoom, zoom-to-fit, keyboard navigation, and viewport restoration.
- **Supporting work:** implement selection, multiselection, grouping, ordering, duplicate, clipboard, undo, and redo through domain commands.
- **Supporting work:** render collaborator cursors and selections without persisting cursor movement as canvas history.
- **Supporting work:** add autosave status, reconnect status, retry behavior, and unsynced-change protection.
- **Supporting work:** add object-count and frame-time instrumentation used only in development and test environments.
- **Exit gate:** “Run a documented multi-browser session covering concurrent object creation, movement, deletion, reconnect, and reload with zero lost committed edits.”

This milestone may create reusable foundations for later work, but it does not complete later `FR-###`, acceptance scenarios, product decisions, or release gates.

## Decisions required

| Decision                      | Owner         | Options and consequences                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Required timing                                        | Status                                                                                                                                                                         |
| ----------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PD-009 — Offline behavior** | Product owner | **Temporary disconnect recovery only (recommended):** a fully loaded canvas may continue accepting edits through a transient connection loss, stores its pending update queue locally, retries automatically, and prevents silent navigation while changes remain unsynced; opening an uncached canvas or marketing deliberate offline work remains unsupported. **Deliberate offline editing:** additionally define offline entry, durable local availability, multi-session merge expectations, storage limits, and recovery UX, materially expanding this milestone. | Before the reconnect and unsynced-change slice begins. | Pending product-owner decision. Plan approval authorized earlier slices but did not select an offline behavior. The task breakdown assumes temporary disconnect recovery only. |

No other unresolved master-plan product decision blocks Milestone 1. `PD-007 — Performance budgets` remains a production-readiness decision; this milestone retains the approved Milestone 0 development baseline and records measurements without claiming the later production budget is approved.

## Technical approach

### Product routes and authenticated data flow

- Replace the placeholder `/app` page with a server-rendered canvas dashboard listing canvases visible through the current user's Supabase session and Row Level Security.
- Create canvases through a validated authenticated server action. Insert the `canvases` row as the current user; the existing database trigger creates the owner membership. Return to `/app/canvases/[canvasId]` only after the insert succeeds.
- Load `/app/canvases/[canvasId]` through a server authorization boundary. Return a not-found or access-denied experience without disclosing whether an inaccessible canvas exists.
- Render the interactive canvas in a browser-only component loaded from the authorized route. Keep server-only Supabase modules out of the client bundle.
- Read the installed Next.js 16.3 documentation under `node_modules/next/dist/docs/` for the affected App Router, server-action, dynamic-route, and error-handling APIs immediately before implementation; do not rely on older Next.js conventions.

### Canonical canvas document and schema evolution

- Promote the renderer-independent spike model into a versioned production canvas-document schema. Keep Konva node state derived and never serialize Konva nodes.
- Add a deterministic version-1-to-version-2 upgrade adapter so existing spike fixtures and stored non-production documents remain readable during the transition. Reject unknown future versions with an explicit non-destructive error.
- Represent each object in Yjs with field-level shared structures rather than replacing one opaque object value. This allows concurrent geometry, text, style, and attachment edits to converge without unrelated fields overwriting one another.
- Store stable object identity, type-specific content, geometry, style, group membership, and stacking order in the shared document. Keep selection, active tool, open panels, and viewport outside shared history.
- Model connector endpoints explicitly as either a free canvas point or an attachment containing the target object ID and a named normalized anchor. Derive rendered connector points from current target geometry on every relevant change.
- Model grouping as shared group records with ordered child IDs and group transform metadata. Deleting a group ungroups its children unless the explicit delete-contents action is invoked; the milestone UI exposes only the non-destructive ungroup behavior.
- Keep one shared stacking-order sequence and expose deterministic bring-forward, send-backward, bring-to-front, and send-to-back commands.

### Commands, history, and clipboard

- Extend the shared command schema with field-aware commands for create, patch, delete, move, resize, style, attach/detach connector endpoint, group/ungroup, reorder, duplicate, and batch paste.
- Separate the authenticated authorization principal from the logical command actor. Human commands use the same identity for both. The simulated AI uses a stable test-only logical actor while an authorized preview/test principal supplies the server-checked permission; this proves the shared boundary without enabling the Milestone 3 AI product.
- Apply every durable human or simulated-AI mutation through the command executor, then encode the resulting Yjs update for persistence and collaboration. UI event handlers may preview drag or transform state locally, but commit only validated commands.
- Maintain an actor-local undo/redo stack of command effects. Undo and redo emit new compensating commands through the same permission and persistence path. Before applying an inverse, compare the affected fields with the expected after-image; report a non-destructive conflict rather than overwriting a collaborator's later edit.
- Put a versioned, schema-validated payload on the system clipboard under an application MIME type, with an in-memory fallback when clipboard access is unavailable. Paste generates new IDs, offsets geometry, preserves valid internal connections and groups, and never retains references to unpasted objects.

### Canvas interaction and UI

- Use Konva for the spatial renderer and interaction layer. Keep camera transforms imperative during pointer movement, following the approved Milestone 0 performance result.
- Provide a persistent application toolbar with select, pan, shape, text, connector, and table tools. The same toolset remains visible for every arrangement; no mind-map, procedure, mood-board, or storyboard mode is introduced.
- Provide click selection, modifier-key multiselection, selection marquee, transform handles, keyboard deletion, arrow-key movement, and discoverable undo/redo, duplicate, group, ungroup, ordering, copy, cut, and paste actions.
- Provide pan by pan tool and space-drag, pointer-centered wheel/trackpad zoom, keyboard zoom, zoom-to-fit, and a visible reset/fit control. Persist the last viewport per user, canvas, and browser locally; viewport restoration is not collaborative state.
- Render applicable styling controls from the selected object types: shape/table fill and outline; connector outline; shape, text, and table typography and text size. A mixed selection exposes only common applicable properties.
- Treat connector manipulation as endpoint movement. Hovering or selecting an eligible shape reveals keyboard- and pointer-usable anchors; dropping an endpoint on an anchor attaches it, and moving or resizing the target immediately recomputes the path.
- Render a compact table with editable cells and resize handles. Rich document behavior remains Milestone 6.
- Preserve keyboard focus intentionally between application chrome and the spatial surface. Add accessible names, status announcements, and toolbar focus behavior now; the complete non-visual structured object list remains the Milestone 10 accessibility gate.

### Collaboration, durability, and transient presence

- Reuse the approved subscribe-before-load overlap algorithm, append-only updates, snapshots, private Supabase channel, and server-assigned sequences from Milestone 0.
- Make update append idempotent with a client-generated update ID. Persist first, treat the returned sequence as the saved acknowledgment, then broadcast the sequenced update. A retry after an ambiguous response returns the original sequence rather than appending a second logical update.
- Batch rapid pointer transformations into local visual previews and one committed command at gesture end. Coalesce high-frequency text/table changes within a short bounded interval without delaying explicit blur or navigation flushes.
- Use Supabase Broadcast for throttled collaborator cursor messages in canvas coordinates and Presence for participant identity, status, color, and current selected object IDs. Neither cursor nor selection payload enters Yjs, `canvas_updates`, undo history, or snapshots.
- Cap cursor publication at approximately 8 updates per second and interpolate remote cursor motion locally. Drop stale cursor messages by sender sequence and remove remote indicators when Presence expires.
- Define save state from durable acknowledgments: `saving` while updates await acknowledgment, `saved` only when the pending queue is empty, `reconnecting` while transport is recovering, `unsynced` when pending edits cannot be persisted, and `failed` after bounded automatic retries.
- Under the recommended `PD-009` choice, retain pending updates in a per-user/per-canvas browser store until acknowledged. Warn before navigation or sign-out when unsynced changes remain. Do not allow a new uncached canvas session to start without an authorized server load.
- Keep compaction available as trusted maintenance, not a user-facing canvas action. The production workspace loads snapshots and updates but does not expose the spike compaction button.

### Simulated AI collaborator

- Add a deterministic preview/test driver that submits ordinary domain commands tagged with a stable `actor.type = "ai"` identity.
- Restrict the driver to local, test, and explicitly enabled Netlify preview contexts. It does not call OpenAI, grant AI permissions, display an AI chat product, or create direct database authority.
- Exercise the driver concurrently with two distinct authenticated human application identities and include the actor identity in privacy-safe evidence.

### Failure behavior, observability, and deployment

- Keep the last valid canvas visible during reconnect and retry. Never replace it with an empty document after a load or schema failure.
- Surface actionable non-secret errors for authorization loss, malformed document data, persistence rejection, realtime failure, clipboard denial, undo conflict, and local pending-store failure.
- Add development/test-only object-count, visible-object-count, frame-time, update-queue depth, durable-sequence, and collaborator-propagation measurements. Compile or gate the instrumentation out of normal production presentation.
- Deploy each approved implementation slice to a Netlify deploy preview using non-production Supabase data. No production launch, domain change, or external visibility change is authorized by this plan.

## Database and security changes

The existing `canvases`, `canvas_members`, `canvas_updates`, and `canvas_snapshots` tables and their Row Level Security policies remain the owning persistence boundary. Milestone 1 proposes one additive durability migration:

- Add a non-null client-generated update UUID to `canvas_updates`, backfill existing non-production rows safely, and add a unique `(canvas_id, client_update_id)` constraint.
- Replace or version `append_canvas_update` so it accepts the client update ID and returns the already-assigned sequence on an exact retry. It must reject attempts to reuse one ID with different update bytes.
- Preserve the authenticated actor from `auth.uid()` as the persistence principal. Logical human/AI actor metadata remains inside the validated command/update payload and cannot grant database access.
- Keep direct authenticated inserts, updates, and deletes on `canvas_updates` and `canvas_snapshots` revoked; all append behavior continues through the security-definer function with a fixed search path and current membership check.
- Regenerate `src/lib/supabase/database.types.ts` from the migrated local schema.
- Extend pgTAP coverage for owner/editor append and retry, commenter/viewer/non-member/unauthenticated denial, update-ID collision rejection, sequence monotonicity, canvas isolation, and unchanged snapshot read policy.
- Add a remote non-production migration and policy smoke check before authenticated preview acceptance.

Canvas objects, styles, groups, order, and connector attachments remain in the approved Yjs document and do not create relational object tables. Viewport preferences and unsynced queues remain local browser data. No production data migration or destructive schema change is authorized.

Rollback or compensation: disable the product canvas route if the document upgrade is unsafe; retain the old append function until the new client is deployed; if necessary, ship an additive function restoring the prior signature. Do not drop the new update-ID column or rewrite stored Yjs bytes during a rollback.

## Ordered task checklist

### Slice 1 — Create, reopen, and render a real canvas

- [x] Read the installed Next.js 16.3 guidance for every affected App Router API and record any implementation constraint discovered.
- [x] Replace the placeholder `/app` shell with an RLS-backed canvas list, validated create-canvas action, empty/loading/error states, and links to authorized canvases.
- [x] Add the protected `/app/canvases/[canvasId]` route with non-disclosing unauthorized/not-found behavior.
- [x] Add the versioned production canvas-document model, version-1 upgrade adapter, and field-level Yjs representation.
- [x] Render an empty product canvas with select/pan tools, camera controls, viewport restoration, save-state region, and development/test instrumentation.
- [x] Add automated creation, authorization, sign-out/sign-in, reopen, document-upgrade, camera, and accessibility coverage.

### Slice 2 — Essential objects, styling, and attachments

- [x] Extend the shared command boundary for create, patch, move, resize, delete, style, and connector endpoint commands.
- [x] Implement shape, text, connector, and table creation plus pointer and keyboard selection, movement, resizing, content editing, and deletion.
- [x] Implement shape anchors, free and attached connector endpoints, attachment preview, detach, and geometry recomputation during target movement and resize.
- [x] Implement applicable fill, outline, typography, and text-size controls with persistent shared values.
- [x] Complete the end-to-end object/action matrix for all four essential object types and the connector-attachment geometry suite.
- [x] Manually construct and retain evidence for representative mind-map, procedure, mood-board, and storyboard arrangements using only the shared toolbar and commands.

### Slice 3 — Selection depth, organization, clipboard, and history

- [x] Implement modifier multiselection, marquee selection, mixed-selection behavior, and deterministic selection focus.
- [x] Implement group, ungroup, stacking-order, duplicate, copy, cut, and paste commands, including ID/reference remapping.
- [x] Implement actor-local undo and redo as conflict-aware compensating commands through the shared executor.
- [x] Add keyboard navigation and discoverable shortcuts for the supported canvas, selection, organization, clipboard, and history actions.
- [x] Add unit and end-to-end coverage for group/order/reference integrity, clipboard validation, undo/redo after collaboration, focus, and keyboard behavior.

### Slice 4 — Durable multiplayer and temporary disconnect recovery

- [ ] Obtain the product-owner `PD-009` decision and update this plan and the master ledger before implementing its selected behavior.
- [ ] Add and test the idempotent-update migration, regenerate database types, and verify local and remote non-production policy behavior.
- [ ] Integrate product commands with durable append, overlap-safe load, private Broadcast, snapshots, and retry-safe sequence acknowledgments.
- [ ] Add Presence participant/selection state and throttled Broadcast cursors without persistent-history writes.
- [ ] Add saved, saving, reconnecting, unsynced, retrying, and failed UI states plus the approved local pending queue and navigation/sign-out protection.
- [ ] Add the preview/test-only deterministic simulated AI command driver.
- [ ] Automate concurrent two-human and simulated-AI edits, ambiguous append retry, disconnect edits, reconnect, cursor/selection ephemerality, authorization loss, and reload convergence.

### Slice 5 — Milestone verification and evidence

- [ ] Run formatting, lint, strict types, unit, migration/RLS, production build, complete Chromium end-to-end, and axe checks on the final branch head.
- [ ] Run the protected GitHub `quality` check and retain the exact run and commit references.
- [ ] Produce an immutable Netlify deploy preview for that exact tested commit and confirm the secret scan and deployment context.
- [ ] Run the authenticated two-human plus simulated-AI multi-browser scenario, including concurrent create, move, delete, disconnect, continued edits, reconnect, reload, and deterministic convergence.
- [ ] Run the create/sign-out/sign-in/reopen scenario and the four general-purpose arrangement demonstrations on the same preview.
- [ ] Record requirement-by-requirement evidence, limitations, defects, fixes, and reruns in this document.
- [ ] Mark this plan `Verification complete — awaiting closure approval` only after every exit criterion passes, then request separate product-owner closure approval.

## Pull-request slices

Pull requests improve reviewability, but neither this draft nor later plan approval authorizes creating a pull request. Open a PR only after the product owner explicitly requests or approves it.

| Slice                                 | Depends on                       | Demoable outcome                                                                                                                             | Included tasks and tests                                                                                                    | Safe rollback or compensating path                                                                                               |
| ------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1. Canvas ownership and product route | Milestone 0 closed               | A participant creates a canvas, opens the real workspace, signs out, signs in, and reopens it.                                               | Dashboard/action/route, document v2 adapter, empty renderer, camera, viewport, unit/component/Auth E2E/axe.                 | Disable the product route and revert UI/document code; relational canvas rows remain valid.                                      |
| 2. Essential object vocabulary        | Slice 1                          | One canvas creates and manipulates styled shapes, text, connectors, and tables; attached connectors follow targets.                          | Command extensions, four renderers, anchors, styling, full object/action matrix, geometry tests, arrangement demos.         | Gate creation tools while retaining readable objects; adapter preserves previously stored documents.                             |
| 3. Canvas organization and history    | Slice 2                          | A participant multiselects, groups, orders, duplicates, uses the clipboard, and safely undoes/redoes.                                        | Group/order model, clipboard remap, compensating commands, keyboard/focus tests.                                            | Hide affected actions; shared base objects remain intact and readable.                                                           |
| 4. Multiplayer durability             | Slices 1–3 and approved `PD-009` | Two humans and a simulated AI converge through concurrent edits, disconnect, retry, reconnect, and reload with ephemeral cursors/selections. | Idempotent append migration, product repository integration, Presence/Broadcast, pending queue, status UI, RLS/DB/unit/E2E. | Disable live collaboration and AI driver; preserve append-only data; retain prior append function until compatibility is proven. |
| 5. Evidence and closure readiness     | Slices 1–4                       | The exact CI-tested preview satisfies every Milestone 1 requirement and exit clause.                                                         | Full local/CI suite, immutable preview, authenticated multi-browser walkthrough, traceability record.                       | Keep the milestone open, leave ledger boxes unchecked, and fix only within approved scope.                                       |

## Automated and manual tests

### Required automated commands

Run and record the exact commit, environment, result, and relevant artifact for:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm db:reset`
- `pnpm db:test` on an environment where the Supabase wrapper can mount the repository; retain the approved direct PostgreSQL pgTAP fallback for the documented macOS mount failure.
- `pnpm build`
- `pnpm test:e2e`
- `pnpm check`
- the protected GitHub `quality` workflow on the final reviewed commit.

Focused suites must cover:

| Area                           | Fixtures and identities                                                                                      | Expected result and retained evidence                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas creation and access     | Owner, editor, viewer, non-member, unauthenticated user                                                      | Owner creates and reopens; members see only authorized canvases; inaccessible IDs do not leak existence; sign-out/sign-in preserves the canvas.                            |
| Schema and command validation  | Version 1 fixture, version 2 fixture, malformed/future version, each command kind                            | Supported data upgrades deterministically; invalid/future data fails without replacing valid state; every durable mutation passes through the command executor.            |
| Essential object/action matrix | Shape, text, connector, table × create, select, move, resize, delete                                         | Every combination has an end-to-end assertion; connector resize means endpoint manipulation; persisted reload matches committed state.                                     |
| Connector attachment           | Rectangle, ellipse, diamond; free/attached endpoints; move/resize/delete target                              | Anchors appear on hover/selection, attachment follows geometry, detachment preserves current visual point, and target deletion leaves an explicit safe free endpoint.      |
| Styling                        | Single and mixed selections across applicable objects                                                        | Fill, outline, typography, and text size expose only valid controls and persist through peer sync and reload.                                                              |
| Organization and history       | Nested-invalid group attempt, valid group, reordered objects, internal/external connectors, copied selection | Groups and order remain valid; paste remaps IDs and internal references; undo/redo preserves later unrelated collaborator fields and reports same-field conflict.          |
| Camera and keyboard            | Mouse, trackpad/wheel, keyboard-only path, restored browser session                                          | Pan, pointer zoom, fit, selection, movement, actions, and viewport restoration behave deterministically with visible focus and status announcements.                       |
| Durability and retry           | Duplicate update ID, same ID/different bytes, reordered Broadcast, missed acknowledgment, snapshot overlap   | Exact retry returns one sequence; collision is rejected; state loads contiguously and converges without duplicate logical history.                                         |
| Multiplayer                    | Distinct owner and editor application users plus stable simulated-AI actor                                   | Concurrent create/move/delete converges; actor identity is visible in evidence; cursor/selection traffic never appears in updates, snapshots, or undo history.             |
| Disconnect recovery            | Loaded editor disconnects, continues bounded edits, owner continues, editor reconnects and reloads           | Approved `PD-009` behavior is honored; pending state is explicit; zero acknowledged changes are lost; final state hashes match.                                            |
| Security and accessibility     | Complete role matrix, malicious clipboard payload, malformed Presence/Broadcast payload, axe scans           | RLS and route authorization deny disallowed actions; untrusted client payloads fail validation; detectable accessibility violations are zero for covered product routes.   |
| Performance instrumentation    | Empty, representative, and 1,000-object development fixtures on documented hardware/browser                  | Instrumentation is absent from normal production presentation; measurements are retained and no sustained interaction falls below the approved Milestone 0 spike baseline. |

### Authenticated Netlify preview scenarios

Use an immutable deploy preview for the exact commit that passed the protected `quality` check. Use non-production data and two distinct Supabase users in separate browser contexts; both contexts may share the same Netlify team-protection authorization when required.

1. **Create and reopen:** the owner creates a uniquely named empty canvas, adds one of each essential object, signs out, signs back in, opens the same dashboard item, and sees the same persisted content and styles.
2. **Essential object/action matrix:** create, select, move, resize, and delete a shape, text object, connector, and table; exercise applicable styles; attach a connector between two shapes; move and resize both shapes; reload and confirm attachment and styles.
3. **General-purpose arrangements:** construct a small mind map, procedure, mood board, and storyboard with the same toolbar and object vocabulary. Retain screenshots and object counts; verify no format-specific mode or schema is introduced.
4. **Multiplayer exit scenario:** owner and editor join the same canvas; enable the deterministic simulated-AI driver; create concurrently; move one shared object; delete another; disconnect the editor; continue acknowledged owner/AI edits and approved pending editor edits; reconnect; reload both contexts; compare deterministic state hashes and visible content. The committed-edit loss count must be zero.
5. **Ephemeral collaboration:** move both cursors and change selections; confirm remote indicators; reload and inspect durable update evidence to show those indicators were not persisted as canvas history.
6. **Failure and recovery:** induce one retryable persistence failure and one authorization loss. The last valid canvas stays visible, status is explicit, retry succeeds when authority/connectivity returns, and disallowed changes are not persisted.

Retain the preview URL/deploy ID, commit SHA, CI run, browser versions, identities/roles, timestamps, deterministic state hashes, durable sequences, screenshots or video, privacy-safe console/function logs, and defect/rerun notes.

## Risks and assumptions

| Risk or assumption                                                                                    | Likelihood / impact | Mitigation or experiment                                                                                                                                                    | Owner                         | Current status                                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| `PD-009` could expand temporary recovery into a full offline product.                                 | Medium / high       | Approve the bounded temporary-disconnect behavior before Slice 4; revise the master ledger first if deliberate offline editing is selected.                                 | Product owner                 | Open.                                                           |
| The spike stores whole object values in one Yjs map, which can overwrite unrelated concurrent fields. | Confirmed / high    | Introduce field-level shared structures and concurrency tests before production object editing.                                                                             | Engineering                   | Planned for Slice 1.                                            |
| A save may reach PostgreSQL while the response is lost, causing an ambiguous retry.                   | Medium / high       | Add client update IDs and idempotent append semantics before exposing unsynced retry.                                                                                       | Engineering                   | Planned for Slice 4.                                            |
| Actor-local undo could overwrite a collaborator's later work.                                         | Medium / high       | Use field-aware before/after checks and compensating commands; return a visible conflict for same-field divergence.                                                         | Engineering and product owner | Proposed behavior; included in plan approval.                   |
| Grouping, paste, and deletion can leave dangling connector or child references.                       | Medium / high       | Centralize reference remapping/invariant validation and fuzz representative command sequences.                                                                              | Engineering                   | Planned for Slices 2–3.                                         |
| Cursor traffic can exceed early Supabase Realtime quotas as collaborator count grows.                 | Medium / medium     | Broadcast at about 8 Hz, interpolate locally, drop stale messages, measure message rates, and keep cursors out of Presence churn and durable updates.                       | Engineering                   | Planned for Slice 4; production thresholds remain Milestone 10. |
| Netlify team protection previously prevented an unrelated browser profile from entering a preview.    | Confirmed / medium  | Authorize both browser contexts through the same Netlify protection session, then sign into distinct Supabase application identities; verify identity readback in evidence. | Product owner and engineering | Known preview setup constraint.                                 |
| The simulated AI could be mistaken for the Milestone 3 AI product.                                    | Medium / medium     | Label it preview/test-only, use no OpenAI call or AI UI, and exclude it from production contexts.                                                                           | Engineering                   | Planned.                                                        |
| 1,000 production objects with selection overlays and live peers may regress the spike benchmark.      | Medium / high       | Retain imperative camera transforms, isolate interaction layers, use `rbush` for spatial queries, and measure each slice with instrumentation.                              | Engineering                   | Development baseline approved; `PD-007` remains open.           |
| Local Supabase's pgTAP wrapper may repeat the documented macOS mount failure.                         | Confirmed / medium  | Keep Linux CI as the clean-start canonical gate and use the approved direct local PostgreSQL pgTAP path when necessary.                                                     | Engineering                   | Known and mitigated.                                            |

## Exit criteria

- [ ] **FR-001:** an authenticated participant creates a canvas and reopens the same persisted canvas after signing out and back in on the tested Netlify preview.
- [ ] **FR-002:** shape, text, connector, and table each pass create, select, move, resize, delete, peer-sync, and reload assertions in the end-to-end matrix.
- [ ] **FR-003:** eligible shape anchors are visible and usable by pointer and keyboard on hover or selection.
- [ ] **FR-004:** attached connector endpoints remain visually and structurally attached during target movement, resize, peer sync, and reload.
- [ ] **FR-005:** every applicable fill, outline, typography, and text-size control persists and converges; inapplicable controls are not offered.
- [ ] **FR-006:** retained preview evidence shows mind-map, procedure, mood-board, and storyboard arrangements built with the same general-purpose primitives and no dedicated mode.
- [ ] **FR-007:** two distinct authenticated humans and one stable simulated AI identity concurrently edit one preview canvas and converge on one deterministic state.
- [ ] Camera pan, pointer-centered zoom, zoom-to-fit, keyboard navigation, and per-user/per-canvas/per-browser viewport restoration pass automated and preview checks.
- [ ] Selection, multiselection, grouping, ordering, duplicate, clipboard, undo, and redo execute through validated commands and pass collaboration-aware tests.
- [ ] Collaborator cursors and selections render for peers and are absent from Yjs durable state, `canvas_updates`, snapshots, and undo history.
- [ ] Saved, saving, reconnecting, unsynced, retrying, and failed states correspond to tested durable-acknowledgment behavior; approved unsynced-change protection prevents silent loss.
- [ ] Development/test object-count and frame-time evidence is recorded, with no sustained interaction below the approved Milestone 0 baseline on documented hardware; this does not close `PD-007`.
- [ ] The additive migration, regenerated types, complete role/policy matrix, idempotent retry cases, and remote non-production smoke check pass.
- [ ] Formatting, lint, strict types, units, database/RLS, production build, Chromium end-to-end, accessibility, and protected CI checks pass on the exact preview commit.
- [ ] The authenticated immutable Netlify preview scenarios pass with retained deploy, commit, browser, identity, sequence, hash, screenshot/log, and defect-rerun evidence.
- [ ] The exact master-plan exit gate is satisfied: “Run a documented multi-browser session covering concurrent object creation, movement, deletion, reconnect, and reload with zero lost committed edits.”
- [ ] All known failures within approved scope are fixed and rerun; failed, deferred, or unverified items remain open and explicit.
- [ ] The plan status is changed to `Verification complete — awaiting closure approval`, and the product owner separately approves closure before any Milestone 1 master-ledger box is checked.

## Explicitly excluded work

- Real OpenAI reasoning, typed AI chat, AI permissions, grounded feedback, or product AI mutation UI (`FR-015` through `FR-022`, Milestone 3). The deterministic simulated AI exists only to verify `FR-007` convergence.
- Comments, replies, structured prompts, or comment overlays (`FR-023` through `FR-030`, Milestone 2).
- Reviewable AI change sets and guided review (`FR-031` through `FR-035`, Milestone 4).
- Freeform vector annotation tools (`FR-036` through `FR-043`, Milestone 5).
- First-class document creation or rich-document product behavior (`FR-044` through `FR-053`, Milestone 6). Tables in this milestone are canvas primitives, not documents.
- Guided stories, story modes, playback, narration, or branching (`FR-054` through `FR-062`, Milestone 7 and deferred scope).
- AI or human live-conversation product UI (`FR-008` through `FR-014`, Milestone 8). The Milestone 0 voice spike remains evidence only.
- Conversational starter structures, saved reusable templates, or format-specific creation modes (`FR-063` through `FR-066`, Milestone 9).
- Deliberate offline-first editing unless the product owner changes `PD-009` and approves the resulting scope revision.
- Production launch, custom domain, production data migration, export/portability, complete cross-browser matrix, final accessibility object-list experience, production observability, or approved release performance budgets (Milestone 10 and `PD-007`/`PD-010`).
- Specialist AI agents, branching stories, story snapshots, cross-boundary document connectors, specialized document types, canvas icon libraries, and AI image generation (explicitly deferred in the master ledger).

## Implementation record

Implementation began on 2026-08-11 after explicit plan approval.

### Slice 1 — Create, reopen, and render a real canvas

- Replaced the authenticated placeholder with an RLS-backed dashboard, validated create-canvas server action, accessible pending/error state, canvas list, and empty state.
- Added `/app/canvases/[canvasId]` with awaited Next.js 16.3 route params, UUID validation, session-scoped Supabase lookup, and one non-disclosing `notFound()` result for missing and inaccessible canvases.
- Added a browser-only product canvas with select/pan state, pointer and keyboard zoom, zoom-to-fit, keyboard panning, per-user/per-canvas local viewport restoration, saved status, and development/test object/frame instrumentation.
- Added the version-2 renderer-independent Yjs document, nested field-level shared maps, stable order, strict Zod schemas, version-1 adapter, cross-canvas rejection, and deterministic concurrent different-field merge coverage. The Milestone 0 spike model remains unchanged for its evidence route.
- Followed the installed Next.js 16.3 constraints: every server action re-authenticates and validates; `redirect()` runs after mutation handling rather than inside a caught block; dynamic params are awaited; and `notFound()` executes in the awaited render path.
- Discovered that PostgREST accepted an authenticated canvas insert but rejected `.insert(...).select("id")` in the same request because the membership-based select policy was not yet satisfied for the returning representation. The action now generates the UUID server-side, inserts without a returning select, and redirects with the known ID; the existing owner-membership trigger and RLS remain authoritative.
- Fixed five axe color-contrast findings in the new protected chrome/dashboard and added explicit navigation waiting so the accessibility assertion runs against the product canvas rather than a matching dashboard card heading.
- Published commit `3fc3223` to the private non-production Netlify branch deploy `6a7bb1454c6a309589fd3204`. The authenticated owner created canvas `36084183-bcc6-4c18-94f8-fdb2f254174f`, restored its 108% viewport after reload and sign-in, and reopened it from the RLS-backed dashboard. The synthetic non-member received the same non-disclosing unavailable state for the owner-only URL.
- No database migration, pull request, production deployment, or master-plan checkbox change occurred in Slice 1.

### Slice 2 — Essential objects, styling, and attachments

- Added a version-2 shared command schema and executor for create, content patch, move, resize, delete, style, and connector endpoint commands. Every product mutation carries a validated actor/origin, command ID, canvas ID, and timestamp before it reaches the Yjs document.
- Added rectangle, ellipse, diamond, text, connector, and table renderers; pointer creation/selection/drag/transform; keyboard movement, resize, and deletion; editable object/table content; an accessible DOM object outline and inspector; and browser-local Yjs restoration ahead of Slice 4 durable multiplayer integration.
- Added five visible shape anchors, free and attached connector endpoints, a live attachment preview, attached-geometry recomputation, pointer endpoint resizing, explicit detach controls, and safe target deletion that preserves the last visual point as a free endpoint.
- Added applicable fill, outline, typeface, and text-size controls. Their Yjs values survive reload with the rest of the local document and remain renderer-independent.
- Added unit coverage for the command and attachment boundary plus Chromium coverage for the four-type create/select/move/resize/delete matrix, shape variants, content editing, styling, reload restoration, connector follow/detach, pointer endpoint resizing, keyboard movement, and axe.
- Constructed a 7-object mind map, 7-object procedure, 4-object mood board, and 4-object storyboard through the same visible toolbar, object outline, inspector, and command executor. The retained screenshots under `docs/implementation/evidence/milestone-01/` show no format-specific mode or schema.
- Published commit `7e69651` to private non-production Netlify branch deploy `6a7bb6a6b980d884e4ad0760`. The authenticated hosted walkthrough created, styled, connected, moved, reloaded, and read back a rectangle, ellipse, connector, text object, and two-row table. Moving the source shape changed its attached endpoint from `350,84` to `360,84`; all five objects remained after reload.

### Slice 3 — Selection depth, organization, clipboard, and history

- Added modifier and marquee multiselection, grouped-object selection expansion, a deterministic primary focus for mixed selections, group-aware drag/keyboard movement, and an accessible selection count and object outline.
- Extended the shared command schema for group, ungroup, reorder, and multi-object duplicate. The canvas document now validates complete stacking order and stores optional group identity without changing the renderer-independent object vocabulary.
- Added a strict versioned clipboard payload. Copy and cut retain an in-app fallback when system permission is unavailable; paste remaps object IDs, complete-group IDs, and internal connector references, converts external connector references to safe free endpoints, rejects untrusted fields, and offsets pasted geometry.
- Added batched actor-local undo/redo history. Each user action captures field-level before/after changes plus order; compensation restores only fields that still match the action's after-image, preserves later unrelated fields, and reports rather than overwrites same-field divergence.
- Added visible organization/history controls and `aria-keyshortcuts` for select all, group/ungroup, duplicate, copy, cut, paste, undo, and redo. Keyboard movement/resizing batches multiselection changes into one history action.
- Added unit and Chromium coverage for nested-group rejection, order, internal/external connector remapping, malicious clipboard payloads, create/reorder history, later unrelated changes, same-field conflicts, modifier selection, marquee, grouped selection, organization, clipboard, and grouped undo/redo.
- Published commit `0be92b4` to private non-production Netlify branch deploy `6a7bbc52b980d89c4ead07b2`. The hosted walkthrough grouped two objects, proved grouped selection returned both, duplicated the group from 3 to 5 objects, cut it back to 3, pasted to 5, undid to 3, redid to 5, brought the third object to the front, and reloaded all five with `Saved` status.

## Verification evidence

Milestone 0 spike evidence demonstrates feasibility only and is not represented as Milestone 1 product acceptance.

| Date       | Environment                                    | Command or scenario                                                                                                             | Result                                                                                                                                                                                                                                                                                                           | Evidence                                                          | Requirements covered                                                              |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 2026-08-11 | Local repository                               | `pnpm check`                                                                                                                    | Pass: Prettier, ESLint with zero warnings, strict TypeScript, 53 Vitest tests across 16 files, and the Next.js 16.3 production build completed; both `/app` routes were emitted as dynamic server-rendered routes.                                                                                               | Local command output                                              | Slice 1 quality, document model, build, and route generation                      |
| 2026-08-11 | Local Supabase Auth and Chromium               | `pnpm test:e2e` with local public Supabase values injected from the running instance                                            | Pass: all 15 scenarios completed, including create/reopen after sign-out, viewport restoration, malformed-ID and non-member nondisclosure, zero detectable axe violations, and all existing Auth, collaboration, canvas, document, AI, Realtime, and reversal regressions.                                       | Playwright output                                                 | Slice 1 product route, Auth/RLS behavior, camera restoration, accessibility       |
| 2026-08-11 | Authenticated Netlify branch deploy and Chrome | Deploy `6a7bb1454c6a309589fd3204` for commit `3fc3223`; create, reload, sign out/in, reopen, and non-member access attempt      | Pass: the deploy reached the private `branch-deploy` context; the owner created and reopened the uniquely named canvas, its 108% viewport survived reload and sign-in, and the non-member received the nondisclosing unavailable state for the same URL.                                                         | Netlify deploy details and signed-in Chrome readback              | Slice 1 hosted creation, persistence, viewport restoration, and RLS nondisclosure |
| 2026-08-11 | Local repository                               | `pnpm check` after the Slice 2 command and renderer implementation                                                              | Pass: Prettier, ESLint with zero warnings, strict TypeScript, 56 Vitest tests across 17 files, and the Next.js 16.3 production build completed.                                                                                                                                                                  | Local command output                                              | Slice 2 command validation, geometry, rendering build, and regression gate        |
| 2026-08-11 | Local Supabase Auth and Chromium               | `pnpm test:e2e` after adding `canvas-objects.spec.ts`                                                                           | Pass: all 18 scenarios completed. The new matrix exercised shape, text, connector, and table creation, selection, movement, resize, edit, style, reload, and deletion; attachment follow/detach, endpoint resizing, and all four arrangement demonstrations passed; covered routes reported zero axe violations. | Playwright output                                                 | Slice 2 essential object/action matrix, connector geometry, style, accessibility  |
| 2026-08-11 | Local Chromium and retained screenshots        | Construct mind-map, procedure, mood-board, and storyboard arrangements through shared product controls                          | Pass: the general-purpose object vocabulary produced the four representative layouts with 7, 7, 4, and 4 objects respectively; the final storyboard survived reload. Four PNGs retain the visible results without introducing format-specific product behavior.                                                  | `docs/implementation/evidence/milestone-01/slice-02-*.png`        | Slice 2 general-purpose arrangement demonstration                                 |
| 2026-08-11 | Authenticated Netlify branch deploy and Chrome | Deploy `6a7bb6a6b980d884e4ad0760` for commit `7e69651`; create, style, attach, move, and reload the essential object vocabulary | Pass: the private branch deploy rendered the product controls; the source-to-target connector followed a 10-pixel keyboard move (`350,84` to `360,84`); rectangle, ellipse, connector, text, and table content/style remained present after reload with `Saved` status.                                          | Netlify deploy details, signed-in Chrome readback, and screenshot | Slice 2 hosted essential objects, attachment geometry, style, and reload          |
| 2026-08-11 | Local repository                               | `pnpm check` after the Slice 3 selection, clipboard, and history implementation                                                 | Pass: Prettier, ESLint with zero warnings, strict TypeScript, 64 Vitest tests across 19 files, and the Next.js 16.3 production build completed.                                                                                                                                                                  | Local command output                                              | Slice 3 schemas, clipboard validation, conflict-aware history, build, regressions |
| 2026-08-11 | Local Supabase Auth and Chromium               | `pnpm test:e2e` with the Slice 3 organization scenario                                                                          | Pass: all 19 scenarios completed. Modifier and marquee selection, group/ungroup, stacking, duplicate, copy/cut/paste, grouped movement, undo/redo, shortcut behavior, reload, and every earlier product/spike regression passed.                                                                                 | Playwright output                                                 | Slice 3 organization, keyboard, focus, clipboard, and history acceptance          |
| 2026-08-11 | Authenticated Netlify branch deploy and Chrome | Deploy `6a7bbc52b980d89c4ead07b2` for commit `0be92b4`; group, duplicate, cut, paste, undo, redo, reorder, and reload           | Pass: the private branch deploy grouped and reselected two objects, duplicated 3 to 5, cut to 3, pasted to 5, undid to 3, redid to 5, moved the third object to the front of the retained order, and reloaded all five with `Saved` status.                                                                      | Netlify deploy details, signed-in Chrome readback, and screenshot | Slice 3 hosted grouping, clipboard, order, batched history, and reload            |

## Change record

| Date       | Change or decision                                                                                                 | Rationale                                                                                                                                    | Impact                                                                                                                                                                                                        | Approved by   |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 2026-08-11 | Created the first detailed Milestone 1 plan from the closed Milestone 0 architecture and current repository state. | The master ledger identifies Canvas foundation and multiplayer core as the next milestone, and no Milestone 1 implementation record existed. | Defines proposed scope, `PD-009` recommendation, ordered slices, tests, and closure gates; implementation remained blocked on explicit plan approval.                                                         | Product owner |
| 2026-08-11 | Approved the Milestone 1 plan for implementation.                                                                  | The product owner explicitly approved the reviewed plan.                                                                                     | Status changed to `Approved for implementation`; Slices 1–3 and Slice 5 are authorized as documented, while Slice 4 reconnect and unsynced-change behavior remains blocked on the separate `PD-009` decision. | Product owner |
| 2026-08-11 | Completed and hosted Slice 1 on the dedicated private branch-deploy alias.                                         | The first slice needed local automation plus authenticated provider evidence before object editing could safely build on it.                 | Commit `3fc3223` and deploy `6a7bb1454c6a309589fd3204` now cover the foundation; Milestone 1 remains open and all master-plan and exit-criteria boxes remain unchecked pending final closure approval.        | Engineering   |
| 2026-08-11 | Completed and hosted Slice 2 with retained general-purpose arrangement evidence.                                   | Essential object behavior needed a complete local matrix and a real protected-provider walkthrough before organization/history work.         | Commit `7e69651` and deploy `6a7bb6a6b980d884e4ad0760` now cover Slice 2; Slice 3 may begin, while durable cross-browser persistence remains explicitly owned by Slice 4.                                     | Engineering   |
| 2026-08-11 | Completed and hosted Slice 3 organization, clipboard, and actor-local history.                                     | Durable multiplayer should build on validated selection/reference semantics and non-destructive local compensation.                          | Commit `0be92b4` and deploy `6a7bbc52b980d89c4ead07b2` now cover Slice 3; Slice 4 remains blocked until the product owner selects `PD-009`.                                                                   | Engineering   |

## Closure

Closure status: Not ready

Closure approval: Pending

Closed on: —
