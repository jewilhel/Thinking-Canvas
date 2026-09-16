// Temporary authenticated preview evaluation; remove after hosted verification.
import {
  authorizeVoice,
  voiceEnabled,
  voiceProvider,
} from "@/voice/voice-server";
import { ENDING_CHECK_INSTRUCTIONS } from "@/voice/live-ending-observer";
import { parsePrimaryAiProviderEnvironment } from "@/ai/primary-ai-gateway-factory";
export const maxDuration = 60;
const fixtures = [
  {
    name: "End after failed canvas request",
    expected: true,
    turns: [
      [
        "user",
        "Create a large grey rounded rectangle and make Alpha and Beta its children.",
      ],
      ["assistant", "I wasn't able to finish that canvas request."],
      [
        "user",
        "Okay, I'll report that command failed. I'm good, let's just end the conversation here and we'll talk again",
      ],
      ["assistant", "Sure thing"],
      ["user", "soon"],
      ["assistant", ". Talk soon!"],
    ],
  },
  {
    name: "Final bye after farewell",
    expected: true,
    turns: [
      ["user", "Great. I guess we can end it here. Thank"],
      ["assistant", "No problem"],
      ["user", "you"],
      ["assistant", ", Jason. Talk with you later."],
      ["user", "Bye"],
    ],
  },
  {
    name: "New work after farewell",
    expected: false,
    turns: [
      ["user", "We can end here"],
      ["assistant", "Talk soon!"],
      ["user", "Wait, save a summary before we finish."],
    ],
  },
  {
    name: "Failure alone does not end",
    expected: false,
    turns: [
      ["user", "Create a shape"],
      ["assistant", "That failed"],
      ["user", "Let's try again"],
    ],
  },
];
async function allowed(context: { params: Promise<{ canvasId: string }> }) {
  const { canvasId } = await context.params;
  return (
    voiceEnabled() &&
    Date.now() < Date.parse("2026-09-18T00:00:00Z") &&
    (await authorizeVoice(canvasId))
  );
}
export async function GET(
  _: Request,
  context: { params: Promise<{ canvasId: string }> },
) {
  if (!(await allowed(context))) return new Response(null, { status: 404 });
  return new Response(
    `<h1>Temporary closing regression checks</h1>${fixtures.map((f, i) => `<form method="post"><input type="hidden" name="case" value="${i}"><button>${f.name}</button></form>`).join("")}`,
    { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } },
  );
}
export async function POST(
  request: Request,
  context: { params: Promise<{ canvasId: string }> },
) {
  if (!(await allowed(context))) return new Response(null, { status: 404 });
  const index = Number((await request.formData()).get("case"));
  if (!Number.isInteger(index) || !fixtures[index])
    return new Response(null, { status: 400 });
  const fixture = fixtures[index];
  const result = await voiceProvider().responses.create(
    {
      model: parsePrimaryAiProviderEnvironment(process.env)
        .OPENAI_RESPONSES_MODEL,
      instructions: ENDING_CHECK_INSTRUCTIONS,
      input: JSON.stringify(
        fixture.turns.map(([speaker, text]) => ({ speaker, text })),
      ),
      store: false,
      max_output_tokens: 512,
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "voice_ending",
          strict: true,
          schema: {
            type: "object",
            properties: { end: { type: "boolean" } },
            required: ["end"],
            additionalProperties: false,
          },
        },
      },
    },
    { timeout: 35000 },
  );
  const end = JSON.parse(result.output_text).end;
  return Response.json(
    {
      test: fixture.name,
      expected: fixture.expected,
      actual: end,
      passed: end === fixture.expected,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
