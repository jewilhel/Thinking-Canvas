import "server-only";
import { parseServiceEnvironment } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import {
  voiceTaskFailureSchema,
  type VoiceTaskFailure,
} from "./task-failure-notices";

/** No conversation text or provider errors are sent or stored. */
export async function broadcastVoiceTaskFailure(
  canvasId: string,
  notice: VoiceTaskFailure,
) {
  const payload = voiceTaskFailureSchema.parse(notice);
  const db = createServiceClient();
  await db.realtime.setAuth(
    parseServiceEnvironment(process.env).SUPABASE_SERVICE_ROLE_KEY,
  );
  const channel = db.channel(`canvas:${canvasId}`, {
    config: { private: true },
  });
  try {
    const result = await channel.httpSend("voice-task-failed", payload);
    if (!result.success)
      throw new Error("Voice failure notification unavailable");
  } finally {
    await db.removeChannel(channel).catch(() => undefined);
  }
}
