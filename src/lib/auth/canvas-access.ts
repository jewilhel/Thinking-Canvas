import "server-only";

import type { CanvasRole } from "@/domain/command";
import { createClient } from "@/lib/supabase/server";

export async function getCanvasRole(
  canvasId: string,
  userId: string,
): Promise<CanvasRole | null> {
  const supabase = await createClient();
  const { data: canvas, error: canvasError } = await supabase
    .from("canvases")
    .select("owner_id")
    .eq("id", canvasId)
    .maybeSingle();

  if (canvasError || !canvas) return null;
  if (canvas.owner_id === userId) return "owner";

  const { data: membership, error: membershipError } = await supabase
    .from("canvas_members")
    .select("role")
    .eq("canvas_id", canvasId)
    .eq("user_id", userId)
    .maybeSingle();

  return membershipError ? null : (membership?.role ?? null);
}
