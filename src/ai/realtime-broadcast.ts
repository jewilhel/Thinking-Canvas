import "server-only";

import { bytesToBase64 } from "@/collaboration/canvas-document";
import { parseServiceEnvironment } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

export async function broadcastAiCanvasUpdate(input: {
  canvasId: string;
  sequence: number;
  update: Uint8Array;
}) {
  const supabase = createServiceClient();
  const environment = parseServiceEnvironment(process.env);
  await supabase.realtime.setAuth(environment.SUPABASE_SERVICE_ROLE_KEY);
  const channel = supabase.channel(`canvas:${input.canvasId}`, {
    config: { private: true },
  });
  try {
    const status = await channel.httpSend("yjs-update", {
      kind: "update",
      sequence: input.sequence,
      update: bytesToBase64(input.update),
    });
    if (!status.success) {
      throw new Error("The durable AI canvas update was not acknowledged.");
    }
  } finally {
    await supabase.removeChannel(channel).catch(() => undefined);
  }
}
