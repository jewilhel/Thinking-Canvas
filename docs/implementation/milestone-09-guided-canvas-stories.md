# Milestone 9 — Guided canvas stories

Status: Approved for implementation

Master plan: [`thinking-canvas-implementation-plan.md`](../../thinking-canvas-implementation-plan.md)

Plan owner: Product owner

Last updated: 2026-09-08

## Goal and user-visible outcome

A participant can frame the live canvas at the position and zoom they want, capture that viewport as a named scene, arrange scenes into one linear story, and present or revisit them with exceptionally smooth previous/next camera movement. The scene list supports rename, replacement from the current viewport, deletion, pointer reordering, and equivalent keyboard operation. Playback always renders the current canvas rather than a frozen board snapshot, allows free exploration after arrival, and returns smoothly to the selected scene when navigation resumes.

The three product-owner screenshots supplied on 2026-09-07 are interaction references for the empty state, ordered scene list, navigation controls, and row actions. They do not authorize a pixel-for-pixel copy, the source product's branding, printing, or PDF export.

This plan covers one milestone only. It does not change Milestone 8's still-open engineering exit verification or treat its product acceptance and merge as formal engineering closure.

## Requirements covered

- `FR-054 — Create linear story.` A participant or permitted AI can create a guided story from an ordered sequence of canvas scenes.
- `FR-055 — Scene data.` Each scene persists target region, camera framing, zoom, and optional contextual comments or narration.
- `FR-056 — Smooth navigation.` Playback animates from the current viewport to the selected next or previous scene without a visual jump.
- `FR-057 — Explore while paused.` A viewer can pan and inspect freely while playback is paused at a scene.
- `FR-058 — Return to scene target.` Next or previous navigation smoothly returns from an explored viewport to the selected scene target.
- `FR-059 — Relevant scene comments.` Scene-specific comments appear at the correct point in playback and do not leak into unrelated scenes.
- `FR-060 — AI narration.` The primary AI narrates saved scenes using reusable synthesized audio with equivalent captions, per the 2026-09-08 cached-audio revision in the master ledger. One story-wide audio toggle enables playback on scene navigation; changed/deleted narration invalidates its cached audio.
- `FR-061 — Live-linked story.` Story order, framing, and narration persist while rendered canvas content reflects current board state.
- `FR-062 — Linear-only first version.` Creation and playback expose one ordered path and do not imply unsupported branching.
- `FR-092 — Viewport-captured scene management.` A participant can position and zoom the canvas, add the current view as a scene, see the scene in a simplified ordered list, drag scenes into a new order, rename a scene, replace its captured view from the current viewport, delete it, and move to the previous or next scene through dedicated controls. The scene-editor control sits between previous and next. Scene rows expose no repeated visible reorder controls; focused rows retain keyboard reordering through `Alt+ArrowUp` / `Alt+ArrowDown`. A persistent per-user, per-canvas **Loop** toggle enables or disables wrapping from either sequence end. The scene panel can be moved by a thin top handle and resized from its left edge between a nominal 320 px minimum and 640 px maximum while remaining clamped to the viewport. Scene management does not expose print or PDF export actions.
- Milestone 9 exit gate: `A saved story plays from beginning to end after underlying objects are edited, moved, and reloaded; reduced-motion mode substitutes an accessible non-sweeping transition.`
- Cross-cutting ledger decisions and boundaries: `PD-006`, `PD-008`, `PD-009`, `PD-012`, and `PD-024`; shared command, RLS, realtime, accessibility, reduced-motion, and no-versioned-story-snapshot boundaries.

## Decisions required

### D1 — One primary story or multiple named stories

- Owner: Product owner.
- Recommended option: expose one primary linear **Scenes** story per canvas in the first version and lazily create its `stories.kind = 'general'` row when the first scene is added. Keep existing `review` story rows hidden and untouched. The schema may continue to support multiple general stories without adding story-library UI.
- Alternative: expose creation, selection, rename, and deletion of multiple named stories in this milestone.
- Consequence: the alternative adds a second management hierarchy not shown in the supplied references and materially expands UI, empty states, permissions, tests, and deletion behavior.
- Required timing: before Slice 1 schema constraints and repository contracts are finalized.
- Status: Approved by the product owner on 2026-09-07.

### D2 — Scene deletion and associated contextual content

- Owner: Product owner.
- Recommended option: delete immediately with a time-bounded **Undo** notice. Undo restores the scene at its prior order with its name, framing, narration, and scene-comment associations. No canvas objects are deleted.
- Alternative: require confirmation before permanent deletion.
- Consequence: immediate undo keeps scene editing fluid but requires a reversible deletion command; confirmation is simpler but interrupts list management.
- Required timing: before Slice 2 scene-management commands.
- Status: Approved by the product owner on 2026-09-07.

### D3 — Meaning of scene-specific comments

- Owner: Product owner.
- Recommended option: reuse the existing threaded comment model through an explicit scene-target association. During playback, only the active scene's contextual threads appear in the scene surface; they remain discoverable in shared Comments history with a scene label. Deleting a scene preserves its comment history as a clearly labeled deleted-scene thread rather than silently deleting participant discussion.
- Alternative: use a lightweight, non-threaded scene note stored directly on `story_scenes`.
- Consequence: threaded comments preserve recipients, replies, structured prompts, AI routing, and audit history but require a new target association and lifecycle rules. A note is smaller but creates a second meaning for “comment” and cannot satisfy the established collaboration experience.
- Required timing: before Slice 4.
- Status: Approved by the product owner on 2026-09-07.

### D4 — Story narration boundary before Milestone 10

- Owner: Product owner.
- Recommended option: persist one editable narration script per scene, use that same text as captions, and let the primary AI draft or revise it under the existing authority model. Playback may speak the approved script through a story-specific, output-only Realtime session; it does not open the Milestone 10 conversational microphone experience and does not store audio.
- Alternatives: defer spoken narration and `FR-060` to Milestone 10 while delivering captioned text only now; or expand Milestone 9 into two-way live voice.
- Consequence: the recommended boundary can satisfy `FR-060` without pulling Milestone 10's microphone, remote-human room, interruption, and retention scope forward. Deferral requires a master-ledger scope decision and leaves Milestone 9 unclosable as currently written. Two-way voice materially expands this milestone.
- Required timing: before Slice 5. `PD-008` privacy and retention wording must be resolved for any microphone or stored-audio expansion.
- Status: Approved by the product owner on 2026-09-07.

### D5 — Camera motion acceptance

- Owner: Product owner, after a hosted motion prototype.
- Recommended option: interruptible distance-aware interpolation of world-space center and logarithmic zoom, clamped to a short presentation range and using one continuous easing curve. A new scene selection begins from the exact currently rendered frame. `prefers-reduced-motion` uses an immediate, announced non-sweeping change.
- Alternative: a fixed-duration eased transition for every distance.
- Consequence: distance-aware timing should feel smoother across both nearby and distant scenes; fixed timing is simpler but can feel abrupt or sluggish at extremes.
- Required timing: initial implementation can use the recommendation, but final tuning and perceptual acceptance are required before Slice 3 is complete.
- Status: Accepted by the product owner on 2026-09-07 after hosted review; the product owner reported that the animations are nice and smooth.

## Technical approach

### Story and camera model

- Reuse the existing `stories` and `story_scenes` relational records. General guided stories remain distinct from legacy `stories.kind = 'review'` rows created by the superseded review workflow.
- Add a required scene title. Keep `position` as the server-owned contiguous order. Preserve `narration`, and validate `target` and `camera` with versioned Zod schemas instead of accepting arbitrary JSON.
- Persist viewport-independent framing: a world-space center, visible world-space target rectangle, and bounded zoom. Do not persist raw screen translation as the authoritative camera because the same scene must center correctly across supported viewport sizes.
- **Add Scene** converts the current `{x, y, scale}` and measured canvas viewport into world-space framing. **Replace Scene** updates only the captured target/camera by default; it keeps scene ID, name, position, narration, and contextual-comment associations.
- Scene list previews are derived from the current shared canvas state using the saved framing. They are not frozen screenshots or versioned story snapshots. This preserves `FR-061` when objects change or move.
- Keep the active scene, playback/paused state, in-flight transition, and temporary explored viewport local and ephemeral. Presence may advertise the active scene for collaborator awareness, but it is not story persistence or canvas history.

### Mutation and synchronization boundary

- Add a story repository and authenticated route/RPC layer for create, list, add, rename, replace, reorder, delete/restore, narration, and permitted AI actions. Every mutation validates canvas membership and the existing owner/editor authority immediately before the write.
- Use a transaction-level story lock and one atomic reorder operation that accepts the complete ordered scene-ID list plus an expected story revision. It validates exact membership, prevents duplicate or missing IDs, rewrites positions without colliding with the existing unique constraint, and returns a conflict response instead of silently overwriting a concurrent reorder.
- Increment a story revision for every ordered-content mutation. Realtime refreshes the scene list after committed changes; optimistic UI rolls back on permission, validation, or revision conflict.
- Human and AI creation use the same domain service and typed schemas. A permitted AI can propose or create scenes by referencing authorized live canvas objects/regions; deterministic server code calculates framing and order. The provider never writes story rows or supplies database IDs directly.
- Story operations remain outside canvas-object undo/history and Yjs updates because they are relational story metadata. Scene delete/undo, if approved in D2, uses a dedicated reversible story command.

### Interface and playback

- Add a compact Stories/Scenes control beside the existing bottom canvas navigation controls. Its empty state explains scenes and offers **Add Scene**. The populated state shows the ordered rows, live previews, names, active state, drag affordance, and **Add Scene**.
- Row actions are **Rename Scene**, **Replace Scene**, and **Delete Scene** only. Printing and PDF export are absent. Rename supports explicit save/cancel and sensible validation. Replacement clearly states that the current canvas position and zoom will replace the saved view.
- Pointer reordering uses a visible insertion indicator and preserves scroll position. Keyboard users can move the focused scene earlier/later with `Alt+ArrowUp` / `Alt+ArrowDown`; no repeated visible arrow controls appear in the list.
- Dedicated previous/next controls disable at the sequence ends and expose current position (`Scene 2 of 5`) to assistive technology. Selecting a row uses the same navigation path.
- Camera animation runs through one cancellable viewport-transition controller rather than CSS-transforming a second visual surface. Pan, wheel/pinch, row selection, previous/next, Escape, or a new transition cancels safely from the exact rendered frame.
- After arrival, playback is paused and ordinary canvas pan/zoom exploration is enabled. Previous/next always targets the saved framing for the requested scene, not the explored offset.
- The active scene shows only its approved contextual comments and caption/narration. Moving away hides that scene-specific surface without resolving or deleting its content.

### Failure and observability behavior

- Adding or replacing a scene is blocked while the canvas reports `Unsynced`, `Retrying`, or `Saving`, unless the implementation can prove the captured framing and displayed content refer to the same durable sequence. The UI explains why capture is temporarily unavailable.
- Failed mutations keep the prior scene list and camera intact and provide retryable, non-destructive errors. A failed transition leaves the canvas at the current rendered viewport.
- Emit privacy-safe telemetry for story load/mutation failures, reorder conflicts, transition start/cancel/complete, animation duration, dropped-frame sampling in development/preview, narration session failures, and permission denials. Do not log canvas text, narration content, thumbnails, or audio.

## Database and security changes

- Add a forward-safe migration that gives `story_scenes` a validated non-empty title with a deterministic backfill (`Scene 1`, `Scene 2`, and so on within each story), and adds a story revision or equivalent concurrency token.
- Add JSON shape checks where practical and application-level versioned Zod validation for `target` and `camera`; reject non-finite coordinates, invalid rectangles, unsupported versions, and zoom outside the canvas bounds.
- Add an atomic story/scene mutation RPC or equivalent transactional server boundary for contiguous ordering and expected-revision conflict detection. Lock the target story row, validate the caller through `private.has_canvas_role`, and reject cross-story scene IDs.
- If D3 selects threaded comments, add a relational scene-target table with foreign keys, indexes, RLS, and explicit delete behavior. Reuse existing comments/replies/prompts/responses rather than duplicating comment bodies.
- Preserve existing RLS intent: authenticated canvas members may read general stories and scenes; owners/editors may create or edit; viewers/commenters cannot mutate story structure. If scene comments reuse the comment model, its existing commenter permissions continue to apply to thread content without granting scene-reorder permission.
- Add policy tests for owner/editor/commenter/viewer reads and writes; cross-canvas, cross-story, forged-author, forged-scene, duplicate-order, stale-revision, and deleted-story cases; and any AI service boundary.
- Regenerate `src/lib/supabase/database.types.ts`. Do not apply hosted migrations until the implementation slice, local reset/policy tests, and explicit implementation approval are in place.
- Rollback/compensation: new nullable/defaulted fields remain readable by the old application; new tables/RPCs are additive. A compensating migration removes new policies/functions only after the application no longer calls them and preserves user-created story data for export or later restoration.

## Ordered task checklist

- [x] Task 1 — Resolve D1 and define `Story`, `StoryScene`, versioned camera/target, repository, mutation, permission, and concurrency contracts against the current schema.
- [x] Task 2 — Add local migrations, generated database types, atomic story revision/reorder behavior, RLS/policy coverage, and safe compatibility/backfill tests.
- [x] Task 3 — Implement authenticated story routes/services and typed human/AI command boundaries with validation, idempotency, and conflict-safe errors.
- [x] Task 4 — Build the empty Scenes surface and capture the current durable viewport as the first named scene; render a current-board preview and reload it.
- [x] Task 5 — Build the populated ordered list, active state, add, rename, replace, delete/restore behavior from D2, drag reordering, keyboard reordering, and concurrent-update recovery.
- [x] Task 6 — Build one interruptible camera-transition controller and row/previous/next navigation; support exploration after arrival, return-to-target behavior, resize, interruption, and reduced motion. D5 hosted perceptual acceptance received on 2026-09-07.
- [x] Task 7 — Resolve D3 and add scene-specific contextual comments/notes with active-scene isolation, history behavior, lifecycle rules, and role coverage.
- [x] Task 8 — Resolve D4 and add captioned AI narration, permitted AI story/scene commands, cancellation/failure fallback, and no-audio-storage proof.
- [ ] Task 9 — Add unit, component, database, integration, and authenticated Playwright coverage for the complete story lifecycle, live-linked board edits, reconnect/reload, two-user conflicts, accessibility, tablet layout, and performance instrumentation.
- [ ] Task 10 — Run the full local gate, create an immutable Netlify preview from the exact reviewed head when authorized, perform Codex in-app-browser QA, retain evidence, and request product-owner closure only after every active requirement and exit criterion passes.

## Pull-request slices

### Slice 1 — Durable viewport scenes

- Dependency: approved plan, D1, clean branch from current `main`, and confirmed Milestone 8 sequencing choice.
- Working behavior: an owner/editor opens Scenes, captures the current saved viewport, sees a named live-linked preview, reloads, and returns to that exact world-space framing on the current device size.
- Included tasks: Tasks 1–4.
- Tests/demo: camera schema/conversion, role matrix, migration/backfill, create/list/reload, live preview update, unsaved-capture guard, keyboard open/add.
- Rollback/compensation: hide the entry point and leave additive story rows readable; no canvas object or Yjs schema changes.

### Slice 2 — Complete scene management

- Dependency: Slice 1 and D2.
- Working behavior: add several scenes, rename, replace from the current view, reorder by drag or keyboard, delete/undo or confirm, and observe the same ordered result after reload and in a second authorized session.
- Included tasks: Task 5.
- Tests/demo: atomic reorder, stale revision, cross-story IDs, replace-preserves-metadata, delete lifecycle, permission denial, concurrent updates, pointer and keyboard list behavior.
- Rollback/compensation: disable mutations individually; retain durable rows and previous order.

### Slice 3 — Smooth linear playback

- Dependency: Slice 2 and D5 prototype review.
- Working behavior: row, previous, and next navigation move smoothly from the current viewport; exploration is unrestricted after arrival; resumed navigation returns to the saved target; reduced motion avoids sweeping animation.
- Included tasks: Task 6.
- Tests/demo: interpolation invariants, interruption, rapid repeated navigation, viewport resize, bounds, sequence ends, active announcements, reduced motion, 1,000-object fixture sampling.
- Rollback/compensation: switch the controller to the accessible immediate viewport change while preserving story data and management.

### Slice 4 — Scene context and live-linked collaboration

- Dependency: Slice 3 and D3.
- Working behavior: active-scene context appears only at the relevant scene; another collaborator sees durable order/framing/context updates; board edits appear live without changing stored camera or preserving a canvas snapshot.
- Included tasks: Task 7 and collaboration portions of Task 9.
- Tests/demo: active-scene isolation, Comments history labeling if selected, lifecycle/delete behavior, owner/editor/commenter/viewer roles, reconnect, moved/deleted target objects, reload.
- Rollback/compensation: hide scene-context rendering while preserving associations and threads; core scene playback remains usable.

### Slice 5 — Permitted AI creation and captioned narration

- Dependency: Slice 4, D4, existing AI authority, Realtime credential boundary, and privacy decision sufficient for the approved playback mode.
- Working behavior: the permitted primary AI creates or updates an ordered scene through typed tools, drafts scene narration, and speaks the persisted script with equivalent captions; failure falls back to captions without blocking playback.
- Included tasks: Task 8 and remaining Task 9 coverage.
- Tests/demo: all authority modes and roles, strict provider schema, invalid/forged target rejection, idempotent retry, captions, speech cancellation/failure, no client secret, no stored audio, live-linked playback.
- Rollback/compensation: disable AI story tools and spoken output independently; human-authored stories and caption text remain intact.

### Slice 6 — Exact-head verification and hosted acceptance

- Dependency: Slices 1–5 and full local green gate.
- Working behavior: the complete milestone runs on one immutable preview matching the protected CI head and satisfies the exit gate.
- Included tasks: Task 10.
- Tests/demo: full matrix below and product-owner hands-on motion acceptance.
- Rollback/compensation: do not merge or close; fix within approved scope and return a replacement preview.

## Automated and manual tests

### Automated verification

- Unit: camera capture and viewport conversion at desktop/tablet sizes; target schema; finite/bounded zoom; distance-aware interpolation; interruption from current frame; reduced-motion result; scene list reducer; metadata preservation on replace; contiguous ordering.
- Component: empty/populated Scenes surfaces, focus return, active row, rename validation, replace disclosure, delete behavior, drag insertion indicator, keyboard reordering, previous/next disabled states and announcements, loading/error/conflict states, 200% zoom, reduced motion.
- Database/RLS: local reset, generated types, policy matrix, transaction/RPC success and rollback, stale revisions, exact ordered membership, cross-canvas access, role boundaries, scene-comment lifecycle if selected.
- Integration: route/service authorization, idempotency, optimistic conflict rollback, realtime refresh, AI strict tools, narration fallback, capture blocked during unstable save state.
- End-to-end: authenticated create/add/reload, three-scene lifecycle, drag and keyboard reorder, rename, replace, delete behavior, next/previous from explored viewport, rapid interruption, current-board updates, reconnect, second collaborator, viewer/commenter restrictions, reduced motion, tablet viewport, accessibility scan.
- Full gates before preview: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm db:test`, affected authenticated Playwright scenarios, and `pnpm build`; then protected CI for the exact candidate head.

### Hosted manual verification

- Environment: one immutable Netlify deploy preview whose `commit_ref` matches the reviewed branch head and protected CI run.
- Browser: Codex in-app browser for ordinary review. Open one additional browser only for the explicit second authenticated collaborator scenario, recording browser and simulated user.
- Fixture: a representative live canvas containing shapes, first-class labels, icons, nested/grouped content, connectors, a table, annotations, and a document across at least three distant regions. Capture scenes at meaningfully different zoom levels.
- Creation/management: create from current viewport, inspect current-board previews, add three or more scenes, rename, replace, pointer reorder, keyboard reorder, delete through the approved D2 behavior, reload, and verify exact order and framing.
- Motion: navigate row/next/previous near and far, interrupt with a new scene and with manual pan/zoom, explore at rest, return to target, resize the browser, and verify no flash, teleport, stale-frame snap, or competing transition. Repeat with reduced motion.
- Live-linked state: move/edit/delete underlying objects after capture; verify scenes retain their camera while showing the current board. Reconnect and reload without missing a committed scene mutation.
- Context/narration: verify only the active scene's context appears; exercise caption and audio behavior approved in D4; interrupt or fail speech and confirm visual playback and captions continue.
- Permissions/collaboration: owner/editor mutation; commenter/viewer read-only playback; simultaneous reorder/replace conflict resolution; permitted and disallowed AI behavior.
- Evidence retained: preview URL and deploy ID, exact commit, protected CI run, migration state, test commands/results, browser/user identities, screenshots or short recordings of the motion and reduced-motion paths, sampled transition timing/frame data, console/server error review, known limitations, and traceability to every requirement.

## Risks and assumptions

- High impact, medium likelihood — Milestone 8 has product acceptance, closure approval, merge, and CI evidence, but its milestone document still says `Not ready` and the master ledger leaves engineering exit verification open. Mitigation: keep the histories distinct, decide whether Milestone 9 implementation may proceed in parallel, and do not represent the release ledger as fully sequentially closed. Owner: Product owner and engineering. Status: Open.
- High impact, medium likelihood — raw `{x, y, scale}` persistence would frame differently across viewport sizes. Mitigation: persist world-space center/target plus zoom and derive screen translation at runtime. Owner: Engineering. Status: Planned.
- High impact, medium likelihood — reordering against `unique (story_id, position)` can collide or lose a collaborator's change. Mitigation: locked atomic reorder plus expected revision, exact-list validation, and conflict UX. Owner: Engineering. Status: Planned.
- High impact, medium likelihood — scene thumbnails can become frozen snapshots and contradict `FR-061`. Mitigation: derive previews from current shared objects and saved framing; do not persist rendered canvas images as story truth. Owner: Engineering. Status: Planned.
- Medium impact, high likelihood — the current `product-canvas.tsx` owns viewport and much rendering behavior in one large component. Mitigation: extract a tested viewport-transition controller and small story surface boundaries without refactoring unrelated canvas systems. Owner: Engineering. Status: Planned.
- High impact, low-to-medium likelihood — simultaneous scene mutations can expose transient order or target mismatch. Mitigation: story revision, atomic server operations, optimistic rollback, and realtime reconciliation. Owner: Engineering. Status: Planned.
- Medium impact, medium likelihood — "exceptionally smooth" is perceptual and device-dependent. Mitigation: prototype early, sample animation behavior on the representative fixture, retain reduced-motion parity, and require product-owner hosted acceptance. Owner: Product owner and engineering. Status: Accepted on 2026-09-07.
- High impact, medium likelihood — story narration may accidentally broaden into Milestone 10 privacy, microphone, and conversation scope. Mitigation: resolve D4; recommended output-only speech reads persisted caption text, stores no audio, and never enables a microphone. Owner: Product owner. Status: Open.
- Medium impact, medium likelihood — scene deletion can orphan or silently destroy collaboration history. Mitigation: resolve D2/D3 and encode delete behavior in database and UI tests. Owner: Product owner and engineering. Status: Open.
- Assumption — current canvas-object content remains live and is not versioned per scene, matching `FR-061` and the explicit deferral of versioned canvas snapshots inside stories.

## Exit criteria

- [ ] `FR-054`: an authorized human and permitted AI can create the approved first-version linear story model through validated shared service boundaries.
- [ ] `FR-055`: every scene durably retains its validated world-space target, camera framing, bounded zoom, name, and approved optional context/narration after reload and reconnect.
- [ ] `FR-056`: selecting a scene or previous/next animates from the exact current rendered viewport without a visual jump, stale snap, or competing animation.
- [ ] `FR-057`: after arrival, a viewer can freely pan and zoom without changing the saved scene until explicitly replacing it.
- [ ] `FR-058`: after exploration, previous/next and row selection smoothly return to the selected saved target.
- [ ] `FR-059`: only the active scene's contextual content appears in playback, while authorized history remains discoverable according to D3.
- [ ] `FR-060`: the primary AI narrates through the approved voice boundary with equivalent captions, safe cancellation/failure behavior, no exposed long-lived key, and approved privacy behavior.
- [ ] `FR-061`: story order, framing, name, and narration survive reload and collaboration while scene rendering reflects current canvas objects after edits, movement, and deletion; no frozen canvas snapshot is story authority.
- [ ] `FR-062`: the UI, schema/API contract, AI tools, and navigation expose one ordered path and no branching affordance.
- [ ] `FR-092`: Add Scene captures current position/zoom; list order persists; drag and keyboard reorder match; rename, replace, and delete work; dedicated previous/next controls work; no print or PDF export is exposed.
- [ ] Owner/editor, commenter, viewer, cross-canvas, stale-revision, and permitted/disallowed-AI cases pass local policy/integration tests and hosted role checks.
- [ ] Pointer, keyboard, touch/tablet, 200% zoom, screen-reader naming/announcements, focus, contrast, and reduced-motion checks pass without removing ordinary canvas exploration.
- [ ] Reconnect/reload and a two-collaborator conflict scenario preserve every acknowledged story mutation and leave one contiguous order.
- [ ] The full local gate, database tests, authenticated browser suite, protected exact-head CI, immutable matching Netlify preview, console/server review, and recorded evidence pass.
- [ ] The exact milestone exit gate passes on the hosted preview: `A saved story plays from beginning to end after underlying objects are edited, moved, and reloaded; reduced-motion mode substitutes an accessible non-sweeping transition.`
- [ ] Product owner completes hands-on hosted review, accepts the camera motion and scene-management experience, and separately approves milestone closure.

## Explicitly excluded work

- Scene printing and scene/story PDF export.
- Branching stories, conditional paths, audience choices, or alternate endings.
- Versioned canvas snapshots, frozen board playback, or restoring historic canvas content from a scene.
- Milestone 10's full live conversation surface, microphone capture, remote-human voice transport, interruption judgment, and natural-pause behavior unless the master plan is explicitly revised.
- Multiple-story library UI unless D1 selects it.
- Per-scene animation of individual objects, object timelines, slide transitions, or video export.
- New document pagination work or completion claims for Milestone 8's remaining engineering exit matrix.
- Production deployment, production configuration, merge, or closure without their separate approvals.

## Implementation record

### Approved narration cache revision — 2026-09-08

The product owner requested outside-click/scene-selection dismissal for scene menus, one audio toggle immediately left of Loop, automatic narration on scene navigation, and reusable cached audio regenerated only for new/changed scripts and deleted with narration. This supersedes D4's original per-scene output-only Realtime/no-stored-audio implementation. The master `FR-060` and `PD-008` record this explicit approval; no additional approval gate is required.

Implementation: private Supabase Storage files with server-owned per-scene version/lease metadata, transactional invalidation from human or AI narration mutations, retryable deletion cleanup, and an authenticated preparation/download boundary. Use OpenAI speech generation for saved scripts, not a new Realtime generation on every visit. Prepare missing versions ahead of playback and preload bytes locally. A changed or unprepared script shows a preparation state; already prepared navigation uses only local audio. Stale generation must never publish over a newer script. Scene deletion removes cached audio; Undo may regenerate it from retained narration. No microphone is used.

Verification includes outside click/Escape/other-scene menu dismissal; global toggle and arrow navigation; same-version cache hits across repeat visits/reload; changed-text invalidation; deleted-text/file cleanup; concurrent preparation deduplication; stale generation rejection; access control; browser playback and cancellation; and existing scene lifecycle regressions.

The product owner also requested movable/resizable narration bubbles. Each scene now persists an optional world-space caption rectangle through a revision-checked owner/editor RPC. Captions follow the canvas framing, wrap text within the saved width, scroll inside a bounded height, and expose pointer plus keyboard move/resize controls to authors. Caption layout does not invalidate narration audio.

Local validation for this revision: `pnpm check` passed 81 test files / 406 tests and production build; `pnpm db:test` passed 10 files / 391 checks; authenticated guided-story Chromium passed 1/1 including caption move/resize persistence, global-toggle placement, scene lifecycle, tablet/reduced-motion, and Axe. Local tests use the fake AI environment and do not count as live speech/storage acceptance; hosted cache-generation/reuse/deletion checks remain before handoff.

The product owner approved the complete plan and its recommended D1–D5 options on 2026-09-07 and authorized dependency-ordered implementation with one local commit per completed slice. Push, pull-request creation, hosted deployment, closure, merge, and production configuration remain separate gates.

### Slice 1 — Durable viewport scenes

- Status: Complete locally on 2026-09-07 in commit `784214f`.
- Added an additive migration for one primary `general` story per canvas, story revisions, required scene titles with compatibility defaults/backfill, and an atomic owner/editor capture RPC. Existing review-story inserts and legacy JSON remain readable.
- Added strict versioned camera/target schemas. Scene framing persists world-space center, visible world bounds, and bounded zoom; screen translation is derived for the current viewport size.
- Added an authenticated no-store story route, client repository/hook, empty and populated Scenes panel, durable-save capture guard, live current-board miniature previews, and immediate selection/reload restoration.
- Kept scene images derived from the current shared canvas state; no rendered snapshot or canvas content is stored in a story.
- Implementation discovery: the planned Task 3 crosses multiple slices. Slice 1 completes the human list/capture boundary; lifecycle mutations are Slice 2 and permitted AI tools remain Slice 5. This changes task accounting only, not approved behavior or architecture.

### Slice 2 — Complete scene management

- Status: Complete locally on 2026-09-07; this record is included in the Slice 2 checkpoint commit.
- Added revision-checked atomic rename, replace, exact-list reorder, soft-delete, and restore RPCs. Active ordering remains contiguous, deleted rows remain available for future scene-comment history, and restore clamps its insertion point after intervening edits.
- Added authenticated PATCH/DELETE boundaries, strict discriminated mutation schemas, conflict-specific HTTP responses, realtime story/scene subscriptions, and read-after-conflict reconciliation.
- Added scoped Rename, Replace, and Delete row actions; inline rename; replace-from-current-framing; pointer drag/drop plus accessible earlier/later controls; nearest-scene active fallback; and an eight-second Undo affordance.
- Kept Replace limited to framing so scene identity, title, order, and future narration metadata remain unchanged. Print and PDF actions were not added.

### Slice 3 — Smooth linear playback

- Status: Motion accepted by the product owner on 2026-09-07; requested control/list/loop refinements are being applied before Slice 4.
- Added one distance-aware viewport-transition controller with bounded duration, cubic ease-in/out position interpolation, geometric zoom interpolation, exact endpoints, reduced-motion immediate arrival, and explicit cancellation.
- Routed scene rows and persistent previous/next controls through the same controller. The active scene is announced as its position and title, sequence ends disable the relevant control, and navigation from an unselected state begins at the first or last scene according to direction.
- Wheel, pointer/pan/pinch entry, zoom controls, Zoom to fit, Escape, Add Scene, Replace Scene, a new scene destination, and component unmount cancel any active transition. Ordinary canvas exploration remains unrestricted after arrival; choosing the scene again returns to its saved target.
- Adjusted the primary dock's responsive reservation so the wider scene-navigation cluster remains clickable at desktop and representative tablet widths.

### Slice 3 hosted-feedback repair

- Status: Complete in `f479c55` and replacement deploy `6a9fa57a15d51beae733a8fa` on 2026-09-07.
- Keep the accepted transition curve unchanged. Place the scene-editor control between previous and next, add an enabled-by-default persistent per-user/per-canvas **Loop** preference, simplify scene rows to a flat list with a subtle selected treatment, and replace repeated row arrows with one selected-scene earlier/later control below the list.
- Preserve drag reorder and the existing atomic revision-checked mutation path. Looping changes presentation navigation only and does not mutate shared story data.

### Slice 3 second hosted-feedback repair

- Status: Accepted by the product owner on 2026-09-07 in commit `0a53318` and replacement deploy `6a9fabe6beeece416ce39a9f`.
- Remove the visible selected-scene reorder footer entirely while retaining drag/drop and nonvisual focused-row keyboard shortcuts.
- Make the scene panel independently movable using a thin top drag handle and resizable from its left edge. Match the comment panel's pointer and arrow-key interaction model, clamp placement to the viewport, and enforce nominal 320–640 px width bounds that yield to smaller screens.

### Slice 4 — Scene context and live-linked collaboration

- Status: Complete locally on 2026-09-08; this record is included in the Slice 4 checkpoint commit.
- Added an explicit `comment_scene_targets` association and idempotent, role-checked scene-comment command. It reuses existing comment bodies, replies, recipients, structured prompts, AI routing, and participant history rather than creating a second note model.
- Added an active-scene **Scene comments** surface in the scene panel. Only open threads for the currently active, non-deleted scene appear there; navigation changes the contextual list without changing or resolving its durable threads.
- Added the shared comment composer and thread panel to scene context. Shared Comments history retains every scene thread with a current or **Deleted scene** label, while soft-deleted scene rows preserve the association.
- Realtime comment invalidation and story refresh keep authorized sessions aligned. Scene previews continue to render current canvas objects from stored framing, so contextual collaboration does not capture a frozen canvas snapshot or mutate saved camera data.

### Slice 5 — Permitted AI creation and captioned narration

- Status: Complete locally on 2026-09-08; this record is included in the Slice 5 checkpoint commit.
- Added a strict `execute_story_scene` tool available only to the primary AI in a scene comment under current **Trusted editor** authority. It can update only the invoking scene's title/narration or append one scene framed from currently projected canvas-object IDs; lower authority modes expose no story mutation tool.
- Added a service-role-only, idempotent story executor with current membership/authority checks, invoking-scene verification, changed-content retry rejection, server-owned scene identity/order, and durable tool audit linkage. Forged scene and object identities fail before canonical story mutation.
- Added one editable persisted narration script per scene, equivalent visible captions in the scene panel and playback canvas, and deterministic refresh after AI story changes.
- Added a story-specific output-only Realtime credential and WebRTC path. It requests no microphone, sends only the persisted script for verbatim speech, supports explicit cancellation, closes stale connection attempts, stores no generated audio, and leaves captions visible when authorization, connection, or playback fails.

## Verification evidence

- 2026-09-07 — Planning inspection only. Local `main` was fast-forwarded from `556eeee` to current `origin/main` commit `99c2835`, which includes merged Milestone 8 code and ledger reconciliation. The working tree was clean before this plan edit. No Milestone 9 tests or preview checks were run.
- 2026-09-07 — Repository inspection confirmed existing `stories` and ordered `story_scenes` tables and RLS, generic JSON `target`/`camera`, nullable narration, current `Viewport = { x, y, scale }`, the installed `motion` dependency, and no general guided-story UI/service implementation.
- 2026-09-07 — The product owner supplied three reference screenshots demonstrating the desired empty state, ordered list, Add Scene, previous/next navigation, and rename/replace/delete menu. Print/PDF actions visible in the source reference were explicitly rejected.
- 2026-09-07 — Slice 1 local database: `pnpm db:reset` applied every migration through `20260908030000_guided_story_viewport_scenes.sql`; `pnpm db:test` passed all 7 SQL files / 346 checks, including owner capture, contiguous append, one-primary-story enforcement, stale revision rejection, and viewer denial.
- 2026-09-07 — Slice 1 source/build gate: `pnpm check` reached 77 Vitest files / 378 tests and a successful Next.js production build after the hook lint repair; the subsequently added contrast repair was verified by the focused authenticated browser test and will be included in the final pre-commit rerun.
- 2026-09-07 — Slice 1 local authenticated Chromium: `tests/e2e/guided-stories.spec.ts` passed 1/1 after creating an isolated canvas, changing zoom, capturing Scene 1, navigating away and back, reloading, reopening the scene, and running Axe with no violations. Initial runs correctly exposed missing local environment injection and a 4.4:1 button contrast failure; neither failed run is counted as passing evidence.
- 2026-09-07 — Slice 2 local database: `pnpm db:reset` applied every migration through `20260908050000_story_scene_management.sql`; `pnpm db:test` passed all 7 SQL files / 359 checks, including metadata-preserving rename/replace, exact atomic reorder, incomplete-list and stale-revision rejection, soft delete, contiguous compaction, and ordered restore.
- 2026-09-07 — Slice 2 source/build gate: the final `pnpm check` passed formatting, lint, TypeScript, 77 Vitest files / 381 tests, and the Next.js production build, including the pointer drag test.
- 2026-09-07 — Slice 2 local authenticated Chromium: `tests/e2e/guided-stories.spec.ts` passed 1/1 for three-scene capture, rename, keyboard-equivalent reorder, second authenticated-session order, replace/return framing, delete/Undo, reload durability, and Axe. The test uses an isolated canvas and does not count the earlier invalid Playwright project-name invocation or strict-locator repair run as passing evidence.
- 2026-09-07 — Slice 3 local source/build gate: `pnpm check` passed formatting, lint, TypeScript, 78 Vitest files / 385 tests, and the Next.js production build. Focused transition tests cover bounded distance-aware duration, exact interpolation endpoints, geometric zoom, reduced-motion arrival, and cancellation without completion.
- 2026-09-07 — Slice 3 local authenticated Chromium: the expanded lifecycle test passed 1/1 with row, previous, and next navigation, rapid destination replacement, saved-target arrival, representative 800×900 tablet control access, reduced-motion navigation, reload, and Axe. The first expanded run exposed an actual primary-dock pointer collision; the responsive reservation was repaired, and only the passing rerun counts as evidence.
- 2026-09-07 — Slice 3 hosted preview: branch `codex/milestone-9-guided-stories` was pushed at `68bee0b`; Netlify draft deploy `6a9f94f3a8f1401766b3b1dc` reached `ready`. The CLI draft was built from that clean checked-out head, but Netlify reports `commit_ref: null`, so this is hands-on product-review evidence rather than final exact-head CI/closure evidence.
- 2026-09-07 — Hosted database: the product owner approved applying the two additive Milestone 9 migrations. `supabase db push --linked` applied `20260908030000_guided_story_viewport_scenes.sql` and `20260908050000_story_scene_management.sql`; a subsequent remote migration listing showed both local/remote versions aligned. After reload, the hosted scene panel loaded without its prior error and Add Scene created Scene 1 successfully in the product owner's review canvas.
- 2026-09-07 — Product-owner hands-on review: the product owner reported that everything appeared to work and that the animations were nice and smooth, satisfying D5 perceptual acceptance. Before Slice 4, the product owner requested the scene-editor control between previous/next, optional bidirectional looping, simplified scene-row styling, and one selected-scene reorder control below the list.
- 2026-09-07 — Slice 3 feedback-repair local gate: `pnpm check` passed formatting, lint, TypeScript, 78 Vitest files / 386 tests, and the Next.js production build. The expanded authenticated Chromium lifecycle passed after verifying previous/editor/next control order, forward and backward wrapping, disabled end navigation when Loop is off, persisted Loop preference, single selected-scene reorder controls, representative tablet sizing, and Axe. The first Axe run found a 3.67:1 small-label contrast regression; the repaired gray passed and only the final rerun counts as evidence.
- 2026-09-07 — Slice 3 replacement preview: branch head `f479c55` was pushed and Netlify draft deploy `6a9fa57a15d51beae733a8fa` reached `ready`. The Codex in-app browser opened the product owner's Milestone 9 canvas and visibly confirmed previous/editor/next order, the Loop control, simplified rows, and the then-current shared reorder footer.
- 2026-09-07 — Product-owner replacement-preview feedback: remove the reorder footer's arrows and words because drag/drop works well; add the same thin top move handle and left-edge constrained resize behavior used by the comment panel. This supersedes only the visible shared reorder control from the prior repair, not drag/drop, keyboard accessibility, looping, or accepted motion.
- 2026-09-07 — Slice 3 second feedback-repair local gate: `pnpm check` passed formatting, lint, TypeScript, 78 Vitest files / 388 tests, and the Next.js production build. The focused authenticated Chromium lifecycle passed 1/1 with pointer scene reordering, removal of the visible reorder footer, actual pointer movement from the thin top handle, actual left-edge widening within the 640 px maximum, loop/navigation coverage, tablet sizing, and Axe. Component tests additionally prove 320–640 px width clamping, viewport placement clamping, and keyboard-equivalent panel move/resize and focused-row reorder.
- 2026-09-07 — Slice 3 second replacement preview: branch head `0a53318` was pushed and Netlify draft deploy `6a9fabe6beeece416ce39a9f` reached `ready`. The product owner reviewed it in the Codex in-app browser and responded “perfect,” accepting removal of visible reorder controls plus movable/resizable panel behavior before authorizing Slice 4 and later work.
- 2026-09-08 — Slice 4 local database: `pnpm db:reset` applied the additive `20260908090000_scene_comment_targets.sql` migration and `pnpm db:test` passed all 8 SQL files / 369 checks. Coverage includes owner, editor, commenter, and viewer roles; idempotent creation; active-scene validation; readable associations; and deleted-scene history preservation.
- 2026-09-08 — Slice 4 local source/browser gate: lint and TypeScript passed; 78 Vitest files / 390 tests passed; and the focused authenticated Chromium lifecycle passed 1/1 after creating scene context, proving active-scene isolation, observing the durable context in a second authenticated session, and rerunning Axe. The first browser invocation lacked local environment injection and one later run used an ambiguous label; neither diagnostic run counts as passing evidence.
- 2026-09-08 — Slice 5 local database: `pnpm db:reset` applied every migration through `20260908120000_story_narration_ai_tools.sql`; `pnpm db:test` passed all 9 SQL files / 381 checks. Coverage includes owner/editor narration, viewer denial, stale revision rejection, trusted AI update/create, exact retry acknowledgment, changed-content retry rejection, forged-scene denial, authority downgrade denial, contiguous ordering, and absence of stored audio columns.
- 2026-09-08 — Slice 5 local source/build gate: `pnpm check` passed formatting, lint, TypeScript, 79 Vitest files / 399 tests, and the Next.js production build with the authenticated narration-token route. Focused tests cover every AI authority allowlist, strict provider scene schema, forged/stale object framing, output-only Realtime configuration, no microphone request, speech cancellation, caption fallback, and narration validation.
- 2026-09-08 — Slice 5 local authenticated Chromium: `tests/e2e/guided-stories.spec.ts` passed 1/1 after persisting a human narration, showing matching panel/canvas captions, routing a scene comment to trusted fake Primary AI, observing the durable AI narration update, reloading it in a second authenticated session, and rerunning the existing full scene lifecycle/Axe checks. Diagnostic runs exposed and repaired an invalid scene-comment review-scope assumption and missing deterministic story refresh; only the final passing run counts as evidence.

### Slice 6 smoke-test repair — 2026-09-08

- The product owner requested broader browser smoke testing and repair before another review handoff. Candidate `0f8070d`, deploy `6aa0321bdfc111b0ada7ba08`, was exercised in Codex's in-app browser as the seeded owner on the existing Milestone 9 canvas.
- Reproduced a scene-comment isolation defect: an opened Stage 1 thread remained visible after Next selected Scene 2. Scene navigation now hides the prior scene's thread/composer while retaining its content. The authenticated lifecycle regression now navigates with a thread open and verifies it closes.
- Found premature audio teardown: `response.done` indicates generation completion, while WebRTC can still have buffered speech. Completion now follows `output_audio_buffer.stopped`; failed responses retain caption fallback. Regression tests distinguish generation completion, playback completion, and errors. Reference: https://platform.openai.com/docs/api-reference/realtime-server-events.
- Before repair deployment, hosted pointer checks passed scene capture, rename, replacement, delete/Undo, scene-comment creation, and a real trusted Primary AI narration update with immediate caption refresh. Keyboard scene reorder also persisted. The temporary scene-management fixture was soft-deleted after Undo verification; comments remain as explicit smoke-test evidence.
- Repair local validation: `pnpm check` passed formatting, lint, TypeScript, 79 test files / 401 tests, and production build. Authenticated `tests/e2e/guided-stories.spec.ts` passed 1/1, including the new open-thread navigation regression, second-session persistence, full scene management, panel movement/resize, reduced motion, tablet layout, and Axe.
- Repair commit `cc36952` was pushed and deployed as [immutable preview `6aa0462a453e03c2b98cf8a0`](https://6aa0462a453e03c2b98cf8a0--thinking-canvas.netlify.app/app/canvases/26ae67a7-4d71-4a86-beff-304f6a97fc4b). Netlify reports `ready`, `deploy-preview`, no error, and the SHA in the deploy title. CLI deployment leaves `commit_ref` null; this is runtime smoke evidence, not protected-CI linkage or milestone closure.
- Hosted repair verification passed with ordinary pointer clicks: open saved Stage 1 thread → Next closes the thread; narration Play remains active beyond generation, completes back to Play without an error; explicit Stop returns to Play with captions retained; Next during playback stops narration and removes the previous caption. Audible sound quality was not independently measured by the automation.
- Hosted narration editing and reopening passed on the AI-created scene. Both loop directions wrapped correctly; disabling Loop disabled Next at the final scene. The actual hosted Primary AI also created the requested additional scene around an existing shape, including the exact supplied narration. The local authenticated suite covers pointer reorder, panel drag/resize, reduced motion, tablet layout, and Axe.
- Found a preview-only obstruction: Netlify's injected pre-launch toolbar intercepted clicks on the lower canvas controls. Used the toolbar's own Minimize → Hide controls to hide it locally in the review browser; subsequent pointer interactions passed. This does not alter project privacy or global deployment settings. Reference: https://docs.netlify.com/manage/projects/pre-launch-toolbar/.
- Cleanup restored the original three-scene order and Stage 1 narration, and restored the canvas's original disabled Primary AI / Comment only settings. The two temporary scenes were soft-deleted (retained by the scene model); two clearly labeled test threads remain in Comments history as execution evidence. Full milestone permission/conflict/performance and protected-CI exit verification remain open; no closure is claimed.

### 2026-09-08 cached narration and caption placement verification

- Implementation checkpoint: `f114cf2`. Hosted smoke testing found that this application's intentionally restricted service role could access the new cache tables but could not read the source narration. Migration `20260908193000_narration_worker_scene_reads.sql` grants only the scene identity/script/deletion and story identity/canvas columns required by the worker. It was applied locally and to the linked preview database. Added a real service-role join regression and an unrelated-column denial check.
- `pnpm check` passed formatting, lint, TypeScript, 81 test files / 406 tests, and the production build. `pnpm db:test` passed 10 SQL files / 393 checks. The earlier authenticated guided-story E2E passed 1/1 with caption keyboard movement/resizing, second-session persistence, reduced motion, tablet layout, and Axe.
- Codex in-app browser smoke test on diagnostic preview `6aa05543c70ea893c8cf6f21`: one global AI narration switch before Loop; no per-scene playback control; cached bytes successfully downloaded and decoded to “AI narration ready”; global toggle, forward/backward navigation and reverse looping exercised without errors. Audible output quality and exact device latency were not independently measured by automation.
- Outside-click on the panel heading and selection of another scene dismissed the scene menu. Pointer dragging moved a temporary caption beside the scene content; corner resizing from 560×112 to 276×220 rewrapped the text without horizontal overflow. Reloading and revisiting the scene restored its world rectangle `{x:40,y:150,width:276,height:220}`.
- Hosted storage evidence: Stage 1 retained version `e00ae134-647d-4be5-9f32-b301fd6f993e`, 67,968 bytes, created at 18:37:55 UTC, across navigation and unrelated scene edits. Temporary scene `75034509-eaee-4929-a7b3-cc4ce250cc8e` generated version `82d51444-675a-4dfc-8d94-615fb9b28598` (192,768 bytes), then editing narration produced only a new version `8f441fab-d2b3-4c1a-886a-785a134582ff` (93,696 bytes). Clearing narration through ordinary keyboard editing removed its metadata and all stored files, with zero cleanup tasks remaining.
- Removed the temporary fourth scene using the normal recoverable soft-delete action. Original three scenes, narration, caption placement, and Primary AI settings were preserved. No production deployment, PR, merge, protected-CI acceptance, or milestone closure is claimed.

## Change record

| Date       | Change or decision                                                                                                                             | Rationale                                                                                                                                                           | Impact                                                                                                                                                                                                         | Approved by                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 2026-09-07 | Created the Milestone 9 draft and added `FR-092` / `PD-024` to the master ledger.                                                              | The product owner declared readiness for Milestone 9 and supplied explicit scene capture, ordering, lifecycle, navigation, motion, and exclusion requirements.      | Preserves the sourced `FR-054`–`FR-062` scope while making the requested scene-management experience independently checkable. No product implementation is authorized.                                         | Product owner requirements; plan approval pending |
| 2026-09-07 | Approved the plan and recommended D1–D5 options; authorized sequential slice implementation and a local commit after each completed slice.     | The product owner explicitly approved the draft and requested implementation through the next hands-on review gate.                                                 | Changes status to `Approved for implementation`; authorizes a dedicated milestone branch and local slice commits. Push, preview, pull request, closure, merge, and production changes remain separately gated. | Product owner                                     |
| 2026-09-07 | Accepted D5 motion and approved a focused Slice 3 UI refinement for control order, looping, list styling, and selected-scene reorder controls. | Hosted hands-on review found the animation smooth while the initial row/button density and non-looping sequence ends could be improved.                             | Keeps the accepted transition controller; revises `FR-092` / `PD-024`, adds only a local playback preference, and does not change shared story schema or begin Slice 4.                                        | Product owner                                     |
| 2026-09-07 | Removed visible reorder controls and approved a movable, left-edge-resizable scene panel.                                                      | Replacement-preview review found drag/drop sufficient visually and requested parity with the comment panel's spatial controls.                                      | Retains keyboard shortcuts without visible clutter; adds local panel placement only, bounded to the viewport and 320–640 px nominal width; does not alter shared story data.                                   | Product owner                                     |
| 2026-09-07 | Accepted the second Slice 3 repair and authorized Slice 4 and later approved-plan slices.                                                      | The product owner reviewed replacement deploy `6a9fabe6beeece416ce39a9f`, called it “perfect,” and asked implementation to continue until another review is needed. | Closes the Slice 3 feedback loop and resumes dependency-ordered work. It does not authorize Milestone 9 closure, merge, or production deployment.                                                              | Product owner                                     |

## Closure

Closure status: Not ready

Closure approval: Pending

Closed on: —
