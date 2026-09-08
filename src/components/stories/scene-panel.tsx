"use client";

import {
  LoaderCircle,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat2,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import type { CommentThread } from "@/comments/comment-model";
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
  loopEnabled: boolean;
  sceneThreads: CommentThread[];
  onAdd: () => void;
  onChoose: (scene: StoryScene) => void;
  onRename: (scene: StoryScene, title: string) => void;
  onReplace: (scene: StoryScene) => void;
  onReorder: (sceneIds: string[]) => void;
  onDelete: (scene: StoryScene) => void;
  deletedScene: Pick<StoryScene, "id" | "title"> | null;
  onUndoDelete: () => void;
  onLoopChange: (enabled: boolean) => void;
  onAddSceneComment: () => void;
  onOpenSceneThread: (threadId: string) => void;
  onNarrationChange: (scene: StoryScene, narration: string | null) => void;
  narrationEnabled: boolean;
  narrationStatus: string;
  narrationPreparing: boolean;
  narrationError: string;
  onToggleNarration: () => void;
  onRetryNarration: () => void;
  onDismiss: () => void;
};

type ScenePanelPlacement = { left: number; top: number; width: number };
type ScreenSize = { width: number; height: number };

export function clampScenePanelPlacement(
  placement: ScenePanelPlacement,
  viewport: ScreenSize,
  panelHeight: number,
): ScenePanelPlacement {
  const width = Math.min(
    Math.min(640, Math.max(320, placement.width)),
    Math.max(0, viewport.width - 32),
  );
  return {
    width,
    left: Math.max(16, Math.min(placement.left, viewport.width - width - 16)),
    top: Math.max(
      16,
      Math.min(placement.top, viewport.height - panelHeight - 16),
    ),
  };
}

export function resizeScenePanelLeft(
  placement: ScenePanelPlacement,
  delta: number,
  viewport: ScreenSize,
  panelHeight: number,
): ScenePanelPlacement {
  const right = placement.left + placement.width;
  const next = clampScenePanelPlacement(
    { ...placement, width: placement.width - delta },
    viewport,
    panelHeight,
  );
  const width = Math.min(next.width, right - 16);
  return { ...next, left: right - width, width };
}

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
  loopEnabled,
  sceneThreads,
  onAdd,
  onChoose,
  onRename,
  onReplace,
  onReorder,
  onDelete,
  deletedScene,
  onUndoDelete,
  onLoopChange,
  onAddSceneComment,
  onOpenSceneThread,
  onNarrationChange,
  narrationEnabled,
  narrationStatus,
  narrationPreparing,
  narrationError,
  onToggleNarration,
  onRetryNarration,
  onDismiss,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState<ScreenSize>(() => ({
    width: typeof window === "undefined" ? 1024 : window.innerWidth,
    height: typeof window === "undefined" ? 768 : window.innerHeight,
  }));
  const [placement, setPlacement] = useState<ScenePanelPlacement | null>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    placement: ScenePanelPlacement;
    panelHeight: number;
    mode: "move" | "resize";
  } | null>(null);
  const [menuSceneId, setMenuSceneId] = useState<string | null>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null);
  const [editingNarrationSceneId, setEditingNarrationSceneId] = useState<
    string | null
  >(null);
  const [narrationDraft, setNarrationDraft] = useState("");
  const scenes = story?.scenes ?? [];
  const activeScene =
    scenes.find((scene) => scene.id === activeSceneId) ?? null;

  useEffect(() => {
    if (!open || !menuSceneId) return;
    const outside = (event: Event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(`[data-scene-menu="${menuSceneId}"]`)
      )
        setMenuSceneId(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setMenuSceneId(null);
      panelRef.current
        ?.querySelector<HTMLButtonElement>(
          `button[data-scene-menu="${menuSceneId}"]`,
        )
        ?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open, menuSceneId]);

  useEffect(() => {
    const measure = () => {
      const nextViewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      setViewport(nextViewport);
      setPlacement((current) =>
        current
          ? clampScenePanelPlacement(
              current,
              nextViewport,
              panelRef.current?.getBoundingClientRect().height ?? 320,
            )
          : current,
      );
    };
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  if (!open || typeof document === "undefined") return null;

  function startPanelGesture(
    event: PointerEvent<HTMLButtonElement>,
    mode: "move" | "resize",
  ) {
    if (event.button !== 0) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      placement: { left: rect.left, top: rect.top, width: rect.width },
      panelHeight: rect.height,
      mode,
    };
  }

  function movePanelGesture(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    setPlacement(
      current.mode === "resize"
        ? resizeScenePanelLeft(
            current.placement,
            dx,
            viewport,
            current.panelHeight,
          )
        : clampScenePanelPlacement(
            {
              ...current.placement,
              left: current.placement.left + dx,
              top: current.placement.top + dy,
            },
            viewport,
            current.panelHeight,
          ),
    );
  }

  function keyboardPanelGesture(
    event: KeyboardEvent<HTMLButtonElement>,
    mode: "move" | "resize",
  ) {
    const direction = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -1,
      ArrowDown: 1,
    }[event.key];
    if (!direction) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    const step = (event.shiftKey ? 40 : 10) * direction;
    const current = { left: rect.left, top: rect.top, width: rect.width };
    setPlacement(
      mode === "resize"
        ? resizeScenePanelLeft(current, step, viewport, rect.height)
        : clampScenePanelPlacement(
            {
              ...current,
              left:
                current.left +
                (event.key === "ArrowLeft" || event.key === "ArrowRight"
                  ? step
                  : 0),
              top:
                current.top +
                (event.key === "ArrowUp" || event.key === "ArrowDown"
                  ? step
                  : 0),
            },
            viewport,
            rect.height,
          ),
    );
  }

  function finishPanelGesture() {
    gesture.current = null;
  }

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
  return createPortal(
    <section
      ref={panelRef}
      id="scene-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="scene-panel-title"
      data-testid="scene-panel"
      className="fixed z-[110] flex max-h-[min(34rem,calc(100dvh-2rem))] flex-col overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-900 text-zinc-50 shadow-2xl"
      style={
        placement ?? {
          right: 16,
          bottom: 80,
          width: "min(24rem, calc(100vw - 2rem))",
        }
      }
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Move scene panel"
        title="Drag to move; arrow keys also move the panel"
        className="flex h-5 shrink-0 cursor-grab touch-none items-center justify-center focus-visible:bg-zinc-800 focus-visible:outline-none active:cursor-grabbing"
        onPointerDown={(event) => startPanelGesture(event, "move")}
        onPointerMove={movePanelGesture}
        onPointerUp={finishPanelGesture}
        onPointerCancel={finishPanelGesture}
        onLostPointerCapture={finishPanelGesture}
        onKeyDown={(event) => keyboardPanelGesture(event, "move")}
      >
        <span className="h-1 w-12 rounded-full bg-zinc-600" />
      </button>
      <header className="flex items-center justify-between gap-3 border-b border-zinc-700 px-5 py-4">
        <h2 id="scene-panel-title" className="text-lg font-semibold">
          Scenes
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-label="AI narration"
            aria-checked={narrationEnabled}
            title={
              narrationEnabled
                ? "Turn off AI narration"
                : "Turn on AI narration for all scenes"
            }
            className={`grid size-9 place-items-center rounded-lg ${narrationEnabled ? "bg-violet-500/25 text-violet-100" : "text-zinc-400 hover:bg-zinc-800"}`}
            onClick={onToggleNarration}
          >
            {narrationEnabled ? (
              <Volume2 aria-hidden="true" className="size-4" />
            ) : (
              <VolumeX aria-hidden="true" className="size-4" />
            )}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={loopEnabled}
            className={`flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors ${
              loopEnabled
                ? "bg-violet-500/25 text-violet-100"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
            onClick={() => onLoopChange(!loopEnabled)}
          >
            <Repeat2 aria-hidden="true" className="size-4" />
            Loop
          </button>
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
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {scenes.some((scene) => scene.narration) ? (
          <div className="mb-3 text-xs text-zinc-400" role="status">
            {narrationPreparing ? (
              <LoaderCircle
                aria-hidden="true"
                className="mr-1 inline size-3 animate-spin"
              />
            ) : null}
            {narrationError || narrationStatus}
            {narrationError ? (
              <button
                type="button"
                className="ml-2 text-violet-300 underline"
                onClick={onRetryNarration}
              >
                Retry audio
              </button>
            ) : null}
          </div>
        ) : null}
        {loading ? (
          <p className="flex min-h-48 items-center justify-center gap-2 text-sm text-zinc-400">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Loading scenes…
          </p>
        ) : scenes.length ? (
          <div>
            <p id="scene-reorder-instructions" className="sr-only">
              Drag scenes to reorder, or press Alt with the up or down arrow
              while a scene is focused.
            </p>
            <ol
              className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900"
              aria-label="Story scenes"
            >
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
                  className={`border-b border-zinc-700/70 last:border-b-0 ${
                    draggedSceneId === scene.id ? "opacity-50" : ""
                  }`}
                >
                  <div
                    className={`relative flex items-center gap-1 border-l-2 px-3 py-2 transition-colors focus-within:ring-2 focus-within:ring-violet-300 focus-within:ring-inset ${
                      activeSceneId === scene.id
                        ? "border-l-violet-400 bg-violet-500/20 text-violet-50"
                        : "border-l-transparent text-zinc-200 hover:bg-zinc-800/70"
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
                          onChange={(event) =>
                            setDraftTitle(event.target.value)
                          }
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
                        aria-describedby="scene-reorder-instructions"
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
                        onClick={() => {
                          setMenuSceneId(null);
                          onChoose(scene);
                        }}
                        onKeyDown={(event) => {
                          if (!event.altKey) return;
                          if (event.key === "ArrowUp") {
                            event.preventDefault();
                            moveScene(scene.id, index - 1);
                          } else if (event.key === "ArrowDown") {
                            event.preventDefault();
                            moveScene(scene.id, index + 1);
                          }
                        }}
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
                      data-scene-menu={scene.id}
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
                      <div
                        data-scene-menu={scene.id}
                        className="absolute top-full right-2 z-10 mt-1 w-44 rounded-xl border border-zinc-600 bg-zinc-950 p-1 shadow-xl"
                      >
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
                </li>
              ))}
            </ol>
            {activeSceneId ? (
              <div className="mt-4 space-y-3">
                {activeScene ? (
                  <section className="rounded-xl border border-zinc-700 bg-zinc-950/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-zinc-200">
                        Narration
                      </h3>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-zinc-300 hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:outline-none"
                          aria-label={`Edit narration for ${activeScene.title}`}
                          disabled={saving || !canCapture}
                          onClick={() => {
                            setNarrationDraft(activeScene.narration ?? "");
                            setEditingNarrationSceneId(activeScene.id);
                          }}
                        >
                          <Pencil aria-hidden="true" className="size-4" />
                        </button>
                      </div>
                    </div>
                    {editingNarrationSceneId === activeScene.id ? (
                      <form
                        className="mt-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          onNarrationChange(
                            activeScene,
                            narrationDraft.trim() || null,
                          );
                          setEditingNarrationSceneId(null);
                        }}
                      >
                        <textarea
                          autoFocus
                          aria-label={`Narration for ${activeScene.title}`}
                          value={narrationDraft}
                          maxLength={100_000}
                          rows={4}
                          className="w-full resize-y rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                          onChange={(event) =>
                            setNarrationDraft(event.target.value)
                          }
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            className="rounded-lg px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                            onClick={() => setEditingNarrationSceneId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-600"
                          >
                            Save narration
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p
                        data-testid="active-scene-caption"
                        className="mt-2 text-sm leading-6 whitespace-pre-wrap text-zinc-300"
                      >
                        {activeScene.narration ??
                          "Add a captioned script for this scene."}
                      </p>
                    )}
                    {narrationError ? (
                      <p role="alert" className="mt-2 text-xs text-rose-300">
                        {narrationError} Captions remain available.
                      </p>
                    ) : null}
                  </section>
                ) : null}
                <section
                  aria-labelledby="active-scene-context-title"
                  className="rounded-xl border border-zinc-700 bg-zinc-950/40 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3
                      id="active-scene-context-title"
                      className="text-sm font-semibold text-zinc-200"
                    >
                      Scene comments
                    </h3>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-violet-200 hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:outline-none"
                      onClick={onAddSceneComment}
                    >
                      <MessageCircle aria-hidden="true" className="size-4" />
                      Add comment
                    </button>
                  </div>
                  {sceneThreads.length ? (
                    <div className="mt-2 space-y-1">
                      {sceneThreads.map((thread) => (
                        <button
                          key={thread.id}
                          type="button"
                          className="block w-full rounded-lg px-2 py-2 text-left hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:outline-none"
                          onClick={() => onOpenSceneThread(thread.id)}
                        >
                          <span className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                            <span>{thread.authorName}</span>
                            <span>{thread.status}</span>
                          </span>
                          <span className="mt-1 line-clamp-2 block text-sm text-zinc-200">
                            {thread.body}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-400">
                      No comments for this scene.
                    </p>
                  )}
                </section>
              </div>
            ) : null}
          </div>
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
      <button
        type="button"
        aria-label="Resize scene panel from left edge"
        title="Drag to resize; left and right arrow keys also resize"
        className="absolute top-6 bottom-6 left-0 w-2 cursor-ew-resize touch-none rounded-full hover:bg-violet-400/30 focus-visible:bg-violet-400/30 focus-visible:outline-none"
        onPointerDown={(event) => startPanelGesture(event, "resize")}
        onPointerMove={movePanelGesture}
        onPointerUp={finishPanelGesture}
        onPointerCancel={finishPanelGesture}
        onLostPointerCapture={finishPanelGesture}
        onKeyDown={(event) => keyboardPanelGesture(event, "resize")}
      />
    </section>,
    document.body,
  );
}
