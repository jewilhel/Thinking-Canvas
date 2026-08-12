"use client";

import dynamic from "next/dynamic";

const ProductCanvas = dynamic(
  () =>
    import("@/components/canvas/product-canvas").then(
      (module) => module.ProductCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[calc(100vh-73px)] items-center justify-center p-6">
        <p className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-400">
          Loading canvas…
        </p>
      </div>
    ),
  },
);

type Props = {
  canvasId: string;
  title: string;
  userId: string;
  simulatedAiEnabled: boolean;
};

export function ProductCanvasLoader(props: Props) {
  return <ProductCanvas key={props.canvasId} {...props} />;
}
