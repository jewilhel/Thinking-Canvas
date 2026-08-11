"use client";

import type Konva from "konva";
import {
  ArrowLeft,
  Hand,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Stage } from "react-konva";

import {
  createProductCanvasDocument,
  listCanvasObjectsV2,
} from "@/canvas/canvas-document";
import {
  maxCanvasScale,
  minCanvasScale,
  zoomViewportAtPointer,
  type Viewport,
} from "@/canvas/geometry";
import { Button, buttonVariants } from "@/components/ui/button";

type Props = { canvasId: string; title: string; userId: string };
type Tool = "select" | "pan";

const defaultViewport: Viewport = { x: 80, y: 80, scale: 1 };

function clampViewport(viewport: Viewport): Viewport {
  return {
    x: Number.isFinite(viewport.x) ? viewport.x : defaultViewport.x,
    y: Number.isFinite(viewport.y) ? viewport.y : defaultViewport.y,
    scale: Math.min(
      maxCanvasScale,
      Math.max(
        minCanvasScale,
        Number.isFinite(viewport.scale)
          ? viewport.scale
          : defaultViewport.scale,
      ),
    ),
  };
}

export function ProductCanvas({ canvasId, title, userId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const frameStartedAt = useRef(0);
  const document = useMemo(
    () => createProductCanvasDocument(canvasId),
    [canvasId],
  );
  const [size, setSize] = useState({ width: 960, height: 640 });
  const [tool, setTool] = useState<Tool>("select");
  const storageKey = `thinking-canvas:viewport:${userId}:${canvasId}`;
  const [viewport, setViewport] = useState<Viewport>(() => {
    if (typeof window === "undefined") return defaultViewport;
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return defaultViewport;

    try {
      return clampViewport(JSON.parse(stored) as Viewport);
    } catch {
      return defaultViewport;
    }
  });
  const [frameTime, setFrameTime] = useState<number | null>(null);
  const objectCount = listCanvasObjectsV2(document).length;
  const instrumentationEnabled = process.env.NODE_ENV !== "production";

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(viewport));
  }, [storageKey, viewport]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: Math.max(320, entry.contentRect.width),
        height: Math.max(480, window.innerHeight - 194),
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!instrumentationEnabled) return;
    frameStartedAt.current = performance.now();
    const frame = requestAnimationFrame((now) => {
      setFrameTime(Number((now - frameStartedAt.current).toFixed(2)));
    });
    return () => cancelAnimationFrame(frame);
  }, [instrumentationEnabled, viewport]);

  function zoomAtCenter(direction: 1 | -1) {
    setViewport((current) =>
      zoomViewportAtPointer(
        current,
        { x: size.width / 2, y: size.height / 2 },
        direction === 1 ? -1 : 1,
      ),
    );
  }

  function fitCanvas() {
    setViewport(defaultViewport);
  }

  function onWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    setViewport((current) =>
      zoomViewportAtPointer(current, pointer, event.evt.deltaY),
    );
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomAtCenter(1);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomAtCenter(-1);
    } else if (event.key === "0") {
      event.preventDefault();
      fitCanvas();
    } else if (event.key === " ") {
      event.preventDefault();
      setTool((current) => (current === "pan" ? "select" : "pan"));
    } else if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const step = 32;
      setViewport((current) => ({
        ...current,
        x:
          current.x +
          (event.key === "ArrowLeft"
            ? step
            : event.key === "ArrowRight"
              ? -step
              : 0),
        y:
          current.y +
          (event.key === "ArrowUp"
            ? step
            : event.key === "ArrowDown"
              ? -step
              : 0),
      }));
    }
  }

  return (
    <section
      aria-labelledby="canvas-title"
      className="flex min-h-full flex-col"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-900/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/app"
            aria-label="Back to canvases"
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
          >
            <ArrowLeft aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 id="canvas-title" className="truncate font-medium">
              {title}
            </h1>
            <p className="text-xs text-zinc-400">Canvas foundation</p>
          </div>
        </div>
        <p
          role="status"
          aria-live="polite"
          data-testid="canvas-save-status"
          className="rounded-full border border-emerald-900 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-300"
        >
          Saved
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div
          className="flex items-center gap-2"
          role="toolbar"
          aria-label="Canvas tools"
        >
          <Button
            type="button"
            size="sm"
            variant={tool === "select" ? "default" : "outline"}
            aria-pressed={tool === "select"}
            onClick={() => setTool("select")}
          >
            <MousePointer2 aria-hidden="true" />
            Select
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === "pan" ? "default" : "outline"}
            aria-pressed={tool === "pan"}
            onClick={() => setTool("pan")}
          >
            <Hand aria-hidden="true" />
            Pan
          </Button>
        </div>
        <div
          className="flex items-center gap-2"
          role="group"
          aria-label="Canvas zoom"
        >
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Zoom out"
            onClick={() => zoomAtCenter(-1)}
          >
            <Minus aria-hidden="true" />
          </Button>
          <output
            aria-label="Canvas zoom level"
            data-testid="product-canvas-scale"
            className="min-w-14 text-center text-xs text-zinc-400"
          >
            {Math.round(viewport.scale * 100)}%
          </output>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Zoom in"
            onClick={() => zoomAtCenter(1)}
          >
            <Plus aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Zoom to fit"
            onClick={fitCanvas}
          >
            <Maximize2 aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label={`Canvas: ${title}. Use arrow keys to pan, plus and minus to zoom, zero to fit, and space to switch tools.`}
        onKeyDown={onKeyDown}
        className="relative min-h-[480px] flex-1 overflow-hidden bg-[#10131a] bg-[radial-gradient(circle,#303746_1px,transparent_1px)] bg-[length:24px_24px] focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none focus-visible:ring-inset"
        data-testid="product-canvas-surface"
      >
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          draggable={tool === "pan"}
          onWheel={onWheel}
          onDragEnd={(event) => {
            if (event.target !== stageRef.current) return;
            setViewport((current) => ({
              ...current,
              x: event.target.x(),
              y: event.target.y(),
            }));
          }}
        />

        {objectCount === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
            <div className="max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950/85 px-6 py-5 shadow-xl backdrop-blur">
              <p className="font-medium text-zinc-200">An empty canvas</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Shape, text, connector, and table tools arrive in the next
                approved slice.
              </p>
            </div>
          </div>
        ) : null}

        {instrumentationEnabled ? (
          <dl className="pointer-events-none absolute right-3 bottom-3 grid grid-cols-2 gap-x-4 rounded-lg border border-zinc-800 bg-zinc-950/90 px-3 py-2 text-xs">
            <div>
              <dt className="text-zinc-400">Objects</dt>
              <dd data-testid="product-object-count">{objectCount}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">Frame</dt>
              <dd data-testid="product-frame-time">
                {frameTime === null ? "—" : `${frameTime} ms`}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>
    </section>
  );
}
