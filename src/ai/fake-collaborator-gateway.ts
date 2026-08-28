import {
  aiInvocationSchema,
  aiProjectionEnvelopeSchema,
  aiReplySchema,
  type AiInvocation,
  type AiProjectionEnvelope,
} from "@/ai/collaborator-contract";
import type {
  FakeAiScenario,
  PrimaryAiGateway,
  PrimaryAiGatewayResult,
} from "@/ai/primary-ai-gateway";
import { allowedAiToolNames, type AiToolName } from "@/ai/tool-registry";

export type { FakeAiScenario } from "@/ai/primary-ai-gateway";

export class FakePrimaryAiGateway implements PrimaryAiGateway {
  private readonly visuallyReviewedScopes = new Set<string>();

  async reviewVisualChange(
    input: Parameters<NonNullable<PrimaryAiGateway["reviewVisualChange"]>>[0],
  ) {
    const reviewScopeKey = `${input.instruction}\u0000${[
      ...input.targetObjectIds,
    ]
      .sort()
      .join(",")}`;
    if (
      input.instruction.toLowerCase().includes("vision refinement") &&
      !this.visuallyReviewedScopes.has(reviewScopeKey)
    ) {
      this.visuallyReviewedScopes.add(reviewScopeKey);
      const objects = input.proposedObjectStates.flatMap((state) => {
        const object = (
          state as {
            object?: {
              id?: string;
              geometry?: { x?: number; y?: number };
            };
          }
        ).object;
        return object?.id &&
          typeof object.geometry?.x === "number" &&
          typeof object.geometry.y === "number"
          ? [object as { id: string; geometry: { x: number; y: number } }]
          : [];
      });
      if (objects.length === input.targetObjectIds.length) {
        return {
          status: "refine" as const,
          issueCount: 1,
          replacementCommands: objects.map((object) => ({
            type: "object.move",
            payload: {
              objectId: object.id,
              x: object.geometry.x + 24,
              y: object.geometry.y,
            },
          })),
          requestId: "fake-visual-refinement",
          model: "deterministic-fake",
        };
      }
    }
    return {
      status: "pass" as const,
      issueCount: 0,
      requestId: "fake-visual-review",
      model: "deterministic-fake",
    };
  }

  async request(input: {
    invocation: AiInvocation;
    projection: AiProjectionEnvelope;
    allowedToolNames: AiToolName[];
    scenario?: FakeAiScenario;
  }): Promise<PrimaryAiGatewayResult> {
    const invocation = aiInvocationSchema.parse(input.invocation);
    const projection = aiProjectionEnvelopeSchema.parse(input.projection);
    if (invocation.canvasId !== projection.canvasId) {
      throw new Error("The invocation and projection canvas must match.");
    }
    const expectedTools = allowedAiToolNames(invocation.authority);
    if (
      input.allowedToolNames.length !== expectedTools.length ||
      input.allowedToolNames.some(
        (name, index) => name !== expectedTools[index],
      )
    ) {
      throw new Error(
        "The AI tool allowlist does not match current authority.",
      );
    }

    const requestId = `fake-${invocation.runId}`;
    if (input.scenario === "cancelled") {
      return { status: "cancelled", requestId, errorCode: "cancelled_by_user" };
    }
    if (input.scenario === "failed") {
      return {
        status: "failed",
        requestId,
        errorCode: "fake_provider_failure",
      };
    }

    const instruction = invocation.instruction.toLowerCase();
    const objectsById = new Map(
      projection.objects.map((object) => [object.id, object]),
    );
    const selectedPath = invocation.selectedPathIds.flatMap((id) => {
      const object = objectsById.get(id);
      return object ? [object] : [];
    });
    const firstObject = selectedPath[0] ?? projection.objects[0];
    const sourceThread = projection.commentThreads.find(
      (thread) => thread.id === invocation.commentId,
    );
    const shouldCreateContextualComment =
      instruction.includes("contextual comment") &&
      firstObject !== undefined &&
      sourceThread?.targetObjectIds.length === 0;
    const shouldCreateNewShapes =
      instruction.includes("five sticky notes") &&
      invocation.reviewContext?.kind === "world_space" &&
      input.allowedToolNames.includes("stage_new_shapes");
    const shouldCreateBackgroundCircle =
      instruction.includes("large grey circle") &&
      instruction.includes("behind") &&
      invocation.reviewContext?.kind === "world_space" &&
      projection.objects.length > 0 &&
      input.allowedToolNames.includes("stage_new_shapes");
    const stickyObjects = projection.objects.filter(
      (object) =>
        object.type === "shape" &&
        object.state.type === "shape" &&
        object.state.shape === "rectangle" &&
        object.state.text.trim().length > 0,
    );
    const stickyCenter = stickyObjects.length
      ? {
          x:
            stickyObjects.reduce(
              (sum, object) =>
                sum + object.geometry.x + object.geometry.width / 2,
              0,
            ) / stickyObjects.length,
          y:
            stickyObjects.reduce(
              (sum, object) =>
                sum + object.geometry.y + object.geometry.height / 2,
              0,
            ) / stickyObjects.length,
        }
      : null;
    const clockwiseStickies = stickyCenter
      ? [...stickyObjects].sort((left, right) => {
          const angle = (object: (typeof stickyObjects)[number]) =>
            Math.atan2(
              object.geometry.y + object.geometry.height / 2 - stickyCenter.y,
              object.geometry.x + object.geometry.width / 2 - stickyCenter.x,
            );
          return angle(left) - angle(right) || left.id.localeCompare(right.id);
        })
      : [];
    const shouldCreateClockwiseConnectors =
      instruction.includes("connect") &&
      instruction.includes("sticky") &&
      instruction.includes("clockwise") &&
      invocation.reviewContext?.kind === "world_space" &&
      clockwiseStickies.length > 1 &&
      input.allowedToolNames.includes("stage_new_connectors");
    const foregroundObjects = projection.objects.filter(
      (object) => object.type !== "connector" && object.type !== "annotation",
    );
    const foregroundBounds = foregroundObjects.length
      ? {
          left: Math.min(
            ...foregroundObjects.map((object) => object.geometry.x),
          ),
          top: Math.min(
            ...foregroundObjects.map((object) => object.geometry.y),
          ),
          right: Math.max(
            ...foregroundObjects.map(
              (object) => object.geometry.x + object.geometry.width,
            ),
          ),
          bottom: Math.max(
            ...foregroundObjects.map(
              (object) => object.geometry.y + object.geometry.height,
            ),
          ),
        }
      : null;
    const backgroundDiameter = foregroundBounds
      ? Math.max(
          240,
          Math.ceil(
            Math.hypot(
              foregroundBounds.right - foregroundBounds.left,
              foregroundBounds.bottom - foregroundBounds.top,
            ) + 96,
          ),
        )
      : 240;
    const shouldProposeChanges =
      instruction.includes("propose") &&
      firstObject !== undefined &&
      input.allowedToolNames.includes("propose_canvas_commands");
    const shouldStageReview =
      (instruction.includes("review") || instruction.includes("revise")) &&
      firstObject !== undefined &&
      input.allowedToolNames.includes("stage_canvas_changes");
    const reviewObjects =
      shouldStageReview && instruction.includes("multiple")
        ? projection.objects
            .filter(
              (object) =>
                object.type !== "connector" && object.type !== "annotation",
            )
            .slice(0, 2)
        : firstObject
          ? [firstObject]
          : [];
    const shouldReviewLabel =
      reviewObjects.length === 1 &&
      instruction.includes("label") &&
      (reviewObjects[0]?.type === "shape" || reviewObjects[0]?.type === "text");
    const shouldExecuteChanges =
      instruction.includes("apply") &&
      firstObject !== undefined &&
      input.allowedToolNames.includes("execute_canvas_commands");
    const reply = aiReplySchema.parse({
      body: shouldCreateNewShapes
        ? "I created five labeled sticky notes in the requested colors."
        : shouldCreateBackgroundCircle
          ? "I added a large grey circle behind the sticky notes without moving them."
          : shouldCreateClockwiseConnectors
            ? "I connected the sticky notes in a clockwise closed loop."
            : shouldExecuteChanges
              ? "I applied validated canvas changes as the primary AI collaborator."
              : shouldStageReview
                ? "I made the requested change on the canvas."
                : shouldProposeChanges
                  ? "I prepared a validated proposal without changing the canvas."
                  : selectedPath.length > 1
                    ? `I inspected ${selectedPath.length} selected path objects in order: ${selectedPath.map((object) => object.summary || object.type).join(" → ")}.`
                    : `I inspected ${projection.objects.length} canvas objects and ${projection.commentThreads.length} comment conversations.`,
      evidence: firstObject
        ? [
            {
              objectId: firstObject.id,
              label: firstObject.summary || firstObject.type,
            },
          ]
        : [],
      contextualTargetObjectIds: firstObject ? [firstObject.id] : [],
    });
    const toolCalls = shouldCreateBackgroundCircle
      ? [
          {
            callKey: "background-circle-1",
            toolName: "stage_new_shapes",
            arguments: {
              summary:
                "Add a large grey background circle around the sticky notes.",
              shapes: [
                {
                  key: "background-circle",
                  shape: "ellipse",
                  layer: "back",
                  text: "",
                  x:
                    (foregroundBounds
                      ? (foregroundBounds.left + foregroundBounds.right) / 2
                      : 400) -
                    backgroundDiameter / 2,
                  y:
                    (foregroundBounds
                      ? (foregroundBounds.top + foregroundBounds.bottom) / 2
                      : 300) -
                    backgroundDiameter / 2,
                  width: backgroundDiameter,
                  height: backgroundDiameter,
                  fill: "#d4d4d8",
                  outline: "#71717a",
                  outlineWidth: 2,
                  fontFamily: "Inter",
                  fontSize: 16,
                  fontWeight: "normal",
                  textAlign: "center",
                  textColor: "#18181b",
                },
              ],
              explanations: [
                {
                  key: "background-circle",
                  whatChanged:
                    "Added a large grey circle behind the sticky notes.",
                  why: "The circle groups the notes without moving them.",
                },
              ],
            },
          },
        ]
      : shouldCreateNewShapes
        ? [
            {
              callKey: "new-sticky-notes-1",
              toolName: "stage_new_shapes",
              arguments: {
                summary:
                  "Create five differently colored labeled sticky notes.",
                shapes: [
                  ["red", "Red", "#fecaca"],
                  ["yellow", "Yellow", "#fef3c7"],
                  ["orange", "Orange", "#fed7aa"],
                  ["green", "Green", "#bbf7d0"],
                  ["blue", "Blue", "#bfdbfe"],
                ].map(([key, text, fill], index) => ({
                  key,
                  shape: "rectangle",
                  layer: "front",
                  text,
                  x:
                    (invocation.reviewContext?.canvasAnchor?.x ?? 400) +
                    (index % 3) * 204,
                  y:
                    (invocation.reviewContext?.canvasAnchor?.y ?? 300) +
                    Math.floor(index / 3) * 144,
                  width: 180,
                  height: 120,
                  fill,
                  outline: "#52525b",
                  outlineWidth: 2,
                  fontFamily: "Inter",
                  fontSize: 18,
                  fontWeight: "bold",
                  textAlign: "center",
                  textColor: "#18181b",
                })),
                explanations: ["red", "yellow", "orange", "green", "blue"].map(
                  (key) => ({
                    key,
                    whatChanged: `Created the ${key} sticky note.`,
                    why: "The user requested five labeled color examples.",
                  }),
                ),
              },
            },
          ]
        : shouldCreateClockwiseConnectors
          ? [
              {
                callKey: "clockwise-connectors-1",
                toolName: "stage_new_connectors",
                arguments: {
                  summary: "Connect the sticky notes clockwise in a loop.",
                  connectors: clockwiseStickies.map((object, index) => {
                    const next =
                      clockwiseStickies[
                        (index + 1) % clockwiseStickies.length
                      ]!;
                    return {
                      key: `connector-${index + 1}`,
                      fromObjectId: object.id,
                      toObjectId: next.id,
                      outline: "#475569",
                      outlineWidth: 2,
                    };
                  }),
                  explanations: clockwiseStickies.map((object, index) => ({
                    key: `connector-${index + 1}`,
                    whatChanged: `Connected ${object.summary || "one sticky note"} to the next sticky note.`,
                    why: "The user requested a clockwise closed loop.",
                  })),
                },
              },
            ]
          : shouldExecuteChanges
            ? [
                {
                  callKey: "trusted-execution-1",
                  toolName: "execute_canvas_commands",
                  arguments: {
                    commands: [
                      {
                        type: "object.move",
                        payload: {
                          objectId: firstObject.id,
                          x: firstObject.geometry.x + 40,
                          y: firstObject.geometry.y,
                        },
                      },
                    ],
                  },
                },
              ]
            : shouldStageReview
              ? [
                  {
                    callKey: "review-stage-1",
                    toolName: "stage_canvas_changes",
                    arguments: {
                      summary: shouldReviewLabel
                        ? "Clarify the supporting object's label."
                        : "Move the supporting object to the right.",
                      explanations: [
                        ...reviewObjects.map((object, index) => ({
                          objectId: object.id,
                          whatChanged: shouldReviewLabel
                            ? `Changed the label from “${"text" in object.state ? object.state.text : ""}” to “Supporting evidence”.`
                            : reviewObjects.length === 1
                              ? "Moved the supporting object to the right."
                              : `Moved supporting object ${index + 1} to the right.`,
                          why: shouldReviewLabel
                            ? "The revised label states the object's purpose more clearly."
                            : "The added spacing separates it from the main idea.",
                        })),
                      ],
                      commands: reviewObjects.map((object) =>
                        shouldReviewLabel
                          ? {
                              type: "object.patch",
                              payload: {
                                objectId: object.id,
                                objectType: object.type as "shape" | "text",
                                text: "Supporting evidence",
                              },
                            }
                          : {
                              type: "object.move",
                              payload: {
                                objectId: object.id,
                                x: object.geometry.x + 40,
                                y: object.geometry.y,
                              },
                            },
                      ),
                    },
                  },
                ]
              : shouldProposeChanges
                ? [
                    {
                      callKey: "proposal-1",
                      toolName: "propose_canvas_commands",
                      arguments: {
                        commands: [
                          {
                            type: "object.move",
                            payload: {
                              objectId: firstObject.id,
                              x: firstObject.geometry.x + 40,
                              y: firstObject.geometry.y,
                            },
                          },
                        ],
                      },
                    },
                  ]
                : shouldCreateContextualComment
                  ? [
                      {
                        callKey: "contextual-comment-1",
                        toolName: "create_contextual_comment",
                        arguments: {
                          body: `Grounded observation: ${firstObject.summary || firstObject.type} is a concrete evidence point for this canvas.`,
                          targetObjectIds: [firstObject.id],
                        },
                      },
                    ]
                  : [];
    return { status: "completed", requestId, reply, toolCalls };
  }
}
