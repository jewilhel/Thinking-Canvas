# Thinking Canvas — Implementation Plan

Status: Draft for review

Source: *Thinking Canvas — Design Brief* and its 66 functional requirements

Last updated: 2026-08-10

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
| AI reasoning and actions | OpenAI Responses API | Canvas interpretation, grounded responses, tool calls, starter structures, document work, and review explanations |
| Live AI voice | OpenAI Realtime API | Low-latency speech sessions only; the Responses API remains the primary reasoning and action API |
| Source control | GitHub | Repository, pull requests, protected main branch, and CI |
| Domain | Any registrar | DNS points to Netlify; registrar choice remains independent of the application |

### Required voice clarification

The Responses API can stream generated results, but the first-version requirements call for a continuous, low-latency voice conversation. OpenAI documents the Realtime API as the interface for interactive voice over WebRTC. Therefore:

- [ ] Approve using the OpenAI Realtime API alongside the Responses API for `FR-008` through `FR-014` and `FR-060`.
- [ ] Keep the OpenAI API key server-side and mint short-lived Realtime client credentials from an authenticated server route.
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

- [ ] Treat Konva as a renderer and interaction layer; keep the canonical canvas schema independent of Konva node serialization.
- [ ] Treat Yjs as the collaboration state engine; persist compacted updates and snapshots in Supabase instead of relying on transient Broadcast delivery.
- [ ] Use Supabase Presence for slow-changing participant state and Broadcast for high-frequency cursor and document-update messages.
- [ ] Keep Zustand state local only; durable or collaborative product state must not live exclusively in a Zustand store.
- [ ] Keep Lucide icons in the application chrome. A searchable icon library for insertion onto the canvas remains deferred.
- [ ] Do not add a second hosted collaboration, authentication, database, or AI service without an approved architecture change.

## System architecture

### Runtime boundaries

1. The browser renders and edits the canvas, maintains the local Yjs document, and connects directly to authorized Supabase Realtime channels.
2. Supabase Auth establishes identity. PostgreSQL Row Level Security enforces canvas membership and role permissions.
3. PostgreSQL stores durable domain records plus append-only Yjs updates and periodic compacted snapshots.
4. Next.js server routes on Netlify validate requests, load an authorized canvas projection, call OpenAI, and convert validated AI tool calls into domain commands.
5. OpenAI Realtime WebRTC sessions use short-lived credentials issued by an authenticated server route; long-lived OpenAI keys never reach the browser.

### Canonical data boundaries

- Shared Yjs document: canvas objects, groups, transforms, connector endpoints, table cell content, annotation stroke points, document-internal visual objects, and live viewport-independent structure.
- Relational records: users, profiles, canvases, memberships, invitations, AI permission policy, comments and replies, structured responses, change sets, review decisions, guided stories and scenes, templates, and audit metadata.
- Ephemeral realtime state: cursors, current selection, voice-speaking state, active scene, typing state, and online presence.
- Object and document IDs are stable UUIDs shared across Yjs and PostgreSQL references.

### Initial database checklist

- [ ] Create migrations for `profiles`, `canvases`, `canvas_members`, and `canvas_invitations`.
- [ ] Create migrations for `canvas_updates` and `canvas_snapshots`, including monotonic sequence/version metadata.
- [ ] Create migrations for `comments`, `comment_targets`, `comment_replies`, `comment_prompts`, and `comment_responses`.
- [ ] Create migrations for `ai_change_sets`, `ai_object_changes`, and `review_decisions` with reversible before/after payloads.
- [ ] Create migrations for `stories` and ordered `story_scenes`.
- [ ] Create migrations for `starter_templates`.
- [ ] Add foreign keys, ownership rules, timestamps, and indexes for all access paths.
- [ ] Enable Row Level Security on every user-owned table before application access is enabled.
- [ ] Prove with automated policy tests that owners, editors, commenters, and viewers receive only their permitted data and operations.

## Milestone 0 — Architecture spikes and project foundation

### Build checklist

- [ ] Create the GitHub repository with `main` protected by pull-request and required-test rules.
- [ ] Scaffold a strict TypeScript Next.js App Router project with Tailwind CSS and shadcn/ui.
- [ ] Add formatting, linting, type-checking, unit-test, and end-to-end-test commands.
- [ ] Connect Netlify to GitHub and produce working preview and production deployment contexts.
- [ ] Configure separate local, preview, and production environment variables without committing secrets.
- [ ] Integrate Supabase Auth using server-readable sessions and protected application routes.
- [ ] Commit Supabase migrations and seed only non-sensitive local development fixtures.
- [ ] Define versioned Zod schemas for every shared object and server API payload.
- [ ] Define one command boundary for all human and AI mutations so permissions, undo data, audit metadata, and collaboration updates cannot be bypassed.

### Required technical spikes

- [ ] Two-browser collaboration spike proves simultaneous edits converge after reordered, repeated, and temporarily disconnected Yjs updates over Supabase Broadcast.
- [ ] Persistence spike proves a new client can load the latest snapshot plus subsequent updates without missing edits made during connection.
- [ ] Compaction spike proves updates can be merged into a new snapshot and old updates safely pruned without changing document state.
- [ ] Canvas spike proves pan, zoom, select, move, resize, connector anchoring, and at least 1,000 visible mixed objects remain usable on target hardware.
- [ ] Rich-document spike proves a Lexical editor can live inside a focused canvas document while its internal visual objects remain isolated.
- [ ] AI spike proves the Responses API can receive a bounded, structured canvas projection and return validated domain commands with no direct database authority.
- [ ] Voice spike proves authenticated browser-to-OpenAI WebRTC through an ephemeral credential on a Netlify preview deployment.
- [ ] Reversal spike proves an AI change can store a before image, apply an after image, and immediately restore the prior state despite later unrelated edits.

### Exit gate

- [ ] Record spike results and approve the final collaboration, persistence, rich-text, AI, and voice architecture before feature milestones begin.

## Milestone 1 — Canvas foundation and multiplayer core

### Product requirements

- [ ] **FR-001 — Create canvas.** A participant can create a canvas and reopen the same persisted canvas after signing out and back in.
- [ ] **FR-002 — Manipulate essential objects.** A participant can create, select, move, resize, and delete shapes, text, connectors, and tables; end-to-end tests cover every object/action combination.
- [ ] **FR-003 — Shape connection points.** Selecting or hovering an eligible shape exposes usable connection points.
- [ ] **FR-004 — Persistent connector attachment.** Attached connector endpoints follow their shapes during movement and resize without visual detachment.
- [ ] **FR-005 — Object styling.** Applicable objects expose fill, outline, typography, and text-size controls and persist the selected values.
- [ ] **FR-006 — General-purpose primitives.** A user can construct representative mind-map, procedure, mood-board, and storyboard arrangements without entering a dedicated creation mode.
- [ ] **FR-007 — Simultaneous collaborators.** At least two humans and one simulated AI identity can edit the same canvas concurrently and converge on one state.

### Supporting work

- [ ] Implement camera pan, pointer-centered zoom, zoom-to-fit, keyboard navigation, and viewport restoration.
- [ ] Implement selection, multiselection, grouping, ordering, duplicate, clipboard, undo, and redo through domain commands.
- [ ] Render collaborator cursors and selections without persisting cursor movement as canvas history.
- [ ] Add autosave status, reconnect status, retry behavior, and unsynced-change protection.
- [ ] Add object-count and frame-time instrumentation used only in development and test environments.

### Exit gate

- [ ] Run a documented multi-browser session covering concurrent object creation, movement, deletion, reconnect, and reload with zero lost committed edits.

## Milestone 2 — Comments and structured feedback

### Product requirements

- [ ] **FR-023 — Anchored comments.** A participant can attach a comment to one object or a selected group, and the target survives movement and reload.
- [ ] **FR-024 — Threaded replies.** Participants can reply to a comment and see replies in deterministic chronological order.
- [ ] **FR-025 — Complete history.** Selecting a comment exposes its entire exchange in-context and through an optional side panel.
- [ ] **FR-026 — Structured prompt creation.** A comment author can add exactly one supported structured response control.
- [ ] **FR-027 — Initial controls.** Yes/no, approve/revise/discard, and bounded numeric rating prompts render, validate, and persist responses.
- [ ] **FR-028 — Human and AI prompt authors.** Both participant types can create structured prompts through the same permission-aware domain command.
- [ ] **FR-029 — Dismiss and resolve.** An authorized participant can dismiss or resolve a temporary comment without deleting its history.
- [ ] **FR-030 — Hide comments.** Comment bubbles and the annotation overlay can be hidden without altering underlying canvas objects or deleting comments.

### Exit gate

- [ ] Complete the sourced **Comment prompt** acceptance scenario with two authenticated browser sessions and persisted thread history.

## Milestone 3 — AI collaborator, permissions, and typed interaction

### Product requirements

- [ ] **FR-015 — One primary AI.** Every canvas can enable one clearly identified primary AI collaborator in the first version.
- [ ] **FR-016 — Full-canvas inspection.** With permission, the AI receives a complete semantic canvas projection, including off-screen objects, within documented context-size safeguards.
- [ ] **FR-017 — Connected-path inspection.** A user can select a connected path or ordered sequence and ask the AI to interpret that exact selection in order.
- [ ] **FR-018 — Shared visual vocabulary.** The AI can create and edit every supported human canvas object through validated domain tools, subject to permission.
- [ ] **FR-019 — AI contextual comments.** The AI can attach a comment to the specific object or group supporting its observation.
- [ ] **FR-020 — Constructive challenge.** Evaluation fixtures demonstrate grounded questions or alternatives for weak assumptions, gaps, ambiguities, and clearer framings.
- [ ] **FR-021 — No empty praise.** Evaluation fixtures reject responses that substitute unsupported praise for substantive canvas-grounded feedback.
- [ ] **FR-022 — Adjustable authority.** A user can select comment only, propose changes, edit with review, or trusted editor, and server-side enforcement blocks every disallowed mutation.

### Supporting work

- [ ] Implement typed messaging that remains available independently of voice.
- [ ] Build a deterministic canvas-to-AI projection with object IDs, types, text, geometry, relationships, document summaries, and selected-path order.
- [ ] Bound AI context by relevance without hiding the fact that off-screen canvas content exists.
- [ ] Validate every AI tool call with Zod and re-check current membership and AI permission server-side at execution time.
- [ ] Store AI request identifiers, tool decisions, affected object IDs, outcome, and failure status without storing secret credentials.
- [ ] Add rate limits, budget limits, cancellation, timeout handling, and a visible retry path.
- [ ] Treat canvas and comment content as untrusted input; prompt text cannot grant tools or permissions.

### Exit gate

- [ ] Evaluation suite passes groundedness, permission, malformed-tool-call, prompt-injection, and cancellation cases at the approved threshold.

## Milestone 4 — Reviewable AI changes

### Product requirements

- [ ] **FR-031 — Explanation per reviewed object.** In edit-with-review mode, every added or edited object receives an attached explanation of what changed and why.
- [ ] **FR-032 — Review actions.** The user can keep, request revision of, or discard each reviewed AI change independently.
- [ ] **FR-033 — Immediate restoration.** Discard restores the affected content to its prior state immediately without reverting unrelated later work.
- [ ] **FR-034 — Guided review story.** The product can generate and play a review story that visits AI changes one at a time.
- [ ] **FR-035 — Contextual review step.** Each step frames the relevant change and exposes its explanation and currently valid actions.

### Exit gate

- [ ] Complete the sourced **Reviewable AI edit** and **Guided review** acceptance scenarios, including a mixed keep/discard change set and a concurrent unrelated human edit.

## Milestone 5 — Vector annotations

### Product requirements

- [ ] **FR-036 — Freeform pen.** The product provides one mouse, touch, and stylus-capable freeform vector-pen annotation tool.
- [ ] **FR-037 — True freeform strokes.** Drawing produces editable point-based vector strokes, not predefined arrow, circle, or underline objects.
- [ ] **FR-038 — Stroke editing.** A participant can change stroke color, thickness, geometry, and position after drawing.
- [ ] **FR-039 — Zoom fidelity.** Strokes remain visually crisp and correctly positioned across the supported zoom range.
- [ ] **FR-040 — Temporary and hideable.** New strokes are temporary by default and hide with comment bubbles.
- [ ] **FR-041 — Promote to durable content.** A participant can promote an annotation so it remains visible when the temporary overlay is hidden.
- [ ] **FR-042 — Automatic overlap attachment.** A stroke overlapping an eligible object attaches to it by default and follows its movement.
- [ ] **FR-043 — Disconnect attachment.** A participant can disconnect an attached stroke without changing its visible geometry at that moment.

### Exit gate

- [ ] Manual pen QA passes at minimum, default, and maximum zoom using mouse and touch/stylus emulation; automated geometry tests cover overlap, movement, disconnect, and promotion.

## Milestone 6 — First-class documents

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

## Milestone 7 — Guided canvas stories

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

## Milestone 8 — Live conversation

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

## Milestone 9 — Conversational creation and templates

### Product requirements

- [ ] **FR-063 — Empty start.** A user can deliberately create and work from an empty canvas.
- [ ] **FR-064 — Describe a thinking task.** A user can tell the primary AI what they want to explore and explicitly request a starter structure.
- [ ] **FR-065 — Generate with standard primitives.** The AI creates the requested initial structure using only supported standard objects and valid connections.
- [ ] **FR-066 — Save reusable structure.** A user can save, name, list, instantiate, rename, and delete their own reusable starter structure.

### Exit gate

- [ ] Fixtures for a mind map, procedure, mood board, and storyboard create editable standard objects and never switch the product into a format-specific mode.

## Milestone 10 — Production readiness and launch

### Security and privacy

- [ ] Row Level Security integration tests cover every table, role, and mutation path.
- [ ] Authorization is checked on the server immediately before every AI read or mutation, not only when a page loads.
- [ ] Secrets exist only in approved Netlify environment scopes and are absent from browser bundles, logs, fixtures, and Git history.
- [ ] User canvas text, comments, documents, and AI outputs are safely rendered without executable HTML or script injection.
- [ ] File and payload size limits, request throttles, abuse controls, and AI spend limits fail safely with user-readable messages.
- [ ] Define retention and deletion behavior for canvases, comments, AI records, transcripts, collaboration updates, and backups.
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

## Sourced acceptance scenarios

These are retained as cross-feature release tests rather than substitutes for the individual requirement checks.

- [ ] **AS-001 — Live co-thinking.** While a user draws connected ideas in live voice, the AI can leave a relevant contextual comment without ending the conversation and defers non-urgent observations while the user speaks.
- [ ] **AS-002 — Reviewable AI edit.** In edit-with-review mode, an AI label change receives an explanation; keep, revise, and discard are available; discard immediately restores the prior label.
- [ ] **AS-003 — Comment prompt.** A collaborator attaches a yes/no prompt, the recipient answers without typing, and the response appears in the thread.
- [ ] **AS-004 — Document collaboration.** Rich text, a shape, and an annotation remain inside a document and support comments and AI review without connecting to the parent canvas.
- [ ] **AS-005 — Guided review.** A multi-change AI review story visits one affected area at a time and provides the correct review controls at each scene.

## Product decisions required before their milestones

- [ ] **PD-001 — Human voice transport:** choose the free/open-source WebRTC approach or explicitly phase remote-human voice after AI voice; `FR-010` cannot be checked until it works.
- [ ] **PD-002 — Document preview:** define how a long document appears at board zoom while keeping `FR-045` understandable and performant.
- [ ] **PD-003 — Page sizes:** select the initial standard sizes and orientation behavior for `FR-050`.
- [ ] **PD-004 — Rating scale:** define allowed numeric ranges and whether the author chooses among them for `FR-027`.
- [ ] **PD-005 — Important interruption:** define testable examples and non-examples for `FR-013` and `FR-014`.
- [ ] **PD-006 — Permission ownership:** define which human roles may change the AI permission level in `FR-022`.
- [ ] **PD-007 — Performance budgets:** approve target hardware, representative canvas size, latency thresholds, and maximum acceptable degradation.
- [ ] **PD-008 — Voice data:** approve consent, transcript visibility, retention, deletion, and whether audio is ever recorded.
- [ ] **PD-009 — Offline behavior:** decide whether the first version supports deliberate offline editing or only temporary disconnect recovery.
- [ ] **PD-010 — Export and portability:** decide whether a user-facing export is a launch requirement; it is prudent for recovery but not stated in the source brief.

## Explicitly deferred

- [ ] Do not implement specialist AI agents spawned by the primary AI.
- [ ] Do not implement branching guided stories.
- [ ] Do not preserve versioned canvas snapshots inside stories.
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
