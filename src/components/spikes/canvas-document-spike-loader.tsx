"use client";

import dynamic from "next/dynamic";

const CanvasDocumentSpike = dynamic(
  () =>
    import("@/components/spikes/canvas-document-spike").then(
      (module) => module.CanvasDocumentSpike,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-zinc-400">
        Loading the browser-only canvas renderer…
      </p>
    ),
  },
);

export function CanvasDocumentSpikeLoader({ canvasId }: { canvasId: string }) {
  return <CanvasDocumentSpike canvasId={canvasId} />;
}
