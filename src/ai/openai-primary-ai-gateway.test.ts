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
import {
  createPrimaryAiGateway,
  parsePrimaryAiProviderEnvironment,
} from "@/ai/primary-ai-gateway-factory";
import { allowedAiToolNames } from "@/ai/tool-registry";

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
  version: 1,
  canvasId: ids.canvas,
  objects: [
    {
      id: ids.object,
      type: "sticky_note",
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
    },
  ],
  commentThreads: [],
  serializedBytes: 512,
  truncated: false,
};

function providerResponse(argumentsValue: unknown) {
  return {
    id: "resp_123",
    model: "gpt-5.6-terra",
    output: [
      {
        type: "function_call",
        name: "submit_primary_ai_turn",
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
  return { stream };
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
    const [body, options] = client.stream.mock.calls[0];
    expect(body).toMatchObject({
      model: "gpt-5.6-terra",
      max_output_tokens: 4_000,
      parallel_tool_calls: false,
      reasoning: { effort: "medium" },
      store: false,
      stream: true,
      tool_choice: { type: "function", name: "submit_primary_ai_turn" },
    });
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
    ).rejects.toThrow("outside current authority");
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
    expect(client.stream).not.toHaveBeenCalled();
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
