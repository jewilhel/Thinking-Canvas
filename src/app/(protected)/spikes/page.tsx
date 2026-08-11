import { CollaborationSpike } from "@/components/spikes/collaboration-spike";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function SpikeWorkspacePage() {
  const user = await requireAuthenticatedUser();
  const supabase = await createClient();
  const { data: canvas } = await supabase
    .from("canvases")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <p className="text-sm font-medium text-amber-300">Development evidence</p>
      <h1 className="mt-4 text-4xl font-semibold">
        Architecture spike workspace
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-zinc-400">
        Reproducible collaboration, persistence, canvas, document, AI, voice,
        and reversal experiments will be mounted here as later slices land.
      </p>
      {canvas ? (
        <CollaborationSpike canvasId={canvas.id} userId={user.id} />
      ) : (
        <p
          className="mt-10 rounded-xl border border-amber-900 bg-amber-950/40 p-4 text-amber-200"
          role="status"
        >
          This account does not have a canvas available for collaboration
          evidence.
        </p>
      )}
    </main>
  );
}
