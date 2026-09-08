"use client";

import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { GripHorizontal, Grip } from "lucide-react";
import type { Viewport } from "@/canvas/geometry";
import type { SceneCaptionLayout, StoryScene } from "@/stories/story-model";

type Size = { width: number; height: number };
export function captionScreenBounds(
  layout: SceneCaptionLayout | null | undefined,
  viewport: Viewport,
  size: Size,
) {
  const width = layout
    ? layout.width * viewport.scale
    : Math.min(560, size.width - 32);
  const height = layout ? layout.height * viewport.scale : 112;
  return {
    x: layout
      ? layout.x * viewport.scale + viewport.x
      : (size.width - width) / 2,
    y: layout
      ? layout.y * viewport.scale + viewport.y
      : Math.max(16, size.height - height - 90),
    width,
    height,
  };
}
export function captionWorldBounds(
  bounds: SceneCaptionLayout,
  viewport: Viewport,
): SceneCaptionLayout {
  return {
    x: (bounds.x - viewport.x) / viewport.scale,
    y: (bounds.y - viewport.y) / viewport.scale,
    width: bounds.width / viewport.scale,
    height: bounds.height / viewport.scale,
  };
}

export function SceneCaption({
  scene,
  viewport,
  size,
  editable,
  onSave,
}: {
  scene: StoryScene;
  viewport: Viewport;
  size: Size;
  editable: boolean;
  onSave: (layout: SceneCaptionLayout) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<SceneCaptionLayout | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const bounds = captionScreenBounds(
    draft ?? scene.captionLayout,
    viewport,
    size,
  );
  const gesture = useRef<{
    x: number;
    y: number;
    bounds: SceneCaptionLayout;
    mode: "move" | "resize";
    next: SceneCaptionLayout;
  } | null>(null);
  function begin(
    event: PointerEvent<HTMLButtonElement>,
    mode: "move" | "resize",
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      bounds,
      mode,
      next: captionWorldBounds(bounds, viewport),
    };
  }
  function update(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.x,
      dy = event.clientY - current.y;
    const next =
      current.mode === "move"
        ? {
            ...current.bounds,
            x: Math.max(
              0,
              Math.min(
                size.width - Math.min(current.bounds.width, size.width),
                current.bounds.x + dx,
              ),
            ),
            y: Math.max(0, Math.min(size.height - 32, current.bounds.y + dy)),
          }
        : {
            ...current.bounds,
            width: Math.max(
              180,
              Math.min(
                size.width - Math.max(0, current.bounds.x),
                current.bounds.width + dx,
              ),
            ),
            height: Math.max(
              64,
              Math.min(
                size.height - Math.max(0, current.bounds.y),
                current.bounds.height + dy,
              ),
            ),
          };
    current.next = captionWorldBounds(next, viewport);
    setDraft(current.next);
  }
  async function save(layout: SceneCaptionLayout) {
    setSaving(true);
    setError("");
    const succeeded = await onSave(layout);
    if (!succeeded) {
      setDraft(null);
      setError("Caption placement could not be saved. Try again.");
    } else setDraft(null);
    setSaving(false);
  }
  function finish() {
    const current = gesture.current;
    gesture.current = null;
    if (current) void save(current.next);
  }
  function keyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    mode: "move" | "resize",
  ) {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.shiftKey ? 20 : 5;
    const dx =
      event.key === "ArrowLeft"
        ? -delta
        : event.key === "ArrowRight"
          ? delta
          : 0;
    const dy =
      event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0;
    const next =
      mode === "move"
        ? { ...bounds, x: bounds.x + dx, y: bounds.y + dy }
        : {
            ...bounds,
            width: Math.max(180, bounds.width + dx),
            height: Math.max(64, bounds.height + dy),
          };
    const layout = captionWorldBounds(next, viewport);
    setDraft(layout);
    void save(layout);
  }
  return (
    <aside
      aria-label={`Caption for ${scene.title}`}
      data-testid="story-caption-overlay"
      className="absolute z-20 flex flex-col overflow-hidden rounded-xl border border-zinc-600 bg-zinc-950/90 text-sm text-white shadow-lg"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        minWidth: 120,
        minHeight: 48,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {editable ? (
        <button
          type="button"
          aria-label="Move narration bubble"
          title="Drag to move; arrow keys also move the caption"
          disabled={saving}
          className="flex h-5 shrink-0 cursor-grab touch-none items-center justify-center hover:bg-zinc-800 focus-visible:bg-zinc-700"
          onPointerDown={(event) => begin(event, "move")}
          onPointerMove={update}
          onPointerUp={finish}
          onPointerCancel={() => {
            gesture.current = null;
            setDraft(null);
          }}
          onKeyDown={(event) => keyboard(event, "move")}
        >
          <GripHorizontal
            aria-hidden="true"
            className="h-4 w-8 text-zinc-400"
          />
        </button>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto px-4 py-2 leading-6 [overflow-wrap:anywhere] whitespace-pre-wrap">
        {scene.narration}
      </div>
      {error ? (
        <p role="alert" className="px-3 text-xs text-rose-300">
          {error}
        </p>
      ) : null}
      {editable ? (
        <button
          type="button"
          aria-label="Resize narration bubble"
          title="Drag to resize; arrow keys also resize the caption"
          disabled={saving}
          className="absolute right-0 bottom-0 grid size-5 cursor-nwse-resize touch-none place-items-center rounded-tl bg-zinc-800 text-zinc-400"
          onPointerDown={(event) => begin(event, "resize")}
          onPointerMove={update}
          onPointerUp={finish}
          onPointerCancel={() => {
            gesture.current = null;
            setDraft(null);
          }}
          onKeyDown={(event) => keyboard(event, "resize")}
        >
          <Grip aria-hidden="true" className="size-3" />
        </button>
      ) : null}
    </aside>
  );
}
