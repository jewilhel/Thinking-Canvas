import OpenAI from "openai";
import { voiceEndingRequest } from "../src/voice/live-ending-observer";
import { voiceEndingFixtures } from "../src/voice/ending-evaluation-fixtures";
const client = new OpenAI({ timeout: 35000, maxRetries: 0 });
const model = process.env.OPENAI_RESPONSES_MODEL ?? "gpt-5.6-luna";
let failures = 0;
for (let repetition = 1; repetition <= 3; repetition++) {
  for (const fixture of voiceEndingFixtures) {
    const result = await client.responses.create(
      voiceEndingRequest(
        model,
        JSON.stringify(
          fixture.turns.map(([speaker, text]) => ({ speaker, text })),
        ),
      ),
    );
    const { end } = JSON.parse(result.output_text);
    const passed = end === fixture.expected;
    if (!passed) failures++;
    console.log(
      JSON.stringify({
        test: fixture.name,
        repetition,
        model,
        expected: fixture.expected,
        actual: end,
        passed,
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
      }),
    );
  }
}
process.exitCode = failures ? 1 : 0;
