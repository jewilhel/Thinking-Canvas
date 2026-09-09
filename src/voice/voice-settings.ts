import { z } from "zod";

export const VOICE_MODEL = "gpt-realtime-2.1";
export const VOICE_SESSION_SECONDS = 600;
export const VOICE_DAILY_CENTS = 2000;
export const voiceSettingsSchema = z.strictObject({
  detection: z.enum(["semantic_vad", "server_vad", "manual"]),
  eagerness: z.enum(["auto", "low", "medium", "high"]),
  threshold: z.number().min(0).max(1),
  silenceMs: z.number().int().min(200).max(6000),
  prefixMs: z.number().int().min(0).max(2000),
  idleMs: z
    .number()
    .int()
    .refine(
      (n) => n === 0 || (n >= 5000 && n <= 30000),
      "Use 0 or 5000–30000 ms.",
    ),
  automaticResponse: z.boolean(),
  interruptResponse: z.boolean(),
  voice: z.enum([
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
  ]),
  speed: z.number().min(0.25).max(1.5),
  noiseReduction: z.enum(["off", "near_field", "far_field"]),
  transcription: z.boolean(),
  language: z.string().max(12),
  transcriptionPrompt: z.string().max(1000),
  instructions: z.string().max(4000),
  maxOutputTokens: z.number().int().min(32).max(4096),
  output: z.enum(["audio", "text"]),
  reasoning: z.enum(["low", "medium", "high"]),
  retentionRatio: z.number().min(0.1).max(1),
});
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  detection: "semantic_vad",
  eagerness: "auto",
  threshold: 0.5,
  silenceMs: 500,
  prefixMs: 300,
  idleMs: 0,
  automaticResponse: true,
  interruptResponse: true,
  voice: "marin",
  speed: 1,
  noiseReduction: "near_field",
  transcription: true,
  language: "",
  transcriptionPrompt: "",
  instructions:
    "Have a natural, thoughtful conversation. Be concise and let the participant finish their thought. This is a voice tuning session; you cannot read or change the canvas yet. Do not claim to have performed canvas actions.",
  maxOutputTokens: 1024,
  output: "audio",
  reasoning: "low",
  retentionRatio: 0.8,
};

/** The server selects models/tools/privacy. This function never accepts those fields. */
export function buildVoiceSession(settings: VoiceSettings) {
  const s = voiceSettingsSchema.parse(settings);
  return {
    type: "realtime" as const,
    model: VOICE_MODEL,
    instructions: s.instructions,
    output_modalities: [s.output],
    max_output_tokens: s.maxOutputTokens,
    reasoning: { effort: s.reasoning },
    tools: [],
    tool_choice: "none" as const,
    tracing: null,
    truncation: {
      type: "retention_ratio" as const,
      retention_ratio: s.retentionRatio,
      token_limits: { post_instructions: 8192 },
    },
    audio: {
      input: {
        noise_reduction:
          s.noiseReduction === "off" ? null : { type: s.noiseReduction },
        transcription: s.transcription
          ? {
              model: "gpt-4o-mini-transcribe",
              ...(s.language ? { language: s.language } : {}),
              ...(s.transcriptionPrompt
                ? { prompt: s.transcriptionPrompt }
                : {}),
            }
          : null,
        turn_detection:
          s.detection === "manual"
            ? null
            : {
                type: s.detection,
                create_response: s.automaticResponse,
                interrupt_response: s.interruptResponse,
                ...(s.detection === "semantic_vad"
                  ? { eagerness: s.eagerness }
                  : {
                      threshold: s.threshold,
                      silence_duration_ms: s.silenceMs,
                      prefix_padding_ms: s.prefixMs,
                      ...(s.idleMs ? { idle_timeout_ms: s.idleMs } : {}),
                    }),
              },
      },
      output: { voice: s.voice, speed: s.speed },
    },
  };
}

/** Never persist whole provider session/event objects (they may contain secrets). */
export function effectiveVoiceSettings(
  value: unknown,
): Record<string, unknown> {
  const session = z
    .object({
      model: z.string().optional(),
      instructions: z.string().max(4000).optional(),
      output_modalities: z.array(z.enum(["audio", "text"])).optional(),
      max_output_tokens: z.union([z.number(), z.literal("inf")]).optional(),
      reasoning: z.object({ effort: z.string() }).optional(),
      truncation: z
        .union([
          z.string(),
          z.object({
            type: z.string(),
            retention_ratio: z.number().optional(),
            token_limits: z
              .object({ post_instructions: z.number() })
              .optional(),
          }),
        ])
        .optional(),
      audio: z
        .object({
          input: z
            .object({
              noise_reduction: z
                .object({ type: z.string() })
                .nullable()
                .optional(),
              transcription: z
                .object({
                  model: z.string(),
                  language: z.string().optional(),
                  prompt: z.string().optional(),
                })
                .nullable()
                .optional(),
              turn_detection: z
                .object({
                  type: z.string(),
                  eagerness: z.string().optional(),
                  threshold: z.number().optional(),
                  silence_duration_ms: z.number().optional(),
                  prefix_padding_ms: z.number().optional(),
                  idle_timeout_ms: z.number().nullable().optional(),
                  create_response: z.boolean().optional(),
                  interrupt_response: z.boolean().optional(),
                })
                .nullable()
                .optional(),
            })
            .optional(),
          output: z
            .object({
              voice: z.string().optional(),
              speed: z.number().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .safeParse(value);
  return session.success ? session.data : {};
}

export const VOICE_SETTING_CONSTRAINTS = [
  [
    "Model",
    "gpt-realtime-2.1; server selected. Additional models require verified pricing and availability.",
  ],
  ["Voice", "A different voice requires restarting after the AI has spoken."],
  ["Speech speed", "Applied between responses."],
  ["Audio format", "Negotiated by WebRTC, not a PCM file-format control."],
  [
    "Transcription model",
    "gpt-4o-mini-transcribe; optional input transcript, separate from direct audio understanding.",
  ],
  [
    "Tools / tool choice / parallel tools",
    "Server controlled; canvas actions arrive in Slice 3.",
  ],
  [
    "Tracing",
    "Disabled. Settings records contain no audio or conversation history.",
  ],
  [
    "Prompt templates / diagnostic includes",
    "Not configured in this tuning session. Editable style instructions are sent explicitly.",
  ],
  [
    "Context",
    "Retention ratio is tunable. Context truncation cannot be disabled in budget-limited testing.",
  ],
  [
    "Limits",
    "10-minute sessions, $20 aggregate daily test budget. No automatic renewal.",
  ],
] as const;
