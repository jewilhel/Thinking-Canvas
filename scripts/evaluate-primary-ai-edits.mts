import type { AiProjectionEnvelope } from "../src/ai/collaborator-contract";
import {
  EDIT_PROMPT_DEADLINE_MS,
  EDIT_PROMPT_FIXTURES,
  EDIT_PROMPT_REPETITIONS,
  evaluateEditPromptResult,
  summarizeEditPromptEvaluation,
} from "../src/ai/edit-evaluation-suite";
import {
  AI_EVALUATION_CANDIDATES,
  aiEvaluationCandidateSchema,
} from "../src/ai/evaluation-suite";
import { OpenAiPrimaryAiGateway } from "../src/ai/openai-primary-ai-gateway";
import { allowedAiToolNames } from "../src/ai/tool-registry";
import { AI_CANVAS_DESIGN_TOKENS } from "../src/ai/visual-grounding";

const ids = {
  canvas: "00000000-0000-4000-8000-000000000100",
  user: "00000000-0000-4000-8000-000000000101",
  comment: "00000000-0000-4000-8000-000000000102",
  stickies: [
    "00000000-0000-4000-8000-000000000201",
    "00000000-0000-4000-8000-000000000202",
    "00000000-0000-4000-8000-000000000203",
    "00000000-0000-4000-8000-000000000204",
    "00000000-0000-4000-8000-000000000205",
  ],
} as const;

const stickySpecs = [
  { text: "Red", fill: "#fecaca", x: 420, y: 120 },
  { text: "Yellow", fill: "#fef3c7", x: 650, y: 240 },
  { text: "Orange", fill: "#fed7aa", x: 570, y: 500 },
  { text: "Green", fill: "#bbf7d0", x: 270, y: 500 },
  { text: "Blue", fill: "#bfdbfe", x: 190, y: 240 },
] as const;

function buildProjection(input: {
  fixture: (typeof EDIT_PROMPT_FIXTURES)[number];
}): AiProjectionEnvelope {
  const seededObjects = ids.stickies.map((id, index) => {
    const spec = stickySpecs[index]!;
    const geometry = {
      x: spec.x,
      y: spec.y,
      width: 180,
      height: 120,
      rotation: 0,
    };
    return {
      id,
      type: "shape",
      summary: `${spec.text} sticky note`,
      geometry,
      groupId: null,
      orderIndex: index,
      relationshipIds: [],
      state: {
        schemaVersion: 2 as const,
        id,
        canvasId: ids.canvas,
        createdBy: ids.user,
        createdAt: "2026-08-28T12:00:00.000Z",
        updatedAt: "2026-08-28T12:00:00.000Z",
        type: "shape" as const,
        shape: "rectangle" as const,
        text: spec.text,
        geometry,
        style: {
          fill: spec.fill,
          outline: "#52525b",
          outlineWidth: 2,
          fontFamily: "Inter",
          fontSize: 18,
          textColor: "#18181b",
        },
      },
      visual: {
        rotatedBounds: {
          x: geometry.x,
          y: geometry.y,
          width: geometry.width,
          height: geometry.height,
        },
        estimatedTextLines: 1,
        estimatedTextClipped: false,
        overlappingObjectIds: [],
      },
    };
  });
  const objects = input.fixture.intent === "five_stickies" ? [] : seededObjects;
  const targetObjectIds =
    input.fixture.context === "world_space"
      ? []
      : input.fixture.context === "single_object"
        ? [ids.stickies[0]]
        : [...ids.stickies];
  const base = {
    version: 2 as const,
    canvasId: ids.canvas,
    objects,
    commentThreads: [
      {
        id: ids.comment,
        status: "open" as const,
        targetObjectIds,
        summary:
          input.fixture.intent === "revision_followup"
            ? "The AI moved the targeted sticky note to the right; the user is requesting a follow-up adjustment."
            : "A synthetic Milestone 5 edit-evaluation comment.",
        participantKeys: ["human:synthetic-owner", "ai:primary-ai"],
        createdAt: "2026-08-28T12:00:00.000Z",
        updatedAt: "2026-08-28T12:01:00.000Z",
      },
    ],
    designTokens: AI_CANVAS_DESIGN_TOKENS,
    truncated: false,
  };
  return {
    ...base,
    serializedBytes: new TextEncoder().encode(JSON.stringify(base)).length,
  };
}

function scopeFor(
  fixture: (typeof EDIT_PROMPT_FIXTURES)[number],
  projection: AiProjectionEnvelope,
) {
  return fixture.context === "single_object"
    ? [ids.stickies[0]]
    : projection.objects.map((object) => object.id);
}

function candidatePrice(candidate: (typeof AI_EVALUATION_CANDIDATES)[number]) {
  return {
    "gpt-5.6-terra": { input: 2, output: 12 },
    "gpt-5.6-sol": { input: 5, output: 30 },
    "gpt-5.6-luna": { input: 0.2, output: 1.2 },
  }[candidate];
}

function estimatedCostUsd(
  candidate: (typeof AI_EVALUATION_CANDIDATES)[number],
  inputTokens: number,
  outputTokens: number,
) {
  const price = candidatePrice(candidate);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

function evaluationUuid(
  kind: number,
  fixtureIndex: number,
  repetition: number,
) {
  return `00000000-0000-4000-8000-${String(kind * 100_000 + fixtureIndex * 10 + repetition).padStart(12, "0")}`;
}

async function runFixture(input: {
  candidate: (typeof AI_EVALUATION_CANDIDATES)[number];
  fixture: (typeof EDIT_PROMPT_FIXTURES)[number];
  fixtureIndex: number;
  repetition: number;
  debug: boolean;
}) {
  const projection = buildProjection({ fixture: input.fixture });
  const scopedObjectIds = scopeFor(input.fixture, projection);
  const gateway = new OpenAiPrimaryAiGateway({
    model: input.candidate,
    maxOutputTokens: 4_000,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EDIT_PROMPT_DEADLINE_MS);
  const startedAt = Date.now();
  try {
    const result = await gateway.request({
      invocation: {
        runId: evaluationUuid(3, input.fixtureIndex, input.repetition),
        canvasId: ids.canvas,
        commentId: ids.comment,
        replyId:
          input.fixture.intent === "revision_followup"
            ? evaluationUuid(6, input.fixtureIndex, input.repetition)
            : null,
        requestedBy: ids.user,
        idempotencyKey: evaluationUuid(5, input.fixtureIndex, input.repetition),
        authority: "edit_with_review",
        instruction: input.fixture.instruction,
        selectedPathIds:
          input.fixture.context === "world_space" ? [] : scopedObjectIds,
        reviewContext: {
          kind: input.fixture.context,
          objectIds:
            input.fixture.context === "world_space" ? [] : scopedObjectIds,
          canvasAnchor:
            input.fixture.context === "world_space" ? { x: 430, y: 330 } : null,
        },
      },
      projection,
      allowedToolNames: allowedAiToolNames("edit_with_review"),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (result.status !== "completed") {
      return {
        fixtureId: input.fixture.id,
        repetition: input.repetition,
        passed: false,
        failureCodes: ["provider_failure"],
        latencyMs: Date.now() - startedAt,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        providerRequestId: result.requestId,
        observedToolNames: [],
      };
    }
    if (input.debug) console.error(`Synthetic reply: ${result.reply.body}`);
    const evaluation = evaluateEditPromptResult({
      fixture: input.fixture,
      replyBody: result.reply.body,
      toolCalls: result.toolCalls,
      projectedObjectIds: projection.objects.map((object) => object.id),
      scopedObjectIds,
    });
    const inputTokens = result.telemetry?.inputTokens ?? 0;
    const outputTokens = result.telemetry?.outputTokens ?? 0;
    return {
      fixtureId: input.fixture.id,
      repetition: input.repetition,
      passed: evaluation.passed,
      failureCodes: evaluation.failureCodes,
      latencyMs: result.telemetry?.latencyMs ?? Date.now() - startedAt,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimatedCostUsd(
        input.candidate,
        inputTokens,
        outputTokens,
      ),
      providerRequestId: result.requestId,
      observedToolNames: result.toolCalls.map((toolCall) => toolCall.toolName),
    };
  } catch (error) {
    clearTimeout(timeout);
    console.error(
      error instanceof Error
        ? `Edit evaluation failed safely: ${error.name}`
        : "Unknown edit-evaluation failure.",
    );
    return {
      fixtureId: input.fixture.id,
      repetition: input.repetition,
      passed: false,
      failureCodes: [
        controller.signal.aborted ? "deadline" : "provider_failure",
      ],
      latencyMs: Date.now() - startedAt,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      providerRequestId:
        error && typeof error === "object" && "requestID" in error
          ? String(error.requestID)
          : `rejected-${input.fixture.id}-${input.repetition}`,
      observedToolNames: [],
    };
  }
}

async function main() {
  const candidate = aiEvaluationCandidateSchema.parse(
    process.argv[2] ?? "gpt-5.6-luna",
  );
  const repetitions = Number(process.argv[3] ?? EDIT_PROMPT_REPETITIONS);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) {
    throw new Error("Repetitions must be an integer from 1 through 10.");
  }
  const requestedFixtureId = process.argv[4];
  const debug = process.argv[5] === "debug";
  const fixtures = requestedFixtureId
    ? EDIT_PROMPT_FIXTURES.filter(
        (fixture) => fixture.id === requestedFixtureId,
      )
    : EDIT_PROMPT_FIXTURES;
  if (requestedFixtureId && fixtures.length !== 1) {
    throw new Error(`Unknown edit fixture ID: ${requestedFixtureId}`);
  }
  const observations = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const fixture of fixtures) {
      const fixtureIndex = EDIT_PROMPT_FIXTURES.indexOf(fixture);
      console.error(`[${repetition}/${repetitions}] ${fixture.id}`);
      const observation = await runFixture({
        candidate,
        fixture,
        fixtureIndex,
        repetition,
        debug,
      });
      observations.push(observation);
      console.log(
        JSON.stringify({ type: "edit-prompt-observation", ...observation }),
      );
    }
  }
  const summary = requestedFixtureId
    ? {
        fixtureCount: 1,
        repetitions,
        observationCount: observations.length,
        passed: observations.every((observation) => observation.passed),
        estimatedCostUsd: observations.reduce(
          (total, observation) => total + observation.estimatedCostUsd,
          0,
        ),
      }
    : summarizeEditPromptEvaluation({ repetitions, observations });
  console.log(
    JSON.stringify(
      {
        type: "edit-prompt-summary",
        candidate,
        generatedAt: new Date().toISOString(),
        syntheticProjection: true,
        store: false,
        ...summary,
      },
      null,
      2,
    ),
  );
  if (!summary.passed) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
