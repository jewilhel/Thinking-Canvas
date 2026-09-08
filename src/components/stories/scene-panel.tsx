"use client";

import { LoaderCircle, Plus, Sparkles, X } from "lucide-react";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import { Button } from "@/components/ui/button";
import type { PrimaryStory, StoryScene } from "@/stories/story-model";

type Props = {
  open: boolean;
  story: PrimaryStory | null;
  objects: CanvasObjectV2[];
  loading: boolean;
  saving: boolean;
  error: string;
  canCapture: boolean;
  activeSceneId: string | null;
  onAdd: () => void;
  onChoose: (scene: StoryScene) => void;
  onDismiss: () => void;
};

function ScenePreview({
  scene,
  objects,
}: {
  scene: StoryScene;
  objects: CanvasObjectV2[];
}) {
  const bounds = scene.target.bounds;
  return (
    <svg
      aria-hidden="true"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="xMidYMid slice"
      className="h-10 w-16 shrink-0 rounded-md border border-zinc-200 bg-white"
    >
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        fill="#fafafa"
      />
      {objects.slice(0, 250).map((object) => {
        const geometry = object.geometry;
        if (object.type === "connector") return null;
        const fill = object.style.fill ?? object.style.outline ?? "#a78bfa";
        return object.type === "annotation" ? (
          <circle
            key={object.id}
            cx={geometry.x + geometry.width / 2}
            cy={geometry.y + geometry.height / 2}
            r={Math.max(2, Math.min(geometry.width, geometry.height) / 3)}
            fill={fill}
            opacity="0.8"
          />
        ) : (
          <rect
            key={object.id}
            x={geometry.x}
            y={geometry.y}
            width={Math.max(2, geometry.width)}
            height={Math.max(2, geometry.height)}
            rx={Math.min(10, Math.max(0, geometry.width / 10))}
            fill={fill}
            stroke={object.style.outline ?? "#71717a"}
            strokeWidth={Math.max(1, 1 / scene.camera.zoom)}
          />
        );
      })}
    </svg>
  );
}

export function ScenePanel({
  open,
  story,
  objects,
  loading,
  saving,
  error,
  canCapture,
  activeSceneId,
  onAdd,
  onChoose,
  onDismiss,
}: Props) {
  if (!open) return null;
  const scenes = story?.scenes ?? [];
  return (
    <section
      id="scene-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="scene-panel-title"
      data-testid="scene-panel"
      className="absolute right-4 bottom-20 z-40 flex max-h-[min(34rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-900 text-zinc-50 shadow-2xl"
    >
      <header className="flex items-center justify-between border-b border-zinc-700 px-5 py-4">
        <h2 id="scene-panel-title" className="text-lg font-semibold">
          Scenes
        </h2>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Close scenes"
          className="text-zinc-300 hover:bg-zinc-800 hover:text-white"
          onClick={onDismiss}
        >
          <X aria-hidden="true" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="flex min-h-48 items-center justify-center gap-2 text-sm text-zinc-400">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Loading scenes…
          </p>
        ) : scenes.length ? (
          <ol className="space-y-2" aria-label="Story scenes">
            {scenes.map((scene) => (
              <li key={scene.id}>
                <button
                  type="button"
                  aria-current={activeSceneId === scene.id ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:outline-none ${
                    activeSceneId === scene.id
                      ? "border-violet-300 bg-violet-700 text-white"
                      : "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                  }`}
                  onClick={() => onChoose(scene)}
                >
                  <ScenePreview scene={scene} objects={objects} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {scene.title}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center px-5 text-center">
            <span className="mb-4 grid size-16 place-items-center rounded-2xl border border-zinc-700 text-zinc-500">
              <Sparkles aria-hidden="true" className="size-8" />
            </span>
            <h3 className="text-2xl font-semibold">No scenes</h3>
            <p className="mt-2 max-w-64 text-sm leading-6 text-zinc-400">
              Position and zoom the canvas, then add a scene to save that view.
            </p>
          </div>
        )}
      </div>

      <footer className="border-t border-zinc-700 p-4">
        <Button
          type="button"
          size="lg"
          className="h-12 w-full rounded-2xl bg-violet-700 text-base text-white hover:bg-violet-600"
          disabled={!canCapture || saving || loading}
          title={
            canCapture
              ? "Capture the current canvas position and zoom"
              : "Wait for the canvas to finish saving before adding a scene"
          }
          onClick={onAdd}
        >
          {saving ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          {saving ? "Adding scene…" : "Add Scene"}
        </Button>
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-center text-xs text-rose-300 empty:hidden"
        >
          {error}
        </p>
      </footer>
    </section>
  );
}
