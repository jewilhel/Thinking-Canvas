# Milestone 6 — Vector annotations

Status: Approved for implementation
Master plan: [`thinking-canvas-implementation-plan.md`](../../thinking-canvas-implementation-plan.md)
Plan owner: Product owner
Last updated: 2026-08-30

## Goal and user-visible outcome

Turn the existing non-mutating Drawing entry into one collaborative freeform vector pen without weakening the renderer-independent canvas, command, history, persistence, permission, or comment-visibility boundaries proven in Milestones 1–5.

When this milestone is complete, an authenticated owner or editor can choose the pen and draw a true point-based stroke with a mouse, a single touch pointer, or a stylus. The stroke renders crisply from the current minimum zoom through the current maximum zoom, persists and converges like other Yjs canvas objects, and can be selected later to change its color, thickness, geometry, and position.

New strokes are shared temporary annotations by default: they survive save, reload, and collaborator convergence, but the existing per-user comment-visibility control hides them together with comment markers. A participant can promote a selected stroke to ordinary always-visible canvas content without copying it or changing its visible geometry.

When a completed stroke overlaps an eligible canvas object, it attaches to the topmost eligible overlap target and follows that object's movement. A selected attached stroke exposes an explicit Disconnect action. Disconnect preserves the stroke's exact visible position and shape at that moment, after which target movement no longer affects it.

Drag-selecting or Shift-clicking two or more annotations and/or canvas objects produces one selection frame and transform handles around the complete selection. Moving or resizing that frame applies one coordinated, undoable batch rather than showing handles only around the last-selected item.

Annotation and object styling use the same floating contextual-palette system. One expandable **Stroke** palette owns shared color and thickness controls; supported object borders and connectors also expose Solid, Dashed, and Dotted stroke styles there. Mixed selections report mixed values, expose only common valid properties, and do not overwrite a property until the participant deliberately chooses a value.

The primary AI retains the already-closed `FR-018` shared visual vocabulary by receiving grounded annotation state and using bounded, server-identified annotation creation plus existing validated edit commands at the current authority level. This adds no new AI conversation surface and does not change the Milestone 5 conversational edit-with-undo model.

## Requirements covered

This plan covers these exact Milestone 6 product requirements from the master ledger:

- **FR-036 — Freeform pen.** The product provides one mouse, touch, and stylus-capable freeform vector-pen annotation tool.
- **FR-037 — True freeform strokes.** Drawing produces editable point-based vector strokes, not predefined arrow, circle, or underline objects.
- **FR-038 — Stroke editing.** A participant can change stroke color, thickness, geometry, and position after drawing.
- **FR-039 — Zoom fidelity.** Strokes remain visually crisp and correctly positioned across the supported zoom range.
- **FR-040 — Temporary and hideable.** New strokes are temporary by default and hide with comment bubbles.
- **FR-041 — Promote to durable content.** A participant can promote an annotation so it remains visible when the temporary overlay is hidden.
- **FR-042 — Automatic overlap attachment.** A stroke overlapping an eligible object attaches to it by default and follows its movement.
- **FR-043 — Disconnect attachment.** A participant can disconnect an attached stroke without changing its visible geometry at that moment.
- **Milestone 6 exit gate:** “Manual pen QA passes at minimum, default, and maximum zoom using mouse and touch/stylus emulation; automated geometry tests cover overlap, movement, disconnect, and promotion.”

Milestone 6 must also preserve these already-closed boundaries:

- **FR-018 — Shared visual vocabulary.** Adding a human annotation object must not leave the primary AI unable to inspect, create, style, move, resize, or delete that supported object when its current authority permits the action.
- **FR-030 — Hide comments.** The existing per-user visibility boundary must hide both comment markers and temporary annotations without mutating either data source.
- Milestone 1 command/history, Yjs durability, reconnect, collaboration, and renderer-independence behavior.
- Milestone 2 progressive disclosure, contextual tools, responsive workspace, keyboard operation, and accessible-state behavior.
- Milestones 4–5 authorization, server-generated AI object identity, plain-language replies, one atomic undo per AI turn, and no separate AI workflow.

The product owner added and approved this exact Milestone 6 supporting work on 2026-08-29:

- **Unified multi-selection transform frame.** Drag-selecting or Shift-clicking multiple annotations and/or supported canvas objects shows one selection boundary and handles around the complete selection; moving or resizing that selection commits as one undoable batch while preserving connector and annotation attachment integrity.
- **Unified Stroke palette.** Applicable annotations and canvas objects use the same expandable floating **Stroke** palette. Shared controls include stroke color and thickness; supported object borders and connectors also expose `Solid`, `Dashed`, and `Dotted` stroke styles through the same palette.
- **Contextual styling parity.** Annotation and object palettes share placement, focus, responsive, accessible-name, mixed-value, and batch-application behavior. A mixed selection exposes only properties valid for every applicable selected item and does not overwrite a mixed property until the participant chooses a value.

The milestone does not complete `AS-004`, which requires annotations inside first-class documents and remains Milestone 7 work.

## Decisions required

| Decision                           | Owner         | Options and consequences                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Required timing                                                              | Status                                             |
| ---------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| Temporary annotation meaning       | Product owner | **Selected:** a temporary annotation is durable, shared overlay content: it persists through save/reload and converges across collaborators, but each participant's existing comment-visibility preference hides it. Promotion changes the same object's classification to always-visible content. **Rejected alternative:** session-only ink would disappear on reload and make collaboration, promotion, and recovery ambiguous.                                                                                                           | Before the annotation schema and persistence tests are finalized.            | Approved by the product owner on 2026-08-29.       |
| First-version geometry editing     | Product owner | **Selected:** selecting a stroke provides whole-stroke move and bounding-box resize/reshape; resize scales its canonical centerline points deterministically, and Undo restores the prior geometry. Do not expose hundreds of raw point handles, segment erasing, or point insertion/removal in the first version. **Rejected alternative:** node-level editing offers finer control but substantially enlarges pointer, accessibility, history, and touch behavior.                                                                         | Before selection, transform, and accessibility behavior is implemented.      | Approved by the product owner on 2026-08-29.       |
| Pressure behavior                  | Product owner | **Selected:** store normalized pressure samples when the pointer supplies meaningful pressure and use deterministic simulated pressure for mouse or devices that report none. Render both paths through `perfect-freehand`; expose one pen, not separate pressure and non-pressure tools. **Rejected alternative:** uniform-width centerlines are simpler but underuse the approved pressure-aware library and reduce stylus fidelity.                                                                                                       | Before the point schema and renderer contract are frozen.                    | Approved by the product owner on 2026-08-29.       |
| Attachment targets and editing     | Product owner | **Selected:** after stroke completion, query overlaps through `rbush`, refine against rendered geometry, and attach to the topmost intersecting shape, text object, or table. Exclude connectors, other annotations, and not-yet-supported documents. Moving/resizing an attached stroke updates its target-relative placement and keeps it attached until the participant deliberately chooses Disconnect. **Rejected alternatives:** attach to every overlap or detach on direct movement, both of which make the result less predictable. | Before overlap and attachment commands are implemented.                      | Approved by the product owner on 2026-08-29.       |
| Multi-selection transform behavior | Product owner | **Selected:** drag-select or Shift-click may combine annotations and canvas objects in one transient selection. One frame encloses the complete selection; move and resize transform all applicable selected geometry as one batch, preserve attachment/reference integrity, and produce one Undo entry. Rotation remains outside this milestone.                                                                                                                                                                                            | Before Slice 2 replaces the current last-selected-node transformer behavior. | Approved by product-owner direction on 2026-08-29. |
| Shared Stroke palette behavior     | Product owner | **Selected:** replace the color-only outline surface with one expandable floating **Stroke** palette. Annotations and applicable objects share color and thickness controls, while supported object borders/connectors also receive Solid, Dashed, and Dotted styles. Mixed selections show only common valid controls and explicit mixed states.                                                                                                                                                                                            | Before Slice 2 changes style schema, commands, or contextual controls.       | Approved by product-owner direction on 2026-08-29. |

These approved choices do not change a sourced `FR-###` requirement or approved service boundary. The three added user-visible supporting requirements are recorded in the master ledger before implementation. Any materially different model still requires a reviewed plan and, when it changes ledger-level behavior, a master-ledger revision before implementation.

## Technical approach

### Delivery baseline and branch boundary

- Base the milestone on `origin/main` commit `9804e64`, the Milestone 5 squash merge. Local inspection on 2026-08-29 confirmed that the clean checkout tree matches `origin/main`, the master ledger marks Milestones 0–5 closed, and the closed Milestone 5 record is present on that tree.
- Use branch `codex/milestone-6-vector-annotations`. Drafting or approving this document does not authorize implementation commits, pushes, pull-request creation, preview database changes, production changes, closure, or merge.
- Before editing application code, read the installed Next.js 16.3 guidance under `node_modules/next/dist/docs/` for every affected Server/Client boundary. The expected work is client-heavy, but existing route and security contracts must not be inferred from older Next.js behavior.

### Canonical annotation model

- Extend the latent renderer-independent `annotation` variant already present in `CanvasObjectV2`; do not serialize Konva nodes or the `perfect-freehand` output polygon.
- Store a bounded canonical centerline as local point pairs plus normalized pressure samples, base geometry, stroke color, stroke thickness, temporary/promoted state, and optional attachment metadata. Validate finite coordinates, point/pressure cardinality, maximum sample count, supported thickness, and canvas/object identity with Zod.
- Keep `perfect-freehand` output derived at render time from the canonical samples and current geometry. This preserves editable source points, deterministic history, compact shared updates, and renderer portability.
- Normalize captured world-space samples into one local stroke coordinate system at completion. The geometry frame owns world position and scale; resizing changes the frame and deterministically maps the centerline rather than rewriting an opaque rendered polygon.
- Preserve compatibility for the existing latent annotation shape with a versioned adapter/defaults. Reject malformed or future annotation payloads without clearing the last valid canvas.

### Pointer capture and pen interaction

- Replace the Milestone 2 Drawing placeholder with one Pen choice and a compact palette for stroke color and thickness, reusing the approved progressive-disclosure and color-control vocabulary.
- Use Pointer Events and pointer capture. Read coalesced events when available, convert screen points to canvas coordinates through the current viewport, retain pointer type and bounded pressure, and ignore secondary contacts while a stroke is active.
- In Pen mode, mouse drag, one-touch drag, or stylus contact draws. Two-finger touch remains reserved for viewport navigation; Select and Pan behavior stays unchanged outside Pen mode.
- Render an in-progress local preview without persisting each pointer sample. On pointer up/cancel, simplify and bound the centerline, reject a degenerate tap/zero-length result, derive geometry, resolve attachment, and commit exactly one `object.create` command and one Yjs update/history entry.
- Escape or pointer cancellation removes only the uncommitted preview. Undo after completion removes the whole stroke through the existing history boundary.

### Vector rendering, selection, and editing

- Render annotations in Konva from the `perfect-freehand` outline as filled vector geometry. Keep temporary annotations on a dedicated overlay layer whose visibility follows the shared comment/annotation preference; render promoted annotations in normal canvas order.
- Use vector geometry and the stage transform at the current `0.25` minimum, `1` default, and `3` maximum scale. Do not raster-cache the canonical stroke in a way that blurs zoom or changes hit geometry.
- Give the rendered stroke an accessible selection target with a bounded screen-space hit area. In Select mode, clicking/tapping a visible stroke selects it like another canvas object.
- Under the recommended editing decision, selection exposes move, resize/reshape, Delete, stroke color, and thickness through existing contextual-control patterns. Attached strokes additionally expose Disconnect; temporary strokes expose Promote. Promoted strokes do not expose a demotion action in this milestone.
- Add annotation-aware command validation instead of letting UI code write Yjs fields directly. Creation, style, move, resize/reshape, promote, attach/reposition, disconnect, and delete must produce conflict-aware history entries and durable collaboration updates.
- When an attachment target is deleted, detach the annotation as part of the same validated command while preserving its last rendered world geometry, following the existing connector-detach safety pattern.

### Unified multi-selection transform

- Replace the current last-selected-node transformer behavior with one combined selection frame derived from every selected annotation and canvas object's rendered world bounds. Drag selection and Shift-click use the same selected-ID order and one visual frame.
- Preview multi-selection movement and resize locally during the gesture, then commit one validated command batch at gesture end. One gesture produces one actor-local Undo/Redo entry and one coherent collaboration update sequence rather than independent visible jumps.
- Map each selected object's geometry from the pre-gesture selection bounds into the new bounds. Shapes, text, tables, and annotations transform directly; free connector endpoints transform with the selection; attached endpoints retain their references and resolve against the resulting target geometry.
- Preserve annotation attachment semantics in mixed selections. An attached annotation and its selected target transform together without double-applying movement; an attached annotation selected without its target updates its target-relative placement; Disconnect remains explicit.
- Include all selected items in the visible frame even when a property or transform action is not valid for every item. Disable or omit an invalid shared action rather than applying a partial, surprising transform. Rotation remains disabled in this milestone.
- Keep the combined frame, handles, toolbar position, focus, keyboard movement, and screen-space affordance sizing usable at the approved minimum/default/maximum zoom and desktop/tablet viewports.

### Shared contextual styling palettes

- Consolidate the current color-only **Stroke color** surface into one expandable floating **Stroke** palette used by selected annotations, shapes, tables, and connectors when applicable.
- Reuse the same palette component, popover positioning, focus restoration, keyboard navigation, custom-color control, responsive clamping, accessible names, and mixed-value presentation for annotations and canvas objects. Do not create a separate annotation styling language.
- Expose stroke color and thickness to every applicable annotation/object selection. Add a backward-compatible `outlinePattern` style field with `solid`, `dashed`, and `dotted` values for supported object borders and connectors; existing objects default to `solid` without a destructive document rewrite.
- Keep pressure-rendered freeform annotations solid in the first version while sharing color and thickness controls. Show the dash-style control only when every applicable selected item supports it; do not imply that an omitted property was applied.
- Display an explicit mixed state for color, thickness, or pattern when selected values differ. Opening the palette is non-mutating; choosing a value applies it to every applicable selected item as one validated, undoable command batch.
- Keep Fill and Text palettes separate by concern while sharing their established contextual shell. The **Stroke** palette owns border/line color, thickness, and supported pattern so those properties are not split across competing popovers.

### Temporary overlay and promotion

- Lift the existing per-user/per-canvas comment visibility state to the shared canvas owner so `CanvasComments` and the annotation renderer consume one source of truth and one current local-storage key.
- Rename the current marker-only control so its visible and accessible copy accurately communicates that it hides or shows comments and temporary annotations. Toggling it remains ephemeral and emits no Yjs or relational mutation.
- Set `temporary: true` on every human or AI-created annotation unless a later explicitly authorized command promotes it.
- Implement promotion as one idempotent, undoable annotation command that changes the existing object to `temporary: false`. Promotion does not clone the stroke, change its geometry, disconnect it, or delete its history.

### Overlap attachment and movement

- Build or reuse an `rbush` index for eligible visible object bounds. Query it once when a stroke completes or when an unattached stroke is deliberately repositioned for reattachment; do not scan the complete canvas on each pointer frame.
- Refine candidate bounds with rectangle, ellipse, diamond, text, or table geometry and stroke-width tolerance. Select the highest candidate in canonical canvas order when more than one eligible target intersects.
- Store one target identity and target-relative offset. Derive the attached stroke's rendered world origin from current target geometry so target movement is visually live without emitting secondary annotation mutations.
- Preserve attachment during direct stroke move/resize by updating its relative placement. Disconnect resolves the current rendered origin, writes that world geometry, and clears attachment in one command so there is no visible jump.
- Include attached annotation geometry in selection bounds, zoom-to-fit, marquee behavior, clipboard/reference remapping, duplicate, delete, Undo/Redo, projection, and collaboration tests where those existing behaviors apply.

### AI vocabulary and permission boundary

- Expand the semantic projection from the current placeholder description to bounded annotation state: stable ID, temporary/promoted state, color, thickness, geometry/bounds, attachment target, and a summarized point count/path envelope rather than unbounded raw samples by default.
- Add a server-identified `stage_new_annotations` path for `Edit with undo`, parallel to the existing server-identified shape and connector creation paths. The provider supplies bounded semantic stroke specifications/local keys; the server creates UUIDs and trusted metadata, validates scope and attachment targets, and applies the complete turn as one transaction.
- Let existing validated move, resize, style, delete, proposal, and trusted-command paths operate on an existing annotation only after annotation-specific schema and scope checks pass. Do not let deterministic layout tools target annotations unless a later approved requirement expands them.
- Preserve current authority, current membership, comment-defined scope, idempotency, cancellation, timeout, prompt-injection, plain-language reply, and atomic-undo rules. No OpenAI or Supabase credential reaches the browser, and no annotation tool bypasses the common command or durable update boundary.

### Collaboration, failure behavior, and observability

- Persist annotation commands in the shared Yjs document through the existing pending-update, server-sequenced append, Broadcast, retry, reconnect, and snapshot load paths. Do not add a relational annotation table or broadcast raw pointer samples.
- Restrict annotation mutations to owners and editors. The Drawing control and annotation edit actions must be unavailable or clearly read-only for commenters and viewers, while RLS/append authorization remains the final durable enforcement.
- Keep the last valid stroke visible after collaboration or persistence errors and report the existing unsynced/failed states. A rejected stroke payload, attachment conflict, or permission loss must not clear unrelated canvas content.
- Add privacy-safe development/test measurements for captured sample count, simplified point count, render time, overlap-candidate count, and attachment result. Do not log canvas coordinates, rendered capture data, comment text, or secrets in production telemetry.
- Keep local, deploy-preview, and production environments distinct. Milestone verification uses a non-production Netlify preview and non-production Supabase data; no production deployment is authorized by plan approval.

## Database and security changes

No relational schema migration is currently expected. Annotation state belongs to the approved shared Yjs canvas document, while the existing `canvas_updates` / `canvas_snapshots` tables and `append_canvas_update` authorization remain the durability boundary.

The implementation must still include security and compatibility work:

- Extend the versioned canvas-object Zod contract and legacy adapter/default behavior without rewriting existing stored Yjs updates or snapshots.
- Prove owners and editors can persist annotation updates while commenters, viewers, non-members, and unauthenticated callers cannot append them through the existing security-definer function and RLS boundary.
- Re-run the complete database/RLS suite even if no migration is added. If implementation discovers that a relational change is necessary, pause, document the additive migration, policy matrix, rollback/compensating path, and preview rollout impact here, then obtain approval before applying it.
- Keep AI annotation creation server-identified and service-only at the existing trusted transaction boundary; authenticated clients cannot forge AI identity, provider provenance, or change-set state.
- Rollback path: remove or disable the Pen and AI annotation entry points while retaining readable annotation schema support. Never ship a rollback that makes already-created annotation objects unloadable or clears the canvas.

## Ordered task checklist

### Slice 1 — One durable vector pen

- [x] Obtain product-owner approval for the four recommended decisions, the unified multi-selection frame, and shared Stroke-palette additions; change this document to `Approved for implementation` before editing product code.
- [x] Read the installed Next.js 16.3 guidance for every affected boundary and record any implementation constraint discovered.
- [x] Extend the versioned annotation schema with bounded local centerline/pressure data, style, temporary state, and compatible attachment metadata; add malformed, legacy/default, and round-trip tests.
- [x] Add annotation-aware create validation and one history-aware commit path through the existing product command executor.
- [x] Replace the Drawing placeholder with one accessible Pen tool and compact color/thickness choices; implement pointer capture, coalesced sampling, pressure normalization, local preview, cancellation, and one-command completion.
- [x] Render derived `perfect-freehand` vector geometry and prove mouse, touch-pointer, stylus-pointer, save, reload, Undo/Redo, and two-session convergence for one temporary stroke.

### Slice 2 — Editing, visibility, and promotion

- [x] Make visible strokes selectable with pointer, touch, keyboard-accessible contextual actions, marquee/zoom-to-fit bounds, and a stable screen-space hit region.
- [x] Implement whole-stroke position and geometry editing under the approved transform model; route color and thickness through validated style commands.
- [x] Replace the last-selected-node transformer with one frame and handles around every drag-selected or Shift-clicked annotation/object; commit multi-item move and resize as one reference-safe history batch.
- [x] Add backward-compatible `solid`, `dashed`, and `dotted` object/connector stroke patterns and consolidate color, thickness, and supported pattern into one expandable floating Stroke palette.
- [x] Reuse the Stroke palette's shared color/thickness, positioning, focus, responsive, accessible-name, mixed-value, and batch-application behavior for annotation and object selections; expose only common valid properties.
- [x] Share the current comment-visibility state with the annotation overlay, update the control copy, and prove the toggle is per-user/per-canvas and non-mutating.
- [x] Implement one idempotent, history-aware Promote action that keeps the same object and geometry visible while the temporary overlay is hidden.
- [x] Add focused accessibility, tablet, reduced-motion, clipboard/duplicate, Delete, Undo/Redo, reconnect, and collaboration regressions for edited and promoted strokes.

### Slice 3 — Automatic attachment and AI vocabulary

- [ ] Add the `rbush` candidate index, shape-aware overlap tests, canonical-order winner, target-relative attachment resolution, and eligible-type enforcement.
- [ ] Make attached strokes follow target movement live, preserve attachment during direct stroke transforms, disconnect without a visible jump, and detach safely when the target is deleted.
- [ ] Cover attachment reference remapping for duplicate/copy-paste and conflict-aware history/collaboration behavior.
- [ ] Expand semantic AI projection and bounded scope checks for annotations without sending an unbounded raw point stream by default.
- [ ] Add server-identified annotation creation for Edit with undo and annotation-safe proposal/trusted edits; preserve plain-language replies, one-turn Undo, current authority/membership, idempotency, cancellation, and comment-defined scope.
- [ ] Prove the primary AI can inspect, create, style, move/resize, and delete an annotation at permitted authorities while lower authorities remain non-mutating.

### Slice 4 — Exit-gate regression and hosted evidence

- [ ] Run formatting, lint, strict type, unit, migration/RLS, production build, complete Chromium E2E/accessibility, and annotation-specific suites from a clean state.
- [ ] Record deterministic performance for capture, simplification, vector rendering, and overlap lookup on a representative mixed canvas; confirm annotation work does not introduce a per-pointer full-canvas scan.
- [ ] Obtain exact-head protected CI and a matching ready immutable Netlify deploy preview with a clean secret scan.
- [ ] In Codex's in-app browser, complete authenticated mouse QA at `25%`, `100%`, and `300%`, including draw, style, move, resize, hide/show, promote, attach, target move, disconnect, reload, and Undo/Redo.
- [ ] Complete the same zoom matrix with touch/stylus emulation, retain input/browser details and screenshots or traces, and record any emulation limitation without describing it as hardware proof.
- [ ] Run a two-authenticated-session scenario proving temporary visibility is per-user, stroke edits/attachment converge, reload restores the same result, and an unrelated collaborator edit survives annotation Undo.
- [ ] Trace evidence to `FR-036` through `FR-043`, the Milestone 6 exit gate, preserved `FR-018`, preserved `FR-030`, and closed-milestone regressions before requesting closure approval.

## Pull-request slices

Pull requests improve reviewability but are not authorized by plan approval alone. Create or push them only after separate product-owner authorization.

| Slice                                             | Depends on                            | Demoable outcome                                                                                                                                                                                                                                      | Tests                                                                                                                                                                                                                                        | Rollback or compensating path                                                                                                                           |
| ------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Durable vector pen                             | Approved decisions and current `main` | An owner/editor draws one pressure-aware point stroke with mouse/touch/stylus input; it saves, reloads, converges, renders crisply, and undoes as one action.                                                                                         | Schema/adapter, sampling/simplification, command/history, renderer, pointer, persistence, two-context E2E, axe.                                                                                                                              | Disable the Drawing entry while retaining schema/read compatibility for any created annotation.                                                         |
| 2. Edit, selection, styling, overlay, and promote | Slice 1                               | A participant transforms one or many annotations/objects with one selection frame, uses one shared Stroke palette for common styling plus supported object dash patterns, hides temporary ink with comments, and promotes it without a visual change. | Combined-bounds and batch-transform mapping, connector/attachment integrity, style schema/defaults, mixed values, shared palette focus/responsiveness, visibility non-mutation, promotion idempotency, clipboard/history, accessibility E2E. | Disable the combined transform and new palette controls while retaining readable schema defaults, single-item selection, and safe temporary visibility. |
| 3. Attachments and AI parity                      | Slices 1–2                            | Overlapping ink attaches to one predictable target, follows it, disconnects without jumping, and remains available to the permission-aware primary AI.                                                                                                | `rbush`/shape intersection, order winner, relative transform, delete/detach, duplicate/remap, AI tool/scope/authority/undo, two-session convergence.                                                                                         | Disable auto-attachment and AI annotation creation; preserve standalone annotations and existing attachment read/detach compatibility.                  |
| 4. Evidence and closure readiness                 | Slices 1–3                            | One exact-head preview proves the full zoom/input/edit/visibility/attachment/collaboration matrix with no closed-milestone regression.                                                                                                                | Full local/CI suite, immutable preview, mouse and emulated touch/stylus matrix, two-session hosted acceptance.                                                                                                                               | Keep the milestone open and correct only failures within approved scope.                                                                                |

## Automated and manual tests

### Automated verification

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all exit zero.
- In an isolated synthetic test database, `pnpm db:reset` replays the complete migration ledger and `pnpm db:test` passes the existing database/RLS matrix. Do not erase retained user or preview data to obtain this evidence. If the documented macOS path-with-spaces wrapper limitation recurs, record it and use direct stop-on-error pgTAP execution without claiming the wrapper passed.
- `pnpm test:e2e` passes the complete Chromium suite with no skipped Milestone 6 scenario and no closed-milestone regression.
- Unit/property fixtures cover:
  - point capture, pressure normalization, coalesced-event ordering, simplification bounds, and degenerate cancellation;
  - stable `perfect-freehand` outline generation from canonical centerline samples;
  - local/world coordinate mapping and crisp geometry at `0.25`, `1`, and `3` scale;
  - whole-stroke move and resize mapping, style bounds, selection/hit geometry, and Undo/Redo conflict behavior;
  - combined drag/Shift selection bounds across annotations, shapes, text, tables, and connectors; one-batch move/resize; connector endpoint and annotation attachment integrity; mixed unsupported-action behavior;
  - backward-compatible `solid`, `dashed`, and `dotted` object/connector stroke rendering; shared color/thickness application; explicit mixed values; non-mutating palette open/close; one-batch style history;
  - temporary visibility as presentation only and promotion as one idempotent object mutation;
  - rectangle, ellipse, diamond, text, and table overlap; connector/annotation/document exclusion; topmost winner; no-overlap result;
  - attached target movement, direct attached-stroke movement, disconnect invariance, target deletion, duplicate/reference remap, and reload;
  - AI projection bounds, server-generated identity, tool authority, direct-object/world-space scope, plain-language reply, atomic undo, malformed samples, and prompt-injection rejection.
- E2E fixtures use real product routes, Yjs updates, Supabase persistence, rendered canvas, visibility control, contextual toolbar, and at least two authenticated browser contexts. Unit-only evidence is insufficient for persistence, convergence, visibility, AI, or the exit gate.

### Manual and hosted preview verification

Use one exact CI-tested immutable Netlify preview in Codex's in-app browser by default. Retain deploy ID, commit SHA, browser/input environment, date, screenshots or traces, and expected-versus-observed results.

1. **Mouse zoom matrix:** at `25%`, `100%`, and `300%`, draw a curved multisegment stroke across empty canvas, then select, move, resize, recolor, and change thickness through the shared floating Stroke palette. The vector stays crisp and aligned under pan/zoom and after reload.
2. **Touch/stylus-emulation matrix:** repeat creation at all three zoom levels with a one-touch pointer and pressure-bearing pen events. Confirm one pointer draws, secondary touch does not corrupt the stroke, and viewport gestures recover cleanly.
3. **Unified multi-selection:** drag-select several strokes, then Shift-click shapes, text, a table, and connectors. One frame encloses the full selection at every zoom. Move and resize once; every applicable item transforms coherently, references remain intact, and one Undo restores the entire pre-gesture state.
4. **Shared Stroke palette:** open the same floating Stroke palette for one annotation, one shape, one table, one connector, homogeneous multiselections, and a mixed annotation/object selection. Color and thickness share controls; shapes/tables/connectors support Solid, Dashed, and Dotted; mixed values remain untouched until a new value is chosen.
5. **Temporary overlay:** create two temporary strokes beside an open comment, hide comments/annotations, and confirm both markers and temporary ink disappear only for that user. Reload retains the preference and the underlying objects.
6. **Promotion:** promote one stroke, hide overlays, and confirm the promoted stroke remains with unchanged pixels/geometry while the unpromoted stroke hides. Undo promotion returns it to temporary status.
7. **Attachment:** cross a rectangle, ellipse, diamond, text object, and table in separate attempts; confirm eligible topmost attachment. Move each target and observe live following. A stroke over a connector or another stroke remains unattached.
8. **Disconnect:** record bounds before and immediately after Disconnect. They match within the approved subpixel tolerance; subsequent target movement leaves the stroke fixed. Reload and Undo/Redo preserve the expected state.
9. **Two participants:** owner and editor see the same completed stroke, combined selection transform, shared style change, attachment, target movement, and promoted state after reload. One participant may hide temporary overlays without hiding them for the other. Commenter/viewer attempts remain read-only.
10. **AI parity:** through an ordinary comment under Edit with undo, request one bounded annotation. The AI uses plain-language copy, creates one server-identified stroke, and one Undo removes the complete turn while preserving a later unrelated human edit.
11. **Responsive and accessibility:** at `1440 × 900`, `1024 × 768`, and `768 × 1024`, confirm the Pen palette, combined selection frame, and shared Stroke palette remain in bounds, touch targets meet the established size, mixed state is not color-only, focus is visible/restored, and axe reports no detectable violation.

The emulated touch/stylus pass proves the browser event and application contract, not physical-device hardware quality. Record any later physical iPad, Apple Pencil, or other stylus pass as additional evidence rather than silently equating it with emulation.

## Risks and assumptions

| Risk or assumption                                                                                             | Likelihood / impact | Mitigation or experiment                                                                                                                                                     | Owner                         | Current status                              |
| -------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------- |
| Raw pointer streams can create oversized Yjs updates and slow rendering.                                       | High / high         | Coalesce, simplify, cap samples, reject degenerate/oversized strokes, store canonical centerlines only, and measure update/render size before preview.                       | Engineering                   | Open.                                       |
| `perfect-freehand` output can change with options or dependency upgrades.                                      | Medium / high       | Pin the existing version, centralize options, store source samples rather than outline polygons, and add deterministic fixtures.                                             | Engineering                   | Open.                                       |
| Pressure values vary by pointer type and browser.                                                              | High / medium       | Normalize bounded values, simulate pressure where absent, record pointer/browser details, and keep the uniform fallback deterministic.                                       | Product owner and engineering | Recommended behavior approved 2026-08-29.   |
| Single-touch drawing can conflict with pan/zoom and browser gestures.                                          | Medium / high       | Pointer capture, one active drawing pointer, explicit Pen mode, two-finger navigation reservation, cancellation tests, and tablet preview QA.                                | Engineering                   | Open.                                       |
| Whole-stroke transforms may not satisfy the product owner's meaning of “geometry editing.”                     | Medium / high       | Use the approved whole-stroke and combined-selection transform model; retain node-level editing as explicitly excluded first-version work.                                   | Product owner                 | Editing model approved 2026-08-29.          |
| Bounding-box overlap can attach ink that only passes near an object.                                           | Medium / high       | Use `rbush` for candidates only, then refine against actual eligible geometry plus stroke-width tolerance and test near misses.                                              | Engineering                   | Open.                                       |
| Target-relative attachment can jump during disconnect, deletion, Undo, or concurrent movement.                 | Medium / critical   | Resolve live world geometry inside one command, use field-aware history, and test subpixel invariance with two contexts and reload.                                          | Engineering                   | Open.                                       |
| Temporary but persisted ink may be misunderstood as ephemeral or disposable.                                   | Medium / medium     | Use the approved shared-overlay meaning and accurate hide/show and promotion copy.                                                                                           | Product owner                 | Shared-overlay meaning approved 2026-08-29. |
| Adding annotations can regress closed `FR-018` because current AI creation helpers focus on shapes/connectors. | High / high         | Add bounded server-identified annotation creation, projection, authority, scope, undo, and provider/tool regression in Slice 3.                                              | Engineering                   | Required preservation work.                 |
| Annotation selection or overlap may introduce full-canvas scans on pointer frames.                             | Medium / high       | Use `rbush` for completion-time overlap and existing indexed/derived bounds; capture candidate counts and frame measurements.                                                | Engineering                   | Open.                                       |
| Comment visibility currently lives inside `CanvasComments`, not the canvas owner.                              | Confirmed / medium  | Lift one backward-compatible state owner and key; pass state into both comments and annotations; prove toggle emits no durable update.                                       | Engineering                   | Planned in Slice 2.                         |
| Playwright is Chromium-only and emulation is not physical stylus proof.                                        | Confirmed / medium  | Use Chromium for milestone automation, explicitly retain emulation details, and leave the production cross-browser/device matrix to Milestone 11.                            | Product owner and engineering | Known limitation.                           |
| One multi-selection frame can break connector endpoints or double-apply attached annotation movement.          | Medium / critical   | Transform from one immutable pre-gesture snapshot, define reference-aware mapping by object type, commit one batch, and test mixed selections with Undo/reload/two contexts. | Engineering                   | Added by approved plan revision.            |
| A shared palette can silently overwrite mixed or unsupported properties.                                       | Medium / high       | Represent mixed values explicitly, expose only common valid controls, make opening non-mutating, and batch only a deliberately chosen value.                                 | Engineering                   | Added by approved plan revision.            |

## Exit criteria

- [ ] `FR-036` passes: one Pen creates valid strokes from mouse, one-touch, and stylus-pointer input through the same user-facing tool.
- [ ] `FR-037` passes: persisted objects contain editable canonical point/pressure data and no predefined-shape substitution or serialized renderer polygon.
- [ ] `FR-038` passes under the approved editing model: color, thickness, geometry, and position changes persist, converge, reload, and participate in Undo/Redo.
- [ ] `FR-039` passes at the exact supported scales `0.25`, `1`, and `3` with retained manual visual evidence and deterministic coordinate tests.
- [ ] `FR-040` passes: every new annotation starts temporary, persists as shared overlay state, and hides with comment markers through one per-user non-mutating control.
- [ ] `FR-041` passes: promotion keeps the same stroke visible when overlays are hidden, with unchanged geometry and an undoable/idempotent state transition.
- [ ] `FR-042` passes: a qualifying overlap attaches to the approved topmost eligible object, follows target movement live, converges across two sessions, and survives reload.
- [ ] `FR-043` passes: Disconnect preserves exact visible geometry within the approved tolerance and prevents later target motion from moving the stroke.
- [ ] **Unified multi-selection transform frame** passes: drag-select and Shift-click produce one complete selection frame for annotations and canvas objects; one move/resize remains reference-safe, collaborative, reloadable, and undoable as a single batch.
- [ ] **Unified Stroke palette** passes: annotations and applicable canvas objects use one floating palette for shared color/thickness; supported object borders/connectors persist Solid, Dashed, and Dotted patterns through schema, command, collaboration, reload, and Undo/Redo boundaries.
- [ ] **Contextual styling parity** passes: annotation/object palettes share placement, focus, responsive, accessible-name, mixed-value, and batch behavior, and mixed selections expose only common valid properties without mutation on open.
- [ ] The exact Milestone 6 exit gate passes with manual mouse and touch/stylus-emulation QA at minimum/default/maximum zoom plus automated overlap, movement, disconnect, and promotion tests.
- [ ] Closed `FR-018` remains true for the newly supported annotation vocabulary at the current AI authority levels, without a new AI UI or technical reply leakage.
- [ ] Closed `FR-030` remains true: comment markers and temporary annotations share visibility while underlying comment and Yjs data remain unchanged.
- [ ] Owners/editors can persist annotations; commenters, viewers, non-members, and unauthenticated actors cannot mutate them in UI and durable authorization tests.
- [ ] The full local quality, database/RLS, Chromium/accessibility, reconnect, collaboration, comment, AI, and Milestones 1–5 regression suites pass from a clean state.
- [ ] Protected CI passes for the exact reviewed head, and a matching ready immutable Netlify preview passes the authenticated hosted matrix with no secret-scan finding.
- [ ] This document reaches `Verification complete — awaiting closure approval`; only after separate product-owner closure approval are the genuinely proven Milestone 6 master-ledger boxes checked.

## Explicitly excluded work

- First-class documents, document-internal annotations, clipping/ownership inside documents, document comments, and `AS-004` (`FR-044` through `FR-053`, Milestone 7).
- Multiple pen types, highlighter, eraser tool, lasso erasing, handwriting recognition, shape recognition, arrow/circle/underline autocorrection, or annotation-to-text conversion.
- Node-by-node point editing, segment insertion/removal, path boolean operations, or Bezier control handles; the approved first-version model uses whole-stroke and combined-selection transforms.
- Dashed or dotted pressure-rendered freeform annotations. Annotations share color and thickness with the unified Stroke palette; Solid, Dashed, and Dotted patterns apply to supported object borders and connectors in this milestone.
- Multiple simultaneous attachment targets, attachment to connectors/annotations, or attaching to not-yet-supported documents.
- Demoting promoted content back to the temporary overlay; deletion and Undo remain available.
- A second comments/annotation visibility system, shared/global hide state, or automatic deletion merely because a user hides overlays.
- A dedicated AI drawing panel, autonomous specialist agent, unbounded raw-point provider context, screenshot-authoritative annotation mutation, or changes to the Milestone 5 conversational undo model.
- Guided stories, live voice, starter templates, production cross-browser/device certification, production deployment, domain changes, or launch work from Milestones 8–11.
- Pull-request creation, push, preview database change, production data/schema/configuration change, milestone closure, merge, or master-plan completion edits without their separate approvals.

## Implementation record

Planning inspection on 2026-08-29 established that:

- `origin/main` is `9804e64`; the clean Milestone 6 planning branch matches that tree.
- The master ledger and Milestone 5 record both identify Milestones 0–5 as closed and vector annotations as the next open milestone.
- `perfect-freehand` `1.2.3` and `rbush` `4.0.1` are already pinned dependencies.
- `CanvasObjectV2` already contains a latent, unrendered annotation variant with points, temporary state, and an attached object ID. `ProductCanvas` currently filters annotations from rendering and contextual styling.
- The Drawing palette is deliberately non-mutating and says the vector pen arrives in Milestone 6.
- Comment visibility is a per-user/per-canvas local preference owned inside `CanvasComments`; the renderer does not yet consume it.
- Current persistence stores canvas objects in Yjs updates/snapshots and authorizes durable append only for owners/editors. No relational annotation table or new migration is indicated by the approved architecture.
- Current AI projection recognizes annotation identity only as “temporary annotation,” deterministic layout rejects annotations, and server-identified creation exists for shapes/connectors but not annotations. Milestone 6 must close that vocabulary gap to preserve `FR-018`.
- Playwright currently runs Chromium only; the milestone exit gate therefore requires explicit hosted input emulation details and must not be represented as physical stylus hardware proof.
- Netlify uses the Next.js adapter with distinct production and deploy-preview environment contexts; CI runs format, lint, strict types, units, local Supabase/RLS, build, Chromium E2E, and accessibility.
- The existing workspace already computes aggregate selected bounds for toolbar placement, but its Konva Transformer binds only the last-selected node. The approved revision replaces that mismatch with one functional multi-selection frame and one-batch transform.
- The current contextual surface splits stroke color into a color-only panel while `outlineWidth` already exists in the object style schema. The approved revision consolidates color, thickness, and supported dash patterns into one shared Stroke palette.

The product owner approved all recommended decisions and the revised multi-selection/shared-palette scope on 2026-08-29. On 2026-08-30, the product owner additionally authorized dependency-ordered implementation and a focused commit after each completed slice, with work continuing until the next feedback gate. Push, pull-request, deployment, closure, and merge authorization remain separate.

Slice 1 implementation on 2026-08-30 established that:

- The installed Next.js 16.3 Client Component guidance keeps browser pointer capture, coalesced events, local preview state, and Konva rendering inside the existing `ProductCanvas` client boundary. No Server Component prop, route, API, or database change was required.
- `CanvasObjectV2` now accepts backward-compatible legacy annotations and canonical `strokeVersion: 1` annotations with even local point pairs, cardinality-matched normalized pressure samples, bounded payloads, pointer type, existing style, temporary state, and compatible attachment identity. New `object.create` commands require the canonical pressure and pointer metadata while legacy stored objects remain readable.
- `annotation-stroke.ts` centralizes deterministic mouse-pressure simulation, meaningful touch/pen pressure, sample simplification and capping, world-to-local normalization, degenerate-tap rejection, and derived `perfect-freehand` outlines. Renderer polygons are never persisted.
- The Drawing placeholder is now an accessible Pen palette with local color and thickness choices. Owners and editors can draw; the Pen action is disabled with explanatory copy for commenters and viewers.
- One active primary pointer owns a local preview and commits only once on completion. Escape or pointer cancellation discards only the preview. Chromium's valid empty `getCoalescedEvents()` result required an explicit fallback to the original pointer event; the focused browser regression retains that fix.
- A second touch cancels uncommitted ink and enters a custom two-pointer pan/pinch gesture without creating an annotation. Single touch resumes only after the gesture's contacts have lifted.
- Completed annotations render as filled vector geometry derived from canonical samples, persist through the existing Yjs update/snapshot path, converge between owner and editor sessions, reload, and use the existing conflict-aware history entry for whole-stroke Undo/Redo.
- No relational migration, preview database mutation, new service, AI behavior, attachment behavior, or Slice 2 editing/styling/visibility work was introduced.

Slice 2 implementation on 2026-08-30 established that:

- An annotation now has a stable screen-space hit target, can be selected from the canvas or object navigator, and uses its canonical geometry for whole-stroke move and resize. Legacy annotations capture their first compatible base frame on resize so their rendered outline remains deterministic.
- Multiple annotations and/or canvas objects now bind one transient selection proxy and Transformer around aggregate world bounds. Gesture preview maps every selected geometry from one immutable source frame; completion runs validated commands inside one outer Yjs transaction and one actor-local history entry. Free connector endpoints transform with the frame while attached endpoint references remain intact; single-connector endpoint handles retain their established behavior.
- The floating **Stroke** palette reuses the existing color controls and adds shared thickness choices plus explicit mixed states. Shapes, tables, and connectors also persist backward-compatible Solid, Dashed, and Dotted patterns; pressure-rendered annotations deliberately expose only the common color and thickness controls.
- Comment-marker visibility is now owned by the canvas and passed into the comment surface. Its backward-compatible local key remains scoped by user and canvas; hiding changes presentation only, clears an inaccessible temporary-annotation selection, emits no canvas command, and leaves a second participant's preference untouched.
- Promotion is an idempotent validated command on the same annotation object. Promoted ink keeps its identity, geometry, style, collaboration state, clipboard behavior, and reload behavior while remaining visible when temporary overlays are hidden.
- Focused Chromium coverage exercises a tablet viewport with reduced motion, mixed thickness, one group frame, one-step group Undo, non-mutating hide/show, promotion, duplicate, Delete, Undo/Redo, reload, axe, two-session style/promotion convergence, and per-user visibility. Existing connector editing, object pattern persistence, reconnect, responsive-panel, comment, and AI-comment smoke scenarios remain green under the correctly configured local server.

## Verification evidence

| Date       | Environment                      | Command or scenario                                                                                                                                   | Result                                                                                                                                                                                                                                                                                                                                                                                                                        | Evidence                                             | Requirements covered                                                                     |
| ---------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 2026-08-29 | Local repository                 | Inspect master ledger, Milestone 0–5 records, code/schema/tests, Git history/status, deployment configuration, dependencies, and current remote refs  | Planning baseline only: clean tree; planning branch matches `origin/main` `9804e64`; Milestone 6 is the next open ledger scope; latent annotation schema and Drawing placeholder exist; no Milestone 6 behavior or passing claim exists.                                                                                                                                                                                      | Local Git and source inspection                      | Milestone selection and implementation baseline only                                     |
| 2026-08-29 | Prior exact merged baseline      | Reconcile Milestone 5 closure, squash merge, post-merge CI, and production deploy before planning the next milestone                                  | Historical prerequisite confirmed: PR #10 merged as `9804e64`; post-merge CI `33228639210` passed; production deploy `6a924190475a7d0008b391f0` matched that commit. This is not Milestone 6 evidence.                                                                                                                                                                                                                        | Closed Milestone 5 record and prior delivery summary | Delivery baseline only                                                                   |
| 2026-08-30 | Local repository                 | `pnpm check` after Slice 1 implementation                                                                                                             | Pass: Prettier, ESLint with zero warnings, strict TypeScript, 205 Vitest assertions across 46 files, and the Next.js 16.3 production build completed. Annotation coverage includes pressure normalization, simplification/capping, canonical geometry, deterministic derived outlines, malformed and legacy compatibility, Yjs round trip, command creation, and whole-stroke Undo/Redo.                                      | Local command output                                 | Slice 1 schema, geometry, command/history, build, and regressions                        |
| 2026-08-30 | Local Supabase Auth and Chromium | `pnpm exec playwright test tests/e2e/canvas-workspace.spec.ts --workers=1` with local public Supabase values injected                                 | Pass: all 10 workspace scenarios completed, including owner/editor/commenter Pen permissions, mouse plus emulated touch/pen creation, two-session convergence, durable save/reload, dock accessibility, reconnect, and all existing workspace regressions.                                                                                                                                                                    | Playwright output                                    | Slice 1 product interaction, permissions, collaboration, persistence, and accessibility  |
| 2026-08-30 | Local Supabase Auth and Chromium | Focused two-touch navigation rerun after adding the second-contact gesture                                                                            | Pass: two emulated touch contacts changed the viewport without increasing annotation count; the same scenario then created mouse, touch-pointer, and pen-pointer annotations, converged them across owner/editor sessions, and restored all three after reload. Input is browser emulation, not physical stylus proof.                                                                                                        | Playwright output                                    | Slice 1 input modes, two-touch reservation, convergence, and reload                      |
| 2026-08-30 | Local repository                 | `pnpm check` after Slice 2 implementation                                                                                                             | Pass: Prettier, ESLint with zero warnings, strict TypeScript, 212 Vitest assertions across 48 files, and the Next.js 16.3 production build completed. Coverage includes combined geometry mapping, attached/free connector handling, stroke-pattern defaults/dash derivation, promotion validation/idempotency, annotation resize compatibility, style validation, and canonical annotation clipboard duplication.            | Local command output                                 | Slice 2 schema, commands, transforms, styling, promotion, clipboard, build, regressions  |
| 2026-08-30 | Local Supabase Auth and Chromium | `pnpm exec playwright test tests/e2e/canvas-objects.spec.ts tests/e2e/canvas-workspace.spec.ts --workers=1`, followed by the expanded workspace suite | Pass: the combined pre-expansion run completed 20/20 scenarios; the final expanded workspace run completed 12/12. Evidence covers shared Stroke pattern persistence, connector endpoint regression, annotation selection/style/group move, one-step Undo, hide/show, promotion/reload, duplicate/Delete/Undo/Redo, reduced-motion tablet axe, reconnect, and two-session per-user visibility plus edit/promotion convergence. | Playwright output                                    | Slice 2 interaction, collaboration, visibility, accessibility, closed canvas regressions |
| 2026-08-30 | Local Supabase Auth and Chromium | Focused comment/collaboration regression with the local service-role value supplied to the dev server                                                 | Pass: 4/4 selected comment scenarios completed, including hide/reload, ordinary primary-AI response, complete-group targeting, and review/history controls. An earlier full-file attempt was invalid because the manually started server omitted the required local service-role value; its AI failures are configuration evidence, not product failures.                                                                     | Playwright output and server log                     | Preserved comment visibility and closed AI/comment boundaries                            |

## Change record

| Date       | Change or decision                                                                                                                                                                                                                                         | Rationale                                                                                                                                                                                                                                                                            | Impact                                                                                                                                                                                                                                                                                                                                                               | Approved by   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 2026-08-29 | Created the first detailed Milestone 6 plan from the closed Milestone 5 tree, canonical ledger, prior milestone records, current annotation schema, workspace/comment UI, command/history/collaboration boundaries, AI tools, tests, and deployment setup. | The master ledger identifies Vector annotations as the next milestone and no Milestone 6 implementation record existed.                                                                                                                                                              | Defines four proposed product decisions, end-to-end technical/security boundaries, dependency-ordered vertical slices, verification, risks, exclusions, and closure gates. Product implementation remained blocked on explicit plan approval.                                                                                                                        | Pending       |
| 2026-08-29 | Approved all recommended decisions and added a unified multi-selection transform frame plus shared contextual styling parity.                                                                                                                              | The product owner approved the draft and requested one frame around drag/Shift multiselections, floating object-style palettes for annotations, consolidated stroke color/thickness/dash controls for canvas objects, and substantial palette reuse between annotations and objects. | Changes status to `Approved for implementation`; records three unchecked supporting requirements in the master ledger; expands Slice 2, tests, risks, and exit criteria; authorizes only the revised documented implementation scope while commits, pushes, PRs, deployment, closure, and merge remain separate gates.                                               | Product owner |
| 2026-08-30 | Completed local Slice 1 implementation and verification for one durable vector Pen.                                                                                                                                                                        | The approved dependency order requires canonical, renderer-independent, collaborative ink before selection, shared styling, visibility, attachment, or AI work.                                                                                                                      | Adds backward-compatible canonical annotation samples, one-command pointer capture, derived vector rendering, role-aware Pen UI, two-touch navigation reservation, unit/history coverage, and local two-session Chromium evidence. Slice 2 may begin after the authorized focused commit; hosted evidence and closure remain open.                                   | Engineering   |
| 2026-08-30 | Completed local Slice 2 implementation and verification for annotation editing, one combined selection frame, shared Stroke styling, temporary visibility, and promotion.                                                                                  | The approved second slice makes durable ink useful through the same selection and contextual-style vocabulary as other canvas content before attachment and AI vocabulary are added.                                                                                                 | Adds combined reference-aware transforms, backward-compatible object dash styles, mixed/common-property palette behavior, per-user presentation-only overlay visibility, idempotent promotion, clipboard/history coverage, and focused local collaboration/accessibility evidence. Attachment and AI parity remain Slice 3; hosted evidence and closure remain open. | Engineering   |

## Closure

Closure status: Not ready
Closure approval: Pending
Closed on: —
