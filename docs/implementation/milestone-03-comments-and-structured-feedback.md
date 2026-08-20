# Milestone 3 — Comments and structured feedback

Status: Approved for implementation  
Master plan: [`thinking-canvas-implementation-plan.md`](../../thinking-canvas-implementation-plan.md)  
Plan owner: Product owner  
Last updated: 2026-08-19

## Goal and user-visible outcome

Turn the Milestone 2 Comments placeholder into durable, contextual feedback without changing the proven canvas-object, Yjs, or collaboration boundaries.

When this milestone is complete, an authenticated participant with feedback permission can attach a comment to one canvas object or one selected group, follow the target as objects move, read the complete thread in context or in the existing shared panel, reply in deterministic order, and optionally add one supported structured response control. A recipient can answer a yes/no, approve/revise/discard, or bounded numeric-rating prompt without typing. Authorized participants can resolve or dismiss a thread without deleting its history, while the comment author or canvas owner can separately choose permanent thread deletion after explicit confirmation. Each user can hide comment bubbles and the temporary annotation overlay without changing canvas content or stored feedback.

Two authenticated browser sessions see the same persisted thread and response after reload. A deterministic preview/test AI actor can create a structured prompt through the same validated command boundary used by a human, while real OpenAI reasoning and the Milestone 4 AI product remain excluded.

## Design references

Visual and interaction direction: [FigJam comment interaction references](../design-references/figjam-comments-2026-08-19/README.md), supplied by the product owner on 2026-08-19.

The five retained screenshots establish a contextual progression from target-adjacent composer, to compact participant marker, to open thread, to expanded reply composer, to a chronological exchange with the composer returned to its compact state. Milestone 3 should preserve the visible relationship among target, marker, and thread; keep inactive comments lightweight; progressively disclose authoring controls; and give author identity, time, lifecycle actions, thread history, and submission a clear hierarchy.

These references guide interaction principles rather than pixel-for-pixel reproduction. Thinking Canvas retains its own tokens, typography, iconography, accessibility behavior, and branding. Profile images are optional with initials as the required fallback. Emoji, mentions, image attachments, reactions, and notifications visible in FigJam remain outside this milestone.

## Requirements covered

This plan covers these exact Milestone 3 requirements from the master ledger:

- **FR-023 — Anchored comments.** A participant can attach a comment to one object or a selected group, and the target survives movement and reload.
- **FR-024 — Threaded replies.** Participants can reply to a comment and see replies in deterministic chronological order.
- **FR-025 — Complete history.** Selecting a comment exposes its entire exchange in-context and through an optional side panel.
- **FR-026 — Structured prompt creation.** A comment author can add exactly one supported structured response control.
- **FR-027 — Initial controls.** Yes/no, approve/revise/discard, and bounded numeric rating prompts render, validate, and persist responses.
- **FR-028 — Human and AI prompt authors.** Both participant types can create structured prompts through the same permission-aware domain command.
- **FR-029 — Dismiss and resolve.** An authorized participant can dismiss or resolve a temporary comment without deleting its history.
- **FR-029a — Permanent comment deletion.** A comment author or canvas owner can permanently delete an entire comment thread after explicit irreversible-action confirmation; other participants cannot delete it.
- **FR-030 — Hide comments.** Comment bubbles and the annotation overlay can be hidden without altering underlying canvas objects or deleting comments.
- **Exit gate:** “Complete the sourced **Comment prompt** acceptance scenario with two authenticated browser sessions and persisted thread history.”
- **AS-003 — Comment prompt.** A collaborator attaches a yes/no prompt, the recipient answers without typing, and the response appears in the thread.

The milestone also preserves the closed Milestone 1 and Milestone 2 canvas, collaboration, persistence, responsive, and accessibility behavior. Evidence created here does not complete Milestone 4 AI behavior, Milestone 6 vector annotations, or any later acceptance scenario.

## Decisions required

| Decision                     | Owner         | Options and consequences                                                                                                                                                                                                                                                                                                                                                                                                                     | Required timing                                                    | Status                                                                                 |
| ---------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **PD-004 — Rating scale**    | Product owner | **Recommended:** use one fixed inclusive `1–5` scale in the first version. This is bounded, easy to understand, and keeps response comparison and accessibility copy consistent. **Alternative:** let the author select from approved scales such as `1–3`, `1–5`, or `1–10`; this adds authoring, validation, display, and test states.                                                                                                     | Before Slice 1 changes the prompt validation contract.             | Approved 2026-08-19: fixed inclusive `1–5`; authors do not choose a range.             |
| Comment status authority     | Product owner | **Recommended:** owners and editors may resolve any open comment; commenters may resolve only comments they authored; the author or canvas owner may dismiss a comment; viewers remain read-only. **Alternative:** restrict both actions to the author, or allow every feedback-capable member to transition every thread, each with different moderation consequences. Status changes remain global and history-preserving.                 | Before Slice 1 replaces the current status policies.               | Approved 2026-08-19: use the recommended transition matrix.                            |
| Permanent deletion authority | Product owner | **Approved adjustment:** the comment author or canvas owner may permanently delete the complete thread after an explicit irreversible-action confirmation. Editors and other participants cannot delete another author's thread. Resolve and dismiss remain the non-destructive choices.                                                                                                                                                     | Before exposing a delete mutation.                                 | Approved 2026-08-19 by product-owner request.                                          |
| AI prompt provenance         | Product owner | **Recommended:** retain the authenticated human requester as the accountable database principal and add a separate logical author kind/key so a prompt can be visibly and auditably identified as human or AI. A deterministic AI control is available only in local/test/preview environments; real OpenAI generation remains Milestone 4. **Alternative:** defer `FR-028`, which would leave Milestone 3 and its exit criteria incomplete. | Before Slice 1 finalizes the comment command and schema migration. | Approved 2026-08-19: use separate accountable principal and logical author provenance. |

The product owner approved the plan and all three recommended decisions on 2026-08-19. The selected `PD-004` outcome is recorded in the master plan.

## Technical approach

### Route, client, and state boundaries

- Keep `/app/canvases/[canvasId]` as the authenticated Server Component and preserve its non-disclosing authorization behavior. Read the installed Next.js 16.3 data-security, mutation, Server/Client Component, and Route Handler guidance immediately before implementation.
- Keep comments, targets, replies, prompts, responses, and status in Supabase PostgreSQL as relational records. Do not place durable feedback in Yjs, canvas updates, snapshots, Zustand, or browser-only storage.
- Keep comment-bubble placement as a derived view of relational target IDs plus the current Yjs object geometry. Object movement changes only canvas state; it does not rewrite comment targets.
- Keep “comments visible” as per-user, per-canvas ephemeral UI state. Hiding comments affects bubbles and the temporary overlay presentation only and emits no domain command or relational mutation.
- Load a typed comment projection for the authorized canvas, then refresh it after durable mutations, reconnect, window focus, and low-frequency comment invalidation events. PostgreSQL remains authoritative when a realtime event is missed or repeated.

### Permission-aware comment command boundary

- Add strict Zod schemas and one comment command executor for `comment.create`, `comment.reply`, `comment.respond`, `comment.status`, and `comment.delete`. Human and AI prompt creation use the same `comment.create` shape, target validation, permission result, persistence path, and audit metadata; only logical actor provenance differs.
- Separate the authenticated authorization principal from the logical author, following the boundary already proven for simulated AI canvas commands. Human commands use the same identity for both. Preview/test AI commands use the authenticated owner or editor as requester and the stable logical actor `primary-ai`.
- Re-authenticate and re-check current canvas membership at execution time. Owner, editor, and commenter roles may create human comments, replies, prompts, and responses; viewers and non-members cannot mutate feedback. The AI path requires an authenticated owner or editor and is unavailable in normal production presentation until Milestone 4 authorizes it.
- Validate the current Yjs document projection before creating a target: one target object must exist, or every member of one selected group must exist and still share the same group ID. Arbitrary ungrouped multiselection is not silently treated as a group.
- Execute comment creation, target creation, optional prompt creation, and actor provenance as one transaction so a partial thread cannot be stored. Reply, response, status, and permanent thread deletion commands are individually atomic.
- Assign client-generated command IDs and make mutation RPCs idempotent so a retry after an ambiguous response cannot duplicate a thread, reply, or response.

### Anchors, bubbles, panel, and thread history

- Replace the Milestone 2 placeholder with two coordinated surfaces: a contextual target-adjacent composer/thread card for in-canvas work and the existing shared panel host for the optional complete-history view. Both use the same selected-thread state and durable projection.
- Enter comment placement from the existing Comments dock control or an applicable object action. Require exactly one selected object or one selected group before enabling submission; keep the selection visible while composing. Open the composer near the target when viewport space permits, clamp it safely, and fall back to the shared panel at constrained desktop/tablet sizes.
- Store one `comment_targets` row for a single object and the complete stable object-ID set for a group. Compute a single bubble anchor from the current visible bounding box of those IDs, so movement and resize are reflected without target writes.
- After submission or dismissal of the open card, collapse the thread to a compact participant marker at the target edge. Use a profile image when available and an accessible initials fallback otherwise; identity and state must not rely on the image or color alone.
- If a target object is later deleted, preserve the thread and show an explicit “target no longer available” state in the panel. Do not cascade comment history from Yjs object deletion and do not recreate the object.
- Order root comments and replies by server `created_at`, then stable UUID as a deterministic tie-breaker. Never rely on client arrival order.
- Selecting a marker opens the full thread in context; the optional shared panel exposes the same complete history and can focus or frame its available target without changing durable canvas content.
- Keep lifecycle overflow, resolve/dismiss, permanent delete, close, and submit actions visually and semantically distinct. Permanent delete requires confirmation that the complete thread will be removed and cannot be undone. Show author identity, relative time, body, replies, and status in a scan-friendly hierarchy while preserving exact timestamps in accessible detail.
- Keep the reply input compact until focused, expand it without replacing the existing exchange, and return it to a compact ready state after successful submission while leaving the new reply visible.

### Structured prompts and responses

- A root comment may contain no prompt or exactly one `yes_no`, `review`, or `rating` prompt. Replies do not create additional prompts in this milestone.
- Render yes/no and approve/revise/discard as labeled button groups. Render the approved bounded rating as labeled radio-style choices. Keyboard, screen-reader, touch, focus, disabled, pending, error, and selected states must not rely on color alone.
- Validate prompt configuration and response values in Zod and again in PostgreSQL. Reject extra JSON keys, wrong scalar types, unsupported labels, and out-of-range ratings.
- Keep one response per prompt and responder. A responder may change their answer while the thread is open; the update retains the original creation time, records a new update time, and appears in the thread. Resolved or dismissed threads are read-only.
- Label preview/test AI-authored prompts distinctly from human-authored prompts and retain the requesting human principal in audit data. Do not call OpenAI or imply that the primary AI product is enabled.

### Realtime, failure behavior, and observability

- Reuse the private `canvas:{canvasId}` Supabase channel for a low-frequency `comments-invalidated` Broadcast after a durable mutation. Expand Broadcast write policy only to the feedback-capable role required by the approved role matrix; keep viewers read-only and keep all comment content out of Broadcast payloads.
- Treat invalidation as a refresh hint, not durability. On reconnect or a sequence gap, fetch the relational projection and deterministically replace the local comment cache.
- Keep the last valid canvas and last valid comment projection visible during retryable failures. Disable only the affected submit action while it is pending; expose a clear retry without clearing the draft.
- Record privacy-safe development/test telemetry for command kind, status, duration, result, and affected record IDs. Do not log comment bodies, response content, secrets, or user tokens.
- Deploy approved slices only to authenticated non-production Netlify previews using non-production Supabase data. Production release, domain changes, and public data remain outside this milestone.

## Database and security changes

Create one forward-safe additive migration after the decisions above are approved:

- Add logical author provenance to `comments` while retaining the authenticated human principal for accountability and membership checks. Backfill existing comments as human-authored without changing their visible author.
- Add client command IDs and unique canvas-scoped constraints needed for idempotent root-comment, reply, and response writes.
- Add or revise indexes for canvas/status ordering, deterministic thread reads, target lookup, prompt lookup, and responder lookup.
- Add transactional functions for root comment plus targets plus optional prompt, reply creation, response upsert, allowed status transitions, and authorized permanent thread deletion. Give each function a fixed search path, strict argument validation, explicit membership checks, and least-privilege grants.
- Enforce exactly one valid target object or one valid grouped target set at the application command boundary; the database stores stable IDs because canvas objects live in Yjs and cannot be protected by a relational foreign key.
- Add database-side response validation against the referenced prompt kind and approved rating bounds. Reject responses to resolved or dismissed comments.
- Replace broad comment-table mutation grants where necessary so clients cannot bypass the transactional functions, author provenance rules, idempotency, or status-transition matrix.
- Update private Realtime Broadcast policy only as needed for feedback invalidation. Content remains available solely through RLS-protected relational reads.
- Regenerate `src/lib/supabase/database.types.ts` from a clean migrated local database.
- Extend pgTAP coverage for owner, editor, commenter, viewer, non-member, unauthenticated, removed-member, human/AI provenance, target isolation, exact retry, collision, response shape/range, one-response-per-user, status transition, history preservation, authorized deletion with cascades, denied deletion, and cross-canvas denial cases.

If trusted server persistence for the preview/test AI actor requires a Supabase service-role credential, keep it server-only in local and Netlify preview scopes, validate requester membership immediately before each write, add bundle/secret-scan evidence, and do not expose the deterministic AI control in production. If this cannot be done without weakening provenance or authorization, stop Slice 1 and return the decision to the product owner rather than simulating a pass.

Rollback or compensation: disable comment mutation entry points while retaining RLS-protected reads; revert application presentation independently; use an additive compensating migration to restore prior grants/functions. Do not delete stored threads or rewrite canvas Yjs data as rollback behavior.

## Ordered task checklist

### Slice 1 — Decisions, command contract, schema, and security

- [x] Obtain explicit approval for `PD-004`, comment status authority, and AI prompt provenance; update the master ledger with the approved `PD-004` decision before implementation.
- [x] Read the installed Next.js 16.3 guidance for every affected data-fetching, mutation, Route Handler, and Server/Client boundary.
- [x] Define strict comment, target, reply, prompt, response, actor, and command schemas plus deterministic projection/order helpers.
- [x] Implement the forward-safe migration, transactional/idempotent mutation functions, response validation, status transitions, least-privilege grants, indexes, and approved Realtime policy change.
- [x] Regenerate database types and update synthetic local fixtures without adding secrets or production data.
- [x] Add command/domain tests plus the complete comment-specific pgTAP role and mutation matrix.

### Slice 2 — Anchored comment creation and durable panel

- [x] Replace the Comments placeholder with coordinated target-adjacent composer/thread-card and shared-panel loading, empty, list, selected-thread, failure, and retry states.
- [x] Add single-object and selected-group comment placement from the dock.
- [x] Persist the root comment and stable target IDs atomically, then render a bubble from current object/group geometry.
- [x] Implement the reference-informed compact participant marker, viewport-safe contextual card, clear author/time/action hierarchy, and initials fallback.
- [x] Keep bubbles attached through object movement, resize, collaborator sync, and reload without rewriting target rows.
- [x] Preserve history and show a target-unavailable state after object deletion.
- [x] Add unit, database, Chromium, accessibility, and two-context coverage for authorization, target validation, placement, movement, reload, and deletion behavior.

### Slice 3 — Replies, complete history, status, and hide behavior

- [x] Add reply creation and deterministic `(created_at, id)` thread ordering.
- [x] Make bubble selection and panel selection expose the complete exchange and select every available target.
- [x] Implement compact-to-expanded reply composition on focus and return to the compact ready state after submission without hiding the existing exchange.
- [x] Implement the approved resolve and dismiss transitions without destructive deletion and make closed threads read-only.
- [x] Add open/resolved/dismissed history access without presenting dismissed records as deleted.
- [x] Add confirmed permanent thread deletion for the author or canvas owner, including cascade and denied-role coverage.
- [x] Add the per-user hide/show control for comment bubbles and the temporary annotation overlay without any canvas or comment mutation.
- [x] Add refresh recovery, idempotency/status-conflict, keyboard, focus, tablet, and accessibility coverage.

### Slice 4 — Structured prompts, responses, and AI author parity

- [x] Add authoring for no prompt or exactly one yes/no, approve/revise/discard, or approved bounded rating control.
- [x] Render and persist validated responses without typing, including one response per user and allowed answer changes while open.
- [x] Reject malformed, extra-key, wrong-kind, out-of-range, cross-canvas, unauthorized, and closed-thread responses in TypeScript and PostgreSQL tests.
- [x] Add the preview/test-only deterministic AI prompt path through the same comment command executor and persistence functions used by humans, with distinct visible provenance and an accountable requesting principal.
- [x] Keep the deterministic AI control behind local/preview presentation flags and make no OpenAI request.
- [ ] Complete automated and hosted two-browser coverage for human and AI prompt authors, every control type, reload, and response convergence.

### Slice 5 — Regression, preview evidence, and closure review

- [x] Run formatting, lint, strict types, units, clean database reset, complete pgTAP, production build, full Chromium end-to-end, and axe checks locally.
- [ ] Run the protected GitHub `quality` check on the exact reviewed commit.
- [x] Produce an immutable commit-addressable Netlify draft deploy and confirm preview context plus the local secret-pattern scan.
- [ ] Complete `AS-003` with two distinct authenticated browser sessions: one collaborator attaches a yes/no prompt, the recipient answers without typing, both sessions show the response, and reload preserves the complete thread and target.
- [ ] Exercise movement, group targeting, replies, every structured control, resolve, dismiss, hide/show, reconnect, removed membership, and preview/test AI provenance on the same preview.
- [ ] Record requirement-by-requirement evidence, defects, fixes, reruns, browser identities/roles, deploy ID, commit, CI run, screenshots/logs, and known limitations.
- [ ] Mark this document `Verification complete — awaiting closure approval` only after every exit criterion passes, then request separate product-owner closure approval.

## Pull-request slices

Pull requests improve reviewability, but neither this draft nor later plan approval authorizes creating one. Open a pull request only after the product owner explicitly requests or approves it.

| Slice                             | Depends on                                | Demoable outcome                                                                                                                   | Tests                                                                                                              | Safe rollback or compensating path                                                                |
| --------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 1. Comment data and command core  | Approved decisions and closed Milestone 2 | Authorized human and preview/test AI commands produce validated, atomic, RLS-protected comment records with visible provenance.    | Zod/command/repository units, migration reset, pgTAP role/mutation matrix, type generation, `pnpm check`.          | Disable mutation routes; preserve protected reads; ship an additive grants/function compensation. |
| 2. Anchored comments              | Slice 1                                   | A participant attaches a comment to one object or group and its bubble follows current geometry through peer movement and reload.  | Target/geometry units, authorization/RLS, object/group/delete E2E, two-context sync, axe.                          | Hide placement controls and bubbles; retained comment records remain readable in the panel.       |
| 3. Thread lifecycle               | Slice 2                                   | Participants reply, read complete ordered history, resolve/dismiss under the approved matrix, and hide presentation locally.       | Ordering/idempotency/status tests, reconnect/refetch, keyboard/tablet/focus/axe, full regression.                  | Disable affected mutations; keep history read-only and restore the prior panel presentation.      |
| 4. Structured feedback            | Slices 1–3                                | Human and preview/test AI authors create one supported prompt; recipients answer every control with validated durable convergence. | Prompt/response units and pgTAP, malformed/cross-canvas cases, two-browser E2E, production-presentation exclusion. | Disable prompt authoring while retaining existing plain comments and readable stored prompts.     |
| 5. Evidence and closure readiness | Slices 1–4                                | One exact CI-tested preview satisfies FR-023 through FR-030 and `AS-003`.                                                          | Full local suite, protected CI, immutable preview, authenticated scenario matrix.                                  | Keep the milestone open and ledger boxes unchecked; fix only within approved scope.               |

## Automated and manual tests

### Required automated commands

Run and record the exact commit, environment, result, and artifact for:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm db:reset`
- `pnpm db:test`; use the documented direct PostgreSQL pgTAP fallback only if the macOS Supabase wrapper mount failure recurs
- `pnpm build`
- focused comment Playwright scenarios
- `pnpm test:e2e`
- `pnpm check`
- the protected GitHub `quality` workflow on the final reviewed commit

### Required verification matrix

| Area                            | Fixtures and identities                                                                            | Expected result and retained evidence                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema and commands             | Every command kind; valid and malformed actor, target, prompt, response, and status payloads       | Strict parsing rejects unknown keys; all durable mutations use the comment executor and idempotent transaction path.                                 |
| Roles and RLS                   | Owner, editor, commenter, viewer, non-member, unauthenticated, removed member                      | Reads and mutations match the approved matrix immediately; cross-canvas and removed-member access fail without leaking content.                      |
| Anchoring                       | Rectangle, text, connector, table, one grouped selection, deleted target                           | Stable IDs survive move/resize/reload; group bubble follows the current aggregate bounds; deleted targets retain history with an unavailable state.  |
| Thread history                  | Concurrent root/reply creation, identical server timestamps, retry after ambiguous response        | `(created_at, id)` order is deterministic; exact retries do not duplicate records; the complete exchange is visible in context and panel.            |
| Structured controls             | Yes/no, approve/revise/discard, approved rating bounds, malformed JSON                             | Controls are operable without typing; only the exact valid shape persists; one responder row updates safely while open.                              |
| Human and AI authors            | Human commenter; preview/test AI requested by owner/editor                                         | Both use the same command contract and permission result; AI provenance is distinct and accountable; production shows no simulated control.          |
| Lifecycle and hiding            | Approved status actors, unauthorized actor, two conflicting transitions, local hide/show           | Resolve/dismiss preserves rows and makes history read-only; hiding changes no Yjs, relational, snapshot, or canvas-history data.                     |
| Realtime and recovery           | Two browser contexts, missed/repeated invalidation, reconnect, reload                              | Durable relational state wins; both sessions converge after refetch; no comment body is placed in Broadcast payloads.                                |
| Reference-informed interaction  | Composer, compact marker, open thread, focused reply editor, submitted reply at desktop and tablet | The sequence preserves target context and progressive disclosure, remains original to Thinking Canvas, and does not expose excluded FigJam controls. |
| Accessibility and responsive UI | Keyboard-only, screen reader semantics, desktop `1440 × 900`, tablet `1024 × 768` and `768 × 1024` | Every action is named and operable, focus is restored, status is announced, touch targets remain usable, and axe finds no detectable violations.     |
| Canvas regression               | Existing object/action, styling, connector, grouping/history, reconnect, multiplayer suites        | Comment overlays and panel behavior do not intercept gestures, mutate Yjs, lose canvas data, or regress closed Milestones 1–2.                       |

### Authenticated Netlify preview scenarios

Use Codex's in-app browser by default for the first hosted pass. Use two distinct authenticated Supabase identities in separate browser contexts for `AS-003` and multiplayer verification; add another browser only if session separation or browser-specific behavior requires it.

1. **Anchored object and group:** create a comment on one object and one grouped selection; verify the target-adjacent composer collapses to a compact participant marker; move and resize the targets from the peer session; reload both and confirm markers, contextual cards, and panel targets remain correct.
2. **Complete history:** create replies from both participants in close succession; focus the compact reply field and verify its progressive expansion; submit and verify its compact reset; open from a marker and from the panel; verify the complete deterministic exchange after reload.
3. **AS-003 comment prompt:** the author attaches a yes/no prompt, the recipient selects an answer without typing, the answer appears in both sessions, and the complete thread persists after reload.
4. **All controls:** create approve/revise/discard and approved rating prompts, answer and revise each while open, then verify malformed and out-of-range requests are rejected without partial records.
5. **Lifecycle and hiding:** exercise each approved resolve/dismiss authority, verify an unauthorized transition fails, inspect retained closed history, hide/show bubbles and overlay, and confirm underlying canvas and relational rows are unchanged.
6. **Recovery and membership:** miss or repeat one invalidation, reconnect and refetch, then remove a participant's membership and prove the next read/mutation is denied without clearing the owner's canvas.
7. **AI parity:** invoke the deterministic preview/test AI prompt command as an authorized owner/editor, verify distinct provenance and the same response behavior, and confirm the normal production presentation contains no simulated AI control.

Retain the immutable deploy ID and URL, exact commit, CI run, browser and viewport, user identities/roles, timestamps, target IDs, thread order, status and response readback, screenshots, privacy-safe logs, and every defect/fix/rerun.

## Risks and assumptions

| Risk or assumption                                                                                                                                                  | Likelihood / impact             | Mitigation or experiment                                                                                                                               | Owner                         | Current status                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------- |
| Existing comment tables prove basic RLS visibility but do not yet provide atomic target/prompt creation, idempotency, strict response validation, or AI provenance. | Confirmed / high                | Implement the Slice 1 migration and pgTAP matrix before exposing UI mutations.                                                                         | Engineering                   | Resolved locally; migration and 25 comment pgTAP assertions pass. |
| Rating storage could drift from the approved product boundary.                                                                                                      | Low / high                      | Enforce the approved fixed inclusive `1–5` range in Zod, PostgreSQL, UI copy, and tests.                                                               | Engineering                   | Decision approved 2026-08-19.                                     |
| Status policies could drift from the approved role/transition matrix.                                                                                               | Medium / high                   | Implement explicit transactional transitions and test every allowed and denied role/status pair.                                                       | Engineering                   | Decision approved 2026-08-19.                                     |
| An AI-labeled prompt could be spoofed or lose accountability if logical author and authenticated principal are conflated.                                           | Medium / high                   | Store both identities, restrict AI provenance to owner/editor RPC execution and preview/test UI, and prove direct unauthorized provenance writes fail. | Engineering                   | Mitigated locally; commenter spoofing is rejected.                |
| Relational targets cannot foreign-key to Yjs canvas objects.                                                                                                        | Confirmed / medium              | Validate against the current authorized document projection at creation and preserve explicit missing-target history after deletion.                   | Engineering                   | Mitigated locally; group and deletion E2E passes.                 |
| Broadcast invalidation may be missed, repeated, or arrive before the durable read is visible.                                                                       | Medium / medium                 | Treat it only as a refresh hint; use idempotent reads plus focus and low-frequency refetch recovery.                                                   | Engineering                   | Mitigated locally; two-context convergence passes.                |
| Comment bubbles and panels may intercept canvas gestures or obscure contextual controls.                                                                            | Medium / high                   | Use explicit overlay layers, viewport clamping, pointer-event boundaries, edge cases, and desktop/tablet regression screenshots.                       | Engineering                   | Mitigated in the current clean 36/36 Chromium regression run.     |
| Large threads could make the panel slow or difficult to navigate.                                                                                                   | Low / medium for this milestone | Use indexed deterministic reads and bounded initial rendering with a documented pagination threshold; retain complete-history access.                  | Engineering                   | Monitor during Slice 3.                                           |
| Milestone work could accidentally remain coupled to the post-closure custom-color swatch branch.                                                                    | Confirmed / medium              | Preserve the hotfix branch unchanged and base the dedicated Milestone 3 branch on the latest reviewed `origin/main`.                                   | Product owner and engineering | Resolved 2026-08-19: the Milestone 3 branch starts at `66eb4d1`.  |

## Exit criteria

- [x] The product owner approves this plan and all three recorded decisions; the document status becomes `Approved for implementation` before product or database changes begin.
- [x] The approved `PD-004` decision is recorded in the master plan before rating implementation.
- [ ] **FR-023:** an authorized participant attaches a comment to one object and one selected group; each target follows current geometry and survives peer movement, reload, and reconnect.
- [ ] **FR-024:** two participants create replies that render in deterministic `(created_at, id)` order in both sessions and after reload.
- [ ] **FR-025:** selecting a comment exposes the entire exchange in context and through the optional shared panel, including retained closed and missing-target history.
- [ ] **FR-026:** an author can add no prompt or exactly one supported structured control; a second prompt is rejected without partial data.
- [ ] **FR-027:** yes/no, approve/revise/discard, and the approved bounded rating controls render accessibly, reject invalid values, and persist valid responses.
- [ ] **FR-028:** human and deterministic preview/test AI authors create prompts through the same permission-aware command contract and durable transaction path with distinct, accountable provenance.
- [ ] **FR-029:** only approved roles can resolve or dismiss; the transition preserves targets, body, replies, prompt, responses, timestamps, and audit evidence.
- [ ] **FR-029a:** the author or canvas owner can permanently delete the complete thread only after confirmation; editors and other participants cannot delete another author's thread, and all dependent rows are removed atomically.
- [ ] **FR-030:** hiding comments removes bubbles and temporary overlay presentation only; canvas objects, Yjs updates/snapshots/history, and relational comment rows remain unchanged.
- [ ] The additive migration, generated types, local/remote non-production migration smoke check, complete pgTAP matrix, and rollback/compensation rehearsal pass.
- [ ] Comment invalidation plus reconnect/focus/refetch recovery converges two sessions without putting comment content in Broadcast payloads.
- [ ] Keyboard-only, touch/tablet, focus, status announcement, contrast, and automated axe checks pass for every new comment surface.
- [ ] Closed Milestone 1–2 canvas, persistence, reconnect, multiplayer, command, responsive, and accessibility scenarios remain passing.
- [ ] Formatting, lint, strict types, units, database/RLS, production build, Chromium end-to-end, protected CI, and secret scan pass on the exact preview commit.
- [ ] The exact Milestone 3 exit gate and **AS-003 — Comment prompt** pass with two authenticated browser sessions and persisted thread history on one immutable Netlify preview.
- [ ] Evidence records the deploy, commit, CI run, environments, browsers, identities/roles, target/thread/response readback, screenshots/logs, limitations, and all defect reruns.
- [ ] The plan status changes to `Verification complete — awaiting closure approval`, and the product owner separately approves closure before any Milestone 3 or `AS-003` master-ledger box is checked.

## Explicitly excluded work

- Real OpenAI reasoning, full-canvas inspection, connected-path interpretation, AI permissions, constructive challenge, or production AI comment creation (`FR-015` through `FR-022`, Milestone 4).
- Reviewable AI changes, explanations, keep/revise/discard review decisions, or guided review (`FR-031` through `FR-035`, Milestone 5). The `approve/revise/discard` comment prompt records feedback only and does not operate an AI change set.
- Freeform vector pen creation, stroke editing, automatic overlap attachment, disconnection, or promotion (`FR-036` through `FR-043`, Milestone 6). Milestone 3 only provides the hide/show boundary that the later temporary annotation overlay will share.
- First-class document comments, text-range targets, or document-internal visual targets (`FR-044` through `FR-053`, Milestone 7).
- Guided stories, story-scoped comments, narration, and playback (`FR-054` through `FR-062`, Milestone 8).
- Live voice, typed AI messaging, or remote-human voice (`FR-008` through `FR-014`, Milestone 9).
- Conversational starter structures and reusable templates (`FR-063` through `FR-066`, Milestone 10).
- Invitations or membership-management UI, comment mentions/notifications, attachments, reactions, freeform polls, anonymous responses, per-response discussion, comment export, configurable retention policy, production launch, cross-browser release matrix, and production observability unless separately promoted in the master ledger.
- Deleting comment history as the implementation of dismiss or resolve.
- Arbitrary ungrouped multiselection as one group target, document targets, connector-segment targets, or viewport-region comments.

## Implementation record

Implementation is complete through local verification; authenticated hosted verification and closure remain open. No pull request, production deploy, or master-plan completion checkbox is authorized or changed.

Implemented on `codex/milestone-3-comments-and-structured-feedback`:

- additive migration `20260819160000_comments_structured_feedback.sql` adds accountable human/AI provenance, client command IDs, deterministic fingerprints, strict structured-response validation, approved status transitions, least-privilege RPC mutation boundaries, indexes, and private content-free comment invalidation policies;
- additive migration `20260819170000_comment_deletion.sql` adds a least-privilege permanent-delete function for the comment author or canvas owner; deleting the root atomically cascades through targets, replies, prompts, and responses;
- the relational repository reads RLS-protected complete projections, executes only strict command schemas, refreshes after writes/focus/invalidation, and uses a low-frequency authoritative refetch as recovery when an invalidation is missed;
- the canvas page resolves the current server-side canvas role and passes only the serializable role to the client boundary;
- the Comments dock now opens a durable shared panel and target-adjacent composer, compact author marker, complete contextual thread, progressively expanding reply field, prompt controls, lifecycle actions, retry state, local hide/show state, and missing-target history;
- marker geometry is derived from current object/group bounds, including resolved connector endpoints, so target movement does not rewrite relational target rows;
- human and preview AI creation use the same RPC and validation path; `primary-ai` remains a logical author while the authenticated owner/editor remains accountable;
- the supplied FigJam references informed contextual placement, progressive disclosure, marker/thread hierarchy, and reply flow without copying Figma branding or adding excluded controls.

Implementation discoveries and approved-scope adjustments:

- comment invalidation uses a distinct private `comments:{canvasId}` channel rather than broadening the high-frequency Yjs `canvas:{canvasId}` channel. This keeps content-free feedback hints isolated and preserves the closed Milestone 2 channel policy; authoritative focus and interval refetch remain the recovery path;
- no service-role credential was needed for preview AI provenance because the authenticated requester executes the same permission-aware database function and the logical author is stored separately;
- relational targets cannot prove Yjs object existence in PostgreSQL, so the current client projection enforces one object or one complete group immediately before command creation, while RLS/RPCs enforce canvas membership and mutation authority.

Planning inspection on 2026-08-19 established that:

- the master ledger and all existing milestone records agree that Milestones 0–2 are closed and Milestone 3 is next;
- the Milestone 2 workspace contains an honest non-persisted Comments placeholder in the shared panel host and a Comments entry in the floating dock;
- the five product-owner-supplied FigJam screenshots are retained under `docs/design-references/figjam-comments-2026-08-19/` as interaction references for contextual composition, compact markers, thread hierarchy, progressive reply composition, and chronological exchange; their README explicitly excludes pixel copying, Figma branding, and unrelated visible controls;
- the initial schema already includes `comments`, `comment_targets`, `comment_replies`, `comment_prompts`, and `comment_responses`, plus basic RLS visibility and commenter mutation evidence;
- the existing schema does not yet provide atomic thread creation, idempotent comment commands, strict prompt-response validation, approved status authority, or distinct AI provenance;
- comment targets reference stable canvas object UUIDs but cannot use a database foreign key because canonical canvas objects live in Yjs;
- the current private canvas channel can carry content-free invalidation hints, but its Broadcast write policy currently permits only owners and editors;
- the current Playwright project is Chromium-only and the protected `quality` workflow covers formatting, lint, strict types, units, local Supabase/RLS, production build, end-to-end, and accessibility checks;
- initial inspection found the clean `codex/fix-custom-color-swatch` branch at commit `8b3b820`, one commit beyond `origin/main`, while local `main` was one commit behind;
- after the product owner corrected the branch choice, local `main` was fast-forwarded to `origin/main` at `66eb4d1` and this draft was moved to the new `codex/milestone-3-comments-and-structured-feedback` branch; the custom-color branch and commit remain unchanged.

## Verification evidence

Local verification on 2026-08-19:

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`: passed; 22 Vitest files and 78 tests passed.
- `pnpm db:reset`: passed from a clean local database through all five migrations and the synthetic seed.
- `pnpm db:test`: the known macOS Docker mount wrapper failure recurred; the documented direct PostgreSQL fallback passed all suites: collaboration durability 13/13, comments and structured feedback 33/33, and RLS policy matrix 96/96.
- `pnpm build` with local public Supabase values: passed under installed Next.js 16.3.0.
- the permanent-delete comment scenario passed with irreversible-action confirmation, immediate removal, and absence after reload; all six focused comment scenarios passed, followed by a clean-database full Chromium run of 36/36 scenarios.
- new browser evidence covers a human yes/no thread with typed-free response, chronological reply, hide/show, reload, axe, tablet bounds, preview AI provenance, complete-group anchoring and movement, deleted-target history, review and fixed `1–5` controls, resolved read-only history, and owner/editor convergence.
- regression fixes prompted by the full run updated two Milestone 2 placeholder assertions and increased timestamp contrast from zinc-400 to zinc-500; all three failed cases then passed before the final 35/35 run.
- after the product owner reproduced a hosted canvas crash, the public Supabase configuration boundary was changed from client-bundle `process.env` replacement to validated Server Component props; lint, strict types, 78 units, production build, and all five focused comment scenarios passed after the fix.
- after the replacement preview exposed the linked database's missing Milestone 3 schema, `supabase db push --linked --include-all` applied `20260819160000_comments_structured_feedback.sql` successfully to the non-production project.
- the remaining canvas-recovery client now receives the same validated public Supabase configuration as the comment repository. Lint, strict types, 78 units, production build, and all five focused comment scenarios pass. A combined 14-scenario comment/workspace run passed 13 scenarios; the existing two-canvas fixture timed out because a retained comment marker intercepted its hard-coded canvas click, so that run is recorded as fixture interference rather than clean regression evidence.
- the subsequent clean-database 36/36 run passed that two-canvas scenario and supersedes the fixture-interference run as current regression evidence.

Hosted preview staging:

- Implementation commit `208de58` (`Implement Milestone 3 comments and structured feedback`) is local on `codex/milestone-3-comments-and-structured-feedback`; no push or pull request was created.
- Netlify draft deploy `6a863c34517fa45e288c7ade` (`https://6a863c34517fa45e288c7ade--thinking-canvas.netlify.app`) built that exact implementation commit successfully in preview context and loaded in Codex's in-app browser.
- The commit-addressable deployed sign-in boundary rendered correctly, but the product owner found that opening a newly created canvas crashed when the client comment repository parsed missing build-time `NEXT_PUBLIC_SUPABASE_*` values. Browser logs isolated the exact Zod failure; this deploy is superseded for feature verification.
- Preliminary working-tree deploy `6a863ad230af3cb206e13869` is superseded and is not completion evidence.
- Fix commit `5d6abc1` (`Fix preview comment client configuration`) produced replacement Netlify draft deploy `6a863efccf704b67d2d0190b` (`https://6a863efccf704b67d2d0190b--thinking-canvas.netlify.app`). The deployed sign-in boundary loads with no replacement-deploy browser errors; authenticated canvas verification requires signing in again because the immutable deploy uses a different origin.
- Follow-up commit `8cf8208` (`Fix preview canvas recovery configuration`) produced Netlify draft deploy `6a8641ba484eba81221affef` (`https://6a8641ba484eba81221affef--thinking-canvas.netlify.app`). Its sign-in boundary renders correctly and has been left open for product-owner authentication; the hosted comment scenario remains pending until that new-origin sign-in is completed.

## Change record

| Date       | Change or decision                                                                                                                                                                                            | Rationale                                                                                                                                                                                           | Impact                                                                                                                                                                                                                | Approved by                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 2026-08-19 | Created the first detailed Milestone 3 plan from the closed Milestone 2 record, current master ledger, comment schema/RLS, workspace placeholder, test suite, deployment configuration, and repository state. | The ledger identifies Comments and structured feedback as the next milestone, and no Milestone 3 implementation record existed.                                                                     | Defines proposed decisions, data/security boundaries, dependency-ordered slices, verification, risks, and closure gates; implementation remains blocked on explicit approval.                                         | Pending                      |
| 2026-08-19 | Moved the draft onto a dedicated Milestone 3 branch based on the latest `origin/main`.                                                                                                                        | The draft was initially created while the checkout was on the separate post-closure custom-color fix branch.                                                                                        | Milestone 3 planning is now isolated from the hotfix; the hotfix branch remains unchanged, and implementation is still blocked on plan approval.                                                                      | Product owner                |
| 2026-08-19 | Added five product-owner-supplied FigJam comment interaction references and reconciled their principles with the Milestone 3 UI plan.                                                                         | The milestone needs concrete visual direction for contextual composition, collapsed markers, open-thread hierarchy, and reply progression.                                                          | The plan now requires those interaction principles while retaining original Thinking Canvas identity and keeping emoji, mentions, attachments, reactions, and notifications excluded.                                 | Product owner                |
| 2026-08-19 | Approved the Milestone 3 plan and all three recommended decisions for implementation.                                                                                                                         | The product owner explicitly approved the reviewed plan, fixed `1–5` rating scale, status transition matrix, and AI provenance approach.                                                            | Status changed to `Approved for implementation`; Slices 1–5 are authorized as documented, while PR creation, master-plan completion, and milestone closure remain separately gated.                                   | Product owner                |
| 2026-08-19 | Implemented the relational command boundary and FigJam-informed comment experience, then completed the clean local verification matrix.                                                                       | Milestone 3 requires one durable path for human and preview AI comments, anchored history, structured responses, lifecycle actions, and recovery.                                                   | Slices 1–4 are implemented; local formatting, lint, types, 78 units, 134 pgTAP assertions, production build, axe, and 35 Chromium scenarios pass. Hosted authenticated evidence remains open.                         | Product owner scope approval |
| 2026-08-19 | Isolated feedback invalidation on private `comments:{canvasId}` Broadcast with authoritative focus and interval refetch recovery.                                                                             | Broadening the existing high-frequency Yjs channel would couple low-frequency relational feedback to the closed Milestone 2 transport boundary.                                                     | Broadcast payloads remain content-free; owner/editor/commenter can publish hints, all members can read, and missed hints converge from PostgreSQL without changing Yjs.                                               | Product owner scope approval |
| 2026-08-19 | Created and opened preliminary Netlify draft deploy `6a863ad230af3cb206e13869` in Codex's in-app browser.                                                                                                     | The milestone workflow requires hosted preview verification after local checks.                                                                                                                     | The deployed shell and sign-in boundary load; authenticated scenarios await browser credential-transmission confirmation and a final commit-addressable redeploy.                                                     | Pending hosted verification  |
| 2026-08-19 | Committed the implementation as `208de58` and created commit-addressable Netlify draft deploy `6a863c34517fa45e288c7ade`.                                                                                     | Final hosted evidence must trace to a stable implementation commit rather than an uncommitted working tree.                                                                                         | The exact implementation build and protected sign-in boundary pass; authenticated milestone scenarios still await credential-transmission confirmation.                                                               | Pending hosted verification  |
| 2026-08-19 | Fixed the product-owner-reported hosted canvas crash by passing validated public Supabase configuration from the Server Component to the client repository.                                                   | Netlify's locally built preview did not replace public environment references in the browser bundle, so comment initialization received `undefined` despite successful server-side canvas creation. | The fix exposes no secret, removes the production client-env assumption, and passes lint, strict types, 78 units, production build, and all five focused comment scenarios; a replacement preview is required.        | Product owner defect report  |
| 2026-08-19 | Committed the preview fix as `5d6abc1` and deployed replacement draft `6a863efccf704b67d2d0190b`.                                                                                                             | The product-owner-reported failure needed a new immutable origin built from the corrected client configuration boundary.                                                                            | The replacement sign-in screen loads without new browser errors; authenticated canvas and comment verification remains pending on this new origin.                                                                    | Pending hosted verification  |
| 2026-08-19 | Applied the Milestone 3 migration to the linked non-production database, fixed the remaining canvas-recovery client configuration, committed it as `8cf8208`, and deployed draft `6a8641ba484eba81221affef`.  | The replacement preview revealed both a stale hosted schema (`comments.author_kind` missing) and a second client repository that still depended on build-time public environment replacement.       | The linked preview schema and both production canvas clients now share the implemented contract; local focused comment verification passes, and the new preview is waiting at its sign-in boundary.                   | Product owner defect report  |
| 2026-08-19 | Added **FR-029a — Permanent comment deletion** after the product owner requested a way to tidy comments beyond dismissing or resolving them.                                                                  | Dismiss and resolve deliberately retain history; the requested cleanup behavior requires a distinct, explicitly destructive action.                                                                 | The author or canvas owner can permanently delete the whole thread after confirmation. Database authorization, cascading deletion, 33 comment assertions, six focused scenarios, and the clean 36/36 regression pass. | Product owner                |

## Closure

Closure status: Not ready  
Closure approval: Pending  
Closed on: —
