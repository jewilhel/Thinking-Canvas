"use client";

import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ellipse,
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";

import { createMixedCanvasFixture, spikeDocumentId } from "@/canvas/fixture";
import {
  normalizeTransformedGeometry,
  resolveConnectorPoints,
  zoomViewportAtPointer,
  type Viewport,
} from "@/canvas/geometry";
import {
  summarizeFrameTimes,
  type FrameMeasurement,
} from "@/canvas/performance";
import { CollaborativeDocument } from "@/components/spikes/collaborative-document";
import { Button } from "@/components/ui/button";
import type { CanvasObject } from "@/domain/canvas-object";

type Props = { canvasId: string };

const fixture = createMixedCanvasFixture();

export function CanvasDocumentSpike({ canvasId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ width: 960, height: 560 });
  const [objects, setObjects] = useState(fixture);
  const [viewport, setViewport] = useState<Viewport>({
    x: 40,
    y: 40,
    scale: 0.7,
  });
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [selectedId, setSelectedId] = useState<string | null>(
    fixture[0]?.id ?? null,
  );
  const [focusedDocument, setFocusedDocument] = useState(false);
  const [measurement, setMeasurement] = useState<FrameMeasurement | null>(null);
  const [measuring, setMeasuring] = useState(false);

  const byId = useMemo(
    () => new Map(objects.map((object) => [object.id, object])),
    [objects],
  );
  const connectors = objects.filter(
    (object): object is Extract<CanvasObject, { type: "connector" }> =>
      object.type === "connector",
  );
  const visibleObjects = objects.filter(
    (object) => object.type !== "connector",
  );
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const firstConnectorPoints = connectors[0]
    ? resolveConnectorPoints(connectors[0], byId)
    : [];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: Math.max(320, entry.contentRect.width), height: 560 });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (
      !transformer ||
      !stage ||
      !selectedId ||
      selected?.type === "connector"
    ) {
      transformer?.nodes([]);
      return;
    }
    const node = stage.findOne(`#${selectedId}`);
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selected?.type, selectedId, objects]);

  function updateObject(
    id: string,
    update: (object: CanvasObject) => CanvasObject,
  ) {
    setObjects((current) =>
      current.map((object) => (object.id === id ? update(object) : object)),
    );
  }

  function commitDrag(object: CanvasObject, node: Konva.Node) {
    updateObject(object.id, (current) => ({
      ...current,
      geometry: { ...current.geometry, x: node.x(), y: node.y() },
    }));
  }

  function commitTransform(object: CanvasObject, node: Konva.Node) {
    const geometry = normalizeTransformedGeometry(
      object,
      node.scaleX(),
      node.scaleY(),
    );
    node.scale({ x: 1, y: 1 });
    updateObject(object.id, (current) => ({
      ...current,
      geometry: { ...geometry, x: node.x(), y: node.y() },
    }));
  }

  function moveSelected() {
    if (!selected || selected.type === "connector") return;
    updateObject(selected.id, (current) => ({
      ...current,
      geometry: {
        ...current.geometry,
        x: current.geometry.x + 48,
        y: current.geometry.y + 24,
      },
    }));
  }

  function resizeSelected() {
    if (!selected || selected.type === "connector") return;
    updateObject(selected.id, (current) => ({
      ...current,
      geometry: {
        ...current.geometry,
        width: current.geometry.width + 36,
        height: current.geometry.height + 20,
      },
    }));
  }

  function onWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    setViewport((current) =>
      zoomViewportAtPointer(current, pointer, event.evt.deltaY),
    );
  }

  async function runMeasurement() {
    if (measuring) return;
    const stage = stageRef.current;
    if (!stage) return;
    setMeasuring(true);
    setMeasurement(null);
    const samples: number[] = [];
    const initial = viewport;
    let prior = performance.now();
    for (let frame = 0; frame < 90; frame += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame((now) => {
          if (frame > 0) samples.push(now - prior);
          prior = now;
          stage.position({
            x: initial.x - frame * 3,
            y: initial.y + Math.sin(frame / 8) * 28,
          });
          const scale = initial.scale * (1 + Math.sin(frame / 18) * 0.08);
          stage.scale({ x: scale, y: scale });
          stage.batchDraw();
          resolve();
        });
      });
    }
    stage.position({ x: initial.x, y: initial.y });
    stage.scale({ x: initial.scale, y: initial.scale });
    stage.batchDraw();
    setMeasurement(summarizeFrameTimes(samples));
    setMeasuring(false);
  }

  return (
    <section
      className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"
      aria-labelledby="canvas-spike-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wider text-violet-300 uppercase">
            Slice 4 live evidence
          </p>
          <h2 id="canvas-spike-title" className="mt-2 text-2xl font-semibold">
            Canvas and rich-document feasibility
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Konva derives its scene from {objects.length.toLocaleString()}{" "}
            renderer-independent objects. Select, move, resize, pan, and
            pointer-zoom while attached connector endpoints follow domain
            geometry.
          </p>
        </div>
        <span
          className="rounded-full border border-zinc-700 px-3 py-1 text-xs"
          data-testid="canvas-fixture-count"
        >
          {objects.length.toLocaleString()} objects
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          type="button"
          variant={tool === "select" ? "default" : "outline"}
          className={
            tool === "select"
              ? undefined
              : "border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800"
          }
          onClick={() => setTool("select")}
        >
          Select
        </Button>
        <Button
          type="button"
          variant={tool === "pan" ? "default" : "outline"}
          className={
            tool === "pan"
              ? undefined
              : "border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800"
          }
          onClick={() => setTool("pan")}
        >
          Pan
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800"
          onClick={() => setSelectedId(fixture[3]?.id ?? null)}
        >
          Select document
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800"
          onClick={() => {
            setSelectedId(fixture[3]?.id ?? null);
            setFocusedDocument(true);
          }}
        >
          Focus document
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800"
          disabled={!selected || selected.type === "connector"}
          onClick={moveSelected}
        >
          Move selected
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800"
          disabled={!selected || selected.type === "connector"}
          onClick={resizeSelected}
        >
          Resize selected
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800"
          disabled={measuring}
          onClick={() => void runMeasurement()}
        >
          {measuring ? "Measuring 90 frames…" : "Measure 1,000 objects"}
        </Button>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-xl bg-zinc-950 p-3">
          <dt className="text-zinc-500">Scale</dt>
          <dd className="mt-1" data-testid="canvas-scale">
            {viewport.scale.toFixed(2)}×
          </dd>
        </div>
        <div className="rounded-xl bg-zinc-950 p-3">
          <dt className="text-zinc-500">Selected</dt>
          <dd className="mt-1 truncate" data-testid="selected-object">
            {selected?.type ?? "None"}
          </dd>
        </div>
        <div className="rounded-xl bg-zinc-950 p-3">
          <dt className="text-zinc-500">Average fps</dt>
          <dd className="mt-1" data-testid="average-fps">
            {measurement?.averageFps ?? "Not measured"}
          </dd>
        </div>
        <div className="rounded-xl bg-zinc-950 p-3">
          <dt className="text-zinc-500">p95 frame</dt>
          <dd className="mt-1" data-testid="p95-frame">
            {measurement ? `${measurement.p95FrameTimeMs} ms` : "Not measured"}
          </dd>
        </div>
      </dl>
      <span className="sr-only" data-testid="selected-geometry">
        {selected ? JSON.stringify(selected.geometry) : "none"}
      </span>
      <span className="sr-only" data-testid="connector-points">
        {firstConnectorPoints.join(",")}
      </span>

      {measurement ? (
        <p
          className="mt-3 text-sm text-zinc-300"
          role="status"
          data-testid="performance-result"
        >
          Captured {measurement.sampleCount} frames; longest{" "}
          {measurement.longestFrameMs} ms; sustained below 30 fps:{" "}
          {measurement.sustainedBelow30Fps ? "yes" : "no"}.
        </p>
      ) : null}

      <div
        ref={containerRef}
        className="mt-5 overflow-hidden rounded-xl border border-zinc-700 bg-[#111827]"
        data-testid="konva-surface"
        role="application"
        aria-label="Interactive one-thousand-object canvas spike"
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
          onDragEnd={(event) => {
            if (event.target === stageRef.current)
              setViewport((current) => ({
                ...current,
                x: event.target.x(),
                y: event.target.y(),
              }));
          }}
          onWheel={onWheel}
          onMouseDown={(event) => {
            if (event.target === stageRef.current) setSelectedId(null);
          }}
        >
          <Layer listening={false}>
            {connectors.map((connector) => (
              <Line
                key={connector.id}
                points={resolveConnectorPoints(connector, byId)}
                stroke="#64748b"
                strokeWidth={2}
              />
            ))}
          </Layer>
          <Layer>
            {visibleObjects.map((object) => (
              <CanvasNode
                key={object.id}
                object={object}
                selected={object.id === selectedId}
                draggable={tool === "select"}
                onSelect={() => setSelectedId(object.id)}
                onDragEnd={(node) => commitDrag(object, node)}
                onTransformEnd={(node) => commitTransform(object, node)}
              />
            ))}
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              flipEnabled={false}
              boundBoxFunc={(oldBox, nextBox) =>
                nextBox.width < 24 || nextBox.height < 24 ? oldBox : nextBox
              }
            />
          </Layer>
        </Stage>
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        Preview canvas: {canvasId}. Measurement evidence must be recorded with
        browser and target hardware; the automated run is instrumentation, not
        production-budget approval.
      </p>

      {focusedDocument ? (
        <div className="mt-6">
          <CollaborativeDocument
            documentId={spikeDocumentId}
            onExit={() => setFocusedDocument(false)}
          />
        </div>
      ) : null}
    </section>
  );
}

function CanvasNode({
  object,
  selected,
  draggable,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: {
  object: Exclude<CanvasObject, { type: "connector" }>;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDragEnd: (node: Konva.Node) => void;
  onTransformEnd: (node: Konva.Node) => void;
}) {
  const { geometry } = object;
  const common = {
    id: object.id,
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    draggable,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) =>
      onDragEnd(event.target),
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) =>
      onTransformEnd(event.target),
  };
  const stroke = selected ? "#a78bfa" : "#475569";

  if (object.type === "shape" && object.shape === "ellipse") {
    return (
      <Ellipse
        {...common}
        radiusX={geometry.width / 2}
        radiusY={geometry.height / 2}
        offsetX={-geometry.width / 2}
        offsetY={-geometry.height / 2}
        fill="#1e293b"
        stroke={stroke}
        strokeWidth={selected ? 3 : 1}
      />
    );
  }

  const label =
    object.type === "table"
      ? (object.cells[0]?.join(" · ") ?? "Table")
      : object.type === "document"
        ? object.title
        : "text" in object
          ? object.text
          : object.type;
  return (
    <Group {...common}>
      <Rect
        width={geometry.width}
        height={geometry.height}
        cornerRadius={object.type === "document" ? 4 : 12}
        fill={object.type === "document" ? "#f8fafc" : "#1e293b"}
        stroke={stroke}
        strokeWidth={selected ? 3 : 1}
      />
      <Text
        text={label}
        width={geometry.width - 24}
        height={geometry.height - 20}
        x={12}
        y={10}
        fontSize={14}
        lineHeight={1.3}
        fill={object.type === "document" ? "#0f172a" : "#e2e8f0"}
        ellipsis
      />
    </Group>
  );
}
