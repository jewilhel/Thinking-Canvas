import type {
  Response,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type {
  AiInvocation,
  AiProjectionEnvelope,
} from "@/ai/collaborator-contract";
import {
  buildSubmitTurnTool,
  OpenAiPrimaryAiGateway,
  type StreamingResponsesClient,
} from "@/ai/openai-primary-ai-gateway";
import { AI_CANVAS_DESIGN_TOKENS } from "@/ai/visual-grounding";
import {
  createPrimaryAiGateway,
  parsePrimaryAiProviderEnvironment,
} from "@/ai/primary-ai-gateway-factory";
import { AiProviderTimeoutError } from "@/ai/primary-ai-gateway";
import {
  allowedAiToolNames,
  allowedSceneAiToolNames,
} from "@/ai/tool-registry";

const ids = {
  run: "00000000-0000-4000-8000-000000000001",
  canvas: "00000000-0000-4000-8000-000000000002",
  comment: "00000000-0000-4000-8000-000000000003",
  user: "00000000-0000-4000-8000-000000000004",
  idempotency: "00000000-0000-4000-8000-000000000005",
  object: "00000000-0000-4000-8000-000000000006",
};

const invocation: AiInvocation = {
  runId: ids.run,
  canvasId: ids.canvas,
  commentId: ids.comment,
  replyId: null,
  requestedBy: ids.user,
  idempotencyKey: ids.idempotency,
  authority: "comment_only",
  instruction: "What assumption should we challenge?",
  selectedPathIds: [],
};

const projection: AiProjectionEnvelope = {
  version: 2,
  canvasId: ids.canvas,
  objects: [
    {
      id: ids.object,
      type: "shape",
      summary: "Customers will adopt the workflow without training.",
      geometry: {
        x: 0,
        y: 0,
        width: 200,
        height: 120,
        rotation: 0,
      },
      groupId: null,
      orderIndex: 0,
      relationshipIds: [],
      state: {
        schemaVersion: 2,
        id: ids.object,
        canvasId: ids.canvas,
        createdBy: ids.user,
        createdAt: "2026-08-26T12:00:00.000Z",
        updatedAt: "2026-08-26T12:00:00.000Z",
        type: "shape",
        shape: "rectangle",
        text: "Customers will adopt the workflow without training.",
        geometry: { x: 0, y: 0, width: 200, height: 120, rotation: 0 },
        style: {
          fill: "#ffffff",
          outline: "#18181b",
          outlineWidth: 2,
          fontFamily: "Inter",
          fontSize: 16,
          textColor: "#18181b",
        },
      },
      visual: {
        rotatedBounds: { x: 0, y: 0, width: 200, height: 120 },
        estimatedTextLines: 2,
        estimatedTextClipped: false,
        overlappingObjectIds: [],
      },
    },
  ],
  commentThreads: [],
  documents: [],
  designTokens: AI_CANVAS_DESIGN_TOKENS,
  serializedBytes: 512,
  truncated: false,
};

function providerResponse(
  argumentsValue: unknown,
  name = "submit_primary_ai_turn",
) {
  return {
    id: "resp_123",
    model: "gpt-5.6-terra",
    output: [
      {
        type: "function_call",
        name,
        arguments: JSON.stringify(argumentsValue),
        call_id: "call_123",
        id: "item_123",
        status: "completed",
      },
    ],
    usage: { input_tokens: 120, output_tokens: 45 },
  } as unknown as Response;
}

function clientReturning(response: Response) {
  const create = vi.fn(
    async (
      body: Parameters<NonNullable<StreamingResponsesClient["create"]>>[0],
      options: Parameters<NonNullable<StreamingResponsesClient["create"]>>[1],
    ) => {
      void body;
      void options;
      return response;
    },
  );
  const stream = vi.fn(
    (body: ResponseCreateParamsStreaming, options: { signal?: AbortSignal }) =>
      ({
        async *[Symbol.asyncIterator]() {
          yield {
            type: "response.function_call_arguments.delta",
            delta: "{}",
          } as ResponseStreamEvent;
        },
        finalResponse: async () => response,
        body,
        options,
      }) as ReturnType<StreamingResponsesClient["stream"]>,
  );
  return { create, stream };
}

describe("OpenAiPrimaryAiGateway", () => {
  it("streams a stateless, bounded, privacy-safe collaborator request", async () => {
    const client = clientReturning(
      providerResponse({
        body: "The adoption claim needs evidence from a real onboarding test.",
        evidence: [{ objectId: ids.object, label: "Adoption assumption" }],
        contextualTargetObjectIds: [ids.object],
        toolCalls: [],
      }),
    );
    const signal = new AbortController().signal;
    const gateway = new OpenAiPrimaryAiGateway({
      apiKey: "test-key",
      model: "gpt-5.6-terra",
      client,
    });

    const result = await gateway.request({
      invocation,
      projection,
      allowedToolNames: allowedAiToolNames("comment_only"),
      signal,
    });

    expect(result).toMatchObject({
      status: "completed",
      requestId: "resp_123",
      reply: {
        body: "The adoption claim needs evidence from a real onboarding test.",
        evidence: [{ objectId: ids.object }],
      },
      toolCalls: [],
      telemetry: {
        model: "gpt-5.6-terra",
        inputTokens: 120,
        outputTokens: 45,
      },
    });
    const [body, options] = client.create.mock.calls[0];
    expect(body).toMatchObject({
      model: "gpt-5.6-terra",
      max_output_tokens: 4_000,
      parallel_tool_calls: false,
      reasoning: { effort: "medium" },
      store: false,
      tool_choice: { type: "function", name: "submit_primary_ai_turn" },
    });
    expect(body).not.toHaveProperty("stream");
    expect(body.safety_identifier).toHaveLength(64);
    expect(body.safety_identifier).not.toContain(ids.user);
    expect(options.signal).toBe(signal);
  });

  it("exposes only authority-allowed executable actions in the strict envelope", () => {
    const tool = buildSubmitTurnTool(allowedAiToolNames("comment_only"));
    const parameters = tool.parameters as {
      properties: {
        toolCalls: { items: { properties: { toolName: { enum: string[] } } } };
      };
    };
    expect(
      parameters.properties.toolCalls.items.properties.toolName.enum,
    ).toEqual(["create_contextual_comment"]);
    expect(tool.strict).toBe(true);
  });

  it("exposes semantic review creation without provider-authored object IDs", () => {
    const tool = buildSubmitTurnTool(allowedAiToolNames("edit_with_review"));
    const serialized = JSON.stringify(tool.parameters);

    expect(serialized).toContain("stage_new_shapes");
    expect(serialized).toContain("stage_new_connectors");
    expect(serialized).toContain('\\"shapes\\"');
    expect(serialized).toContain('\\"key\\"');
    expect(serialized).not.toContain("new-shape:${shape.key}");
  });

  it("accepts the strict trusted scene action only in a scene allowlist", async () => {
    const client = clientReturning(
      providerResponse({
        body: "I added the closing scene.",
        evidence: [{ objectId: ids.object, label: "Customer assumption" }],
        contextualTargetObjectIds: [],
        toolCalls: [
          {
            callKey: "story-scene-1",
            toolName: "execute_story_scene",
            argumentsJson: JSON.stringify({
              action: "create",
              title: "Closing scene",
              narration: "End on the outcome.",
              targetObjectIds: [ids.object],
            }),
          },
        ],
      }),
    );
    const gateway = new OpenAiPrimaryAiGateway({ apiKey: "test-key", client });

    await expect(
      gateway.request({
        invocation: { ...invocation, authority: "trusted_editor" },
        projection,
        allowedToolNames: [...allowedSceneAiToolNames("trusted_editor")],
      }),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          toolName: "execute_story_scene",
          arguments: { action: "create", title: "Closing scene" },
        },
      ],
    });
  });

  it("keeps provider-facing document edits compact and validates them before returning", async () => {
    const tool = buildSubmitTurnTool([
      "propose_document_changes",
      "stage_document_changes",
    ]);
    expect(
      tool.parameters.properties.toolCalls.items.properties,
    ).not.toHaveProperty("argumentsJson");
    expect(
      tool.parameters.properties.toolCalls.items.properties.toolName.enum,
    ).toEqual(["propose_document_changes", "stage_document_changes"]);
    const documentArguments = (
      tool.parameters.properties.toolCalls.items.properties as unknown as {
        arguments: {
          properties: Record<string, unknown>;
          required: string[];
        };
      }
    ).arguments as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(documentArguments.required).toEqual([
      "summary",
      "documentObjectId",
      "operations",
      "whatChanged",
      "why",
    ]);
    expect(documentArguments.properties).not.toHaveProperty("objectCommands");

    const client = clientReturning(
      providerResponse({
        body: "I applied the clearer wording.",
        evidence: [],
        contextualTargetObjectIds: [],
        toolCalls: [
          {
            callKey: "document-edit",
            toolName: "stage_document_changes",
            arguments: {
              summary: "Clarify the selection.",
              documentObjectId: ids.object,
              operations: [
                {
                  kind: "replace_selection",
                  text: "Clearer selected wording.",
                  format: "plain",
                },
              ],
              whatChanged: "Replaced the selected wording.",
              why: "The user approved the suggested clarification.",
            },
          },
        ],
      }),
    );
    const gateway = new OpenAiPrimaryAiGateway({ apiKey: "test-key", client });

    await expect(
      gateway.request({
        invocation: { ...invocation, authority: "edit_with_review" },
        projection,
        allowedToolNames: [
          "propose_document_changes",
          "stage_document_changes",
        ],
      }),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          arguments: {
            operations: [{ format: "plain" }],
            objectCommands: [],
            objectExplanations: [],
          },
        },
      ],
    });
  });

  it("rejects malformed document actions inside the provider retry boundary", async () => {
    const client = clientReturning(
      providerResponse({
        body: "I applied the wording.",
        evidence: [],
        contextualTargetObjectIds: [],
        toolCalls: [
          {
            callKey: "document-edit",
            toolName: "stage_document_changes",
            arguments: {
              documentObjectId: ids.object,
              operations: [],
            },
          },
        ],
      }),
    );
    const gateway = new OpenAiPrimaryAiGateway({ apiKey: "test-key", client });

    await expect(
      gateway.request({
        invocation: { ...invocation, authority: "edit_with_review" },
        projection,
        allowedToolNames: ["stage_document_changes"],
      }),
    ).rejects.toThrow("invalid structured response");
  });

  it("rejects a provider action outside current authority", async () => {
    const client = clientReturning(
      providerResponse({
        body: "I will not apply an unauthorized change.",
        evidence: [],
        contextualTargetObjectIds: [],
        toolCalls: [
          {
            callKey: "forged",
            toolName: "execute_canvas_commands",
            argumentsJson: JSON.stringify({ commands: [] }),
          },
        ],
      }),
    );
    const gateway = new OpenAiPrimaryAiGateway({
      apiKey: "test-key",
      client,
    });
    await expect(
      gateway.request({
        invocation,
        projection,
        allowedToolNames: allowedAiToolNames("comment_only"),
      }),
    ).rejects.toThrow("invalid structured response");
  });

  it("fails before provider access when already cancelled", async () => {
    const client = clientReturning(providerResponse({}));
    const controller = new AbortController();
    controller.abort();
    const gateway = new OpenAiPrimaryAiGateway({
      apiKey: "test-key",
      client,
    });
    await expect(
      gateway.request({
        invocation,
        projection,
        allowedToolNames: allowedAiToolNames("comment_only"),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(client.create).not.toHaveBeenCalled();
    expect(client.stream).not.toHaveBeenCalled();
  });

  it("classifies an upstream gateway timeout", async () => {
    const client = clientReturning(providerResponse({}));
    client.create.mockRejectedValueOnce(new Error("Request timed out."));
    const gateway = new OpenAiPrimaryAiGateway({
      apiKey: "test-key",
      client,
    });

    await expect(
      gateway.request({
        invocation,
        projection,
        allowedToolNames: allowedAiToolNames("comment_only"),
      }),
    ).rejects.toBeInstanceOf(AiProviderTimeoutError);
  });

  it("submits targeted before and after captures to a separate visual gate", async () => {
    const client = clientReturning(
      providerResponse(
        { status: "pass", issues: [], replacementCommandsJson: "" },
        "submit_visual_review",
      ),
    );
    const gateway = new OpenAiPrimaryAiGateway({
      apiKey: "test-key",
      model: "gpt-5.6-luna",
      client,
    });
    const result = await gateway.reviewVisualChange({
      instruction: "Improve spacing.",
      targetObjectIds: [ids.object],
      beforeImageDataUrl: "data:image/png;base64,before",
      afterImageDataUrl: "data:image/png;base64,after",
      proposedCommands: [],
      proposedObjectStates: [projection.objects[0]!.state],
    });
    expect(result).toMatchObject({
      status: "pass",
      issueCount: 0,
      model: "gpt-5.6-terra",
    });
    const [body] = client.stream.mock.calls[0];
    expect(body.tool_choice).toEqual({
      type: "function",
      name: "submit_visual_review",
    });
    expect(JSON.stringify(body.input)).toContain(
      "data:image/png;base64,before",
    );
    expect(JSON.stringify(body.input)).toContain("data:image/png;base64,after");
    expect(body.store).toBe(false);
    expect(body.instructions).toContain("applied after the proposed commands");
  });

  it("parses one bounded visual refinement through the canonical command schema", async () => {
    const replacementCommands = [
      {
        type: "object.move",
        payload: { objectId: ids.object, x: 32, y: 0 },
      },
    ];
    const client = clientReturning(
      providerResponse(
        {
          status: "refine",
          issues: ["The supporting object needs more spacing."],
          replacementCommandsJson: JSON.stringify({
            commands: replacementCommands,
          }),
        },
        "submit_visual_review",
      ),
    );
    const gateway = new OpenAiPrimaryAiGateway({
      apiKey: "test-key",
      client,
    });
    await expect(
      gateway.reviewVisualChange({
        instruction: "Improve spacing.",
        targetObjectIds: [ids.object],
        beforeImageDataUrl: "data:image/png;base64,before",
        afterImageDataUrl: "data:image/png;base64,after",
        proposedCommands: [],
        proposedObjectStates: [projection.objects[0]!.state],
      }),
    ).resolves.toMatchObject({
      status: "refine",
      issueCount: 1,
      replacementCommands,
    });
  });
});

describe("primary AI gateway configuration", () => {
  it("defaults to the deterministic gateway and approved Luna model", () => {
    expect(
      parsePrimaryAiProviderEnvironment({ UNRELATED_SERVER_VALUE: "ignored" }),
    ).toMatchObject({
      THINKING_CANVAS_AI_GATEWAY: "fake",
      OPENAI_RESPONSES_MODEL: "gpt-5.6-luna",
      OPENAI_RESPONSES_TIMEOUT_MS: 45_000,
      OPENAI_RESPONSES_MAX_OUTPUT_TOKENS: 4_000,
    });
    expect(createPrimaryAiGateway({}).constructor.name).toBe(
      "FakePrimaryAiGateway",
    );
  });

  it("requires an explicit server credential before enabling provider access", () => {
    expect(() =>
      createPrimaryAiGateway({ THINKING_CANVAS_AI_GATEWAY: "openai" }),
    ).toThrow("not configured");
  });
});

it("offers no product action in the read-only delegation schema", () => {
  const tool = buildSubmitTurnTool([]);
  expect(tool.parameters.properties.toolCalls.maxItems).toBe(0);
  expect(JSON.stringify(tool)).not.toContain('"enum":[]');
});
