"use client";

import {
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";

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
  onRename: (scene: StoryScene, title: string) => void;
  onReplace: (scene: StoryScene) => void;
  onReorder: (sceneIds: string[]) => void;
  onDelete: (scene: StoryScene) => void;
  deletedScene: Pick<StoryScene, "id" | "title"> | null;
  onUndoDelete: () => void;
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
  onRename,
  onReplace,
  onReorder,
  onDelete,
  deletedScene,
  onUndoDelete,
  onDismiss,
}: Props) {
  const [menuSceneId, setMenuSceneId] = useState<string | null>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null);
  if (!open) return null;
  const scenes = story?.scenes ?? [];

  function moveScene(sceneId: string, targetIndex: number) {
    const currentIndex = scenes.findIndex((scene) => scene.id === sceneId);
    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= scenes.length ||
      currentIndex === targetIndex
    )
      return;
    const reordered = [...scenes];
    const [moved] = reordered.splice(currentIndex, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);
    onReorder(reordered.map((scene) => scene.id));
  }
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
            {scenes.map((scene, index) => (
              <li
                key={scene.id}
                draggable={!saving && editingSceneId !== scene.id}
                onDragStart={() => setDraggedSceneId(scene.id)}
                onDragEnd={() => setDraggedSceneId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedSceneId) moveScene(draggedSceneId, index);
                  setDraggedSceneId(null);
                }}
                className={
                  draggedSceneId === scene.id ? "opacity-50" : undefined
                }
              >
                <div
                  className={`relative flex items-center gap-1 rounded-xl border px-2 py-2 transition-colors focus-within:ring-2 focus-within:ring-violet-300 ${
                    activeSceneId === scene.id
                      ? "border-violet-300 bg-violet-700 text-white"
                      : "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                  }`}
                >
                  {editingSceneId === scene.id ? (
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ScenePreview scene={scene} objects={objects} />
                      <input
                        aria-label={`Rename ${scene.title}`}
                        autoFocus
                        maxLength={120}
                        value={draftTitle}
                        className="min-w-0 flex-1 rounded-md bg-white px-2 py-1 text-zinc-900"
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setEditingSceneId(null);
                          if (event.key === "Enter" && draftTitle.trim()) {
                            onRename(scene, draftTitle.trim());
                            setEditingSceneId(null);
                          }
                        }}
                        onBlur={() => {
                          if (
                            draftTitle.trim() &&
                            draftTitle.trim() !== scene.title
                          )
                            onRename(scene, draftTitle.trim());
                          setEditingSceneId(null);
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-current={
                        activeSceneId === scene.id ? "step" : undefined
                      }
                      aria-label={scene.title}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
                      onClick={() => onChoose(scene)}
                    >
                      <ScenePreview scene={scene} objects={objects} />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {scene.title}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Scene actions for ${scene.title}`}
                    aria-expanded={menuSceneId === scene.id}
                    className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-black/20 focus-visible:outline-none"
                    onClick={() =>
                      setMenuSceneId((current) =>
                        current === scene.id ? null : scene.id,
                      )
                    }
                  >
                    <MoreHorizontal aria-hidden="true" className="size-4" />
                  </button>
                  {menuSceneId === scene.id ? (
                    <div className="absolute top-full right-2 z-10 mt-1 w-44 rounded-xl border border-zinc-600 bg-zinc-950 p-1 shadow-xl">
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800"
                        onClick={() => {
                          setDraftTitle(scene.title);
                          setEditingSceneId(scene.id);
                          setMenuSceneId(null);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800"
                        onClick={() => {
                          onReplace(scene);
                          setMenuSceneId(null);
                        }}
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-zinc-800"
                        onClick={() => {
                          onDelete(scene);
                          setMenuSceneId(null);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-1 flex justify-end gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${scene.title} earlier`}
                    disabled={saving || index === 0}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
                    onClick={() => moveScene(scene.id, index - 1)}
                  >
                    <ChevronUp aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${scene.title} later`}
                    disabled={saving || index === scenes.length - 1}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
                    onClick={() => moveScene(scene.id, index + 1)}
                  >
                    <ChevronDown aria-hidden="true" className="size-4" />
                  </button>
                </div>
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
        {deletedScene ? (
          <div
            role="status"
            className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-zinc-800 px-3 py-2 text-sm"
          >
            <span className="truncate">Deleted {deletedScene.title}</span>
            <button
              type="button"
              className="font-semibold text-violet-300 hover:text-violet-200"
              onClick={onUndoDelete}
            >
              Undo
            </button>
          </div>
        ) : null}
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
