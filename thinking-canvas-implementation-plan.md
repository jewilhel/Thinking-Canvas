# Thinking Canvas — Implementation Plan

Status: Milestones 0–5 closed; later milestones remain draft

Source: *Thinking Canvas — Design Brief* and its 66 functional requirements

Last updated: 2026-08-29

## Purpose

This document is the build and completion ledger for the first version of Thinking Canvas. Every sourced product requirement retains its original `FR-###` identifier. A requirement may be checked only when its implementation, automated coverage where practical, and stated manual acceptance evidence are complete.

## Completion rules

- [ ] A feature is not complete until it works for an authenticated user in a Netlify preview deployment.
- [ ] Each `FR-###` item has automated unit, integration, or end-to-end coverage unless the item explicitly requires a manual perceptual test.
- [ ] Each completed item records its pull request, test evidence, and any follow-up issue in the project's delivery tracker.
- [ ] A milestone is complete only when every requirement and exit gate in that milestone is checked.
- [ ] Product decisions that change a sourced requirement are first recorded in this document and approved before implementation.
- [ ] Deferred requirements remain out of the first-version build unless they are explicitly promoted into scope.

## Approved service stack

| Concern | Choice | Planned use |
| --- | --- | --- |
| Hosting | Netlify | Preview deployments, production deployment, Next.js route handlers, environment variables, and domain configuration |
| Authentication | Supabase Auth | Email-based authentication, session management, and collaborator identity |
| Relational database | Supabase PostgreSQL | Canvas metadata, membership, permissions, comments, reviews, stories, templates, collaboration updates, and snapshots |
| Realtime transport | Supabase Realtime | Broadcast for high-frequency canvas updates and cursors; Presence for online participant state |
| Web framework | Next.js + TypeScript | App Router application, server-only AI routes, and typed domain code |
| UI | Tailwind CSS + shadcn/ui | Application shell, dialogs, menus, panels, toolbars, forms, and accessible controls |
| AI reasoning and actions | OpenAI Responses API | Multimodal canvas interpretation, grounded responses, validated tool calls, starter structures, document work, review explanations, and targeted visual feedback |
| Live AI voice | OpenAI Realtime API | Low-latency speech sessions only; the Responses API remains the primary reasoning and action API |
| Source control | GitHub | Repository, pull requests, protected main branch, and CI |
| Domain | Any registrar | DNS points to Netlify; registrar choice remains independent of the application |

### Required voice clarification

The Responses API can stream generated results, but the first-version requirements call for a continuous, low-latency voice conversation. OpenAI documents the Realtime API as the interface for interactive voice over WebRTC. Therefore:

- [x] Approve using the OpenAI Realtime API alongside the Responses API for `FR-008` through `FR-014` and `FR-060`. Approved by the product owner on 2026-08-10; implementation and preview evidence remain Milestone 0 work.
- [x] Keep the OpenAI API key server-side and mint short-lived Realtime client credentials from an authenticated server route.
- [ ] If Realtime API use is not approved, revise the affected requirements from *live conversation* to turn-based record/transcribe/respond/playback before development.

## Recommended free libraries

Use exact versions selected during project initialization and commit the lockfile. Review licenses again before the first production release.

| Library | License / cost basis | Responsibility | Why it fits |
| --- | --- | --- | --- |
| `konva` + `react-konva` | MIT | Infinite canvas scene graph, shapes, text, lines, transforms, hit detection, and layered rendering | Gives direct control over the shared object model without imposing a proprietary canvas format |
| `perfect-freehand` | MIT | Pressure-aware editable vector stroke geometry | Produces smooth freeform ink from pointer samples and remains renderer-independent |
| `yjs` + `y-protocols` | MIT | Conflict-free shared canvas state, document updates, and collaboration awareness protocol | Concurrent updates are commutative, associative, and idempotent; suitable for offline/reconnect convergence |
| `rbush` | MIT | Spatial index for viewport queries, connector lookups, and annotation-overlap attachment | Prevents full-canvas scans as object count grows |
| `lexical` + `@lexical/react` + `@lexical/yjs` | MIT | Rich-text documents, outlines, tables, and collaborative editor binding | Modular, accessible editor foundation with a Yjs collaboration package |
| `motion` | MIT | Guided-story camera and UI transitions | Supports interruptible animation and reduced-motion handling |
| `zustand` | MIT | Local, non-persistent UI state such as tools, selections, panels, and viewport mode | Keeps ephemeral UI state separate from shared Yjs state |
| `zod` | MIT | Runtime validation for API inputs, AI tool arguments, database payloads, and imported snapshots | Prevents untrusted or malformed data from entering the domain model |
| `@supabase/supabase-js` + `@supabase/ssr` | MIT | Auth, PostgreSQL access, Realtime channels, and Next.js session integration | Official Supabase clients for the selected platform |
| `openai` | Apache-2.0 | Responses and Realtime server integration | Official OpenAI JavaScript/TypeScript SDK |
| `lucide-react` | ISC | Application-interface icons only | Clear, consistent toolbar and menu icons; not a canvas illustration library |
| `vitest` + Testing Library | MIT | Unit and component tests | Fast TypeScript-friendly tests for commands, reducers, schemas, and UI behavior |
| `@playwright/test` + `axe-core` | Apache-2.0 / MPL-2.0 | Cross-browser end-to-end and automated accessibility tests | Covers real interaction flows, concurrent browser sessions, and accessibility regressions |

### Library boundaries

- [x] Treat Konva as a renderer and interaction layer; keep the canonical canvas schema independent of Konva node serialization.
- [x] Treat Yjs as the collaboration state engine; persist compacted updates and snapshots in Supabase instead of relying on transient Broadcast delivery.
- [x] Use Supabase Presence for slow-changing participant state and Broadcast for high-frequency cursor and document-update messages.
- [x] Keep Zustand state local only; durable or collaborative product state must not live exclusively in a Zustand store.
- [x] Keep Lucide icons in the application chrome. A searchable icon library for insertion onto the canvas remains deferred.
- [x] Do not add a second hosted collaboration, authentication, database, or AI service without an approved architecture change.

## System architecture

### Runtime boundaries

1. The browser renders and edits the canvas, maintains the local Yjs document, and connects directly to authorized Supabase Realtime channels.
2. Supabase Auth establishes identity. PostgreSQL Row Level Security enforces canvas membership and role permissions.
3. PostgreSQL stores durable domain records plus append-only Yjs updates and periodic compacted snapshots.
4. Next.js server routes on Netlify validate requests, load an authorized semantic canvas projection and any bounded transient render captures required for visual judgment, call OpenAI, and convert validated AI tool calls into domain commands.
5. OpenAI Realtime WebRTC sessions use short-lived credentials issued by an authenticated server route; long-lived OpenAI keys never reach the browser.

### Canonical data boundaries

- Shared Yjs document: canvas objects, groups, transforms, connector endpoints, table cell content, annotation stroke points, document-internal visual objects, and live viewport-independent structure.
- Relational records: users, profiles, canvases, memberships, invitations, AI permission policy, comments and replies, structured responses, change sets, review decisions, guided stories and scenes, templates, and audit metadata.
- Ephemeral realtime state: cursors, current selection, voice-speaking state, active scene, typing state, and online presence.
- Object and document IDs are stable UUIDs shared across Yjs and PostgreSQL references.

### Initial database checklist

- [x] Create migrations for `profiles`, `canvases`, `canvas_members`, and `canvas_invitations`.
- [x] Create migrations for `canvas_updates` and `canvas_snapshots`, including monotonic sequence/version metadata.
- [x] Create migrations for `comments`, `comment_targets`, `comment_replies`, `comment_prompts`, and `comment_responses`.
- [x] Create migrations for `ai_change_sets`, `ai_object_changes`, and `review_decisions` with reversible before/after payloads.
- [x] Create migrations for `stories` and ordered `story_scenes`.
- [x] Create migrations for `starter_templates`.
- [x] Add foreign keys, ownership rules, timestamps, and indexes for all access paths.
- [x] Enable Row Level Security on every user-owned table before application access is enabled.
- [x] Prove with automated policy tests that owners, editors, commenters, and viewers receive only their permitted data and operations.

## Milestone 0 — Architecture spikes and project foundation

### Build checklist

- [x] Create the GitHub repository with `main` protected by pull-request and required-test rules.
- [x] Scaffold a strict TypeScript Next.js App Router project with Tailwind CSS and shadcn/ui.
- [x] Add formatting, linting, type-checking, unit-test, and end-to-end-test commands.
- [x] Connect Netlify to GitHub and produce working preview and production deployment contexts.
- [x] Configure separate local, preview, and production environment variables without committing secrets.
- [x] Integrate Supabase Auth using server-readable sessions and protected application routes.
- [x] Commit Supabase migrations and seed only non-sensitive local development fixtures.
- [x] Define versioned Zod schemas for every shared object and server API payload.
- [x] Define one command boundary for all human and AI mutations so permissions, undo data, audit metadata, and collaboration updates cannot be bypassed.

### Required technical spikes

- [x] Two-browser collaboration spike proves simultaneous edits converge after reordered, repeated, and temporarily disconnected Yjs updates over Supabase Broadcast.
- [x] Persistence spike proves a new client can load the latest snapshot plus subsequent updates without missing edits made during connection.
- [x] Compaction spike proves updates can be merged into a new snapshot and old updates safely pruned without changing document state.
- [x] Canvas spike proves pan, zoom, select, move, resize, connector anchoring, and at least 1,000 visible mixed objects remain usable on target hardware.
- [x] Rich-document spike proves a Lexical editor can live inside a focused canvas document while its internal visual objects remain isolated.
- [x] AI spike proves the Responses API can receive a bounded, structured canvas projection and return validated domain commands with no direct database authority.
- [x] Voice spike proves authenticated browser-to-OpenAI WebRTC through an ephemeral credential on a Netlify preview deployment.
- [x] Reversal spike proves an AI change can store a before image, apply an after image, and immediately restore the prior state despite later unrelated edits.

### Exit gate

- [x] Record spike results and approve the final collaboration, persistence, rich-text, AI, and voice architecture before feature milestones begin.

Evidence: [Milestone 0 architecture record](docs/implementation/milestone-00-architecture-spikes-and-project-foundation.md), final protected CI run `31534352424`, immutable Netlify deploy preview `6a7b8960b7e2fe0009ee74bf`, and product-owner closure approval on 2026-08-11.

## Milestone 1 — Canvas foundation and multiplayer core

### Product requirements

- [x] **FR-001 — Create canvas.** A participant can create a canvas and reopen the same persisted canvas after signing out and back in.
- [x] **FR-002 — Manipulate essential objects.** A participant can create, select, move, resize, and delete shapes, text, connectors, and tables; end-to-end tests cover every object/action combination.
- [x] **FR-003 — Shape connection points.** Selecting or hovering an eligible shape exposes usable connection points.
- [x] **FR-004 — Persistent connector attachment.** Attached connector endpoints follow their shapes during movement and resize without visual detachment.
- [x] **FR-005 — Object styling.** Applicable objects expose fill, outline, typography, and text-size controls and persist the selected values.
- [x] **FR-006 — General-purpose primitives.** A user can construct representative mind-map, procedure, mood-board, and storyboard arrangements without entering a dedicated creation mode.
- [x] **FR-007 — Simultaneous collaborators.** At least two humans and one simulated AI identity can edit the same canvas concurrently and converge on one state.

### Supporting work

- [x] Implement camera pan, pointer-centered zoom, zoom-to-fit, keyboard navigation, and viewport restoration.
- [x] Implement selection, multiselection, grouping, ordering, duplicate, clipboard, undo, and redo through domain commands.
- [x] Render collaborator cursors and selections without persisting cursor movement as canvas history.
- [x] Add autosave status, reconnect status, retry behavior, and unsynced-change protection.
- [x] Add object-count and frame-time instrumentation used only in development and test environments.

### Exit gate

- [x] Run a documented multi-browser session covering concurrent object creation, movement, deletion, reconnect, and reload with zero lost committed edits.

Evidence: [Milestone 1 implementation and verification record](docs/implementation/milestone-01-canvas-foundation-and-multiplayer-core.md), protected CI [run `31620288083`](https://github.com/jewilhel/Thinking-Canvas/actions/runs/31620288083), Git-backed Netlify deploy preview `6a7bf41b02a9bf0008ad1ed6`, and product-owner closure approval on 2026-08-12.

## Milestone 2 — Workspace experience and interaction system

Visual direction: [FigJam workspace interaction references](docs/design-references/figjam-workspace-2026-08-12/README.md), supplied by the product owner on 2026-08-12. These references establish interaction principles rather than a pixel-for-pixel reproduction or use of Figma branding.

### Experience requirements

- [x] **Full-bleed canvas workspace.** The authenticated canvas uses the available viewport as the primary work surface, with application chrome layered around it instead of permanently reducing the editable canvas to a dashboard-like content region.
- [x] **Compact workspace identity and collaboration controls.** Canvas navigation and identity remain compact at the upper left, while participant presence, sharing, save or connection state, and other collaboration controls remain compact at the upper right.
- [x] **Floating primary tool dock.** Select, pan, drawing, sticky-note, shape, connector, text, table, comment, and extensibility entry points use a coherent floating dock with icon labels, active states, tooltips, keyboard shortcuts, and touch-sized targets.
- [x] **Progressive tool disclosure.** Tool families expose relevant variants and recent choices through flyouts or secondary palettes without showing every possible action at all times.
- [x] **Contextual selection controls.** Selecting an object or mixed selection exposes only applicable formatting and editing actions in a nearby contextual toolbar or popover; destructive and infrequent commands remain available without dominating the workspace.
- [x] **Contextual styling controls.** Fill, outline, text, connector, drawing, and sticky-note controls use consistent palettes, menus, and state indicators and persist changes through the existing command and collaboration boundaries.
- [x] **Collapsible workspace panels.** Comments, object navigation, AI interaction, and later review experiences use a shared docked or floating panel system that opens on demand, preserves canvas context, and can be dismissed without losing work.
- [x] **Canvas navigation controls.** Zoom, zoom-to-fit, help, and any approved overview or minimap control remain discoverable while occupying minimal canvas space.
- [x] **Coherent visual system.** The workspace defines and uses shared tokens and reusable components for color, typography, spacing, sizing, radius, elevation, iconography, motion, focus, hover, selected, disabled, loading, error, and synchronization states.
- [x] **Responsive workspace behavior.** The interface remains usable at supported desktop and tablet viewport sizes, including overflow, panel placement, tool access, touch targets, and virtual-keyboard behavior.
- [x] **Accessible interaction parity.** Every visible workspace action has an operable keyboard path, meaningful accessible name, visible focus treatment, non-color-only state communication, and appropriate reduced-motion behavior.
- [x] **Preserved canvas capabilities.** The Milestone 1 create, manipulate, style, organize, history, zoom, persistence, reconnect, and multiplayer behaviors remain available through the refined interface with no loss of durable data or command-boundary enforcement.
- [x] **Distinct Thinking Canvas identity.** The experience applies the spatial clarity, progressive disclosure, and contextual interaction principles demonstrated by the approved FigJam references while retaining original Thinking Canvas branding and avoiding a pixel-for-pixel reproduction.

### Exit gate

- [x] On an authenticated Netlify preview, a participant completes the approved create-and-format, connect-and-organize, comment-panel placeholder, zoom-and-navigate, keyboard-only, tablet-viewport, reconnect, and two-collaborator scenarios through the refined workspace; retained screenshots and interaction evidence show no permanent wall of action buttons, no permanently required inspector, and no regression of verified Milestone 1 behavior.

Evidence: [Milestone 2 implementation and verification record](docs/implementation/milestone-02-workspace-experience-and-interaction-system.md), protected CI [run `31772703709`](https://github.com/jewilhel/Thinking-Canvas/actions/runs/31772703709), Git-backed Netlify deploy preview `6a7ea5ac23271200084f44d3`, and product-owner closure approval on 2026-08-13.

## Milestone 3 — Comments and structured feedback

### Product requirements

- [x] **FR-023 — Anchored comments.** A participant can attach a comment to one object or a selected group, and the target survives movement and reload.
- [x] **FR-023a — Direct canvas comment placement.** A participant can place a comment at any canvas position; placement over an unselected object attaches to that object, while placement over empty canvas persists at its world-space position through pan, zoom, and reload.
- [x] **FR-024 — Threaded replies.** Participants can reply to a comment and see replies in deterministic chronological order.
- [x] **FR-025 — Complete history.** Selecting a comment exposes its entire exchange in-context and through an optional side panel.
- [x] **FR-025a — Compact contextual conversation.** Opening a canvas comment marker shows the complete exchange in a smaller card beside that marker or its object, and comment/reply submission uses an obvious upward arrow inside a light-grey circular control.
- [x] **FR-026 — Structured prompt creation.** A comment author can add exactly one supported structured response control.
- [x] **FR-027 — Initial controls.** Yes/no, approve/revise/discard, and bounded numeric rating prompts render, validate, and persist responses.
- [x] **FR-028 — Human and AI prompt authors.** Both participant types can create structured prompts through the same permission-aware domain command.
- [x] **FR-029 — Dismiss and resolve.** An authorized participant can dismiss or resolve a temporary comment without deleting its history.
- [x] **FR-029a — Permanent comment deletion.** A comment author or canvas owner can permanently delete an entire comment thread after explicit irreversible-action confirmation; other participants cannot delete it.
- [x] **FR-030 — Hide comments.** Comment bubbles and the annotation overlay can be hidden without altering underlying canvas objects or deleting comments.

### Exit gate

- [x] Complete the sourced **Comment prompt** acceptance scenario with two authenticated browser sessions and persisted thread history.

Evidence: [Milestone 3 implementation and verification record](docs/implementation/milestone-03-comments-and-structured-feedback.md), implementation commits `8c14e93` and `340b0cb`, draft pull request [#8](https://github.com/jewilhel/Thinking-Canvas/pull/8), protected CI [run `32764955133`](https://github.com/jewilhel/Thinking-Canvas/actions/runs/32764955133), immutable Netlify deploy `6a8c93460c7d4a72b34f8f05`, authenticated owner/editor `AS-003` verification, and product-owner closure approval on 2026-08-24. The pull request remains unmerged and production was not changed.

## Milestone 4 — AI collaborator, permissions, and typed interaction

### Product requirements

- [x] **FR-015 — One primary AI.** Every canvas can enable one clearly identified primary AI collaborator in the first version.
- [x] **FR-016 — Full-canvas inspection.** With permission, the AI receives a complete semantic canvas projection, including off-screen objects, within documented context-size safeguards.
- [x] **FR-017 — Connected-path inspection.** A user can select a connected path or ordered sequence and ask the AI to interpret that exact selection in order.
- [x] **FR-018 — Shared visual vocabulary.** The AI can create and edit every supported human canvas object through validated domain tools, subject to permission.
- [x] **FR-019 — AI contextual comments.** The AI can attach a comment to the specific object or group supporting its observation.
- [x] **FR-020 — Constructive challenge.** Evaluation fixtures demonstrate grounded questions or alternatives for weak assumptions, gaps, ambiguities, and clearer framings.
- [x] **FR-021 — No empty praise.** Evaluation fixtures reject responses that substitute unsupported praise for substantive canvas-grounded feedback.
- [x] **FR-022 — Adjustable authority.** A user can select comment only, propose changes, edit with review, or trusted editor, and server-side enforcement blocks every disallowed mutation.

### Supporting work

- [x] Implement typed messaging that remains available independently of voice.
- [x] Use the existing comment system as the only human/AI conversation surface; `@` establishes human or AI participants, following turns inherit that routing, and a later `@` redirects subsequent turns without rewriting history.
- [x] Resolve ends a comment conversation and removes its canvas marker without deleting history; authorized open and resolved conversations remain available as AI context, while permanently deleted conversations do not.
- [x] Build a deterministic canvas-to-AI projection with object IDs, types, text, geometry, relationships, document summaries, and selected-path order.
- [x] Bound AI context by relevance without hiding the fact that off-screen canvas content exists.
- [x] Validate every AI tool call with Zod and re-check current membership and AI permission server-side at execution time.
- [x] Store AI request identifiers, tool decisions, affected object IDs, outcome, and failure status without storing secret credentials.
- [x] Add rate limits, budget limits, cancellation, timeout handling, and a visible retry path.
- [x] Treat canvas and comment content as untrusted input; prompt text cannot grant tools or permissions.

### Exit gate

- [x] Evaluation suite passes groundedness, permission, malformed-tool-call, prompt-injection, and cancellation cases at the approved threshold.

Evidence: [Milestone 4 implementation and verification record](docs/implementation/milestone-04-ai-collaborator-permissions-and-typed-interaction.md), pull request [#9](https://github.com/jewilhel/Thinking-Canvas/pull/9), exact-head protected CI [run `32938748793`](https://github.com/jewilhel/Thinking-Canvas/actions/runs/32938748793) for commit `1f9234c`, ready Git-backed Netlify deploy preview `6a8e88fa3512c700083c983b`, the Luna evaluation trace, and product-owner hosted acceptance and closure approval on 2026-08-26. The pull request was squash-merged to `main` as `f965395`; production was not changed.

## Milestone 5 — Conversational AI edits with undo

### Superseded sourced requirements retained for traceability

The following original requirements remain verbatim for source traceability but are no longer first-version release requirements. Product-owner decision `PD-012` replaces their guided, per-object approval model with the simpler conversational transaction model in `FR-067` through `FR-071` and `AS-006`.

- [ ] **FR-031 — Explanation per reviewed object.** In edit-with-review mode, every added or edited object receives an attached explanation of what changed and why.
- [ ] **FR-032 — Review actions.** The user can keep, request revision of, or discard each reviewed AI change independently.
- [ ] **FR-033 — Immediate restoration.** Discard restores the affected content to its prior state immediately without reverting unrelated later work.
- [ ] **FR-034 — Guided review story.** The product can generate and play a review story that visits AI changes one at a time.
- [ ] **FR-035 — Contextual review step.** Each step frames the relevant change and exposes its explanation and currently valid actions.

### Approved replacement requirements

- [x] **FR-067 — Plain-language AI change summary.** After changing the canvas, the AI replies in ordinary product language describing the visible result without exposing object UUIDs, command names, staging terminology, or other implementation details.
- [x] **FR-068 — Atomic AI-turn undo.** Every AI edit turn is one undoable canvas transaction; Undo restores the prior state without reverting unrelated later work or requiring per-object decisions.
- [x] **FR-069 — Conversational revision.** A user can request revisions or modifications by replying naturally in the originating comment thread, and the AI applies a new validated transaction against current authorized canvas state.
- [x] **FR-070 — Implicit acceptance.** AI edits require no explicit Keep action; leaving the result in place, closing the thread, continuing work, or changing the topic leaves the durable change intact and available through normal history.
- [x] **FR-071 — Optional affected-object inspection.** The product may highlight the objects affected by one AI turn as a single set without starting a guided story or requiring object-by-object approval.

### Supporting work

- [x] Expand the versioned semantic canvas projection to include every render-affecting style and layout property required to understand the current composition, including fill, outline, typography, text alignment, object geometry, group/order, connector relationships, computed bounds, and applicable canvas design tokens; keep stable object IDs and server-derived state authoritative.
- [x] Add a bounded initial set of deterministic higher-level layout tools for reviewable AI edits—at minimum alignment, distribution, spacing normalization, and resize-to-content—implemented through the same validated domain-command, authorization, idempotency, collaboration, and reversal boundaries as lower-level commands. Defer template-specific composition and broader layout expansion to Milestone 10.
- [x] Add targeted before-and-after render captures for visually sensitive AI changes: use an object-plus-context region for direct-object comments and a grounded affected region plus full-canvas orientation image for world-space multi-object comments. Send captures only to an approved vision-capable Responses API model, keep them supplementary to the semantic projection, bound resolution/count/cost, use `store: false`, and do not persist image content in operational logs.
- [x] Validate each visually sensitive staged result with deterministic checks for clipping, overlap, contrast, spacing, bounds, and connector integrity, plus a bounded visual-feedback pass before presenting it for human review; never let screenshot interpretation create object IDs, widen comment-defined scope, or bypass server simulation.

Current acceptance hardening also preserves ordered multi-object context across ordinary replies and retries, permits one budgeted provider retry only before canvas mutation, hides reply composition during active AI work, and separates contextual comment placement from the history/settings surface. These behaviors and their exact-head CI and replacement-preview acceptance evidence are tracked in the Milestone 5 implementation record.

### Exit gate

- [x] Complete the approved **Conversational AI edit with undo** acceptance scenario: a plain-language multi-object change is immediately durable, contains no technical identifiers, can be revised through a normal reply, and can be rolled back as one conflict-safe transaction while preserving an unrelated later human edit.
- [x] On the same immutable preview, a visually sensitive single-object change and a world-space multi-object arrangement prove complete semantic style/layout grounding, deterministic layout-tool execution, targeted before/after visual feedback, scope preservation, and human-reviewable results without clipping, unsafe overlap, invalid contrast, or retention of provider capture payloads.

Evidence: [Milestone 5 implementation and verification record](docs/implementation/milestone-05-reviewable-ai-changes.md), pull request [#10](https://github.com/jewilhel/Thinking-Canvas/pull/10), protected CI [run `33227548477`](https://github.com/jewilhel/Thinking-Canvas/actions/runs/33227548477) for commit `e23a527`, ready Git-backed Netlify deploy preview `6a923b70e60aa80008b2999c`, the 30-prompt Luna evaluation trace, and product-owner hosted acceptance and closure approval on 2026-08-28.

## Milestone 6 — Vector annotations

### Product requirements

- [ ] **FR-036 — Freeform pen.** The product provides one mouse, touch, and stylus-capable freeform vector-pen annotation tool.
- [ ] **FR-037 — True freeform strokes.** Drawing produces editable point-based vector strokes, not predefined arrow, circle, or underline objects.
- [ ] **FR-038 — Stroke editing.** A participant can change stroke color, thickness, geometry, and position after drawing.
- [ ] **FR-039 — Zoom fidelity.** Strokes remain visually crisp and correctly positioned across the supported zoom range.
- [ ] **FR-040 — Temporary and hideable.** New strokes are temporary by default and hide with comment bubbles.
- [ ] **FR-041 — Promote to durable content.** A participant can promote an annotation so it remains visible when the temporary overlay is hidden.
- [ ] **FR-042 — Automatic overlap attachment.** A stroke overlapping an eligible object attaches to it by default and follows its movement.
- [ ] **FR-043 — Disconnect attachment.** A participant can disconnect an attached stroke without changing its visible geometry at that moment.

### Supporting work

- [ ] **Unified multi-selection transform frame.** Drag-selecting or Shift-clicking multiple annotations and/or supported canvas objects shows one selection boundary and handles around the complete selection; moving or resizing that selection commits as one undoable batch while preserving connector and annotation attachment integrity.
- [ ] **Unified Stroke palette.** Applicable annotations and canvas objects use the same expandable floating **Stroke** palette. Shared controls include stroke color and thickness; supported object borders and connectors also expose `Solid`, `Dashed`, and `Dotted` stroke styles through the same palette.
- [ ] **Contextual styling parity.** Annotation and object palettes share placement, focus, responsive, accessible-name, mixed-value, and batch-application behavior. A mixed selection exposes only properties valid for every applicable selected item and does not overwrite a mixed property until the participant chooses a value.
- [ ] **Annotation tool family and return-to-select behavior.** The Drawing entry remembers the participant's last Pen, Highlighter, or Eraser choice; Pen and semi-transparent Highlighter create whole editable vector strokes, Eraser deletes complete strokes, and each completed draw or erase action returns to Select.
- [ ] **Visual stroke controls and border-off state.** Drawing and contextual Stroke palettes share the first ten standard colors plus Custom, show thickness as selected visual weight samples instead of numeric labels, and allow applicable canvas-object borders to use zero thickness without offering an invisible annotation width.
- [ ] **Constant-width annotation transforms.** Resizing an annotation changes its vector path geometry while preserving the selected stroke thickness instead of scaling or distorting the rendered ink width.

### Exit gate

- [ ] Manual pen QA passes at minimum, default, and maximum zoom using mouse and touch/stylus emulation; automated geometry tests cover overlap, movement, disconnect, and promotion.

## Milestone 7 — First-class documents

### Product requirements

- [ ] **FR-044 — Add document.** A participant can add a general-purpose document container to the canvas.
- [ ] **FR-045 — Page-like board representation.** A document is recognizable as a page-like object at canvas level and has an approved long-content preview behavior.
- [ ] **FR-046 — Focused document interaction.** Zooming into a document frames it, enters document interaction, and provides a clear return to the parent canvas.
- [ ] **FR-047 — Rich text.** Documents support bold, italics, underline, and hierarchical outline formatting with keyboard and toolbar access.
- [ ] **FR-048 — AI document editing.** Subject to permission, the AI can generate, edit, and format document content through validated commands.
- [ ] **FR-049 — Scrolling layout.** A document can use a responsive continuous scrolling layout.
- [ ] **FR-050 — Paginated layout.** A document can use fixed pagination with standard selectable page sizes and previous/next navigation.
- [ ] **FR-051 — Internal visual objects.** Shapes, text, connectors, tables, and annotations can be placed alongside document text.
- [ ] **FR-052 — Internal collaboration.** Text ranges and internal objects support comments, replies, structured prompts, annotations, and AI-assisted review.
- [ ] **FR-053 — Boundary containment.** Internal objects remain clipped and owned by the document and cannot connect to parent-canvas objects.

### Exit gate

- [ ] Complete the sourced **Document collaboration** acceptance scenario in both scrolling and paginated layouts, then verify reload and concurrent editing.

## Milestone 8 — Guided canvas stories

### Product requirements

- [ ] **FR-054 — Create linear story.** A participant or permitted AI can create a guided story from an ordered sequence of canvas scenes.
- [ ] **FR-055 — Scene data.** Each scene persists target region, camera framing, zoom, and optional contextual comments or narration.
- [ ] **FR-056 — Smooth navigation.** Playback animates from the current viewport to the selected next or previous scene without a visual jump.
- [ ] **FR-057 — Explore while paused.** A viewer can pan and inspect freely while playback is paused at a scene.
- [ ] **FR-058 — Return to scene target.** Next or previous navigation smoothly returns from an explored viewport to the selected scene target.
- [ ] **FR-059 — Relevant scene comments.** Scene-specific comments appear at the correct point in playback and do not leak into unrelated scenes.
- [ ] **FR-060 — AI narration.** The primary AI can narrate a story through the approved live-voice path, with captions or equivalent text available.
- [ ] **FR-061 — Live-linked story.** Story order, framing, and narration persist while rendered canvas content reflects current board state.
- [ ] **FR-062 — Linear-only first version.** Creation and playback expose one ordered path and do not imply unsupported branching.

### Exit gate

- [ ] A saved story plays from beginning to end after underlying objects are edited, moved, and reloaded; reduced-motion mode substitutes an accessible non-sweeping transition.

## Milestone 9 — Live conversation

### Product requirements

- [ ] **FR-008 — Prominent live control.** A persistent, keyboard-accessible canvas control starts or joins a live voice conversation and clearly indicates listening, speaking, muted, reconnecting, and ended states.
- [ ] **FR-009 — AI live voice.** A participant can hold a low-latency voice conversation with the primary AI collaborator.
- [ ] **FR-010 — Remote-human model.** The same conversation surface and participant model supports remote human collaborators; transport may use a standards-based peer or room implementation approved during the voice spike.
- [ ] **FR-011 — Type during voice.** A participant can send and receive typed messages while voice remains connected.
- [ ] **FR-012 — AI works while speaking.** The AI can read, comment on, or change the canvas within permission without ending its live session.
- [ ] **FR-013 — Important interruption judgment.** Approved conversation evaluations show that the AI interrupts active speech only for defined timely and important conditions.
- [ ] **FR-014 — Natural-pause deferral.** Lower-urgency observations queue and surface at a detected conversational pause.

### Supporting work

- [ ] Define privacy copy, microphone consent, recording/transcript retention, and deletion behavior before enabling voice in production.
- [ ] Provide mute, leave, device-error recovery, captions/transcript visibility, and text-only fallback.
- [ ] Define and test the remote-human voice transport; OpenAI Realtime must not be assumed to provide a general human-to-human room.
- [ ] Keep high-frequency audio out of PostgreSQL and Supabase Realtime Broadcast.
- [ ] Measure connection time, response latency, interruption timing, reconnect success, and session failure rate.

### Exit gate

- [ ] Complete the sourced **Live co-thinking** acceptance scenario on the Netlify preview deployment with typed messaging, an AI canvas action, pause behavior, and recovery from a dropped connection.

## Milestone 10 — Conversational creation and templates

### Product requirements

- [ ] **FR-063 — Empty start.** A user can deliberately create and work from an empty canvas.
- [ ] **FR-064 — Describe a thinking task.** A user can tell the primary AI what they want to explore and explicitly request a starter structure.
- [ ] **FR-065 — Generate with standard primitives.** The AI creates the requested initial structure using only supported standard objects and valid connections.
- [ ] **FR-066 — Save reusable structure.** A user can save, name, list, instantiate, rename, and delete their own reusable starter structure.

### Supporting work

- [ ] Reuse and expand the Milestone 5 deterministic layout-tool foundation for larger starter structures, including bounded grid/flow composition, style-preset application, connector routing, and post-generation layout validation without introducing format-specific canvas modes.
- [ ] Use the complete semantic projection and targeted vision feedback when refining generated starter structures; retain standard primitives and validated domain commands as the canonical output rather than storing or editing a screenshot.

### Exit gate

- [ ] Fixtures for a mind map, procedure, mood board, and storyboard create editable standard objects and never switch the product into a format-specific mode.

## Milestone 11 — Production readiness and launch

### Security and privacy

- [ ] Row Level Security integration tests cover every table, role, and mutation path.
- [ ] Authorization is checked on the server immediately before every AI read or mutation, not only when a page loads.
- [ ] Secrets exist only in approved Netlify environment scopes and are absent from browser bundles, logs, fixtures, and Git history.
- [ ] User canvas text, comments, documents, and AI outputs are safely rendered without executable HTML or script injection.
- [ ] File and payload size limits, request throttles, abuse controls, and AI spend limits fail safely with user-readable messages.
- [ ] Define retention and deletion behavior for canvases, comments, AI records, transcripts, collaboration updates, and backups.
- [ ] Define and verify privacy, retention, redaction, and access behavior for transient canvas render captures sent for AI visual feedback; operational telemetry must retain metadata rather than image content or reconstructable canvas text.
- [ ] Complete a dependency license and vulnerability review; resolve all release-blocking findings.

### Reliability and recovery

- [ ] Define explicit save-state semantics: saved, saving, offline/unsynced, retrying, and failed.
- [ ] Automated tests cover browser crash, network loss, reconnect, duplicate delivery, out-of-order delivery, stale snapshots, and two-user conflicts.
- [ ] Snapshot compaction and restore jobs have metrics, alerts, idempotency, and a documented manual recovery procedure.
- [ ] Verify backup and point-in-time recovery settings appropriate to the selected Supabase plan; perform a restore rehearsal before launch.
- [ ] AI, voice, and realtime failures degrade without preventing local viewing or export of already loaded canvas content.

### Accessibility and compatibility

- [ ] Application chrome and non-spatial workflows meet WCAG 2.2 AA targets, including focus visibility, labeling, contrast, error messaging, and 200% zoom.
- [ ] Every toolbar action is keyboard accessible; shortcuts are discoverable and avoid browser and assistive-technology conflicts.
- [ ] Provide a structured object list or equivalent non-visual path to select, read, edit, and comment on canvas content.
- [ ] Do not rely on color alone for collaborator, review, connection, voice, or status meaning.
- [ ] Respect reduced-motion preferences in guided stories and all nonessential animation.
- [ ] Test the supported current versions of Chrome, Safari, Firefox, and Edge at desktop and tablet viewport sizes.

### Performance targets to approve and test

- [ ] Approve measurable budgets for initial application load, canvas open, local interaction latency, collaborator propagation, reconnect, and AI first feedback.
- [ ] A representative canvas with 1,000 objects pans and zooms without sustained interaction below the approved frame-rate budget on target hardware.
- [ ] Object lookup, culling, and selection use the spatial index rather than scanning every object per pointer frame.
- [ ] AI context generation and snapshot compaction run off the hot pointer/render path.
- [ ] Load and concurrency tests remain within the selected Supabase, Netlify, and OpenAI plan limits or produce a documented upgrade threshold.

### Quality, delivery, and operations

- [ ] CI blocks merging on formatting, lint, type, unit, integration, end-to-end, migration, and accessibility failures.
- [ ] Preview deployments use non-production data and credentials and are access-controlled when they contain unreleased features.
- [ ] Database migrations are forward-safe and have a tested rollback or compensating migration plan.
- [ ] Production errors, server latency, realtime disconnects, AI failures, and voice failures emit privacy-safe structured telemetry.
- [ ] A release checklist covers migrations, environment variables, RLS, smoke tests, domain, HTTPS, rollback, and owner sign-off.
- [ ] Configure the production domain through Netlify, verify HTTPS, and document registrar DNS records and renewal ownership.
- [ ] Publish user-facing privacy terms and support/contact information appropriate to collected canvas, voice, and AI data.

### Final acceptance

- [ ] All `FR-001` through `FR-066` items are checked with linked evidence.
- [ ] All five sourced acceptance scenarios pass in production-like conditions.
- [ ] No unresolved release-blocking security, accessibility, data-loss, permission, or cross-browser defect remains.
- [ ] Product owner explicitly approves the first-version release.

## Acceptance scenarios

These are retained as cross-feature release tests rather than substitutes for the individual requirement checks.

- [ ] **AS-001 — Live co-thinking.** While a user draws connected ideas in live voice, the AI can leave a relevant contextual comment without ending the conversation and defers non-urgent observations while the user speaks.
- [ ] **AS-002 — Reviewable AI edit.** In edit-with-review mode, an AI label change receives an explanation; keep, revise, and discard are available; discard immediately restores the prior label. **Superseded for the first version by `PD-012` and `AS-006`; retained verbatim for source traceability.**
- [x] **AS-003 — Comment prompt.** A collaborator attaches a yes/no prompt, the recipient answers without typing, and the response appears in the thread.
- [ ] **AS-004 — Document collaboration.** Rich text, a shape, and an annotation remain inside a document and support comments and AI review without connecting to the parent canvas.
- [ ] **AS-005 — Guided review.** A multi-change AI review story visits one affected area at a time and provides the correct review controls at each scene. **Superseded for the first version by `PD-012` and `AS-006`; retained verbatim for source traceability.**
- [x] **AS-006 — Conversational AI edit with undo.** In the user-facing **Edit with undo** authority mode, an AI applies one plain-language canvas change without exposing technical identifiers; the user can revise it through a normal thread reply or undo the complete AI turn while unrelated later human work remains intact; otherwise no explicit acceptance action is required.

## Product decisions required before their milestones

- [ ] **PD-001 — Human voice transport:** choose the free/open-source WebRTC approach or explicitly phase remote-human voice after AI voice; `FR-010` cannot be checked until it works.
- [ ] **PD-002 — Document preview:** define how a long document appears at board zoom while keeping `FR-045` understandable and performant.
- [ ] **PD-003 — Page sizes:** select the initial standard sizes and orientation behavior for `FR-050`.
- [x] **PD-004 — Rating scale:** use one fixed inclusive `1–5` numeric rating scale in the first version; the comment author does not choose among multiple ranges. Approved by the product owner on 2026-08-19.
- [ ] **PD-005 — Important interruption:** define testable examples and non-examples for `FR-013` and `FR-014`.
- [x] **PD-006 — Permission ownership:** only the canvas owner may enable or disable the primary AI and change its authority; editors may invoke tools allowed by the selected authority, commenters may invoke comment-only interaction when enabled, and viewers remain read-only. Approved by the product owner with the Milestone 4 plan on 2026-08-24.
- [ ] **PD-007 — Performance budgets:** approve target hardware, representative canvas size, latency thresholds, and maximum acceptable degradation.
- [ ] **PD-008 — Voice data:** approve consent, transcript visibility, retention, deletion, and whether audio is ever recorded.
- [x] **PD-009 — Offline behavior:** decide whether the first version supports deliberate offline editing or only temporary disconnect recovery. **Decision:** the first version supports temporary disconnect recovery only; a fully loaded canvas may retain and retry pending edits through a transient connection loss, while deliberate offline entry and opening an uncached canvas offline remain unsupported.
- [ ] **PD-010 — Export and portability:** decide whether a user-facing export is a launch requirement; it is prudent for recovery but not stated in the source brief.
- [x] **PD-011 — AI visual grounding and layout assistance:** keep the complete semantic canvas projection and stable object IDs authoritative; add validated deterministic layout tools for manipulation; use bounded targeted before-and-after render captures only as supplementary vision context and never as mutation authority. The bounded core is Milestone 5 scope, with broader starter-structure composition deferred to Milestone 10. Approved by the product owner on 2026-08-26.
- [x] **PD-012 — Conversational AI edits with undo:** replace the first-version guided per-object Keep/Discard/Request revision workflow with one immediately durable, conflict-safe AI transaction per turn. Show only a plain-language summary; expose the existing internal `edit_with_review` authority as **Edit with undo**; use normal comment replies for revisions; make acceptance implicit; and keep guided review only as deferred optional exploration. Approved by the product owner on 2026-08-27 after hosted Milestone 5 testing.

## Explicitly deferred

- [ ] Do not implement specialist AI agents spawned by the primary AI.
- [ ] Do not implement branching guided stories.
- [ ] Do not preserve versioned canvas snapshots inside stories.
- [ ] Do not restore the superseded per-object AI approval or guided-review workflow unless a later product decision explicitly promotes it as an optional advanced mode.
- [ ] Do not allow connectors between document-internal and parent-canvas objects.
- [ ] Do not add specialized document types.
- [ ] Do not add a canvas-insertable icon or illustration library.
- [ ] Do not add AI image generation as a canvas-element source.

These boxes are checked when the release is verified to exclude or avoid implying each deferred capability.

## Reference documentation

- [Netlify: Next.js overview](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Supabase: Realtime](https://supabase.com/docs/guides/realtime)
- [Supabase: Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Supabase: Presence](https://supabase.com/docs/guides/realtime/presence)
- [OpenAI: Realtime API](https://platform.openai.com/docs/api-reference/realtime)
- [Yjs: introduction](https://docs.yjs.dev/)
- [Yjs: document updates](https://docs.yjs.dev/api/document-updates)
- [Konva: React integration](https://konvajs.org/docs/react/index.html)
- [Lexical](https://lexical.dev/)
- [Motion for React](https://motion.dev/docs/react)
- [perfect-freehand](https://github.com/steveruizok/perfect-freehand)
