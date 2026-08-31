# Milestone 7 — Expanded shapes and illustration icons

Status: Approved for implementation

Master plan: [`thinking-canvas-implementation-plan.md`](../../thinking-canvas-implementation-plan.md)

Plan owner: Product owner

Last updated: 2026-08-30

## Goal and user-visible outcome

Expand the existing Shapes palette from three primitives into a searchable visual library suitable for diagrams and lightweight illustrations. A participant can add richer basic shapes and consistent Phosphor illustration icons as ordinary collaborative canvas objects, independently set their fill and stroke colors like other canvas objects, connect and comment on them, and optionally place an icon inside a sticky note or basic shape. A nested icon remains independently editable, but follows the parent when the parent moves or resizes.

The supplied screenshots are visual references only. They establish the desired breadth, category browsing, searchable grid, consistent vector quality, and examples such as tree, brain, clock, and shoe icons. They do not authorize copying Apple assets, branding, layout, or interaction details.

## Requirements covered

- `FR-072 — Expanded basic shapes`
- `FR-073 — Searchable categorized illustration catalog`
- `FR-074 — First-class icon objects`
- `FR-075 — Icon fill and stroke styling`
- `FR-076 — Nest icon in a parent object`
- `FR-077 — Independent nested-icon editing`
- `FR-078 — Parent-relative containment`
- `AS-007 — Illustrated nested idea`
- Milestone 7 supporting work and exit gate in the master plan

This milestone also preserves the already-closed `FR-002`, `FR-003`, `FR-004`, `FR-005`, `FR-007`, `FR-023` through `FR-035`, `FR-036` through `FR-043`, `AS-003`, and `AS-006` behaviors wherever the new object types participate in those existing boundaries.

## Decisions required

| Decision                               | Owner         | Recommended choice                                                                                                                                                                                                                                                                                                                                           | Consequences and required timing                                                                                                                                                                                                                                                | Status                                  |
| -------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `PD-013 — Canvas illustration library` | Product owner | Pin `@phosphor-icons/core` `2.1.1`. Compile its trusted packaged SVGs and catalog metadata into local, versioned canvas assets. Do not use the public Iconify API or mix icon families in the first release. Insert the Phosphor `fill` variant by default and expose independent canvas-object **Fill** and **Stroke** styling for every supported variant. | The pinned package contains 1,512 base icons and 9,072 SVG variants across thin, light, regular, bold, fill, and duotone weights. Phosphor is MIT licensed and publishes names, tags, and categories. This decision does not approve the full milestone plan or implementation. | Approved by product owner on 2026-08-30 |
| `PD-014 — Initial basic-shape set`     | Product owner | Add rounded rectangle, triangle, pentagon, hexagon, octagon, star, cloud, speech bubble, and cylinder.                                                                                                                                                                                                                                                       | Removing a shape after users create it requires permanent compatibility rendering.                                                                                                                                                                                              | Approved by product owner on 2026-08-30 |
| `PD-015 — Nested-icon behavior`        | Product owner | Support one containment level: icon children may have sticky-note or basic-shape parents. Full-containment drop or **Place inside** nests; a clear hover preview confirms the target; children remain bounded and clipped; parent resize proportionally changes child offset and size; **Remove from container** detaches in place.                          | This avoids arbitrary recursive scene graphs while satisfying the requested parent/child behavior.                                                                                                                                                                              | Approved by product owner on 2026-08-30 |

No product decision in `PD-013` through `PD-015` remains unresolved. The overall milestone plan still requires explicit implementation approval. No database-table decision is expected. A schema or security discovery that requires relational persistence, arbitrary uploaded SVG, an external catalog service, recursive nesting, or exposed vector path/node editing must return to product review before implementation continues.

## Library research and selection

Phosphor Core is the recommended canvas catalog:

- The official project describes Phosphor as a flexible icon family for interfaces, diagrams, and presentations and licenses it under MIT.
- `@phosphor-icons/core` exposes raw SVG assets plus searchable names, tags, categories, and release metadata. Version `2.1.1`, inspected on 2026-08-30, contains 1,512 base icons and 9,072 SVG files across six weights.
- Its catalog includes the representative concepts shown in the supplied canvas reference, including tree, brain, clock, and sneaker/shoe imagery.
- The first version can use one coherent family while still offering categories such as arrows, commerce, communication, design, technology and development, finance, games, health and wellness, maps and travel, media, nature, objects, office, people, system, and weather.

Alternatives were not selected:

- Iconify has far greater breadth, but it aggregates more than 200 icon sets with different licenses and visual languages. Its convenient components can fetch icon data from a public API, which would make existing canvases dependent on an external runtime service unless every approved set were separately pinned and bundled.
- Material Symbols is Apache-2.0 and broad, but its visual vocabulary is optimized primarily for product-interface symbols. It is less suitable than Phosphor's multi-weight family for the requested mix of diagrams, presentations, and canvas illustrations.
- `lucide-react` remains the application-chrome library. Reusing toolbar components as durable canvas content would couple saved canvases to UI implementation details and provide a much narrower illustration catalog.

Research sources:

- [Phosphor Icons](https://phosphoricons.com/)
- [Phosphor Core catalog and assets](https://github.com/phosphor-icons/core)
- [Iconify documentation](https://iconify.design/docs/)
- [Material Symbols guide](https://developers.google.com/fonts/docs/material_symbols)

## Technical approach

### Canonical object model

- Add the nine approved values to the versioned `shape` discriminator while preserving all existing shape values and saved objects.
- Add a new `icon` object discriminator. Persist only bounded declarative data: stable object identity, geometry, ordinary object fill/stroke style, `catalog: "phosphor"`, pinned catalog compatibility version, icon name, optional Phosphor visual variant, and nullable parent reference. New icons default to the Phosphor `fill` variant. Never persist React component names, raw user-supplied SVG, remote URLs, scripts, or event attributes.
- Add an optional explicit parent reference only to icon objects. An icon parent must exist on the same canvas and must be an eligible shape. Reject self-reference, missing parents, document-crossing references, icon-as-parent chains, and cycles at validation and command execution.
- Store a nested icon's geometry in parent-local normalized coordinates while parented. Derive world geometry for rendering, hit testing, comments, connectors, AI grounding, and spatial indexing. Detaching converts the derived world geometry to ordinary world coordinates in the same command transaction so no visual jump occurs.
- Limit containment to one level in this milestone. Existing `groupId` continues to represent peer grouping and is not overloaded as ownership or containment.
- Keep catalog provenance separate from normalized vector geometry and object styling. The icon schema identifies the source asset; a provider-neutral vector-scene adapter resolves that source into compound paths, transforms, fill rules, and layer opacity; the ordinary canvas style remains authoritative for user-selected fill and stroke.
- Reserve a later compatible conversion path from a catalog-backed icon to a user-owned editable-vector object. Such a conversion should be able to retain the object ID, world geometry, appearance, parent relationship, comments, connectors, ordering, collaboration, and history, but the editable-vector discriminator and commands are not part of Milestone 7.

### Trusted vector catalog pipeline

- Pin the approved Phosphor Core version in the lockfile and retain its license notice.
- Add a deterministic build-time generator that reads only the pinned package's SVG assets and metadata, rejects unexpected elements or attributes, converts supported primitives into normalized vector drawing instructions, and emits one immutable versioned catalog. The measured first release uses a virtualized browser over the approximately 202 KB compressed catalog; the provider-neutral boundary preserves a later move to chunks if catalog size or measured load time grows.
- Keep the generated format renderer-independent and provider-neutral rather than naming Phosphor concepts in its path/layer grammar. Test deterministic output. The canonical canvas object references a catalog key and optional visual variant; it does not store duplicated SVG bodies.
- Render icons as vector paths inside Konva groups so they stay crisp across zoom and participate in selection, transforms, clipping, exports, and bounded render captures. Normalize source artwork so object-level fill and stroke remain separate style channels rather than baked-in source colors. Do not use a raster thumbnail as the durable canvas representation.
- Preserve old icon keys across a catalog upgrade through aliases or retained compatibility assets. Treat removing or visually changing a saved icon as a schema migration, not an incidental dependency update.
- Keep selection, transforms, hit testing, styling, clipboard, collaboration, comments, connectors, and history pointed at canvas-object and vector-scene interfaces rather than package-specific SVG nodes. A future path editor may add control-point operations without rewriting these surrounding systems.

### Shapes, geometry, and connection behavior

- Implement each added basic shape from deterministic normalized geometry rather than image assets.
- Define fill and outline geometry, hit regions, bounds, connection anchors, overlap tests, annotation attachment, selection frames, and resize behavior for every shape.
- Keep text placement usable inside shapes that support labels. For irregular silhouettes such as star, cloud, and speech bubble, use an explicit inset text region rather than the raw bounding box.
- Connectors may attach to independent icons and nested icons. A connector endpoint targeting a nested icon follows the icon's derived world transform when either the child or parent changes.

### Palette and insertion experience

- Present basic shapes and illustration icons in one integrated catalog. **All** ranks basic shapes first, **Basic** filters to deterministic canvas shapes, and the remaining category tabs filter the Phosphor collection; the shared interface does not collapse their distinct saved-object types or insertion commands.
- Provide one search across basic-shape names and icon names/tags, category tabs, combined recent choices, a virtualized result grid, clear selected/hover/focus states, and a short visible label plus a disambiguating accessible name for every result.
- Support keyboard traversal, Enter/Space insertion, Escape dismissal, focus return to the invoking control, touch-sized targets, reduced-motion behavior, and responsive desktop/tablet layouts.
- Insert by click at a predictable viewport location and by drag/drop at the chosen canvas location. Do not enter or retain a surprising repeated-insert mode after a single click unless the existing shape-tool convention clearly communicates it.

### Styling and selection

- Reuse the existing contextual **Fill** and **Stroke** palette placement, focus behavior, standard ten colors plus **Custom**, mixed-value handling, and batch-command semantics.
- Default inserted icons to the Phosphor `fill` artwork. Give every supported icon variant an independent fill color or no-fill state plus an independent stroke color, thickness including zero/off, `Solid`/`Dashed`/`Dotted` pattern, and opacity. Changing fill must not change stroke, and changing stroke must not change fill.
- If additional Phosphor visual variants are exposed, switching variants preserves the selected object-level fill and stroke values. Duotone source opacity may define geometry layering but does not replace the user's fill/stroke colors with baked-in catalog colors.
- Preserve ordinary move, resize, rotation when supported, delete, duplicate, clipboard, z-order, group, comment, connector, history, and collaboration behavior for independent icons.
- For a nested icon, a first click selects the parent when approaching the composition as a unit; a deliberate second click, Enter action, or object-list selection enters the child and exposes independent child handles. The exact discoverability copy and gesture are verified in Slice 3; nested selection must never trap keyboard focus.

### Parent/child commands and transforms

- Add validated commands for `nest icon`, `detach icon`, and `reparent icon`. Each records sufficient before/after state for one atomic undo and uses the existing human/AI authorization, idempotency, collaboration, and audit boundaries.
- Show an eligible-parent highlight only when the icon is fully contained or the user invokes **Place inside**. Invalid or partially overlapping drops remain ordinary independent placement.
- Clip a child to the parent's interior and clamp independent child move/resize operations to the approved inset bounds.
- Parent move changes only the derived child world transform. Parent resize preserves the child's normalized local offset and dimensions, causing proportional movement and scaling. Parent deletion deletes contained icons in the same batch after an explicit cascade warning; parent duplication duplicates its children with new IDs and preserved local transforms.
- Grouping an eligible parent moves its contained icons with the parent without also adding children as independent group peers. Ordering commands keep a nested icon above its own parent and within the parent's local child layer.
- Define deterministic last-valid-command behavior for simultaneous reparent, detach, parent resize, and parent deletion. No converged state may contain a missing parent, invalid parent type, recursive parent, or duplicated ownership.

### Comments, AI, collaboration, and observability

- Treat icons as normal comment targets. Markers follow derived world geometry when a parent changes.
- Extend the semantic projection with icon catalog/name/visual variant, independent fill/stroke style, derived world bounds, parent identity, local transform, and human-readable catalog metadata. Keep IDs server-derived and bounded.
- Extend validated AI tools so the permitted primary AI can create supported shapes and icons, style them, and nest/detach/reparent icons through the same commands. Do not allow provider output to submit raw SVG or invent catalog keys.
- Ensure clipboard, snapshots, Yjs updates, reconnect, compaction, undo/redo, and two-client convergence preserve parent-first ordering and references.
- Add development/test telemetry for palette search time, visible tile count, icon asset load failures, generated asset size, frame timing, and orphan-reference rejection without logging canvas content or search text.

## Database and security changes

No relational migration is planned. Canvas objects remain in the shared Yjs document and its existing update/snapshot persistence path.

- Evolve the versioned canvas schema compatibly; old documents with no icons or new shape variants must load unchanged.
- Validate catalog keys, weights, parent eligibility, local geometry, and all style values in both client command handling and server AI/tool boundaries.
- Compile only package-owned SVG assets. Reject scripts, external references, embedded HTML, event handlers, filters requiring remote resources, and unsupported SVG elements during generation.
- Keep all catalog assets same-origin and immutable by version. Do not send canvas content, user searches, or icon selections to Phosphor, Iconify, or another third party.
- Add policy regression coverage proving the new object commands do not widen canvas membership roles: owners/editors may mutate, commenters may comment but not mutate, and viewers remain read-only.
- A rollback may stop new insertion while retaining the pinned compatibility renderer and schema reader so existing icon objects never disappear.

## Ordered task checklist

### Slice 1 — Canonical catalog and expanded basic shapes

- [x] Record the approved `PD-013` Phosphor selection and independent fill/stroke direction in the master ledger and this change record.
- [x] Record the approved `PD-014` basic-shape set and `PD-015` containment behavior in the master ledger and this change record.
- [x] Pin Phosphor Core and add its license notice without installing a runtime Iconify dependency.
- [x] Add deterministic catalog generation, validation, metadata, search indexing, compatibility versioning, and generation tests.
- [ ] Extend the shape discriminator and implement normalized geometry, labels, bounds, connection anchors, overlap, selection, rendering, and schema fixtures for every approved basic shape.
- [x] Add the canonical icon object schema and renderer-independent vector instruction type behind fixtures; do not expose insertion until the catalog and renderer tests pass.
- [x] Define and test the provider-neutral vector-scene adapter and a non-product conversion seam from catalog-backed geometry to owned vector geometry; do not expose path/node editing or conversion UI.
- [x] Benchmark catalog generation, metadata payload, the monolithic-versus-lazy-load decision, 100 visible palette tiles, and 1,000 mixed canvas objects; record results before finalizing the asset strategy.

### Slice 2 — Searchable icons as ordinary canvas objects

- [x] Build the responsive searchable/category icon browser with virtualization, recents, keyboard behavior, accessible names, drag/drop, and click insertion.
- [x] Render independent icons as crisp vectors and add ordinary selection, move, resize, rotation when supported, delete, duplicate, clipboard, ordering, grouping, comments, connectors, and annotation overlap behavior.
- [x] Add contextual icon **Fill** and **Stroke** colors, no-fill/no-stroke states, stroke thickness and pattern, opacity, and any approved visual-variant control using the existing palette vocabulary and atomic batch commands.
- [x] Extend history, Yjs collaboration, snapshot/reload, spatial indexing, semantic projection, validated AI tools, and permission handling for independent icons and new shape values.
- [x] Verify representative tree, brain, clock, and shoe searches plus the full independent-object lifecycle before containment begins.

### Slice 3 — One-level parent/child containment

- [x] Add validated nest, detach, and reparent commands with eligibility, cycle/orphan prevention, local/world transform conversion, clipping, and one-step undo/redo.
- [x] Add containment preview, **Place inside**, **Remove from container**, nested selection entry/exit, keyboard path, object-list representation, and invalid-target feedback.
- [x] Make parent move, resize, delete, duplicate, group, order, copy/paste, comment markers, connectors, annotations, AI projection/tools, and concurrent edits reference-safe.
- [ ] Add deterministic concurrency tests for simultaneous child edit and parent transform, reparent versus detach, and parent deletion versus child edit.
- [ ] Validate that a child remains independently editable but moves and proportionally scales with its parent across zoom, reload, reconnect, and undo/redo.

### Slice 4 — Regression, hosted acceptance, and evidence

- [ ] Run the complete static, unit, integration, migration/RLS, accessibility, Chromium end-to-end, build, and secret-scan gates.
- [ ] Run catalog and canvas performance checks at the approved desktop/tablet viewports and with 1,000 mixed objects.
- [ ] Push and create or update a pull request only after separate authorization; require protected CI for the exact implementation head.
- [ ] Verify the matching immutable Netlify preview in Codex's in-app browser, including two authenticated collaborators and `AS-007`.
- [ ] Retain commands, run IDs, commit SHA, deploy ID, browser/environment, screenshots, and known limitations; request product-owner closure only after every exit criterion passes.

## Pull-request slices

| Slice                           | Dependency                          | Demoable outcome                                                                                                                            | Required tests                                                                                                                                    | Rollback or compensating path                                                                                                                     |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Catalog and shape foundation | Approved plan and `PD-013`–`PD-015` | All approved basic shapes render and connect; trusted Phosphor assets compile deterministically; icon fixtures render without insertion UI. | Generator determinism/security, schema compatibility, geometry/bounds/anchors, visual fixtures, catalog/performance measurements, `pnpm check`.   | Remove insertion-free new UI/schema writers; retain readers for any committed fixtures. Uninstall dependency only if no saved icon objects exist. |
| 2. Independent icon objects     | Slice 1                             | Search/category palette inserts representative icons that behave like ordinary styled collaborative objects.                                | Search/accessibility, renderer fidelity, CRUD/clipboard/history/comments/connectors/AI, two-client convergence/reload, focused E2E, `pnpm check`. | Disable new insertion and AI creation while retaining pinned reader/renderer compatibility.                                                       |
| 3. Nested containment           | Slice 2                             | An icon can be placed inside, independently edited, parent-moved/resized, detached, and reparented with stable results.                     | Transform algebra, clipping/bounds, reference integrity, cascade/duplicate/clipboard, keyboard selection, concurrent conflicts, E2E.              | Disable nest/reparent commands while retaining parent-reference reads and a safe detach repair command.                                           |
| 4. Delivery evidence            | Slices 1–3                          | Exact-head CI and immutable hosted preview prove `AS-007` without regressions.                                                              | Full repository gate, isolated migration/RLS tests, Chromium/axe, performance, hosted manual two-user acceptance.                                 | Do not merge; retain the previous production deployment.                                                                                          |

No commit, push, pull request, deployment, closure, or merge is authorized by approving this plan unless the product owner explicitly combines those approvals.

## Automated and manual tests

### Automated

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm db:test` against the isolated local Supabase stack
- Focused Playwright scenarios for shape catalog, icon search/insertion/style, nested selection/transforms, comments/connectors, clipboard/history, permission roles, persistence/reconnect, collaboration conflicts, keyboard access, axe, responsive layouts, and reduced motion
- One uninterrupted full Chromium/axe suite after the focused scenarios pass
- Deterministic asset-generation snapshot and hostile-SVG rejection tests
- Provider-neutral vector-scene contract tests proving Phosphor assets resolve without leaking package-specific node types into selection, styling, commands, or history
- Geometry property tests for local-to-world and world-to-local round trips, parent resize, detach without a jump, clipping, connector endpoints, comment markers, and spatial-index bounds
- Performance fixtures for catalog search, virtualized browsing, 100 visible icon tiles, and 1,000 mixed canvas objects

### Manual local and immutable-preview scenarios

1. Search for and insert tree, brain, clock, and shoe/sneaker icons using both keyboard and pointer paths; confirm category discovery, accessible names, crisp rendering, and responsive palette behavior.
2. Move and resize each independent icon; independently change fill and stroke colors, turn either channel off, change stroke thickness/pattern and opacity, and confirm one channel never overwrites the other. Then duplicate, copy/paste, reorder, group, comment on, connect to, undo/redo, reload, and reconnect each icon.
3. Create every new basic shape; verify label fit, fill/outline controls, connection anchors, attached connectors, annotation attachment, selection, resize, duplicate, and reload.
4. Nest an icon by drag/drop and by **Place inside** in a sticky note and a basic shape. Independently select, move, resize, style, comment on, and connect to the child.
5. Move and resize each parent. Confirm proportional child movement/size, clipping, connector/comment following, one-step undo/redo, and no movement of unrelated work.
6. Detach and reparent a child without a visual jump. Duplicate and delete a parent and verify the approved child cascade. Exercise invalid, partial-overlap, and attempted recursive targets.
7. With two authenticated editors, concurrently edit a child and resize its parent, then reload both sessions and confirm convergence. Repeat through a temporary disconnect.
8. Verify owner/editor/commenter/viewer behavior and invoke permitted AI creation/style/nesting with no raw SVG, technical IDs, or unauthorized mutation exposed to the user.
9. Repeat the core path at `1440 × 900`, `1024 × 768`, and the `768 × 1024` stress viewport; inspect minimum/default/maximum canvas zoom and keyboard-only navigation.

Retain the exact commit SHA, protected CI run, immutable deploy ID/URL, browser and viewport, date, screenshots of the catalog and nested result, performance measurements, and any limitation. Local success is not hosted proof.

## Risks and assumptions

| Risk or assumption                                                                                                     | Likelihood / impact | Mitigation or experiment                                                                                                                                                                                                                    | Owner                         | Status                                        |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------- |
| Thousands of SVG imports inflate the JavaScript bundle or slow the palette.                                            | High / high         | Keep the generated catalog out of the JavaScript bundle, serve it as an immutable same-origin asset, virtualize the grid, and revisit versioned chunks if measured size or load time exceeds the recorded baseline.                         | Engineering                   | Mitigated locally; hosted measurement pending |
| Arbitrary SVG handling introduces script, remote-resource, or parser risk.                                             | Low / high          | Read only the pinned package, allowlist elements/attributes, reject unexpected content at build time, emit declarative vector instructions, and add hostile-fixture tests.                                                                  | Engineering                   | Open                                          |
| Rendering all Phosphor SVG constructs as Konva vectors or separating fill from stroke produces visual differences.     | Medium / high       | Build a representative fixture across SVG element types and all supported variants in Slice 1; compare generated and source renders, then verify independent fill, stroke, thickness, pattern, and zoom behavior before exposing insertion. | Engineering                   | Open                                          |
| Catalog upgrades silently change or remove saved icons.                                                                | Medium / high       | Persist catalog/version/name/weight, pin the package, generate aliases or retain compatibility assets, and require explicit migration review for upgrades.                                                                                  | Engineering                   | Open                                          |
| Phosphor-specific assumptions make a later basic vector editor require a second renderer or saved-object rewrite.      | Medium / high       | Keep provenance, normalized vector scenes, and object styling separate; use one compound-path/layer renderer; reserve a conversion seam while deferring editable path schemas and UI.                                                       | Engineering                   | Open                                          |
| Parent-relative coordinates interact badly with grouping, connectors, comments, annotations, and selection transforms. | High / high         | Keep containment one level, centralize derived-world geometry, use reference-safe command ordering, add property and concurrency tests, and implement containment only after independent icons pass.                                        | Engineering                   | Open                                          |
| Selecting a child inside a parent is hard to discover or conflicts with dragging the composition.                      | Medium / high       | Test deliberate second-click/Enter and object-list entry, visible parent/child breadcrumbs, Escape-to-parent, and keyboard focus behavior on the preview.                                                                                   | Product owner and engineering | Open                                          |
| Proportional parent resize may not match the product owner's expectation in hands-on use.                              | Low / high          | Implement the approved `PD-015` proportional local-coordinate behavior, demonstrate it with a small fixture before Slice 3, and return to product review if the preview feels surprising.                                                   | Product owner and engineering | Decision approved; preview validation pending |
| Brand icons create trademark or product-policy ambiguity.                                                              | Medium / medium     | Hide the Phosphor **Brands** category in the initial canvas catalog unless separately approved; keep the underlying library license notice.                                                                                                 | Product owner                 | Recommended                                   |
| Existing malformed compatibility entries could block new history-backed commands.                                      | Medium / high       | Reuse the Milestone 6 tolerant-list/strict-direct-read boundary and add mixed legacy/new-object regression fixtures.                                                                                                                        | Engineering                   | Open                                          |

## Exit criteria

- [x] `PD-013` is explicitly approved and reflected in both documents; this does not mark implementation complete.
- [x] `PD-014` and `PD-015` are explicitly approved and reflected in both documents; this does not mark implementation complete.
- [ ] `FR-072`: every approved basic shape passes the complete applicable ordinary-object lifecycle, connection, style, comment, history, persistence, and collaboration matrix.
- [ ] `FR-073`: the pinned local catalog is searchable by accessible name/tag and browsable by category with responsive, virtualized, keyboard-accessible results and no third-party runtime request.
- [ ] `FR-074`: independent icons pass the ordinary object lifecycle plus permission, AI, collaboration, reconnect, reload, connector, comment, and annotation integration.
- [ ] `FR-075`: independent fill and stroke color, no-fill/no-stroke, stroke thickness/pattern, opacity, supported visual-variant preservation, mixed-selection, batch, and zoom-fidelity behavior passes automated and hosted manual checks.
- [ ] `FR-076`: drag/drop and **Place inside** containment plus detach/reparent are understandable, validated, and visually stable.
- [ ] `FR-077`: a nested icon is independently selectable, movable, resizable, styleable, commentable, connector-targetable, keyboard-operable, and undoable within its parent.
- [ ] `FR-078`: parent move/resize, delete, duplicate, grouping, ordering, clipboard, simultaneous editing, reconnect, and reload preserve proportional transforms and referential integrity with no cycles or orphans.
- [ ] The exact Milestone 7 `AS-007` exit scenario passes with tree, brain, clock, and shoe icons on an authenticated immutable Netlify preview using two collaborators.
- [ ] Catalog generation/security, source-quality, unit/integration, migration/RLS, complete Chromium/axe, build, and performance gates pass for the exact implementation head.
- [ ] The milestone record contains exact-head CI and matching immutable preview evidence, known limitations, and product-owner hands-on acceptance.
- [ ] Product code remains deployable, previous canvases load unchanged, and no requirement from Milestones 0–6 regresses.
- [ ] The icon pipeline uses a documented provider-neutral vector-scene boundary, and contract tests prove ordinary object systems do not depend directly on Phosphor SVG nodes; no path/node editing UI or user-owned vector schema is exposed.

## Explicitly excluded work

- First-class documents and document-internal visual objects (`FR-044` through `FR-053`, `AS-004`, Milestone 8).
- Guided canvas stories (`FR-054` through `FR-062`, Milestone 9).
- Live conversation (`FR-008` through `FR-014`, Milestone 10).
- Conversational starter structures and reusable templates (`FR-063` through `FR-066`, Milestone 11).
- Production launch, full cross-browser release matrix, final performance budgets, export/portability, observability, domain, and release operations (Milestone 12 and unresolved `PD-007` / `PD-010`).
- Arbitrary SVG upload/import, remote image URLs, mixed Iconify sets, runtime public icon APIs, paid icon catalogs, AI image generation, and copying Apple Freeform assets or UI.
- User-created vector paths, catalog-icon conversion UI, control-point/path-node editing, freehand Bézier editing, Boolean path operations, and custom clipping paths. These remain future candidates, but Milestone 7 must preserve the provider-neutral vector-scene and conversion seams described above.
- Recursive containers, icon-inside-icon nesting, general shape-inside-shape nesting, freeform clipping masks, component instances, constraints beyond the one approved parent-relative behavior, and document containment.
- Specialized diagram modes or a change to the product's general-purpose primitive model.

## Implementation record

- 2026-08-30 — Implementation began on `codex/milestone-7-expanded-shapes-icons` from `main` at `4047c1a` after explicit product-owner approval.
- 2026-08-30 — Slice 1 added the nine approved shape variants to the existing three-shape palette, deterministic normalized geometry and Konva rendering, the pinned Phosphor dependency and MIT notice, a strict build-time fill-SVG compiler, the versioned local catalog, the icon object discriminator, and a provider-neutral vector-scene boundary. Icon insertion remains hidden until Slice 2 completes.
- 2026-08-30 — Slice 2 exposed a responsive searchable/category browser with recents, bounded virtualized rendering, keyboard-accessible buttons, click insertion, and drag/drop. Independent icons now use Konva vector paths and the ordinary selection, transform, fill, stroke, opacity, connector, annotation, grouping, ordering, clipboard, history, collaboration, permission, and semantic-grounding paths. Generated catalog names reject invented AI or clipboard keys.
- 2026-08-30 — Slice 3 added validated `icon.nest` and `icon.detach` commands, with `icon.nest` also providing reparenting. Normalized parent-relative geometry is authoritative at read time so concurrent child edits and parent transforms converge to stable world geometry. The canvas adds full-containment drop preview, **Place inside**, **Remove from container**, parent-first/child-second selection, clipped child rendering, nested object-list affordance, proportional parent movement/resizing, bounded child editing, cascade confirmation/deletion, family ordering, and reference-safe duplication/clipboard/history.
- 2026-08-30 — Slice 4 added hostile-SVG compiler fixtures and authenticated Chromium/axe coverage for the expanded palette, virtualized icon results, insertion, styling, containment, and detach-without-jump. Measurement supported retaining one immutable same-origin catalog in this release: its compressed transfer is about 202 KB, parse/search costs are low, and virtualized rendering keeps fewer than 100 tiles mounted. This replaces the draft's per-icon lazy-request strategy to avoid a burst of small asset requests; the provider-neutral scene boundary still permits chunking later without changing saved objects.
- 2026-08-31 — Product-owner preview review found that the icon browser's fixed width escaped its containing palette and that the basic-shape tiles did not match the filled, label-below icon presentation; the rounded-rectangle label also exceeded its tile. The hosted-feedback fix constrains all icon-browser regions to the palette, lets the virtualized grid reflow from the measured container width, and replaces horizontal outline-only shape buttons with bounded filled silhouettes and labels underneath.
- 2026-08-31 — Product-owner follow-up approved integrating basic shapes into the illustration-icon catalog instead of retaining separate top-level tabs. The palette now provides one search, combined recents, **All** and **Basic** category choices, and a single virtualized result grid while preserving the different canvas object types and insertion handlers. Basic-shape previews opt out of the shared 16-pixel button-icon rule and use an optical size comparable to catalog icons.

## Verification evidence

Implementation evidence on 2026-08-30:

- Slice 1 `pnpm typecheck` passed.
- Slice 1 `pnpm test` passed all 52 files and 244 tests, including new deterministic basic-shape geometry and provider-neutral vector-scene contract coverage.
- `pnpm icons:generate` compiled 1,512 Phosphor `fill` icons into `public/phosphor-icons/catalog-v2.1.1.json` using the pinned local package and without a runtime third-party request.
- Slice 2 `pnpm lint`, `pnpm typecheck`, `pnpm test` (53 files, 248 tests), and `pnpm build` passed.
- Slice 3 `pnpm lint`, `pnpm typecheck`, and `pnpm test` passed 55 files and 256 tests. New coverage proves local/world round trips, proportional transforms, bounds clamping, command validation, detach/reparent, cascade deletion, parent-with-child clipboard remapping, atomic history, and two-client Yjs convergence during simultaneous child movement and parent resize.
- Slice 4 `pnpm check` passed formatting, lint, TypeScript, 55 test files / 256 tests, and the optimized Next.js build before the final compiler fixtures were added; the post-fixture focused run passed 56 files / 261 tests.
- The focused authenticated Chromium/axe milestone spec passed both scenarios in 5.8 seconds. The first complete Chromium run passed 57 of 61 scenarios in 1.3 minutes. Two palette-regression failures were corrected; a serial rerun of those two legacy scenarios plus both milestone scenarios passed 4 of 4 in 16.2 seconds. The two remaining full-suite failures are pre-existing seed-state sensitivity: the shared local seed canvas had accumulated more than 130 objects, causing one concurrent-add count race and the AI grounding size guard. They do not involve Milestone 7 paths; a clean isolated database rerun remains pending.
- `pnpm db:test` could not start its test container because Docker Desktop denied the bind mount for `.../Desktop/Vibe Coding/Thinking Canvas/supabase/tests`. No database schema changed in this milestone. This is recorded as an environment blocker rather than a passing database result.
- Catalog measurement: 1,512 icons; generation 0.64 seconds; 772,282-byte raw catalog; 202,094-byte gzip transfer; 2.11 ms JSON parse; 0.401 ms average in-memory search across 100 runs; 0.25 ms serialization for a synthetic 1,000-object mixed array. Chromium asserted fewer than 100 mounted result tiles while exposing all 1,512 results.
- Representative catalog searches resolved `tree`, `brain`, `clock`, `sneaker`, and `shoe`; the focused browser scenario inserted and independently styled `brain` and passed axe analysis.
- The integrated-catalog refinement passed `pnpm check` with 56 test files / 261 tests and a production build. Its focused authenticated Chromium/axe run passed both scenarios in 5.8 seconds, including 1,524 combined results, the 12-result **Basic** filter, shared shape/icon search, comparable preview sizing, bounded layout, icon styling, containment, and detach-without-jump.
- PR #12 hosted review on immutable Netlify deploy `6a95c3009efbbc0008a2374d` at exact head `02035ac6ff548099666e5d2e4b6f41bcb5ec2b13` exposed two responsive palette defects: icon-browser content bled beyond the panel's right edge, and the basic-shape presentation used horizontal outline previews with an overflowing rounded-rectangle label. The product owner supplied screenshots from the authenticated in-app-browser preview; replacement-preview verification remains pending after the fix.

Research evidence:

- npm registry reported `@phosphor-icons/core` version `2.1.1`, MIT license, and a 6,476,685-byte unpacked package.
- The pinned tarball contained 1,512 regular/base SVGs and 9,072 total SVG variants; catalog metadata exposed names, tags, categories, and release versions.
- Repository inspection confirmed that existing `groupId` is peer grouping rather than containment, shapes currently use only rectangle/ellipse/diamond, stickies are styled rectangle shape objects, and the canonical Yjs schema has no icon discriminator or parent reference.
- The screenshot at `/Users/jasonwilhelm/Desktop/Screenshot 2026-08-30 at 10.16.03 PM.png` was not present. The two available screenshots were used only as visual quality and composition references.

## Change record

| Date       | Change or decision                                                                                                                                                | Rationale                                                                                                                                                                               | Impact                                                                                                                                                                                                                                                                                                                                                                          | Approved by   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 2026-08-30 | Inserted a new Milestone 7 draft for expanded shapes and illustration icons, moved First-class documents to Milestone 8, and shifted all later milestones by one. | The product owner requested a dedicated milestone after Vector annotations and before First-class documents.                                                                            | Adds `FR-072` through `FR-078`, `AS-007`, `PD-013` through `PD-015`, promotes the formerly deferred canvas icon library, and renumbers later roadmap sections without changing their sourced requirement wording.                                                                                                                                                               | Product owner |
| 2026-08-30 | Recommended Phosphor Core `2.1.1` and a one-level parent-relative icon containment model.                                                                         | Phosphor supplies a large coherent MIT vector family with metadata; explicit containment is required because existing `groupId` cannot express parent ownership or relative transforms. | Defines the proposed catalog, security, compatibility, schema, UI, performance, collaboration, AI, verification, and rollback boundaries. Implementation remains blocked on plan and remaining decision approval.                                                                                                                                                               | Engineering   |
| 2026-08-30 | Approved Phosphor Core and required independent icon Fill and Stroke colors like other canvas objects.                                                            | The product owner reviewed Phosphor, preferred its filled artwork, and requested normal canvas-object color styling rather than a single icon color.                                    | Resolves `PD-013`; defaults new icons to the Phosphor `fill` variant; replaces the prior primary/duotone color proposal with independent Fill and Stroke colors, no-fill/no-stroke, stroke thickness/pattern, opacity, mixed-selection, and variant-preservation requirements. The overall plan remains Draft pending `PD-014`, `PD-015`, and explicit implementation approval. | Product owner |
| 2026-08-30 | Approved the recommended basic-shape set and one-level nested-icon behavior; requested future basic vector-editing compatibility.                                 | The product owner agreed with `PD-014` and `PD-015` and may later add basic vector editing.                                                                                             | Resolves all three Milestone 7 product decisions; adds a provider-neutral vector-scene boundary, catalog-to-owned-vector conversion seam, contract tests, risk, exit criterion, and explicit deferral of path/node editing. The plan remains Draft pending explicit implementation approval.                                                                                    | Product owner |
| 2026-08-30 | Approved the full revised Milestone 7 plan and requested a dedicated milestone branch.                                                                            | All product decisions are resolved and the product owner explicitly authorized execution.                                                                                               | Changes status to `Approved for implementation`; implementation proceeds on `codex/milestone-7-expanded-shapes-icons`. Commits, pushes, pull requests, deployment, closure, and merge remain separate gates.                                                                                                                                                                    | Product owner |
| 2026-08-31 | Approved one integrated, searchable catalog for basic shapes and illustration icons, with comparable preview sizing.                                              | The preview made the two separately browsed entity types feel unnecessarily disconnected, and the shared Button SVG rule made basic-shape previews optically too small.                 | Removes the Basic Shapes / Icons top-level tabs; adds Basic alongside the icon categories, ranks shapes first in All, searches and records recents across both types, distinguishes basic shapes in accessible names, and preserves separate underlying object and insertion semantics.                                                                                         | Product owner |

## Closure

Closure status: Not ready

Closure approval: Pending

Closed on: —
