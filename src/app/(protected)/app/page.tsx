import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { AuthenticatedHeader } from "@/components/app/authenticated-header";
import { CreateCanvasForm } from "@/components/canvas/create-canvas-form";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ApplicationPage() {
  const user = await requireAuthenticatedUser();
  const supabase = await createClient();
  const { data: canvases, error } = await supabase
    .from("canvases")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false });

  return (
    <>
      <AuthenticatedHeader identity={user.email ?? user.id} />
      <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <p className="text-sm font-medium text-violet-300">Canvas workspace</p>
        <h1 className="mt-4 text-4xl font-semibold">Your canvas workspace</h1>
        <p className="mt-4 max-w-2xl leading-7 text-zinc-400">
          Create a durable canvas or return to one already shared with you.
        </p>

        <section className="mt-10" aria-labelledby="create-canvas-heading">
          <h2 id="create-canvas-heading" className="sr-only">
            Create a canvas
          </h2>
          <CreateCanvasForm />
        </section>

        <section className="mt-12" aria-labelledby="available-canvases-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                Available to you
              </p>
              <h2
                id="available-canvases-heading"
                className="mt-2 text-2xl font-semibold"
              >
                Canvases
              </h2>
            </div>
            {!error ? (
              <p className="text-sm text-zinc-400">
                {canvases.length}{" "}
                {canvases.length === 1 ? "canvas" : "canvases"}
              </p>
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-5 rounded-2xl border border-red-900/70 bg-red-950/30 p-5 text-sm text-red-200"
            >
              Your canvases could not be loaded. Refresh to try again.
            </div>
          ) : canvases.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-zinc-700 p-8 text-center">
              <p className="font-medium">No canvases yet</p>
              <p className="mt-2 text-sm text-zinc-400">
                Name your first canvas above to open an empty thinking space.
              </p>
            </div>
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {canvases.map((canvas) => (
                <li key={canvas.id}>
                  <Link
                    href={`/app/canvases/${canvas.id}`}
                    className="group block h-full rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-zinc-600 hover:bg-zinc-900 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="font-medium text-zinc-100">
                        {canvas.title}
                      </h3>
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    </div>
                    <p className="mt-8 text-xs text-zinc-400">
                      Updated {formatUpdatedAt(canvas.updated_at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
