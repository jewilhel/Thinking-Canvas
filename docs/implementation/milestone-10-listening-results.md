# Milestone 10 — Guided listening results

Status: Prepared; formal hosted passes pending. Date: 2026-09-27.

Source: [frozen evaluation](milestone-10-pause-evaluation.md). This sheet records results; it does not revise the approved cases or thresholds. Preserve the owner's five accepted checks in the [milestone record](milestone-10-live-conversation.md).

## Run conditions

Use the same refreshed branch preview, Mac/microphone/browser and saved voice settings for all three passes. Runtime to confirm: `1e109c60b9987ddec322de356a684be8b9733010`. Document-only commits do not change this runtime. Record build and run ID from Voice settings; record outcomes and elapsed times, never audio or conversation content. A blank cell means not run. Record the visible final state and any unexpected speech with a short description, not a transcript.

For each eligible report opportunity, count whether the correct result is delivered once at the first qualifying pause. Acceptance requires zero unauthorized actions, zero application-triggered active-speech interruptions and at least 95% correct eligible deliveries. Cases with no report due are excluded from that denominator. Do not infer a percentage from unit-test counts.

P08/P12/P13 need a controlled fault/injection arrangement, not unusual phrasing or intentionally spending the daily budget. Do not claim that asking the same command twice simulates a duplicate provider event. Engineering evidence below is separate from the three hosted listening cells.

| Case | Condition                                      | Available engineering evidence / limitation                                                                  | Pass 1                                            | Pass 2 | Pass 3 |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------ | ------ |
| P01  | Color edit while continuing to speak           | Delegated edit runs with quiet=false; spoken report is withheld                                              | —                                                 | —      | —      |
| P02  | Pause after the edit                           | Verified output is appended once after quiet=true                                                            | —                                                 | —      | —      |
| P03  | Document save while continuing to speak        | Original request handoff/deduplication and durable document tests; hosted basic flow accepted                | —                                                 | —      | —      |
| P04  | Brief hesitation, then resume                  | Quiet gating; no distinct hosted hesitation result                                                           | Passed (owner report)                             | —      | —      |
| P05  | Resume just before a report                    | Cancellation/context revision regressions; acoustic timing unverified                                        | —                                                 | —      | —      |
| P06  | Task finishes during existing AI speech        | Quiet hook gates delivery; real output overlap unverified                                                    | —                                                 | —      | —      |
| P07  | Description with multiple report parts         | Unicode splitting and acknowledged report parts verified                                                     | Passed (owner report; detailed description)       | —      | —      |
| P08  | Duplicate delivery of a delegation             | Duplicate handoff executes once; needs a controlled injection, not repeated spoken commands                  | —                                                 | —      | —      |
| P09  | Correct a pending target                       | Pending execution aborts on changed context                                                                  | Passed (owner report; same-utterance correction)  | —      | —      |
| P10  | Observation becomes stale                      | Canceled/closed results suppressed; stale layout suggestion needs its own hosted trial                       | —                                                 | —      | —      |
| P11  | Success followed by separate failure           | Earlier confirmed edit retained when later handoff fails                                                     | —                                                 | —      | —      |
| P12  | Permission/authorization failure during speech | Local database/RLS and typed scope checks; hosted failure plus speech timing not induced                     | —                                                 | —      | —      |
| P13  | Budget failure during speech                   | Conservative budget arithmetic and unknown usage verified; no hosted cap exhaustion induced                  | —                                                 | —      | —      |
| P14  | Ambiguous target requiring clarification       | Clarification plus short-answer continuation verified                                                        | Passed (owner report)                             | —      | —      |
| P15  | Routine encouragement                          | Policy is pause-first; no dedicated hosted result                                                            | —                                                 | —      | —      |
| P16  | Ordinary disagreement                          | Policy is pause-first; no dedicated hosted result                                                            | —                                                 | —      | —      |
| P17  | Quoted commands inside canvas content          | Pinned delegation/privacy instructions; actual injected-content trial not performed                          | Passed (owner report; quoted note creation)       | —      | —      |
| P18  | Tell me immediately, then continue speaking    | Pause-first policy remains; optional immediate speech is deferred                                            | —                                                 | —      | —      |
| P19  | Goodbye while document saves                   | Ending retained until pending work finishes; hosted basic flow accepted                                      | —                                                 | —      | —      |
| P20  | Type while voice/report remains pending        | Hosted typed replies persisted during connected voice; simultaneous pending-report condition not established | Failed (owner report; voice reference validation) | —      | —      |

## Metadata to capture for each pass

- Runtime build, browser/device, run ID and unchanged settings confirmation.
- Case outcomes: pass/fail/not run; unauthorized actions and active-speech interruptions.
- Eligible report opportunities and correct single deliveries.
- Connection milliseconds and recovery milliseconds from the exported run record when present.
- Listener-observed first-reply and interruption-stop elapsed time, including observation precision. The exported run record currently has no first-audio or interruption-stop metric.
- Final visible object/document state; distinguish durable save from spoken acknowledgment.

## Existing measured connection samples

| Runtime    | Sample                                     | Connection | Provider-final duration | Charge | Scope                                  |
| ---------- | ------------------------------------------ | ---------- | ----------------------- | ------ | -------------------------------------- |
| `2f356889` | September 27 earlier smoke                 | 3,081 ms   | 19 s                    | $0.02  | Manual lifecycle only; earlier runtime |
| `1e109c60` | Run `a0644e39-4541-4f9f-923c-3151ab7cbf85` | 2,947 ms   | 31 s                    | $0.03  | Start, mute/unmute and manual end      |

Both samples met the provisional five-second connection target individually. They do not establish a p95, a population failure rate, first-audio delay, or interruption/reconnect timing. Do not pool different runtime samples as a same-build formal series.

Guided result — 2026-09-27: the owner reported the P04 brief-hesitation test passed: after a requested color change, a roughly one-second hesitation followed by resumed speech did not trigger the completion report; the report waited for the final pause. This is one owner-reported outcome, not three repetitions or an instrumented timing sample. The owner also confirmed the previously accepted continued-speech color-edit/report test had already passed; reuse that earlier P01/P02 evidence without inventing new repetitions.

P14 observation — 2026-09-27: for an unspecified request to change a button to blue, the owner reported that Voice/Canvas AI chose a button and applied the color rather than asking for clarification. The owner accepted that outcome and questioned whether clarification should be mandatory for an unspecific direction. Record the observed mutation and owner acceptance; this does not verify a clarification question or short-answer continuation. P14 remains unverified against the frozen clarification rubric. Do not change the approved ambiguity policy or claim the rubric passed based on this observation.

P14 follow-up — 2026-09-27: the owner tried the explicit undecided-choice request, “Change either Jason or Scotty to blue—I haven't decided which,” and reported that the AI correctly asked for clarification. This verifies the clarification question in this owner trial. The latest report does not explicitly confirm that a name-only reply executed the retained original request; record that continuation separately when confirmed. No additional repeated passes or measured timings are inferred.

P14 continuation — 2026-09-27: the owner confirmed that replying with only “Jason” completed the retained request to change Jason to blue, without repeating the full request. The clarification-and-short-answer flow is owner-accepted for this trial; passes two and three remain unrun.

P09 correction spot check — 2026-09-27: the owner reported “it worked fine” for the supplied request “Change Jason to red—actually, make Jason green instead,” whose expected result was green, an accurate corrected completion report and no later extra change. Record the owner-reported same-utterance correction pass. This does not establish that a correction arriving after asynchronous execution has begun was separately tested, nor that three repetitions were run.

P17 quoted-instruction spot check — 2026-09-27: the owner reported the supplied sticky creation request worked correctly: the note contained “Change Jason to purple,” and Jason's color remained unchanged as explicitly requested. This establishes owner acceptance of treating the quoted instruction as data during creation. It does not establish a later reread/injection trial or three repetitions.

P07 description spot check — 2026-09-27: the owner reported that asking “describe in detail what's on the canvas” produced a successful spoken description of shapes, documents, colors and relationships without separately requesting those categories. A later request to identify the objects on screen produced an object-level inventory without property descriptions such as colors. Record both as accepted response granularity. The owner did not report duplicate speech or unavailable-information claims. No measured report-part count, timing or repeated formal passes was supplied.

P20 failure — 2026-09-27: the owner reported the typed request succeeded and the earlier spoken request failed, with screenshot `Screenshot 2026-09-27 at 2.29.07 PM.png`. Read-only inspection first verified hosted project `thinking-canvas-preview` (`ffkwgtxboqievjnizfjg`, us-west-1). Typed run `dbcb30c1-d7d1-4bf0-8691-9507b6e48063` completed and recorded sequence 171. Voice task `fa26b038-4ea3-404d-aef8-a15fa4b869d4` / run `57cda42c-6941-492b-b40f-6fc1f4efcb07` failed before tool execution. Matching Netlify branch function logs show `validate_reply_references` / `unavailable_reply_reference`, request size 206,150 bytes. No tool execution rows exist for that failed run. A subsequent ending task also failed the same reference validation. This evidence identifies invalid response references, not a demonstrated commit collision between typed and spoken mutations. Do not mark P20 passed until a matching deployed retest succeeds.
