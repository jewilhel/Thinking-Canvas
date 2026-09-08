import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getCanvasRole } from "@/lib/auth/canvas-access";
import { createServiceClient } from "@/lib/supabase/server";
import {
  downloadNarrationAudio,
  prepareSceneNarration,
} from "@/stories/narration-audio-service";

export const maxDuration = 300;
type Context = { params: Promise<{ canvasId: string; sceneId: string }> };
async function authorize(context: Context) {
  const ids = await context.params;
  const user = await getAuthenticatedUser();
  if (!user)
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (
    !z.uuid().safeParse(ids.canvasId).success ||
    !z.uuid().safeParse(ids.sceneId).success
  )
    return Response.json({ error: "Invalid scene." }, { status: 400 });
  if (!(await getCanvasRole(ids.canvasId, user.id)))
    return Response.json({ error: "Canvas access denied." }, { status: 403 });
  return ids;
}
export async function POST(request: Request, context: Context) {
  const ids = await authorize(context);
  if (ids instanceof Response) return ids;
  const input = z
    .object({
      narration: z.string().max(100_000),
      retry: z.boolean().optional(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json({ error: "Invalid narration." }, { status: 400 });
  const db = createServiceClient();
  const scene = await db
    .from("story_scenes")
    .select("narration,stories!inner(canvas_id)")
    .eq("id", ids.sceneId)
    .is("deleted_at", null)
    .eq("stories.canvas_id", ids.canvasId)
    .maybeSingle();
  if (scene.error || !scene.data)
    return Response.json({ error: "Scene unavailable." }, { status: 404 });
  if (scene.data.narration !== input.data.narration)
    return Response.json(
      { error: "Narration changed. Reload the story." },
      { status: 409 },
    );
  try {
    const audio = await prepareSceneNarration(
      ids.canvasId,
      ids.sceneId,
      input.data.retry,
    );
    const current = await db
      .from("story_scenes")
      .select("narration,deleted_at")
      .eq("id", ids.sceneId)
      .maybeSingle();
    if (
      current.error ||
      current.data?.deleted_at ||
      current.data?.narration !== input.data.narration
    )
      return Response.json(
        { error: "Narration changed. Reload the story." },
        { status: 409 },
      );
    if (!audio)
      return Response.json(
        { error: "Narration unavailable." },
        { status: 404 },
      );
    return Response.json(
      { state: audio.state, version: audio.version },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Audio preparation failed. Try again." },
      { status: 503 },
    );
  }
}
export async function GET(request: Request, context: Context) {
  const ids = await authorize(context);
  if (ids instanceof Response) return ids;
  const version = new URL(request.url).searchParams.get("version");
  if (!z.uuid().safeParse(version).success)
    return Response.json({ error: "Invalid audio version." }, { status: 400 });
  try {
    const audio = await downloadNarrationAudio(
      ids.canvasId,
      ids.sceneId,
      version!,
    );
    if (!audio)
      return Response.json(
        { error: "Audio is no longer available." },
        { status: 404 },
      );
    return new Response(audio, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Audio could not be loaded." },
      { status: 503 },
    );
  }
}
