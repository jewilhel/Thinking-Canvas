# Milestone 0 — Architecture spikes and project foundation

Status: Approved for implementation
Master plan: [`thinking-canvas-implementation-plan.md`](../../thinking-canvas-implementation-plan.md)
Plan owner: Product owner
Last updated: 2026-08-10

## Goal and user-visible outcome

Establish a deployable, authenticated Thinking Canvas foundation and resolve the expensive technical uncertainties before feature work begins.

When this milestone is complete, a reviewer can open an authenticated Netlify preview, enter a protected spike workspace, and inspect recorded demonstrations showing that collaboration, persistence, compaction, canvas interaction, rich documents, bounded AI commands, live AI voice, and reversible AI changes are viable within the approved architecture. The spike UI is evidence tooling, not the Milestone 1 product experience.

## Requirements covered

Milestone 0 does not complete any `FR-###` product requirement. It validates the architecture required by later requirements and covers these exact master-plan commitments:

- **Required voice clarification:** approve the OpenAI Realtime API alongside the Responses API; keep the OpenAI API key server-side; mint short-lived Realtime client credentials from an authenticated server route.
- **Library boundaries:** keep the canonical schema independent of Konva serialization; use Yjs as the collaboration engine with durable Supabase updates and snapshots; use Presence for participant state and Broadcast for high-frequency cursor and document-update messages; keep durable state out of Zustand; keep Lucide in application chrome; do not add a second hosted collaboration, authentication, database, or AI service without approval.
- **Initial database checklist:** create the initial relational schema, ownership rules, indexes, Row Level Security, and automated role-policy evidence described in the master plan.
- **Milestone 0 — Build checklist:** complete all nine foundation items in the master plan.
- **Milestone 0 — Required technical spikes:** complete all eight spikes in the master plan.
- **Milestone 0 — Exit gate:** “Record spike results and approve the final collaboration, persistence, rich-text, AI, and voice architecture before feature milestones begin.”

Evidence produced here informs, but does not check, `FR-007`, `FR-008` through `FR-014`, `FR-031` through `FR-035`, and `FR-044` through `FR-053`.

## Decisions required

| Decision                              | Owner         | Options and consequences                                                                                                                                                                                                                                                     | Required timing                      | Status                                                                                                                                                                                         |
| ------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Realtime voice architecture           | Product owner | Approve OpenAI Realtime alongside Responses and retain live conversation requirements; or revise `FR-008` through `FR-014` and `FR-060` to turn-based voice before development.                                                                                              | Before the voice-spike slice begins. | Approved 2026-08-10: use OpenAI Realtime alongside Responses and retain the live-conversation requirements.                                                                                    |
| Spike performance target              | Product owner | Approve the proposed baseline of a current Mac used by the product owner, current Chrome at a desktop viewport, 1,000 visible mixed objects, responsive direct manipulation, and no sustained interaction below 30 fps; or provide different target hardware and thresholds. | Before canvas-spike acceptance.      | Approved 2026-08-10: use the proposed spike baseline. This does not close the later production budget decision `PD-007`.                                                                       |
| GitHub branch protection availability | Product owner | Make the repository public so the existing master-plan requirement can be satisfied on the current GitHub plan.                                                                                                                                                              | Before Slice 1 can complete.         | Resolved 2026-08-10: repository visibility is `PUBLIC`; `main` protection now enforces pull requests, strict required `quality` checks, stale-review dismissal, and administrator enforcement. |
| Final architecture                    | Product owner | Approve the validated collaboration, persistence, rich-text, AI, and voice choices; require a bounded follow-up experiment; or revise the master-plan architecture before feature work.                                                                                      | At the Milestone 0 exit gate.        | Open; closure decision, separate from plan approval.                                                                                                                                           |

`PD-001` through `PD-006`, `PD-008`, and `PD-010` remain deferred to their owning feature milestones. `PD-009` does not block this milestone because the spike covers temporary disconnect recovery, not deliberate offline editing. The Milestone 0 measurements will inform the final `PD-007` production budget; they do not close it.

## Technical approach

### Application foundation

- Scaffold a strict TypeScript Next.js App Router application with Tailwind CSS and shadcn/ui.
- Keep browser, server, and shared modules explicit. Server-only Supabase and OpenAI clients must not be importable into client bundles.
- Use Zod-versioned domain schemas and a renderer-independent object model. Konva nodes are derived views and never persistence payloads.
- Use Zustand only for ephemeral UI state such as active tool, selection, viewport mode, and open panels.
- Expose one `executeCommand` boundary for human and AI mutations. Each command carries actor, origin, target canvas, validated payload, permission result, undo data, audit metadata, and collaboration update metadata.

### Collaboration and persistence

- Keep shared canvas content in a Yjs document. Use Supabase Realtime Broadcast to exchange Yjs updates and Presence for slow-changing participant state.
- Persist append-only updates with monotonic server-assigned sequence metadata. Load the latest compacted snapshot, subscribe with an overlap-safe sequence boundary, fetch subsequent updates, and rely on Yjs idempotency for repeated delivery.
- Compact in a trusted server process: lock one canvas compaction, merge the selected update range into a snapshot, verify the reconstructed state, publish the snapshot transactionally, and prune only the covered updates after verification.
- Treat disconnect recovery as a required spike. Deliberate offline product behavior remains a later decision.

### Spike harness

- Build authenticated, development/preview-only routes that exercise real domain boundaries and expose deterministic controls, metrics, and downloadable privacy-safe evidence.
- Keep spike fixtures reproducible and non-sensitive. Spike-only UI must be clearly marked and removable without changing canonical domain modules.
- Implement the smallest mixed-object model needed to test pan, zoom, selection, transforms, connectors, and 1,000 visible objects; defer polished creation tools and full object/action coverage to Milestone 1.
- Mount a Lexical editor only while a document is focused. Bind its state to a document-owned Yjs substructure and prove that internal visual-object IDs and coordinate space remain isolated from the parent canvas.

### AI, voice, and reversal

- Build an authenticated server route that accepts a bounded semantic canvas projection, calls the Responses API, validates returned tool arguments, and passes allowed results through the same command boundary used by humans. OpenAI receives no database credentials or direct mutation authority.
- Build a separate authenticated route that verifies membership and returns a short-lived Realtime client credential. The browser connects to OpenAI Realtime over WebRTC; the long-lived key remains server-only.
- Model an AI change as per-object before and after state plus stable object identity and affected-field metadata. Reversal restores only the AI-owned fields when they remain applicable, preserving unrelated later edits; conflicts must produce an explicit non-destructive result.

### Failure and deployment behavior

- Distinguish local, preview, and production configuration. Fail startup or the affected route with a clear non-secret error when required configuration is missing.
- Surface collaboration connection, synchronization, persistence, compaction, AI validation, voice credential, and reversal failures in the spike harness and structured privacy-safe server logs.
- Deploy each reviewable slice to Netlify preview. Production configuration is established but no public product launch occurs in this milestone.

## Database and security changes

Commit forward-safe Supabase migrations for the master plan's initial schema:

- Identity and access: `profiles`, `canvases`, `canvas_members`, `canvas_invitations`.
- Collaboration durability: `canvas_updates`, `canvas_snapshots`, including monotonic sequence/version metadata and compaction coverage.
- Feedback: `comments`, `comment_targets`, `comment_replies`, `comment_prompts`, `comment_responses`.
- AI review: `ai_change_sets`, `ai_object_changes`, `review_decisions`, including reversible before/after payloads.
- Stories: `stories`, ordered `story_scenes`.
- Reuse: `starter_templates`.

For every table:

- Add primary and foreign keys, ownership constraints, timestamps, and indexes for expected membership and canvas-scoped access paths.
- Enable Row Level Security before application access is granted.
- Define owner, editor, commenter, and viewer policies from an explicit permission matrix. Service-role use is limited to trusted server maintenance that cannot safely run as the user.
- Reject unauthenticated reads and writes. Re-check current membership for AI reads, AI commands, and Realtime credential issuance.
- Seed only deterministic local fixtures with synthetic identities and content; preview fixtures use non-production data.
- Add automated policy tests that prove both allowed and denied operations for every role and table.

Migrations are additive during this milestone. Any destructive correction requires a reviewed compensating migration and a local database reset rehearsal; production data migration is out of scope.

## Ordered task checklist

### Slice 1 — Repository and deployable shell

- [x] Resolve the GitHub plan/visibility decision, then configure `main` protection with pull-request and required-test rules as required by the master plan.
- [x] Scaffold the strict Next.js App Router project, Tailwind CSS, and shadcn/ui without overwriting the master plan.
- [x] Pin dependency versions, review licenses, and commit the lockfile.
- [x] Add formatting, linting, type-checking, Vitest, Testing Library, Playwright, and axe commands.
- [x] Add CI for formatting, lint, type, unit, end-to-end, and accessibility checks. Integration and migration checks will join this gate when their Slice 2 and Slice 3 suites exist.
- [x] Add validated environment configuration and safe example files for local, Netlify preview, and production scopes.
- [x] Connect Netlify and prove distinct preview and production deployment contexts.

### Slice 2 — Authentication, schema, and command boundary

- [ ] Configure Supabase local development and server-readable Auth sessions.
- [ ] Add protected application and spike routes with sign-in, sign-out, and expired-session behavior.
- [x] Commit the initial database migrations, indexes, constraints, RLS policies, and synthetic local seed fixtures.
- [x] Add role-policy integration tests for owner, editor, commenter, viewer, non-member, and unauthenticated identities.
- [x] Define versioned Zod schemas for shared objects and server payloads.
- [x] Implement and test the shared human/AI command boundary, including permission denial, undo metadata, audit metadata, and collaboration updates.

### Slice 3 — Collaboration, persistence, and compaction

- [ ] Implement a renderer-independent Yjs canvas document and deterministic state hashing for evidence.
- [ ] Connect authorized Supabase Broadcast and Presence channels.
- [ ] Implement overlap-safe snapshot-plus-update loading and append-only persistence.
- [ ] Implement trusted compaction with locking, state verification, transactional snapshot publication, and covered-update pruning.
- [ ] Automate reordered, repeated, disconnected, reconnect, load-race, and compaction equivalence cases.
- [ ] Run the two-browser collaboration, persistence, and compaction spike scenarios on Netlify preview.

### Slice 4 — Canvas and rich-document feasibility

- [ ] Implement the minimal Konva spike surface with pan, pointer-centered zoom, select, move, resize, and connector anchoring.
- [ ] Generate a deterministic 1,000-object mixed fixture and record frame-time and interaction measurements on the approved target hardware.
- [ ] Implement a focused Lexical document with Yjs binding and isolated document-internal visual objects.
- [ ] Prove focus entry/exit, parent-canvas isolation, update convergence, and reload for the rich-document spike.

### Slice 5 — AI, voice, and reversal feasibility

- [ ] Implement the bounded canvas projection and authenticated Responses API spike route.
- [ ] Validate AI tool arguments and execute accepted AI mutations only through the shared command boundary.
- [ ] Add malformed, unauthorized, oversized, and prompt-injection fixture cases.
- [ ] Implement authenticated short-lived Realtime credential issuance and browser WebRTC connection.
- [ ] Prove the live voice connection on a Netlify preview without exposing the long-lived API key.
- [ ] Implement per-object AI before/after records and field-aware reversal.
- [ ] Prove immediate restoration while preserving a later unrelated human edit.

### Slice 6 — Architecture decision and milestone evidence

- [ ] Consolidate commands, logs, screenshots, metrics, preview deploy identifiers, and limitations in this document.
- [ ] Trace evidence to every build-checklist item, technical spike, library boundary, initial database item, and exit-gate clause.
- [ ] Record proposed final collaboration, persistence, rich-text, AI, and voice architecture, including any approved deviations.
- [ ] Run the complete affected suite and authenticated Netlify preview walkthrough.
- [ ] Request product-owner closure approval; do not begin Milestone 1 until it is granted.

## Pull-request slices

Pull requests are proposed for reviewability but are not authorized by plan approval alone. Open them only when the product owner explicitly requests or approves PR creation.

| Slice                                 | Depends on | Demoable outcome                                                                                          | Tests                                                                                                           | Rollback or compensating path                                                                          |
| ------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1. Project shell and delivery         | None       | A typed shell passes CI and deploys distinct Netlify contexts.                                            | Format, lint, type, unit smoke, Playwright smoke, axe smoke, deployment smoke.                                  | Revert scaffold/config commits; no persistent data.                                                    |
| 2. Auth, schema, command core         | Slice 1    | An authenticated user reaches a protected spike workspace; role tests and commands enforce permissions.   | Auth integration, migration/reset, complete RLS matrix, schema and command unit tests.                          | Additive compensating migration and route/config revert.                                               |
| 3. Collaboration durability           | Slice 2    | Two browsers converge, reload from durable state, and survive verified compaction.                        | Yjs update permutation tests, reconnect/load-race integration, two-browser E2E, snapshot equivalence.           | Disable compaction/pruning; replay append-only updates from last verified snapshot.                    |
| 4. Canvas and document spikes         | Slice 3    | The 1,000-object canvas remains usable and a focused collaborative document stays isolated.               | Geometry/connector tests, performance capture, Lexical isolation/convergence tests, preview walkthrough.        | Remove spike routes while retaining validated domain primitives.                                       |
| 5. AI, voice, and reversal spikes     | Slices 2–3 | Validated AI commands, live preview voice, and non-destructive reversal work through approved boundaries. | Route authorization/schema tests, adversarial fixtures, WebRTC preview evidence, concurrent-edit reversal test. | Disable AI/voice routes by environment flag; preserve audit data; no direct database authority exists. |
| 6. Evidence and architecture approval | Slices 1–5 | One traceable record supports an informed architecture decision.                                          | Full affected suite and final preview scenario.                                                                 | Keep milestone open and run a bounded follow-up spike.                                                 |

## Automated and manual tests

Exact package-script names will be recorded after scaffold approval. The planned verification surface is:

| Area          | Automated verification                                                                                                  | Manual/preview scenario                                                                                                | Expected result and retained evidence                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Quality       | Format, lint, strict type check, unit, integration, Playwright, axe, migration tests.                                   | Open the authenticated shell in current Chrome and Safari.                                                             | All commands exit zero; CI run and deploy identifiers recorded.                                                                    |
| Auth/RLS      | Policy matrix for every table and role, including non-member and unauthenticated denial.                                | Sign in, sign out, expire session, and attempt a protected route.                                                      | Only permitted rows/actions succeed; test report and privacy-safe denial logs retained.                                            |
| Collaboration | Permute, duplicate, delay, and reconnect Yjs updates; compare deterministic state hashes.                               | Two authenticated browser contexts edit simultaneously, disconnect one, continue editing, reconnect, and reload both.  | Final state hashes match with zero lost committed edits; video or screenshots plus logs retained.                                  |
| Persistence   | Snapshot/update overlap and connection-race integration tests.                                                          | Open a fresh third client during active edits.                                                                         | It loads the latest snapshot plus every subsequent update without a gap; sequence trace retained.                                  |
| Compaction    | Reconstruct before/after compaction and compare state vectors/hashes; retry the job.                                    | Trigger preview compaction, then reload a fresh client.                                                                | State is unchanged, retry is idempotent, and only covered updates are pruned; metrics retained.                                    |
| Canvas        | Geometry, transform, connector-anchor, culling, and fixture tests.                                                      | Pan, zoom, select, move, and resize on the approved target with 1,000 visible mixed objects.                           | Connectors remain attached and interaction meets the approved spike threshold; trace and hardware/browser details retained.        |
| Rich document | Lexical/Yjs convergence and parent/child ownership tests.                                                               | Focus and edit a document while another browser updates it; add/move an internal object; exit focus and reload.        | Text converges, internal objects remain isolated, and content reloads; screenshots and hashes retained.                            |
| AI            | Projection bound, Zod tool validation, authorization, malformed call, oversized context, and prompt-injection fixtures. | Ask AI for one permitted spike mutation and one disallowed mutation.                                                   | Only validated, authorized commands execute and OpenAI has no database authority; request ID and redacted command record retained. |
| Voice         | Credential-route auth/expiry tests and browser secret-bundle scan.                                                      | From authenticated Netlify preview, obtain an ephemeral credential and establish, end, and reconnect a WebRTC session. | Live session connects without the long-lived key appearing in browser or logs; deploy ID and connection metrics retained.          |
| Reversal      | Field-aware before/after and conflict tests.                                                                            | Apply an AI label change, make an unrelated human position change, then discard the AI change.                         | Prior label is restored immediately while the later position remains; state diff retained.                                         |

The final preview walkthrough uses non-production identities and data. No test may be described as passing until its command or scenario has actually run.

## Risks and assumptions

| Risk or assumption                                                                             | Likelihood / impact | Mitigation or experiment                                                                                                                                                   | Owner                         | Status                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Broadcast can reorder or duplicate messages and is not durable storage.               | Expected / high     | Use Yjs idempotency plus durable sequenced updates and automate permutation/reconnect cases.                                                                               | Engineering                   | Planned.                                                                                                                                      |
| A snapshot/subscription race could lose edits.                                                 | Medium / critical   | Subscribe with an overlap-safe boundary, fetch subsequent sequences, deduplicate, and test a new client during active editing.                                             | Engineering                   | Planned.                                                                                                                                      |
| Unsafe compaction could prune needed updates.                                                  | Medium / critical   | Lock per canvas, verify reconstructed state, publish transactionally, retain last verified snapshot, and prune only its covered range.                                     | Engineering                   | Planned.                                                                                                                                      |
| Konva with 1,000 visible mixed objects may miss the approved interaction budget.               | Medium / high       | Measure early, separate static/interactive layers, limit redraws, and use `rbush` for viewport/selection queries.                                                          | Engineering and product owner | Spike target approved 2026-08-10.                                                                                                             |
| Lexical focus and Konva transforms may compete for keyboard/pointer ownership.                 | Medium / medium     | Use an explicit focus state and input-routing boundary; test entry, editing, exit, and collaboration.                                                                      | Engineering                   | Planned.                                                                                                                                      |
| AI output could bypass permissions or corrupt shared state.                                    | Medium / critical   | No direct DB authority; validate Zod tools and re-check membership through the shared command boundary.                                                                    | Engineering                   | Planned.                                                                                                                                      |
| Field-aware reversal may encounter a later human edit to the same field.                       | Medium / high       | Never overwrite silently; prove unrelated-field preservation and return an explicit conflict for same-field divergence.                                                    | Product owner and engineering | Conflict behavior must be validated at final architecture review.                                                                             |
| Netlify preview, Supabase, or OpenAI credentials/projects may not yet exist.                   | Medium / high       | Inventory configuration before each dependent slice; create only approved non-production resources and keep secrets out of Git/evidence.                                   | Product owner and engineering | Netlify verified; Supabase CLI is not authenticated and no remote Supabase project has been linked, so Auth and preview evidence remain open. |
| Local Docker Desktop leaves Supabase service containers in `Created` instead of starting them. | Confirmed / medium  | Retain standard Supabase CLI scripts for CI/Linux; use the healthy local database for migration and pgTAP evidence while the Auth stack remains unverified locally.        | Engineering                   | Open local-tooling limitation; direct clean migration/seed replay and database tests pass, but local Auth E2E has not run.                    |
| The repository was private on a GitHub plan that did not expose branch protection.             | Confirmed / high    | Product owner selected public visibility; protect `main` with pull requests, strict required checks, and administrator enforcement.                                        | Product owner and engineering | Resolved 2026-08-10; GitHub readback confirms the required `quality` check and protected `main`.                                              |
| The master implementation plan itself is marked `Draft for review`.                            | High / high         | Milestone 0 and its listed decisions are approved, but any architecture change outside that documented scope still requires an explicit master-plan revision and approval. | Product owner                 | Milestone 0 scope approved 2026-08-10; broader ledger approval remains separate.                                                              |

## Exit criteria

- [ ] Every Milestone 0 build-checklist item is implemented and linked to evidence.
- [ ] Every required technical spike records setup, fixture, command or scenario, expected result, actual result, measurements, limitations, and preview deploy identifier.
- [ ] Collaboration converges after reordered, repeated, simultaneous, and temporarily disconnected updates in the documented two-browser preview scenario.
- [ ] A fresh client loads a snapshot plus subsequent updates without losing edits made during connection.
- [ ] Compaction produces an equivalent document, is retry-safe, and prunes only verified covered updates.
- [ ] Pan, zoom, select, move, resize, connector anchoring, and 1,000 visible mixed objects meet the approved spike target on documented hardware and browser.
- [ ] A collaborative Lexical document works in focused canvas interaction and keeps internal visual objects isolated.
- [ ] The Responses API receives only a bounded structured projection and returns validated commands without direct database authority.
- [ ] Authenticated browser-to-OpenAI WebRTC works through an ephemeral credential on Netlify preview, with no long-lived key in the browser, logs, fixtures, or Git.
- [ ] Discarding an AI change restores its prior value without reverting a later unrelated human edit.
- [ ] RLS policy tests prove the documented allowed and denied operations for owners, editors, commenters, viewers, non-members, and unauthenticated users.
- [ ] The authenticated Netlify preview walkthrough passes, and local-only results are not represented as preview evidence.
- [ ] The product owner approves the final collaboration, persistence, rich-text, AI, and voice architecture.
- [ ] The exact master-plan exit gate is satisfied: “Record spike results and approve the final collaboration, persistence, rich-text, AI, and voice architecture before feature milestones begin.”

## Explicitly excluded work

- Milestone 1's complete canvas object creation/styling experience, multiplayer product UI, autosave UX, undo/redo experience, and `FR-001` through `FR-007` completion.
- Production-ready comments and structured feedback from Milestone 2.
- The primary AI collaborator product experience, full semantic interpretation, typed conversation, and adjustable authority from Milestone 3.
- The full review workflow and guided review story from Milestone 4; this milestone proves only reversal feasibility.
- Production annotation, first-class document, guided story, live-conversation, and template experiences from Milestones 5 through 9.
- Human-to-human voice transport selection and implementation (`PD-001` and `FR-010`).
- Deliberate offline editing (`PD-009`), export/portability (`PD-010`), launch hardening, production data, domain configuration, and public release.
- Every item listed under **Explicitly deferred** in the master plan.

## Implementation record

Implementation authorized on 2026-08-10; no pull request is authorized.

Slice 1 established Next.js 16.3.0, React 19.2.8, TypeScript 5.9.3, Tailwind CSS 4.3.3, shadcn/ui, the approved runtime libraries, and exact dependency versions in `pnpm-lock.yaml`. It added a minimal foundation shell, Zod environment boundaries, Prettier, ESLint, Vitest/Testing Library, Playwright/axe, GitHub Actions, and `netlify.toml` with distinct local, deploy-preview, branch-deploy, and production contexts. The Netlify CLI is authenticated and the local checkout is linked to the `thinking-canvas` site; the Netlify GitHub app has access only to `jewilhel/Thinking-Canvas`.

The foundation was delivered directly to `main` in commits `c8741d8`, `2c5fa4d`, and `f8c521e`; no pull request was created. The first production artifact exposed a packaging defect: Netlify uploaded raw `.next` internals without its Next.js adapter, so the provider reported a ready deploy while `/` returned 404. Commit `f8c521e` made `@netlify/plugin-nextjs` 5.15.13 explicit. The replacement production deploy and a separate deploy-preview context both rendered the expected shell in the signed-in browser. The Netlify project remains private, consistent with the Milestone 0 exclusion of public launch.

The production dependency license inventory contains MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, BlueOak-1.0.0, Python-2.0, CC-BY-4.0, and one LGPL-3.0-or-later transitive binary package (`@img/sharp-libvips-darwin-arm64`). No license was treated as final release approval; the master plan's production-release review remains required.

Slice 2 work began on `codex/milestone-0-slice-2`. It added local Supabase configuration and CI database commands; server/browser Supabase clients; cookie-refresh proxy handling; protected `/app` and `/spikes` routes; sign-in and sign-out server actions; the initial 17-table migration with indexes, constraints, triggers, grants, and RLS; deterministic synthetic seed data; generated database types; a 96-assertion role-policy matrix; strict versioned shared-object schemas; and one permission-aware human/AI command boundary that emits reversible undo, audit, and collaboration metadata.

The migration and seed were replayed against a clean local application schema, and the role-policy matrix passes against the resulting database. Application checks pass. The two Auth checklist items remain open because Docker Desktop has not started the complete local Supabase Auth stack and the Supabase CLI has no authenticated remote project. No sign-in, sign-out, expired-session, authenticated Netlify preview, or remote database claim is recorded as passing.

## Verification evidence

| Date       | Environment            | Command or scenario                                                                      | Result                                                                                                                                                                                                                                              | Evidence                              | Requirements covered                     |
| ---------- | ---------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| 2026-08-10 | Local repository       | Repository inventory and Git status before planning                                      | Pass: private GitHub repository on `main`; no application, migrations, tests, deployment configuration, or earlier milestone documents found; worktree was clean before this document was added. External service configuration remains unverified. | Planning inspection                   | Milestone selection and baseline only    |
| 2026-08-10 | GitHub API             | Read `main` branch protection for `jewilhel/Thinking-Canvas`                             | Blocked: HTTP 403 states GitHub Pro is required for protection on this private repository, or the repository must be public.                                                                                                                        | CLI response captured during planning | Milestone 0 protected-`main` build item  |
| 2026-08-10 | GitHub API             | Verify repository visibility and read `main` protection after the product-owner decision | Pass: repository visibility is `PUBLIC`; `main` enforces pull requests, strict required `quality` checks, stale-review dismissal, and administrator enforcement.                                                                                    | GitHub CLI readback                   | Milestone 0 protected-`main` build item  |
| 2026-08-10 | Local repository       | `pnpm check`                                                                             | Pass: Prettier, ESLint with zero warnings, strict TypeScript, four Vitest tests, and the Next.js production build completed successfully.                                                                                                           | Local command output                  | Slice 1 project shell and quality gates  |
| 2026-08-10 | Local Chromium         | `pnpm test:e2e`                                                                          | Pass: the foundation shell rendered and axe reported zero detectable accessibility violations.                                                                                                                                                      | Playwright command output             | Slice 1 end-to-end and accessibility     |
| 2026-08-10 | Local repository       | `pnpm licenses list --prod --json`                                                       | Pass for initialization inventory: ten declared license identifiers recorded; the LGPL transitive `sharp-libvips` binary is retained for the required production-release review.                                                                    | pnpm license inventory                | Slice 1 dependency review                |
| 2026-08-10 | Netlify API            | Link local checkout and configure `thinking-canvas` for `jewilhel/Thinking-Canvas`       | Partial: site ID `f9d33c05-2c29-4b38-8b39-d7e1c39bee72` is linked and repository build settings target `main`; deployment and context evidence require the foundation commit on GitHub.                                                             | Netlify CLI/API readback              | Slice 1 delivery setup                   |
| 2026-08-10 | GitHub Actions         | CI run `31456156129` for commit `f8c521e`                                                | Pass: the `quality` job completed formatting, lint, strict type checking, four unit tests, production build, Playwright end-to-end testing, and axe accessibility testing.                                                                          | GitHub Actions run                    | Slice 1 CI and required-test gate        |
| 2026-08-10 | Netlify production     | Deploy `6a7a99edb39a9f0008f58f0b` for commit `f8c521e`                                   | Pass: adapter-backed production deploy reached `ready`; the signed-in browser loaded `/` with title `Thinking Canvas` and the expected Milestone 0 foundation regions.                                                                              | Netlify API and browser walkthrough   | Slice 1 production deployment            |
| 2026-08-10 | Netlify deploy preview | Deploy `6a7a9a528ecabd1970640145`                                                        | Pass: the distinct `deploy-preview` context reached `ready`; the signed-in browser loaded its permalink with title `Thinking Canvas` and the same expected foundation regions.                                                                      | Netlify API and browser walkthrough   | Slice 1 preview deployment               |
| 2026-08-10 | Local PostgreSQL       | Clean application-schema migration and deterministic synthetic seed replay               | Pass: the forward migration recreated all 17 user-owned tables, constraints, indexes, triggers, grants, and RLS policies; the synthetic five-role fixture loaded successfully.                                                                      | Direct local PostgreSQL output        | Slice 2 schema, RLS, and seed            |
| 2026-08-10 | Local PostgreSQL       | `rls_policy_matrix.test.sql`                                                             | Pass: all 96 pgTAP assertions passed across every user-owned table and the owner, editor, commenter, viewer, non-member, former-member, and unauthenticated cases.                                                                                  | Direct local PostgreSQL output        | Slice 2 role-policy matrix               |
| 2026-08-10 | Local repository       | `pnpm check` after Slice 2 schema and command work                                       | Pass: Prettier, ESLint with zero warnings, strict TypeScript, 20 Vitest tests, and the Next.js production build completed successfully.                                                                                                             | Local command output                  | Slice 2 schemas and command boundary     |
| 2026-08-10 | Local Chromium         | `pnpm test:e2e` after Slice 2 route work                                                 | Pass for the unauthenticated foundation smoke only: one Chromium test passed with zero detectable axe violations. Auth flows remain unverified and open.                                                                                            | Playwright command output             | Regression evidence; not Auth acceptance |

## Change record

| Date       | Change or decision                                                                                 | Rationale                                                                                                                           | Impact                                                                                                                                                     | Approved by   |
| ---------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 2026-08-10 | Created the first detailed milestone plan for Milestone 0.                                         | No milestone implementation has begun, so the master ledger and skill workflow identify Milestone 0 as the required starting point. | Defines proposed scope and approval gates; does not authorize implementation until approved.                                                               | Pending       |
| 2026-08-10 | Use a public GitHub repository.                                                                    | Public visibility makes branch protection available on the current GitHub plan while preserving the master-plan requirement.        | The repository is now public; protected `main` can be configured during Slice 1 after required CI check names are established.                             | Product owner |
| 2026-08-10 | Approved the Milestone 0 plan, OpenAI Realtime architecture, and spike performance baseline.       | The product owner approved all required decisions after reviewing the milestone plan.                                               | Status changed to `Approved for implementation`; Slices 1–6 are authorized, while final architecture approval remains the evidence-based closure decision. | Product owner |
| 2026-08-10 | Made the Netlify Next.js adapter explicit after the first ready deploy returned 404.               | The first artifact contained raw `.next` output and no adapter-created routing or function layer.                                   | Commit `f8c521e` produced verified production and deploy-preview shells; the project remains private and no public launch occurred.                        | Engineering   |
| 2026-08-10 | Began Slice 2 on a protected-main feature branch and implemented its database/schema/command core. | These boundaries must exist before collaboration persistence can safely begin.                                                      | Four of six Slice 2 checklist items now have local automated evidence; Auth session and authenticated-preview evidence remain open.                        | Engineering   |

## Closure

Closure status: Not ready
Closure approval: Pending
Closed on: —
