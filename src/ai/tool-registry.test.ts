import { describe, expect, it } from "vitest";

import {
  AiToolNotFoundError,
  AiToolPermissionError,
  allowedAiToolNames,
  allowedVoiceAiToolNames,
  allowedDocumentRangeAiToolNames,
  allowedSceneAiToolNames,
  storySceneArgumentsSchema,
  validateAiToolRequest,
} from "@/ai/tool-registry";

const objectId = "61000000-0000-4000-8000-000000000001";

describe("AI authority tool registry", () => {
  it("permits voice object execution only at Trusted Editor authority", () => {
    for (const authority of [
      "comment_only",
      "propose_changes",
      "edit_with_review",
    ] as const) {
      expect(allowedVoiceAiToolNames(authority)).toEqual([
        "create_contextual_comment",
      ]);
    }
    expect(allowedVoiceAiToolNames("trusted_editor")).toEqual([
      "create_contextual_comment",
      "execute_canvas_commands",
    ]);
  });
  it("derives a cumulative fail-closed allowlist for every authority", () => {
    expect(allowedAiToolNames("comment_only")).toEqual([
      "inspect_canvas_objects",
      "inspect_comment_threads",
      "create_contextual_comment",
    ]);
    expect(allowedAiToolNames("propose_changes")).toContain(
      "propose_canvas_commands",
    );
    expect(allowedAiToolNames("propose_changes")).toContain(
      "propose_document_changes",
    );
    expect(allowedAiToolNames("propose_changes")).not.toContain(
      "stage_canvas_changes",
    );
    expect(allowedAiToolNames("edit_with_review")).toContain(
      "stage_canvas_changes",
    );
    expect(allowedAiToolNames("edit_with_review")).toContain(
      "stage_document_changes",
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
      "propose_document_changes",
      "stage_canvas_changes",
      "stage_document_changes",
      "stage_layout_changes",
      "stage_new_shapes",
      "stage_new_connectors",
      "stage_new_annotations",
      "execute_canvas_commands",
      "execute_document_changes",
    ]);
  });

  it("limits document range conversations to document-specific actions", () => {
    expect(allowedDocumentRangeAiToolNames("comment_only")).toEqual([
      "create_contextual_comment",
    ]);
    expect(allowedDocumentRangeAiToolNames("propose_changes")).toEqual([
      "propose_document_changes",
    ]);
    expect(allowedDocumentRangeAiToolNames("edit_with_review")).toEqual([
      "propose_document_changes",
      "stage_document_changes",
    ]);
    expect(allowedDocumentRangeAiToolNames("trusted_editor")).toEqual([
      "propose_document_changes",
      "execute_document_changes",
    ]);
  });

  it("exposes story mutation only to a trusted editor in scene context", () => {
    expect(allowedSceneAiToolNames("comment_only")).toEqual([
      "inspect_canvas_objects",
      "inspect_comment_threads",
    ]);
    expect(allowedSceneAiToolNames("propose_changes")).not.toContain(
      "execute_story_scene",
    );
    expect(allowedSceneAiToolNames("edit_with_review")).not.toContain(
      "execute_story_scene",
    );
    expect(allowedSceneAiToolNames("trusted_editor")).toContain(
      "execute_story_scene",
    );
    expect(allowedAiToolNames("trusted_editor")).not.toContain(
      "execute_story_scene",
    );
  });

  it("validates strict grounded scene creation and current-scene updates", () => {
    expect(
      storySceneArgumentsSchema.parse({
        action: "create",
        title: "Overview",
        narration: "Start with the full map.",
        targetObjectIds: [objectId],
      }),
    ).toMatchObject({ action: "create", title: "Overview" });
    expect(() =>
      storySceneArgumentsSchema.parse({
        action: "create",
        title: "Overview",
        targetObjectIds: [objectId],
        sceneId: objectId,
      }),
    ).toThrow();
    expect(() =>
      storySceneArgumentsSchema.parse({ action: "update_current" }),
    ).toThrow();
  });

  it("validates semantic document actions without accepting raw Yjs state", () => {
    expect(
      validateAiToolRequest({
        authority: "edit_with_review",
        toolName: "stage_document_changes",
        arguments: {
          summary: "Clarify the selected phrase.",
          documentObjectId: objectId,
          operations: [
            {
              kind: "replace_selection",
              text: "clearer phrase",
              format: "bold",
            },
          ],
          whatChanged: "Replaced and emphasized the selected phrase.",
          why: "The comment requested clearer wording.",
        },
      }),
    ).toMatchObject({ toolName: "stage_document_changes", effect: "review" });
    expect(() =>
      validateAiToolRequest({
        authority: "edit_with_review",
        toolName: "stage_document_changes",
        arguments: {
          summary: "Injected state",
          documentObjectId: objectId,
          operations: [{ kind: "replace_selection", text: "safe" }],
          whatChanged: "Changed text.",
          why: "Requested.",
          yjsUpdate: "untrusted",
        },
      }),
    ).toThrow();
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
    expect(() =>
      validateAiToolRequest({
        authority: "comment_only",
        toolName: "propose_document_changes",
        arguments: {},
      }),
    ).toThrow(AiToolPermissionError);
    expect(() =>
      validateAiToolRequest({
        authority: "propose_changes",
        toolName: "stage_document_changes",
        arguments: {},
      }),
    ).toThrow(AiToolPermissionError);
    expect(() =>
      validateAiToolRequest({
        authority: "edit_with_review",
        toolName: "execute_document_changes",
        arguments: {},
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

  it("accepts server-identified multi-shape review creation", () => {
    expect(
      validateAiToolRequest({
        authority: "edit_with_review",
        toolName: "stage_new_shapes",
        arguments: {
          summary: "Create two reviewable sticky notes.",
          shapes: ["red", "blue"].map((key, index) => ({
            key,
            shape: "rectangle",
            text: key,
            x: index * 224,
            y: 0,
            width: 200,
            height: 120,
            fill: key,
            outline: "#18181b",
            outlineWidth: 2,
            fontFamily: "Inter",
            fontSize: 16,
            fontWeight: "bold",
            textAlign: "center",
            textColor: "#18181b",
          })),
          explanations: ["red", "blue"].map((key) => ({
            key,
            whatChanged: `Created the ${key} sticky note.`,
            why: "The comment requested a labeled color set.",
          })),
        },
      }),
    ).toMatchObject({ toolName: "stage_new_shapes", effect: "review" });
  });

  it("accepts server-identified directional connector creation", () => {
    expect(
      validateAiToolRequest({
        authority: "edit_with_review",
        toolName: "stage_new_connectors",
        arguments: {
          summary: "Connect the notes clockwise.",
          connectors: [
            {
              key: "first-to-second",
              fromObjectId: objectId,
              toObjectId: "61000000-0000-4000-8000-000000000002",
              outline: "#475569",
              outlineWidth: 2,
            },
          ],
          explanations: [
            {
              key: "first-to-second",
              whatChanged: "Connected the first note to the second.",
              why: "The user requested a clockwise path.",
            },
          ],
        },
      }),
    ).toMatchObject({ toolName: "stage_new_connectors", effect: "review" });
  });

  it("accepts bounded server-identified annotation creation", () => {
    expect(
      validateAiToolRequest({
        authority: "edit_with_review",
        toolName: "stage_new_annotations",
        arguments: {
          summary: "Create one freeform annotation.",
          annotations: [
            {
              key: "stroke",
              points: [
                { x: 100, y: 100 },
                { x: 180, y: 140, pressure: 0.8 },
              ],
              outline: "#7c3aed",
              outlineWidth: 5,
            },
          ],
          explanations: [
            {
              key: "stroke",
              whatChanged: "Added a freeform annotation.",
              why: "The user requested it.",
            },
          ],
        },
      }),
    ).toMatchObject({ toolName: "stage_new_annotations", effect: "review" });
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
