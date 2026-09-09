import "server-only";
import { createHmac } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getCanvasRole } from "@/lib/auth/canvas-access";
import { createClient } from "@/lib/supabase/server";

export function voiceService() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function voiceProvider() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 15_000,
    maxRetries: 0,
  });
}
export function supervisorSignature(id: string) {
  return createHmac("sha256", process.env.OPENAI_API_KEY!)
    .update(`voice-supervisor:${id}`)
    .digest("hex");
}
export async function authorizeVoice(canvasId: string) {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const role = await getCanvasRole(canvasId, user.id);
  if (!role || role === "viewer") return null;
  const db = await createClient();
  const { data, error } = await db.rpc("get_canvas_ai_access", {
    target_canvas_id: canvasId,
  });
  return !error && data?.[0]?.enabled ? user : null;
}
export function voiceEnabled() {
  return (
    process.env.VOICE_DEPLOY_ENVIRONMENT === "preview" &&
    process.env.VOICE_TESTING_ENABLED === "true" &&
    Boolean(
      process.env.VOICE_DEPLOY_ORIGIN &&
      process.env.OPENAI_API_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
  );
}
