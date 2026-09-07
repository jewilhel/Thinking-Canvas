"use client";

import { PanelRightClose, PanelRightOpen, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useCommentWorkspace } from "@/components/comments/comment-workspace";
import { Button } from "@/components/ui/button";

type Box = { left: number; top: number; width: number; height: number };
export function clampCommentPanel(
  box: Box,
  viewport: { width: number; height: number },
): Box {
  const width = Math.min(
    Math.max(280, box.width),
    Math.max(0, viewport.width - 16),
  );
  const height = Math.min(
    Math.max(180, box.height),
    Math.max(0, viewport.height - 16),
  );
  return {
    width,
    height,
    left: Math.max(8, Math.min(box.left, viewport.width - width - 8)),
    top: Math.max(8, Math.min(box.top, viewport.height - height - 8)),
  };
}

export function CommentPanel({
  title,
  label = title,
  anchor,
  children,
  onClose,
  busy = false,
  initialHeight = 440,
  closeLabel,
}: {
  title: string;
  label?: string;
  anchor: { left: number; top: number };
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  initialHeight?: number;
  closeLabel?: string;
}) {
  const {
    docked,
    setDocked,
    dimensions: savedDimensions,
    setDimensions,
  } = useCommentWorkspace();
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1024 : window.innerWidth,
    height: typeof window === "undefined" ? 768 : window.innerHeight,
  }));
  const [placement, setPlacement] = useState<Box | null>(null);
  const dimensions = savedDimensions ?? { width: 400, height: initialHeight };
  const gesture = useRef<{
    x: number;
    y: number;
    box: Box;
    mode: "move" | "resize";
  } | null>(null);
  useEffect(() => {
    const measure = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const box = clampCommentPanel(
    docked
      ? {
          left: viewport.width - dimensions.width - 8,
          top: 80,
          width: dimensions.width,
          height: viewport.height - 96,
        }
      : (placement ?? { ...anchor, ...dimensions }),
    viewport,
  );
  function start(
    event: PointerEvent<HTMLButtonElement>,
    mode: "move" | "resize",
  ) {
    if (event.button !== 0 || docked) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { x: event.clientX, y: event.clientY, box, mode };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.x,
      dy = event.clientY - current.y;
    const next = clampCommentPanel(
      current.mode === "move"
        ? {
            ...current.box,
            left: current.box.left + dx,
            top: current.box.top + dy,
          }
        : {
            ...current.box,
            width: current.box.width + dx,
            height: current.box.height + dy,
          },
      viewport,
    );
    setPlacement(next);
    setDimensions({ width: next.width, height: next.height });
  }
  function keyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    mode: "move" | "resize",
  ) {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction || docked) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    const [dx, dy] = direction;
    const next = clampCommentPanel(
      mode === "move"
        ? { ...box, left: box.left + dx! * step, top: box.top + dy! * step }
        : {
            ...box,
            width: box.width + dx! * step,
            height: box.height + dy! * step,
          },
      viewport,
    );
    setPlacement(next);
    setDimensions({ width: next.width, height: next.height });
  }
  if (typeof document === "undefined") return null;
  return createPortal(
    <aside
      role="dialog"
      aria-label={label}
      aria-busy={busy}
      data-comment-panel
      data-docked={docked}
      className="group fixed z-[120] flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl"
      style={box}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" && !event.defaultPrevented && !busy) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {!docked ? (
        <button
          type="button"
          aria-label="Move comment panel"
          title="Drag to move; arrow keys also move the panel"
          className="flex h-5 shrink-0 cursor-grab touch-none items-center justify-center focus-visible:bg-violet-100 focus-visible:outline-none active:cursor-grabbing"
          onPointerDown={(event) => start(event, "move")}
          onPointerMove={move}
          onPointerUp={() => {
            gesture.current = null;
          }}
          onPointerCancel={() => {
            gesture.current = null;
          }}
          onLostPointerCapture={() => {
            gesture.current = null;
          }}
          onKeyDown={(event) => keyboard(event, "move")}
        >
          <span className="h-1 w-12 rounded-full bg-zinc-300" />
        </button>
      ) : null}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-4 py-2">
        <h2 className="min-w-0 flex-1 font-semibold">{title}</h2>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={
            docked ? "Undock comment panel" : "Dock comment panel right"
          }
          title={docked ? "Undock" : "Dock right"}
          onClick={() => {
            setPlacement(null);
            setDocked(!docked);
          }}
        >
          {docked ? (
            <PanelRightOpen aria-hidden="true" />
          ) : (
            <PanelRightClose aria-hidden="true" />
          )}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={closeLabel ?? `Close ${label}`}
          disabled={busy}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {children}
      </div>
      {!docked ? (
        <button
          type="button"
          aria-label="Resize comment panel"
          title="Drag to resize; arrow keys also resize the panel"
          className="absolute right-0 bottom-0 flex size-6 cursor-nwse-resize touch-none items-center justify-center rounded-tl-lg bg-white/90 text-zinc-500 focus-visible:bg-violet-100 focus-visible:outline-none"
          onPointerDown={(event) => start(event, "resize")}
          onPointerMove={move}
          onPointerUp={() => {
            gesture.current = null;
          }}
          onPointerCancel={() => {
            gesture.current = null;
          }}
          onLostPointerCapture={() => {
            gesture.current = null;
          }}
          onKeyDown={(event) => keyboard(event, "resize")}
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
            <path
              d="M4 13 13 4M9 13l4-4"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </button>
      ) : null}
    </aside>,
    document.body,
  );
}
