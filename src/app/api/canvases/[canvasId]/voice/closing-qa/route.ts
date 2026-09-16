import { liveDelegationSignature } from "@/voice/live-delegation-signature";
// Temporary authenticated preview evaluation; remove after hosted verification.
import {
  authorizeVoice,
  voiceEnabled,
  voiceProvider,
  voiceService,
} from "@/voice/voice-server";
import { voiceEndingRequest } from "@/voice/live-ending-observer";
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
  request: Request,
  context: { params: Promise<{ canvasId: string }> },
) {
  if (!(await allowed(context))) return new Response(null, { status: 404 });
  if (new URL(request.url).searchParams.has("script"))
    return new Response(
      `document.querySelectorAll('form').forEach(form => form.addEventListener('submit', async event => { event.preventDefault(); const output=document.querySelector('pre'); output.textContent='Running real provider check...'; try { const response=await fetch(location.pathname,{method:'POST',body:new FormData(form)}); output.textContent=await response.text(); } catch(error) { output.textContent=String(error); } }));`,
      {
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-store",
        },
      },
    );
  return new Response(
    `<h1>Temporary closing regression checks</h1><pre aria-live="polite">Ready</pre><script src="${new URL(request.url).pathname}?script=1" defer></script>${fixtures.map((f, i) => `<form method="post"><input type="hidden" name="case" value="${i}"><button>${f.name}</button></form>`).join("")}<form method="post"><input type="hidden" name="case" value="creation"><button>Run creation through active voice session (QA canvas only)</button></form>`,
    { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } },
  );
}
export async function POST(
  request: Request,
  context: { params: Promise<{ canvasId: string }> },
) {
  if (!(await allowed(context))) return new Response(null, { status: 404 });
  const form = await request.formData();
  const { canvasId } = await context.params;
  if (
    form.get("case") === "creation" &&
    canvasId === "0475e44b-8a0a-4521-820c-6251f42e5500"
  ) {
    const active = await voiceService()
      .from("voice_test_sessions")
      .select("id")
      .eq("canvas_id", canvasId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .single();
    if (!active.data)
      return new Response("Start voice on the QA canvas first", {
        status: 409,
      });
    const userText =
      "I was wondering if you could create a large grey shape and then move the Alpha object and the Beta object and make them children of the grey, let's make it a rounded rectangle shape.";
    const task = {
      kind: "conversation" as const,
      text: JSON.stringify({
        fragments: [
          { speaker: "user", text: userText, startMs: 0, endMs: 1000 },
        ],
        completedTasks: [],
      }),
    };
    const id = `control:qa:${crypto.randomUUID()}`;
    const result = await fetch(
      `${new URL(request.url).origin}/api/canvases/${canvasId}/voice/delegations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: request.headers.get("cookie") ?? "",
          "x-live-delegation": liveDelegationSignature(
            process.env.OPENAI_API_KEY!,
            active.data.id,
            id,
            task,
          ),
        },
        body: JSON.stringify({
          sessionId: active.data.id,
          delegationId: id,
          request: task,
        }),
      },
    );
    return new Response(await result.text(), {
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }
  const index = Number(form.get("case"));
  if (!Number.isInteger(index) || !fixtures[index])
    return new Response(null, { status: 400 });
  const fixture = fixtures[index];
  const result = await voiceProvider().responses.create(
    voiceEndingRequest(
      parsePrimaryAiProviderEnvironment(process.env).OPENAI_RESPONSES_MODEL,
      JSON.stringify(
        fixture.turns.map(([speaker, text]) => ({ speaker, text })),
      ),
    ),
    { timeout: 35000 },
  );
  const { end, reason } = JSON.parse(result.output_text);
  return new Response(
    JSON.stringify({
      test: fixture.name,
      expected: fixture.expected,
      actual: end,
      reason,
      passed: end === fixture.expected,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
    }),
    { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } },
  );
}
