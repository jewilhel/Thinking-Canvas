import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  captureSceneRequestSchema,
  primaryStorySchema,
  storyDeleteRequestSchema,
  storyMutationRequestSchema,
} from "@/stories/story-model";

async function loadPrimaryStory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  canvasId: string,
) {
  const result = await supabase
    .from("stories")
    .select(
      "id,title,revision,story_scenes(id,title,position,camera,target,narration,deleted_at,created_at,updated_at)",
    )
    .eq("canvas_id", canvasId)
    .eq("kind", "general")
    .is("story_scenes.deleted_at", null)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;
  return primaryStorySchema.parse({
    id: result.data.id,
    title: result.data.title,
    revision: result.data.revision,
    scenes: [...result.data.story_scenes]
      .sort((left, right) => left.position - right.position)
      .map((scene) => ({
        id: scene.id,
        title: scene.title,
        position: scene.position,
        camera: scene.camera,
        target: scene.target,
        narration: scene.narration,
        createdAt: scene.created_at,
        updatedAt: scene.updated_at,
      })),
  });
}

function mutationError(error: { code?: string } | null) {
  const status =
    error?.code === "42501"
      ? 403
      : error?.code === "40001"
        ? 409
        : error?.code === "P0002"
          ? 404
          : 400;
  const message =
    status === 409
      ? "The story changed in another session. Reload and try again."
      : status === 403
        ? "You do not have permission to edit this story."
        : status === 404
          ? "The scene is no longer available."
          : "The scene change could not be saved.";
  return Response.json({ error: message }, { status });
}

async function refreshedStoryResponse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  canvasId: string,
) {
  return Response.json(
    { story: await loadPrimaryStory(supabase, canvasId) },
    { headers: { "cache-control": "no-store" } },
  );
}

async function validateCanvasRequest(canvasId: string) {
  if (!z.uuid().safeParse(canvasId).success) {
    return Response.json(
      { error: "A valid canvas is required." },
      { status: 400 },
    );
  }
  if (!(await getAuthenticatedUser())) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  const invalid = await validateCanvasRequest(canvasId);
  if (invalid) return invalid;
  try {
    const story = await loadPrimaryStory(await createClient(), canvasId);
    return Response.json(
      { story },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "The canvas story could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  const invalid = await validateCanvasRequest(canvasId);
  if (invalid) return invalid;
  const parsed = captureSceneRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "A valid saved canvas view is required." },
      { status: 400 },
    );
  }
  const supabase = await createClient();
  const result = await supabase.rpc("capture_primary_story_scene", {
    target_canvas_id: canvasId,
    target_title: parsed.data.title,
    target_camera: parsed.data.camera as unknown as Json,
    target_region: parsed.data.target as unknown as Json,
    target_expected_revision: parsed.data.expectedRevision,
  });
  if (result.error) {
    return mutationError(result.error);
  }
  try {
    return refreshedStoryResponse(supabase, canvasId);
  } catch {
    return Response.json(
      { error: "The scene was saved, but the story could not be refreshed." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  const invalid = await validateCanvasRequest(canvasId);
  if (invalid) return invalid;
  const parsed = storyMutationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return mutationError(null);
  const supabase = await createClient();
  const input = parsed.data;
  const result =
    input.action === "reorder"
      ? await supabase.rpc("reorder_primary_story_scenes", {
          target_canvas_id: canvasId,
          target_scene_ids: input.sceneIds,
          target_expected_revision: input.expectedRevision,
        })
      : input.action === "restore"
        ? await supabase.rpc("restore_primary_story_scene", {
            target_canvas_id: canvasId,
            target_scene_id: input.sceneId,
            target_expected_revision: input.expectedRevision,
          })
        : await supabase.rpc("update_primary_story_scene", {
            target_canvas_id: canvasId,
            target_scene_id: input.sceneId,
            target_expected_revision: input.expectedRevision,
            target_title: input.action === "rename" ? input.title : null,
            target_camera:
              input.action === "replace"
                ? (input.camera as unknown as Json)
                : null,
            target_region:
              input.action === "replace"
                ? (input.target as unknown as Json)
                : null,
          });
  if (result.error) return mutationError(result.error);
  try {
    return refreshedStoryResponse(supabase, canvasId);
  } catch {
    return Response.json(
      { error: "The change was saved, but the story could not be refreshed." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const { canvasId } = await params;
  const invalid = await validateCanvasRequest(canvasId);
  if (invalid) return invalid;
  const parsed = storyDeleteRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return mutationError(null);
  const supabase = await createClient();
  const result = await supabase.rpc("delete_primary_story_scene", {
    target_canvas_id: canvasId,
    target_scene_id: parsed.data.sceneId,
    target_expected_revision: parsed.data.expectedRevision,
  });
  if (result.error) return mutationError(result.error);
  try {
    return refreshedStoryResponse(supabase, canvasId);
  } catch {
    return Response.json(
      { error: "The scene was deleted, but the story could not be refreshed." },
      { status: 500 },
    );
  }
}
