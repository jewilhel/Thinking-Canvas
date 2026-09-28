# Milestone 12 — Deferred voice hardening backlog

Status: Deferred backlog — authorized transfer from Milestone 10; implementation is not started.

Approved by the product owner on 2026-09-27. Source: [Milestone 10](milestone-10-live-conversation.md), [original evaluation](milestone-10-pause-evaluation.md), [recorded listening results](milestone-10-listening-results.md), and the [release ledger](../../thinking-canvas-implementation-plan.md#milestone-12--production-readiness-and-launch).

The owner accepted the present voice experience as sufficient to close Milestone 10 and expects some interactions may be redesigned. Preserve all accepted trials, failures and repairs. Do not describe deferred trials as passing. These checks belong to production hardening, not Milestone 11 feature work.

## Nine deferred scenarios

| Case | Future check                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------- |
| P05  | Participant resumes just before a queued report; avoid speaking over them.                          |
| P06  | Canvas work finishes during existing assistant speech; avoid competing application output.          |
| P08  | Duplicate provider delivery executes and reports only once, using controlled injection.             |
| P10  | Canvas changes make a pending observation stale; suppress it.                                       |
| P11  | A successful action is followed by a separate failure; preserve the successful result.              |
| P12  | Authorization fails during speech; block the action, show the failure and defer spoken explanation. |
| P13  | Budget admission fails during speech; stop affected work, show the limit and defer speech.          |
| P15  | Routine encouragement does not create an application-triggered interruption.                        |
| P16  | Ordinary disagreement or uncertainty waits for a pause.                                             |

## Deferred evaluation and instrumentation

- Revisit `FR-013`/`FR-014` formal validation after the interaction design stabilizes. The prior 20-case, three-pass matrix and 95% eligible-delivery threshold are retained as the historical rubric; they were not achieved or measured during Milestone 10. Reapprove the future rubric against the revised experience rather than assuming the old scripts must remain unchanged.
- Complete wider connection, first-audio, interruption-stop, reconnect and failure-rate measurements on representative hardware. Existing individual samples and qualitative owner reports remain evidence, not population statistics.
- Verify hosted admission-failure visibility under controlled queue/context/budget and permission conditions without deliberately exhausting the shared paid allowance. Local component, database and private-topic tests are supporting evidence, not proof of audible hosted behavior.
- Complete production privacy/retention disclosures and operational telemetry/access review before public voice enablement. Preserve no saved audio and save-conversation-content only on request.

## Retained boundaries

Keep the current voice settings UI and account preferences, ten-minute conversation plus at most two-minute goodbye period, shared $20 daily test cap, and existing authorized Canvas AI executor. Thirty-minute/Render hosting and remote-human voice remain separately deferred. No new service, hosted write, audio recording or automatic transcript archive is authorized by this backlog.
