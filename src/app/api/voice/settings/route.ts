import { getAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { liveSettingsSchema } from "@/voice/live-protocol";
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return new Response(null, { status: 401 });
  const db = await createClient();
  const { data, error } = await db
    .from("voice_user_settings")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return new Response(null, { status: 503 });
  return Response.json(
    { settings: data?.settings ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function PUT(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  const user = await getAuthenticatedUser();
  if (!user) return new Response(null, { status: 401 });
  const text = await request.text();
  if (text.length > 16000) return new Response(null, { status: 413 });
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = liveSettingsSchema.safeParse(value);
  if (!parsed.success) return new Response(null, { status: 400 });
  const db = await createClient();
  const { error } = await db
    .from("voice_user_settings")
    .upsert({ user_id: user.id, settings: parsed.data });
  return new Response(null, { status: error ? 503 : 204 });
}
