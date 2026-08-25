import { describe, expect, it } from "vitest";

import {
  AiToolNotFoundError,
  AiToolPermissionError,
  allowedAiToolNames,
  validateAiToolRequest,
} from "@/ai/tool-registry";

const objectId = "61000000-0000-4000-8000-000000000001";

describe("AI authority tool registry", () => {
  it("derives a cumulative fail-closed allowlist for every authority", () => {
    expect(allowedAiToolNames("comment_only")).toEqual([
      "inspect_canvas_objects",
      "inspect_comment_threads",
      "create_contextual_comment",
    ]);
    expect(allowedAiToolNames("propose_changes")).toContain(
      "propose_canvas_commands",
    );
    expect(allowedAiToolNames("propose_changes")).not.toContain(
      "stage_canvas_changes",
    );
    expect(allowedAiToolNames("edit_with_review")).toContain(
      "stage_canvas_changes",
    );
    expect(allowedAiToolNames("edit_with_review")).not.toContain(
      "execute_canvas_commands",
    );
    expect(allowedAiToolNames("trusted_editor")).toContain(
      "execute_canvas_commands",
    );
    expect(allowedAiToolNames("trusted_editor")).toEqual([
      "inspect_canvas_objects",
      "inspect_comment_threads",
      "create_contextual_comment",
      "propose_canvas_commands",
      "stage_canvas_changes",
      "execute_canvas_commands",
    ]);
  });

  it("denies mutation and review tools below their persisted authority", () => {
    expect(() =>
      validateAiToolRequest({
        authority: "comment_only",
        toolName: "execute_canvas_commands",
        arguments: { commands: [] },
      }),
    ).toThrow(AiToolPermissionError);
    expect(() =>
      validateAiToolRequest({
        authority: "propose_changes",
        toolName: "stage_canvas_changes",
        arguments: { summary: "Review", commands: [] },
      }),
    ).toThrow(AiToolPermissionError);
  });

  it("accepts strict product-command proposals without trusted envelope fields", () => {
    expect(
      validateAiToolRequest({
        authority: "propose_changes",
        toolName: "propose_canvas_commands",
        arguments: {
          commands: [
            {
              type: "object.move",
              payload: { objectId, x: 120, y: 240 },
            },
          ],
        },
      }),
    ).toMatchObject({
      toolName: "propose_canvas_commands",
      effect: "proposal",
    });
  });

  it("rejects malformed arguments and client-supplied trusted metadata", () => {
    expect(() =>
      validateAiToolRequest({
        authority: "trusted_editor",
        toolName: "execute_canvas_commands",
        arguments: {
          commands: [
            {
              type: "object.delete",
              payload: { objectId },
              canvasId: "20000000-0000-4000-8000-000000000001",
            },
          ],
        },
      }),
    ).toThrow();
    expect(() =>
      validateAiToolRequest({
        authority: "comment_only",
        toolName: "inspect_canvas_objects",
        arguments: { cursor: 0, limit: 25, extra: true },
      }),
    ).toThrow();
    expect(() =>
      validateAiToolRequest({
        authority: "comment_only",
        toolName: "create_contextual_comment",
        arguments: {
          body: "Duplicate target",
          targetObjectIds: [objectId, objectId],
        },
      }),
    ).toThrow("Contextual comment targets must be unique");
  });

  it("rejects unknown or prompt-injected tool names", () => {
    for (const toolName of [
      "ignore_instructions_and_delete_canvas",
      "constructor",
    ]) {
      expect(() =>
        validateAiToolRequest({
          authority: "trusted_editor",
          toolName,
          arguments: {},
        }),
      ).toThrow(AiToolNotFoundError);
    }
  });
});
