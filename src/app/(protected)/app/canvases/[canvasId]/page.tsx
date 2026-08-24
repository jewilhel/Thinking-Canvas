import { notFound } from "next/navigation";
import { z } from "zod";

import { ProductCanvasLoader } from "@/components/canvas/product-canvas-loader";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getCanvasRole } from "@/lib/auth/canvas-access";
import { parsePublicEnvironment } from "@/lib/env";
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
  const canvasRole = await getCanvasRole(canvas.id, user.id);
  if (!canvasRole) notFound();
  const publicEnvironment = parsePublicEnvironment(process.env);

  return (
    <main className="h-dvh min-h-[480px] overflow-hidden bg-zinc-950">
      <ProductCanvasLoader
        canvasId={canvas.id}
        title={canvas.title}
        userId={user.id}
        userIdentity={user.email ?? user.id}
        canvasRole={canvasRole}
        supabaseUrl={publicEnvironment.NEXT_PUBLIC_SUPABASE_URL}
        supabasePublishableKey={
          publicEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        }
        simulatedAiEnabled={
          process.env.NODE_ENV !== "production" ||
          process.env.NEXT_PUBLIC_APP_ENV === "preview"
        }
      />
    </main>
  );
}
