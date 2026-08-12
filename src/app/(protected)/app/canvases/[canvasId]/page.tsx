import { notFound } from "next/navigation";
import { z } from "zod";

import { ProductCanvasLoader } from "@/components/canvas/product-canvas-loader";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const user = await requireAuthenticatedUser();
  const { canvasId } = await params;

  if (!z.uuid().safeParse(canvasId).success) notFound();

  const supabase = await createClient();
  const { data: canvas, error } = await supabase
    .from("canvases")
    .select("id,title,updated_at")
    .eq("id", canvasId)
    .maybeSingle();

  if (error || !canvas) notFound();

  return (
    <main className="min-h-[calc(100vh-73px)] bg-zinc-950">
      <ProductCanvasLoader
        canvasId={canvas.id}
        title={canvas.title}
        userId={user.id}
        simulatedAiEnabled={
          process.env.NODE_ENV !== "production" ||
          process.env.APP_ENV === "preview"
        }
      />
    </main>
  );
}
