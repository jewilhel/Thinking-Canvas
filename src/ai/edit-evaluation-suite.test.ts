import { describe, expect, it } from "vitest";

import type { AiToolCall } from "@/ai/collaborator-contract";
import {
  EDIT_PROMPT_FIXTURES,
  EDIT_PROMPT_REPETITIONS,
  evaluateEditPromptResult,
  expectedEditToolNames,
  summarizeEditPromptEvaluation,
} from "@/ai/edit-evaluation-suite";

const stickyIds = [
  "00000000-0000-4000-8000-000000000201",
  "00000000-0000-4000-8000-000000000202",
  "00000000-0000-4000-8000-000000000203",
  "00000000-0000-4000-8000-000000000204",
  "00000000-0000-4000-8000-000000000205",
];

function fixture(intent: (typeof EDIT_PROMPT_FIXTURES)[number]["intent"]) {
  return EDIT_PROMPT_FIXTURES.find((candidate) => candidate.intent === intent)!;
}

function call(
  toolName: AiToolCall["toolName"],
  argumentsValue: Record<string, unknown>,
): AiToolCall {
  return { callKey: "evaluation-call", toolName, arguments: argumentsValue };
}

function observations(failed: string[] = []) {
  return EDIT_PROMPT_FIXTURES.flatMap((candidate, fixtureIndex) =>
    Array.from({ length: EDIT_PROMPT_REPETITIONS }, (_, repetitionIndex) => ({
      fixtureId: candidate.id,
      repetition: repetitionIndex + 1,
      passed: !failed.includes(candidate.id),
      failureCodes: failed.includes(candidate.id)
        ? [candidate.critical ? "scope_violation" : "semantic_mismatch"]
        : [],
      latencyMs: 100 + fixtureIndex,
      inputTokens: 500,
      outputTokens: 200,
      estimatedCostUsd: 0.001,
      providerRequestId: `request-${fixtureIndex}-${repetitionIndex}`,
      observedToolNames:
        candidate.expected.kind === "tool" ? [candidate.expected.toolName] : [],
    })),
  );
}

describe("edit prompt evaluation suite", () => {
  it("defines ten intents with three distinct phrasings and the complete edit tool surface", () => {
    const byIntent = new Map<string, Set<string>>();
    for (const candidate of EDIT_PROMPT_FIXTURES) {
      const prompts = byIntent.get(candidate.intent) ?? new Set<string>();
      prompts.add(candidate.instruction.toLowerCase());
      byIntent.set(candidate.intent, prompts);
    }
    expect(byIntent.size).toBe(10);
    expect([...byIntent.values()].every((prompts) => prompts.size === 3)).toBe(
      true,
    );
    expect(expectedEditToolNames()).toEqual(
      new Set([
        "stage_canvas_changes",
        "stage_layout_changes",
        "stage_new_shapes",
        "stage_new_connectors",
      ]),
    );
  });

  it("accepts five distinct labeled stickies and rejects technical reply copy", () => {
    const toolCall = call("stage_new_shapes", {
      summary: "Five labeled notes",
      shapes: [
        ["red", "Red", "#ef4444"],
        ["yellow", "Yellow", "#eab308"],
        ["orange", "Orange", "#f97316"],
        ["green", "Green", "#22c55e"],
        ["blue", "Blue", "#3b82f6"],
      ].map(([key, text, fill]) => ({ key, text, fill })),
      explanations: [],
    });
    expect(
      evaluateEditPromptResult({
        fixture: fixture("five_stickies"),
        replyBody: "I created five labeled sticky notes in matching colors.",
        toolCalls: [toolCall],
        projectedObjectIds: [],
        scopedObjectIds: [],
      }),
    ).toEqual({ passed: true, failureCodes: [] });
    expect(
      evaluateEditPromptResult({
        fixture: fixture("five_stickies"),
        replyBody: "I used stage_new_shapes with object IDs.",
        toolCalls: [toolCall],
        projectedObjectIds: [],
        scopedObjectIds: [],
      }),
    ).toMatchObject({ passed: false, failureCodes: ["technical_reply"] });
  });

  it("requires a true closed connector cycle over the scoped sticky set", () => {
    const connectors = stickyIds.map((fromObjectId, index) => ({
      key: `connector-${index}`,
      fromObjectId,
      toObjectId: stickyIds[(index + 1) % stickyIds.length],
    }));
    const valid = call("stage_new_connectors", {
      summary: "Clockwise loop",
      connectors,
      explanations: [],
    });
    expect(
      evaluateEditPromptResult({
        fixture: fixture("closed_connector_loop"),
        replyBody: "I connected the notes in a closed clockwise loop.",
        toolCalls: [valid],
        projectedObjectIds: stickyIds,
        scopedObjectIds: stickyIds,
      }),
    ).toEqual({ passed: true, failureCodes: [] });
    const open = call("stage_new_connectors", {
      summary: "Open chain",
      connectors: connectors.slice(0, -1),
      explanations: [],
    });
    expect(
      evaluateEditPromptResult({
        fixture: fixture("closed_connector_loop"),
        replyBody: "I connected the notes.",
        toolCalls: [open],
        projectedObjectIds: stickyIds,
        scopedObjectIds: stickyIds,
      }).failureCodes,
    ).toContain("semantic_mismatch");
  });

  it("blocks direct-object scope leakage and requires a clear unsupported response", () => {
    const direct = call("stage_canvas_changes", {
      summary: "Change a label",
      commands: [
        {
          type: "object.patch",
          payload: { objectId: stickyIds[1], patch: { text: "Evidence" } },
        },
      ],
      explanations: [
        {
          objectId: stickyIds[1],
          whatChanged: "Changed the label.",
          why: "The requested label is clearer.",
        },
      ],
    });
    expect(
      evaluateEditPromptResult({
        fixture: fixture("direct_label"),
        replyBody: "I changed the note's label.",
        toolCalls: [direct],
        projectedObjectIds: stickyIds,
        scopedObjectIds: [stickyIds[0]],
      }).failureCodes,
    ).toContain("scope_violation");
    expect(
      evaluateEditPromptResult({
        fixture: fixture("unsupported_request"),
        replyBody: "I can't create or place photorealistic images yet.",
        toolCalls: [],
        projectedObjectIds: stickyIds,
        scopedObjectIds: stickyIds,
      }),
    ).toEqual({ passed: true, failureCodes: [] });
  });

  it("enforces unique complete repetitions and the critical/overall thresholds", () => {
    expect(
      summarizeEditPromptEvaluation({
        repetitions: EDIT_PROMPT_REPETITIONS,
        observations: observations(),
      }),
    ).toMatchObject({
      fixtureCount: 30,
      observationCount: 90,
      overallPassRate: 1,
      criticalPassRate: 1,
      deadlineBreaches: 0,
      passed: true,
    });
    const noncritical = fixture("single_shape").id;
    expect(
      summarizeEditPromptEvaluation({
        repetitions: EDIT_PROMPT_REPETITIONS,
        observations: observations([noncritical]),
      }).passed,
    ).toBe(true);
    const critical = fixture("closed_connector_loop").id;
    expect(
      summarizeEditPromptEvaluation({
        repetitions: EDIT_PROMPT_REPETITIONS,
        observations: observations([critical]),
      }).passed,
    ).toBe(false);
    expect(() =>
      summarizeEditPromptEvaluation({
        repetitions: EDIT_PROMPT_REPETITIONS,
        observations: observations().slice(1),
      }),
    ).toThrow("Every edit prompt");
  });
});
