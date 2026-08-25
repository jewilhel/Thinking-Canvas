import { describe, expect, it } from "vitest";

import {
  APPROVED_AI_EVALUATION_MANIFEST,
  AI_PROJECTION_MAX_SERIALIZED_BYTES,
  aiEvaluationManifestSchema,
  aiInvocationSchema,
  aiProjectionEnvelopeSchema,
  commentRoutingSelectionSchema,
  effectiveAiAuthority,
  PRIMARY_AI_KEY,
} from "@/ai/collaborator-contract";
import { FakePrimaryAiGateway } from "@/ai/fake-collaborator-gateway";
import { allowedAiToolNames } from "@/ai/tool-registry";

const ids = {
  run: "80000000-0000-4000-8000-000000000001",
  canvas: "20000000-0000-4000-8000-000000000001",
  comment: "30000000-0000-4000-8000-000000000001",
  user: "10000000-0000-4000-8000-000000000001",
  command: "81000000-0000-4000-8000-000000000001",
  object: "61000000-0000-4000-8000-000000000001",
};

const invocation = aiInvocationSchema.parse({
  runId: ids.run,
  canvasId: ids.canvas,
  commentId: ids.comment,
  replyId: null,
  requestedBy: ids.user,
  idempotencyKey: ids.command,
  authority: "comment_only",
  instruction: "Inspect this direction.",
  selectedPathIds: [ids.object],
});

const projection = aiProjectionEnvelopeSchema.parse({
  version: 1,
  canvasId: ids.canvas,
  objects: [
    {
      id: ids.object,
      type: "shape",
      summary: "Main idea",
      geometry: { x: 0, y: 0, width: 100, height: 80, rotation: 0 },
      groupId: null,
      orderIndex: 0,
      relationshipIds: [],
    },
  ],
  commentThreads: [
    {
      id: ids.comment,
      status: "resolved",
      targetObjectIds: [ids.object],
      summary: "Prior decision",
      participantKeys: [ids.user, PRIMARY_AI_KEY],
      createdAt: "2026-08-24T12:00:00.000Z",
      updatedAt: "2026-08-24T12:00:00.000Z",
    },
  ],
  serializedBytes: 512,
  truncated: false,
});

describe("AI collaborator contracts", () => {
  it("accepts explicit human and primary-AI recipients", () => {
    expect(
      commentRoutingSelectionSchema.parse({
        mode: "explicit",
        recipients: [
          { kind: "human", userId: ids.user },
          { kind: "ai", aiKey: PRIMARY_AI_KEY },
        ],
      }),
    ).toMatchObject({ mode: "explicit" });
  });

  it("rejects duplicate and unrecognized recipients", () => {
    expect(() =>
      commentRoutingSelectionSchema.parse({
        mode: "explicit",
        recipients: [
          { kind: "human", userId: ids.user },
          { kind: "human", userId: ids.user },
        ],
      }),
    ).toThrow("Collaborator recipients must be unique");
    expect(() =>
      commentRoutingSelectionSchema.parse({
        mode: "explicit",
        recipients: [{ kind: "ai", aiKey: "secondary-ai" }],
      }),
    ).toThrow();
  });

  it("preserves selected-path order and rejects duplicates", () => {
    expect(invocation.selectedPathIds).toEqual([ids.object]);
    expect(() =>
      aiInvocationSchema.parse({
        ...invocation,
        selectedPathIds: [ids.object, ids.object],
      }),
    ).toThrow("Selected path IDs must be unique and ordered");
  });

  it("allows only open and resolved comment context", () => {
    expect(projection.commentThreads[0]?.status).toBe("resolved");
    expect(() =>
      aiProjectionEnvelopeSchema.parse({
        ...projection,
        commentThreads: [
          { ...projection.commentThreads[0], status: "dismissed" },
        ],
      }),
    ).toThrow();
  });

  it("rejects projections whose complete manifest exceeds the request budget", () => {
    expect(() =>
      aiProjectionEnvelopeSchema.parse({
        ...projection,
        serializedBytes: AI_PROJECTION_MAX_SERIALIZED_BYTES + 1,
      }),
    ).toThrow();
  });

  it("enforces the approved role-derived authority", () => {
    expect(
      effectiveAiAuthority({
        enabled: true,
        configuredAuthority: "trusted_editor",
        role: "editor",
      }),
    ).toBe("trusted_editor");
    expect(
      effectiveAiAuthority({
        enabled: true,
        configuredAuthority: "trusted_editor",
        role: "commenter",
      }),
    ).toBe("comment_only");
    expect(
      effectiveAiAuthority({
        enabled: true,
        configuredAuthority: "trusted_editor",
        role: "viewer",
      }),
    ).toBeNull();
  });

  it("freezes the approved evaluation thresholds", () => {
    expect(
      aiEvaluationManifestSchema.parse(APPROVED_AI_EVALUATION_MANIFEST),
    ).toMatchObject({
      securityPassThreshold: 1,
      qualityPassThreshold: 0.9,
      allowCriticalUngroundedClaim: false,
    });
  });
});

describe("FakePrimaryAiGateway", () => {
  it("returns deterministic grounded output without provider access", async () => {
    const gateway = new FakePrimaryAiGateway();
    await expect(
      gateway.request({
        invocation,
        projection,
        allowedToolNames: allowedAiToolNames(invocation.authority),
      }),
    ).resolves.toEqual({
      status: "completed",
      requestId: `fake-${ids.run}`,
      reply: {
        body: "I inspected 1 canvas objects and 1 comment conversations.",
        evidence: [{ objectId: ids.object, label: "Main idea" }],
        contextualTargetObjectIds: [ids.object],
      },
      toolCalls: [],
    });
  });

  it("requests an anchored contextual comment only from an explicit world-space instruction", async () => {
    const gateway = new FakePrimaryAiGateway();
    const result = await gateway.request({
      invocation: {
        ...invocation,
        instruction: "Please leave a contextual comment on the evidence.",
      },
      projection: {
        ...projection,
        commentThreads: [
          {
            ...projection.commentThreads[0],
            status: "open",
            targetObjectIds: [],
          },
        ],
      },
      allowedToolNames: allowedAiToolNames(invocation.authority),
    });
    expect(result).toMatchObject({
      status: "completed",
      toolCalls: [
        {
          callKey: "contextual-comment-1",
          toolName: "create_contextual_comment",
          arguments: { targetObjectIds: [ids.object] },
        },
      ],
    });
  });

  it("returns a strict non-mutating proposal tool call only when authority allows it", async () => {
    const gateway = new FakePrimaryAiGateway();
    const proposalInvocation = {
      ...invocation,
      authority: "propose_changes" as const,
      instruction: "Propose moving this object to the right.",
    };
    const result = await gateway.request({
      invocation: proposalInvocation,
      projection,
      allowedToolNames: allowedAiToolNames(proposalInvocation.authority),
    });
    expect(result).toMatchObject({
      status: "completed",
      reply: {
        body: "I prepared a validated proposal without changing the canvas.",
      },
      toolCalls: [
        {
          callKey: "proposal-1",
          toolName: "propose_canvas_commands",
          arguments: {
            commands: [
              {
                type: "object.move",
                payload: { objectId: ids.object, x: 40, y: 0 },
              },
            ],
          },
        },
      ],
    });
  });

  it("returns a strict review-stage tool call only when authority allows it", async () => {
    const gateway = new FakePrimaryAiGateway();
    const reviewInvocation = {
      ...invocation,
      authority: "edit_with_review" as const,
      instruction: "Stage moving this object to the right for review.",
    };
    const result = await gateway.request({
      invocation: reviewInvocation,
      projection,
      allowedToolNames: allowedAiToolNames(reviewInvocation.authority),
    });
    expect(result).toMatchObject({
      status: "completed",
      reply: {
        body: "I staged validated changes for later review without changing the canvas.",
      },
      toolCalls: [
        {
          callKey: "review-stage-1",
          toolName: "stage_canvas_changes",
          arguments: {
            summary: "Move the supporting object to the right.",
            commands: [
              {
                type: "object.move",
                payload: { objectId: ids.object, x: 40, y: 0 },
              },
            ],
          },
        },
      ],
    });
  });

  it("returns deterministic cancellation and failure results", async () => {
    const gateway = new FakePrimaryAiGateway();
    await expect(
      gateway.request({
        invocation,
        projection,
        allowedToolNames: allowedAiToolNames(invocation.authority),
        scenario: "cancelled",
      }),
    ).resolves.toMatchObject({
      status: "cancelled",
      errorCode: "cancelled_by_user",
    });
    await expect(
      gateway.request({
        invocation,
        projection,
        allowedToolNames: allowedAiToolNames(invocation.authority),
        scenario: "failed",
      }),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "fake_provider_failure",
    });
  });

  it("fails closed when the provider allowlist exceeds current authority", async () => {
    const gateway = new FakePrimaryAiGateway();
    await expect(
      gateway.request({
        invocation,
        projection,
        allowedToolNames: [
          ...allowedAiToolNames(invocation.authority),
          "execute_canvas_commands",
        ],
      }),
    ).rejects.toThrow("does not match current authority");
  });
});
