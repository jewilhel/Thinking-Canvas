import { z } from "zod";

import type { AiToolCall } from "@/ai/collaborator-contract";
import type { AiToolName } from "@/ai/tool-registry";

export const EDIT_PROMPT_REPETITIONS = 3;
export const EDIT_PROMPT_OVERALL_PASS_THRESHOLD = 0.95;
export const EDIT_PROMPT_CRITICAL_PASS_THRESHOLD = 1;
export const EDIT_PROMPT_DEADLINE_MS = 75_000;

const editIntentSchema = z.enum([
  "five_stickies",
  "single_shape",
  "background_container",
  "closed_connector_loop",
  "align_objects",
  "distribute_objects",
  "direct_label",
  "direct_style",
  "revision_followup",
  "unsupported_request",
]);

const expectedOutcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("tool"),
    toolName: z.enum([
      "stage_canvas_changes",
      "stage_layout_changes",
      "stage_new_shapes",
      "stage_new_connectors",
    ]),
    exactItemCount: z.number().int().positive().optional(),
    layoutOperation: z
      .enum(["align", "distribute", "normalize_spacing", "resize_to_content"])
      .optional(),
    background: z.boolean().default(false),
    closedLoop: z.boolean().default(false),
  }),
  z.strictObject({ kind: z.literal("safe_refusal") }),
]);

export const editPromptFixtureSchema = z.strictObject({
  id: z.string().regex(/^edit-[a-z0-9-]+-v[1-3]$/),
  intent: editIntentSchema,
  variant: z.number().int().min(1).max(3),
  instruction: z.string().trim().min(1).max(2_000),
  context: z.enum(["world_space", "single_object", "explicit_context"]),
  critical: z.boolean(),
  expected: expectedOutcomeSchema,
});

type FixtureSeed = Omit<
  z.input<typeof editPromptFixtureSchema>,
  "id" | "variant" | "instruction"
> & { prompts: readonly [string, string, string] };

const fixtureSeeds: readonly FixtureSeed[] = [
  {
    intent: "five_stickies",
    context: "world_space",
    critical: true,
    expected: {
      kind: "tool",
      toolName: "stage_new_shapes",
      exactItemCount: 5,
    },
    prompts: [
      "Add five sticky notes labeled Red, Yellow, Orange, Green, and Blue, using the matching color for each note.",
      "Make a set of five colored stickies: one red, one yellow, one orange, one green, and one blue. Put the color name on each.",
      "Create Red, Yellow, Orange, Green, and Blue sticky notes. Each should have its own color and display that color's name.",
    ],
  },
  {
    intent: "single_shape",
    context: "world_space",
    critical: false,
    expected: {
      kind: "tool",
      toolName: "stage_new_shapes",
      exactItemCount: 1,
    },
    prompts: [
      "Create one blue diamond labeled Decision.",
      "Add a single diamond with a blue fill and the word Decision centered inside it.",
      "Place a blue decision diamond here and label it Decision.",
    ],
  },
  {
    intent: "background_container",
    context: "world_space",
    critical: true,
    expected: {
      kind: "tool",
      toolName: "stage_new_shapes",
      exactItemCount: 1,
      background: true,
    },
    prompts: [
      "Add a large grey circle behind all five sticky notes. Keep every sticky exactly where it is and place them inside the circle.",
      "Without moving the notes, put one big gray circular background beneath them that contains the whole set.",
      "Create a large grey ellipse as a background behind the stickies and size it to surround them; do not reposition any sticky.",
    ],
  },
  {
    intent: "closed_connector_loop",
    context: "world_space",
    critical: true,
    expected: {
      kind: "tool",
      toolName: "stage_new_connectors",
      exactItemCount: 5,
      closedLoop: true,
    },
    prompts: [
      "Connect the five sticky notes clockwise in a closed loop.",
      "Draw directional connectors from each sticky to the next one clockwise, including the final arrow back to the first.",
      "Link every colored note into one clockwise circle of arrows so there are no open ends.",
    ],
  },
  {
    intent: "align_objects",
    context: "explicit_context",
    critical: false,
    expected: {
      kind: "tool",
      toolName: "stage_layout_changes",
      layoutOperation: "align",
    },
    prompts: [
      "Align all five selected sticky notes along their top edges.",
      "Make the selected stickies share the same top alignment.",
      "Line up these five notes across the top without changing their sizes.",
    ],
  },
  {
    intent: "distribute_objects",
    context: "explicit_context",
    critical: false,
    expected: {
      kind: "tool",
      toolName: "stage_layout_changes",
      layoutOperation: "distribute",
    },
    prompts: [
      "Distribute the selected sticky notes evenly from left to right.",
      "Give these five notes equal horizontal spacing between the first and last.",
      "Space the selected stickies evenly across the row.",
    ],
  },
  {
    intent: "direct_label",
    context: "single_object",
    critical: true,
    expected: { kind: "tool", toolName: "stage_canvas_changes" },
    prompts: [
      "Rename this sticky note to Evidence.",
      "Change only this object's label so it reads Evidence.",
      "Replace the text on this note with Evidence and leave everything else alone.",
    ],
  },
  {
    intent: "direct_style",
    context: "single_object",
    critical: false,
    expected: { kind: "tool", toolName: "stage_canvas_changes" },
    prompts: [
      "Make this sticky dark blue with white text.",
      "Restyle only this note with a navy fill and readable white lettering.",
      "Change this object's background to dark blue and its text color to white.",
    ],
  },
  {
    intent: "revision_followup",
    context: "single_object",
    critical: false,
    expected: { kind: "tool", toolName: "stage_canvas_changes" },
    prompts: [
      "Move it a little farther to the right than the last change.",
      "Revise that result by shifting this object right again.",
      "Please adjust the previous change: move this same note another 40 pixels to the right.",
    ],
  },
  {
    intent: "unsupported_request",
    context: "world_space",
    critical: true,
    expected: { kind: "safe_refusal" },
    prompts: [
      "Generate a photorealistic image and place it on this canvas.",
      "Start a live video meeting with everyone viewing this canvas.",
      "Create and run an embedded spreadsheet formula engine inside the board.",
    ],
  },
];

export const EDIT_PROMPT_FIXTURES = z
  .array(editPromptFixtureSchema)
  .length(30)
  .readonly()
  .parse(
    fixtureSeeds.flatMap((seed) =>
      seed.prompts.map((instruction, index) => ({
        id: `edit-${seed.intent.replaceAll("_", "-")}-v${index + 1}`,
        intent: seed.intent,
        variant: index + 1,
        instruction,
        context: seed.context,
        critical: seed.critical,
        expected: seed.expected,
      })),
    ),
  );

const technicalReplyPattern =
  /\b(?:uuid|object id|tool call|canvas tools|stage_(?:new|canvas|layout)[a-z_]*|object\.(?:create|move|resize|style|patch)|database state|command name)\b/i;
const uuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const refusalPattern =
  /\b(?:can(?:not|'t|’t)|unable|is(?: not|n't|n’t) (?:available|supported)|not (?:available|supported)|does not support|need (?:more|a clearer)|clarif)/i;
const inventedUnsupportedCapabilityPattern =
  /\b(?:image upload|upload feature|hidden (?:action|tool)|install (?:a )?plugin)\b/i;

function projectedReferences(
  value: unknown,
  projectedIds: ReadonlySet<string>,
) {
  const references = new Set<string>();
  const visit = (candidate: unknown) => {
    if (typeof candidate === "string" && projectedIds.has(candidate)) {
      references.add(candidate);
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (candidate && typeof candidate === "object") {
      Object.values(candidate).forEach(visit);
    }
  };
  visit(value);
  return references;
}

function isClosedConnectorLoop(
  connectors: Array<{ fromObjectId: string; toObjectId: string }>,
  targetIds: ReadonlySet<string>,
) {
  if (connectors.length !== targetIds.size) return false;
  const nextBySource = new Map<string, string>();
  const destinations = new Set<string>();
  for (const connector of connectors) {
    if (
      !targetIds.has(connector.fromObjectId) ||
      !targetIds.has(connector.toObjectId) ||
      connector.fromObjectId === connector.toObjectId ||
      nextBySource.has(connector.fromObjectId) ||
      destinations.has(connector.toObjectId)
    ) {
      return false;
    }
    nextBySource.set(connector.fromObjectId, connector.toObjectId);
    destinations.add(connector.toObjectId);
  }
  const first = targetIds.values().next().value as string | undefined;
  if (!first) return false;
  let current = first;
  const visited = new Set<string>();
  for (let index = 0; index < targetIds.size; index += 1) {
    if (visited.has(current)) return false;
    visited.add(current);
    const next = nextBySource.get(current);
    if (!next) return false;
    current = next;
  }
  return current === first && visited.size === targetIds.size;
}

export type EditPromptFailureCode =
  | "provider_failure"
  | "deadline"
  | "technical_reply"
  | "unsafe_refusal"
  | "unexpected_tool_count"
  | "unexpected_tool"
  | "semantic_mismatch"
  | "scope_violation";

export function evaluateEditPromptResult(input: {
  fixture: z.infer<typeof editPromptFixtureSchema>;
  replyBody: string;
  toolCalls: AiToolCall[];
  projectedObjectIds: string[];
  scopedObjectIds: string[];
}) {
  const failures = new Set<EditPromptFailureCode>();
  if (
    technicalReplyPattern.test(input.replyBody) ||
    uuidPattern.test(input.replyBody)
  ) {
    failures.add("technical_reply");
  }
  if (input.fixture.expected.kind === "safe_refusal") {
    if (input.toolCalls.length !== 0) failures.add("unexpected_tool_count");
    if (
      !refusalPattern.test(input.replyBody) ||
      inventedUnsupportedCapabilityPattern.test(input.replyBody)
    ) {
      failures.add("unsafe_refusal");
    }
    return { passed: failures.size === 0, failureCodes: [...failures] };
  }
  if (input.toolCalls.length !== 1) failures.add("unexpected_tool_count");
  const call = input.toolCalls[0];
  if (!call || call.toolName !== input.fixture.expected.toolName) {
    failures.add("unexpected_tool");
    return { passed: false, failureCodes: [...failures] };
  }
  const projectedIds = new Set(input.projectedObjectIds);
  const scopedIds = new Set(input.scopedObjectIds);
  const references = projectedReferences(call.arguments, projectedIds);
  if ([...references].some((id) => !scopedIds.has(id))) {
    failures.add("scope_violation");
  }
  if (call.toolName === "stage_new_shapes") {
    const shapes = Array.isArray(call.arguments.shapes)
      ? call.arguments.shapes
      : [];
    if (
      input.fixture.expected.exactItemCount !== undefined &&
      shapes.length !== input.fixture.expected.exactItemCount
    ) {
      failures.add("semantic_mismatch");
    }
    if (input.fixture.intent === "five_stickies") {
      const labels = new Set(
        shapes.map((shape) =>
          String((shape as { text?: unknown }).text ?? "").toLowerCase(),
        ),
      );
      const fills = new Set(
        shapes.map((shape) => String((shape as { fill?: unknown }).fill ?? "")),
      );
      if (
        !["red", "yellow", "orange", "green", "blue"].every((label) =>
          labels.has(label),
        ) ||
        fills.size !== 5
      ) {
        failures.add("semantic_mismatch");
      }
    }
    if (input.fixture.expected.background) {
      const shape = shapes[0] as
        { shape?: unknown; layer?: unknown } | undefined;
      if (shape?.shape !== "ellipse" || shape.layer !== "back") {
        failures.add("semantic_mismatch");
      }
    }
  } else if (call.toolName === "stage_new_connectors") {
    const connectors = Array.isArray(call.arguments.connectors)
      ? (call.arguments.connectors as Array<{
          fromObjectId: string;
          toObjectId: string;
        }>)
      : [];
    if (
      input.fixture.expected.exactItemCount !== undefined &&
      connectors.length !== input.fixture.expected.exactItemCount
    ) {
      failures.add("semantic_mismatch");
    }
    if (
      input.fixture.expected.closedLoop &&
      !isClosedConnectorLoop(connectors, scopedIds)
    ) {
      failures.add("semantic_mismatch");
    }
  } else if (call.toolName === "stage_layout_changes") {
    const layout = call.arguments.layout as
      { operation?: unknown; objectIds?: unknown } | undefined;
    const layoutObjectIds = Array.isArray(layout?.objectIds)
      ? layout.objectIds
      : [];
    if (
      layout?.operation !== input.fixture.expected.layoutOperation ||
      layoutObjectIds.length !== scopedIds.size ||
      layoutObjectIds.some((id) => !scopedIds.has(String(id)))
    ) {
      failures.add("semantic_mismatch");
    }
  } else if (call.toolName === "stage_canvas_changes") {
    if (
      references.size === 0 ||
      [...scopedIds].some((id) => !references.has(id))
    ) {
      failures.add("semantic_mismatch");
    }
  }
  return { passed: failures.size === 0, failureCodes: [...failures] };
}

export const editPromptObservationSchema = z.strictObject({
  fixtureId: z.string().min(1),
  repetition: z.number().int().positive(),
  passed: z.boolean(),
  failureCodes: z.array(z.string().min(1)).max(20),
  latencyMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  providerRequestId: z.string().min(1).max(255),
  observedToolNames: z.array(z.string().min(1).max(120)).max(8),
});

export function summarizeEditPromptEvaluation(input: {
  repetitions: number;
  observations: unknown[];
}) {
  const repetitions = z
    .number()
    .int()
    .positive()
    .max(10)
    .parse(input.repetitions);
  const observations = z
    .array(editPromptObservationSchema)
    .parse(input.observations);
  if (observations.length !== EDIT_PROMPT_FIXTURES.length * repetitions) {
    throw new Error("Every edit prompt fixture must have every repetition.");
  }
  const fixturesById = new Map(
    EDIT_PROMPT_FIXTURES.map((fixture) => [fixture.id, fixture]),
  );
  const seen = new Set<string>();
  for (const observation of observations) {
    if (
      !fixturesById.has(observation.fixtureId) ||
      observation.repetition > repetitions ||
      seen.has(`${observation.fixtureId}:${observation.repetition}`)
    ) {
      throw new Error(
        "Edit observations must match unique fixture repetitions.",
      );
    }
    seen.add(`${observation.fixtureId}:${observation.repetition}`);
  }
  const critical = observations.filter(
    (observation) => fixturesById.get(observation.fixtureId)?.critical,
  );
  const overallPassRate =
    observations.filter((observation) => observation.passed).length /
    observations.length;
  const criticalPassRate =
    critical.filter((observation) => observation.passed).length /
    critical.length;
  const deadlineBreaches = observations.filter((observation) =>
    observation.failureCodes.includes("deadline"),
  ).length;
  const sortedLatencies = observations
    .map((observation) => observation.latencyMs)
    .sort((left, right) => left - right);
  const totalLatencyMs = sortedLatencies.reduce(
    (total, latency) => total + latency,
    0,
  );
  return {
    fixtureCount: EDIT_PROMPT_FIXTURES.length,
    repetitions,
    observationCount: observations.length,
    overallPassRate,
    criticalPassRate,
    deadlineBreaches,
    passed:
      overallPassRate >= EDIT_PROMPT_OVERALL_PASS_THRESHOLD &&
      criticalPassRate >= EDIT_PROMPT_CRITICAL_PASS_THRESHOLD &&
      deadlineBreaches === 0,
    totalLatencyMs,
    averageLatencyMs: Math.round(totalLatencyMs / observations.length),
    p95LatencyMs:
      sortedLatencies[Math.ceil(sortedLatencies.length * 0.95) - 1] ?? 0,
    maximumLatencyMs: sortedLatencies.at(-1) ?? 0,
    failedObservations: observations
      .filter((observation) => !observation.passed)
      .map((observation) => ({
        fixtureId: observation.fixtureId,
        repetition: observation.repetition,
        failureCodes: observation.failureCodes,
        observedToolNames: observation.observedToolNames,
        providerRequestId: observation.providerRequestId,
      })),
    totalInputTokens: observations.reduce(
      (total, observation) => total + observation.inputTokens,
      0,
    ),
    totalOutputTokens: observations.reduce(
      (total, observation) => total + observation.outputTokens,
      0,
    ),
    estimatedCostUsd: observations.reduce(
      (total, observation) => total + observation.estimatedCostUsd,
      0,
    ),
  };
}

export function expectedEditToolNames() {
  return new Set<AiToolName>(
    EDIT_PROMPT_FIXTURES.flatMap((fixture) =>
      fixture.expected.kind === "tool" ? [fixture.expected.toolName] : [],
    ),
  );
}
