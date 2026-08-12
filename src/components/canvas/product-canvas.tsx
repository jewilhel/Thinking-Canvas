"use client";

import type Konva from "konva";
import {
  ArrowLeft,
  Check,
  Cloud,
  LogOut,
  Maximize2,
  Minus,
  Plus,
  Share2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Arrow,
  Circle,
  Ellipse,
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import * as Y from "yjs";

import { signOut } from "@/app/auth/actions";
import {
  createCanvasClipboardPayload,
  parseCanvasClipboard,
  remapCanvasClipboard,
  serializeCanvasClipboard,
} from "@/canvas/canvas-clipboard";
import {
  createProductCanvasDocument,
  listCanvasObjectsV2,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";
import {
  applyCanvasHistoryEntry,
  executeProductCanvasCommandWithHistory,
  type CanvasHistoryEntry,
} from "@/canvas/canvas-history";
import {
  anchorPointV2,
  maxCanvasScale,
  minCanvasScale,
  resolveConnectorEndpointV2,
  resolveConnectorPointsV2,
  zoomViewportAtPointer,
  type CanvasAnchor,
  type Point,
  type Viewport,
} from "@/canvas/geometry";
import { useCanvasRecovery } from "@/collaboration/use-canvas-recovery";
import {
  WorkspacePrimaryDock,
  type CanvasShapeTool,
  type CanvasTool,
} from "@/components/canvas/workspace-primary-dock";
import { Button, buttonVariants } from "@/components/ui/button";

type Props = {
  canvasId: string;
  title: string;
  userId: string;
  userIdentity: string;
  simulatedAiEnabled: boolean;
};
type ConnectorEndpoint = Extract<
  CanvasObjectV2,
  { type: "connector" }
>["start"];
type Marquee = { start: Point; current: Point; additive: boolean };
type CommandDefinition = { type: string; payload: unknown };

const defaultViewport: Viewport = { x: 80, y: 80, scale: 1 };
const anchors: CanvasAnchor[] = ["top", "right", "bottom", "left", "center"];

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

function encodeUpdate(update: Uint8Array) {
  let binary = "";
  for (const byte of update) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function decodeUpdate(value: string) {
  return Uint8Array.from(window.atob(value), (character) =>
    character.charCodeAt(0),
  );
}

function baseStyle(type: CanvasObjectV2["type"]) {
  return {
    fill: type === "connector" ? null : "#ffffff",
    outline: "#475569",
    outlineWidth: 2,
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: 16,
  };
}

function objectLabel(object: CanvasObjectV2) {
  if (object.type === "shape")
    return `${object.shape} — ${object.text || "Untitled"}`;
  if (object.type === "text") return `text — ${object.text || "Untitled"}`;
  if (object.type === "table") return `table — ${object.cells.length} rows`;
  if (object.type === "connector") return "connector";
  return object.type;
}

function tableText(object: Extract<CanvasObjectV2, { type: "table" }>) {
  return object.cells.map((row) => row.join("\t")).join("\n");
}

const simulatedAiActorId = "90000000-0000-4000-8000-000000000001";

export function ProductCanvas({
  canvasId,
  title,
  userId,
  userIdentity,
  simulatedAiEnabled,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const objectNodeRefs = useRef(new Map<string, Konva.Node>());
  const frameStartedAt = useRef(0);
  const documentStorageKey = `thinking-canvas:document:${canvasId}`;
  const viewportStorageKey = `thinking-canvas:viewport:${userId}:${canvasId}`;
  const document = useMemo(() => {
    const next = createProductCanvasDocument(canvasId);
    const stored = window.localStorage.getItem(documentStorageKey);
    if (stored) {
      try {
        Y.applyUpdate(next, decodeUpdate(stored), "canvas.local.restore");
      } catch {
        window.localStorage.removeItem(documentStorageKey);
      }
    }
    return next;
  }, [canvasId, documentStorageKey]);
  const [objects, setObjects] = useState(() => listCanvasObjectsV2(document));
  const [size, setSize] = useState({ width: 960, height: 640 });
  const [tool, setTool] = useState<CanvasTool>("select");
  const [recentShape, setRecentShape] = useState<CanvasShapeTool>("rectangle");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [connectorStart, setConnectorStart] =
    useState<ConnectorEndpoint | null>(null);
  const [pointerPreview, setPointerPreview] = useState<Point | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [clipboardText, setClipboardText] = useState("");
  const [undoStack, setUndoStack] = useState<CanvasHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<CanvasHistoryEntry[]>([]);
  const [historyNotice, setHistoryNotice] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [viewport, setViewport] = useState<Viewport>(() => {
    const stored = window.localStorage.getItem(viewportStorageKey);
    if (!stored) return defaultViewport;
    try {
      return clampViewport(JSON.parse(stored) as Viewport);
    } catch {
      return defaultViewport;
    }
  });
  const [frameTime, setFrameTime] = useState<number | null>(null);
  const {
    status: saveStatus,
    pendingCount,
    lastSequence,
    participants,
    remoteCursors,
    publishedCursorCount,
    attemptedCursorCount,
    cursorPublishStatus,
    publishCursor,
    retry,
  } = useCanvasRecovery({
    canvasId,
    document,
    selectedObjectIds: selectedIds,
    userId,
  });
  const instrumentationEnabled = process.env.NODE_ENV !== "production";
  const objectsById = useMemo(
    () => new Map(objects.map((object) => [object.id, object])),
    [objects],
  );
  const selectedId = selectedIds.at(-1) ?? null;
  const selectedObjects = selectedIds.flatMap((id) => {
    const object = objectsById.get(id);
    return object ? [object] : [];
  });
  const selectedObject = selectedId ? objectsById.get(selectedId) : undefined;

  useEffect(() => {
    function synchronize() {
      setObjects(listCanvasObjectsV2(document));
      window.localStorage.setItem(
        documentStorageKey,
        encodeUpdate(Y.encodeStateAsUpdate(document)),
      );
    }

    document.on("update", synchronize);
    return () => {
      document.off("update", synchronize);
    };
  }, [document, documentStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(viewportStorageKey, JSON.stringify(viewport));
  }, [viewportStorageKey, viewport]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: Math.max(320, entry.contentRect.width),
        height: Math.max(480, entry.contentRect.height),
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    const node = selectedId
      ? objectNodeRefs.current.get(selectedId)
      : undefined;
    if (!transformer) return;
    transformer.nodes(
      node && selectedObject?.type !== "connector" ? [node] : [],
    );
    transformer.getLayer()?.batchDraw();
  }, [selectedId, selectedObject]);

  useEffect(() => {
    if (!instrumentationEnabled) return;
    frameStartedAt.current = performance.now();
    const frame = requestAnimationFrame((now) => {
      setFrameTime(Number((now - frameStartedAt.current).toFixed(2)));
    });
    return () => cancelAnimationFrame(frame);
  }, [instrumentationEnabled, objects, viewport]);

  function executeCommand(
    type: string,
    payload: unknown,
    actorType: "human" | "ai" = "human",
  ) {
    return executeProductCanvasCommandWithHistory(document, {
      schemaVersion: 2,
      commandId: crypto.randomUUID(),
      canvasId,
      actor: {
        id: actorType === "ai" ? simulatedAiActorId : userId,
        type: actorType,
      },
      origin: actorType,
      issuedAt: new Date().toISOString(),
      type,
      payload,
    });
  }

  function recordHistory(entries: CanvasHistoryEntry[]) {
    const first = entries[0];
    const last = entries.at(-1);
    if (!first || !last) return;
    const beforeObjects: CanvasHistoryEntry["beforeObjects"] = {};
    const afterObjects: CanvasHistoryEntry["afterObjects"] = {};
    for (const entry of entries) {
      for (const [id, object] of Object.entries(entry.beforeObjects)) {
        if (!(id in beforeObjects)) beforeObjects[id] = object;
      }
      Object.assign(afterObjects, entry.afterObjects);
    }
    const history: CanvasHistoryEntry = {
      commandId: first.commandId,
      actorId: first.actorId,
      beforeObjects,
      afterObjects,
      beforeOrder: first.beforeOrder,
      afterOrder: last.afterOrder,
    };
    setUndoStack((current) => [...current, history]);
    setRedoStack([]);
    setHistoryNotice("");
  }

  function runCommand(type: string, payload: unknown) {
    const result = executeCommand(type, payload);
    recordHistory([result.history]);
    return result;
  }

  function runCommandBatch(commands: CommandDefinition[]) {
    const results = commands.map((command) =>
      executeCommand(command.type, command.payload),
    );
    recordHistory(results.map((result) => result.history));
    return results;
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareNotice("Canvas link copied. Access is still limited to members.");
    } catch {
      setShareNotice(
        "Copy is unavailable. Use the address bar; access is still limited to members.",
      );
    }
  }

  function createObject(
    activeTool: Exclude<CanvasTool, "select" | "pan" | "connector">,
    point: Point,
  ) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const shared = {
      schemaVersion: 2 as const,
      id,
      canvasId,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      geometry: {
        x: Math.round(point.x),
        y: Math.round(point.y),
        width:
          activeTool === "text"
            ? 220
            : activeTool === "table"
              ? 300
              : activeTool === "sticky"
                ? 200
                : 180,
        height:
          activeTool === "text"
            ? 72
            : activeTool === "table"
              ? 140
              : activeTool === "sticky"
                ? 160
                : 110,
        rotation: 0,
      },
      style:
        activeTool === "sticky"
          ? {
              ...baseStyle("shape"),
              fill: "#fef3c7",
              outline: "#f59e0b",
            }
          : baseStyle(
              activeTool === "text"
                ? "text"
                : activeTool === "table"
                  ? "table"
                  : "shape",
            ),
    };
    const object: CanvasObjectV2 =
      activeTool === "text"
        ? { ...shared, type: "text", text: "New text" }
        : activeTool === "table"
          ? {
              ...shared,
              type: "table",
              cells: [
                ["Heading", "Value"],
                ["Item", "Detail"],
              ],
            }
          : {
              ...shared,
              type: "shape",
              shape: activeTool === "sticky" ? "rectangle" : activeTool,
              text: activeTool === "sticky" ? "Sticky note" : "New idea",
            };
    runCommand("object.create", { object });
    setSelectedIds([id]);
    setTool("select");
  }

  function chooseTool(nextTool: CanvasTool) {
    setTool(nextTool);
    if (nextTool !== "connector") {
      setConnectorStart(null);
      setPointerPreview(null);
    }
  }

  function chooseShape(shape: CanvasShapeTool) {
    setRecentShape(shape);
    chooseTool(shape);
  }

  function addSimulatedAiIdea() {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const result = executeCommand(
      "object.create",
      {
        object: {
          schemaVersion: 2,
          id,
          canvasId,
          createdBy: simulatedAiActorId,
          createdAt: now,
          updatedAt: now,
          type: "shape",
          shape: "rectangle",
          text: "Simulated AI idea",
          geometry: {
            x: 80 + (objects.length % 5) * 48,
            y: 80 + (objects.length % 4) * 40,
            width: 180,
            height: 110,
            rotation: 0,
          },
          style: {
            ...baseStyle("shape"),
            fill: "#ede9fe",
            outline: "#7c3aed",
          },
        },
      },
      "ai",
    );
    recordHistory([result.history]);
    setSelectedIds([id]);
  }

  function finishConnector(endpoint: ConnectorEndpoint) {
    if (!connectorStart) {
      setConnectorStart(endpoint);
      setTool("connector");
      return;
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const object: CanvasObjectV2 = {
      schemaVersion: 2,
      id,
      canvasId,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      type: "connector",
      start: connectorStart,
      end: endpoint,
      geometry: { x: 0, y: 0, width: 24, height: 24, rotation: 0 },
      style: baseStyle("connector"),
    };
    runCommand("object.create", { object });
    setConnectorStart(null);
    setPointerPreview(null);
    setSelectedIds([id]);
    setTool("select");
  }

  function worldPointer() {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - viewport.x) / viewport.scale,
      y: (pointer.y - viewport.y) / viewport.scale,
    };
  }

  function selectObject(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
    object: CanvasObjectV2,
  ) {
    event.cancelBubble = true;
    if (tool === "connector" && object.type !== "connector") {
      finishConnector({
        kind: "attached",
        objectId: object.id,
        anchor: "center",
      });
      return;
    }
    if (tool === "select") {
      const modifier =
        event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey;
      updateSelectionForObject(object, modifier);
    }
  }

  function updateSelectionForObject(object: CanvasObjectV2, modifier: boolean) {
    const groupIds = object.groupId
      ? objects
          .filter((candidate) => candidate.groupId === object.groupId)
          .map((candidate) => candidate.id)
      : [object.id];
    setSelectedIds((current) => {
      if (!modifier) return groupIds;
      const everySelected = groupIds.every((id) => current.includes(id));
      return everySelected
        ? current.filter((id) => !groupIds.includes(id))
        : [...current.filter((id) => !groupIds.includes(id)), ...groupIds];
    });
  }

  function moveSelectionFromDrag(object: CanvasObjectV2, x: number, y: number) {
    const dx = x - object.geometry.x;
    const dy = y - object.geometry.y;
    const commands: CommandDefinition[] = [];
    for (const selected of selectedObjects) {
      if (selected.type === "connector")
        commands.push(...moveConnectorCommands(selected, dx, dy, true));
      else
        commands.push({
          type: "object.move",
          payload: {
            objectId: selected.id,
            x: selected.geometry.x + dx,
            y: selected.geometry.y + dy,
          },
        });
    }
    runCommandBatch(commands);
  }

  function moveConnectorCommands(
    connector: Extract<CanvasObjectV2, { type: "connector" }>,
    dx: number,
    dy: number,
    preserveAttached = false,
  ) {
    const commands: CommandDefinition[] = [];
    for (const endpoint of ["start", "end"] as const) {
      if (preserveAttached && connector[endpoint].kind === "attached") continue;
      const point = resolveConnectorEndpointV2(
        connector[endpoint],
        objectsById,
      );
      commands.push({
        type: "connector.endpoint",
        payload: {
          objectId: connector.id,
          endpoint,
          value: { kind: "free", x: point.x + dx, y: point.y + dy },
        },
      });
    }
    return commands;
  }

  function deleteSelected() {
    if (!selectedObjects.length) return;
    runCommandBatch(
      [...selectedObjects].reverse().map((object) => ({
        type: "object.delete",
        payload: { objectId: object.id },
      })),
    );
    setSelectedIds([]);
  }

  function groupSelected() {
    if (selectedIds.length < 2) return;
    runCommand("selection.group", {
      objectIds: selectedIds,
      groupId: crypto.randomUUID(),
    });
  }

  function ungroupSelected() {
    const groupIds = [
      ...new Set(
        selectedObjects.flatMap((object) =>
          object.groupId ? [object.groupId] : [],
        ),
      ),
    ];
    runCommandBatch(
      groupIds.map((groupId) => ({
        type: "selection.ungroup",
        payload: { groupId },
      })),
    );
  }

  function reorderSelected(
    direction: "front" | "forward" | "backward" | "back",
  ) {
    runCommandBatch(
      selectedIds.map((objectId) => ({
        type: "object.reorder",
        payload: { objectId, direction },
      })),
    );
  }

  function duplicatedSelection(offset = 32) {
    if (!selectedIds.length) return [];
    const payload = createCanvasClipboardPayload(objects, selectedIds);
    return remapCanvasClipboard(payload, {
      canvasId,
      actorId: userId,
      issuedAt: new Date().toISOString(),
      offset,
    });
  }

  function duplicateSelected() {
    const duplicates = duplicatedSelection();
    if (!duplicates.length) return;
    runCommand("selection.duplicate", { objects: duplicates });
    setSelectedIds(duplicates.map((object) => object.id));
  }

  async function copySelected() {
    if (!selectedIds.length) return "";
    const value = serializeCanvasClipboard(
      createCanvasClipboardPayload(objects, selectedIds),
    );
    setClipboardText(value);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // The validated in-app clipboard remains available when browser permission is absent.
    }
    return value;
  }

  async function cutSelected() {
    if (!(await copySelected())) return;
    deleteSelected();
  }

  async function pasteSelected() {
    let value = clipboardText;
    if (!value) {
      try {
        value = await navigator.clipboard.readText();
      } catch {
        setHistoryNotice("Clipboard access is unavailable.");
        return;
      }
    }
    try {
      const pasted = remapCanvasClipboard(parseCanvasClipboard(value), {
        canvasId,
        actorId: userId,
        issuedAt: new Date().toISOString(),
      });
      runCommand("selection.duplicate", { objects: pasted });
      setSelectedIds(pasted.map((object) => object.id));
    } catch {
      setHistoryNotice("Clipboard content is not a valid canvas selection.");
    }
  }

  function undo() {
    const entry = undoStack.at(-1);
    if (!entry) return;
    const result = applyCanvasHistoryEntry(document, entry, "undo");
    const existingIds = new Set(
      listCanvasObjectsV2(document).map((object) => object.id),
    );
    setSelectedIds((current) => current.filter((id) => existingIds.has(id)));
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, entry]);
    setHistoryNotice(
      result.conflicts.length
        ? `Undo preserved ${result.conflicts.length} conflicting field${result.conflicts.length === 1 ? "" : "s"}.`
        : "Undo complete.",
    );
  }

  function redo() {
    const entry = redoStack.at(-1);
    if (!entry) return;
    const result = applyCanvasHistoryEntry(document, entry, "redo");
    const existingIds = new Set(
      listCanvasObjectsV2(document).map((object) => object.id),
    );
    setSelectedIds((current) => current.filter((id) => existingIds.has(id)));
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current, entry]);
    setHistoryNotice(
      result.conflicts.length
        ? `Redo preserved ${result.conflicts.length} conflicting field${result.conflicts.length === 1 ? "" : "s"}.`
        : "Redo complete.",
    );
  }

  function zoomAtCenter(direction: 1 | -1) {
    setViewport((current) =>
      zoomViewportAtPointer(
        current,
        { x: size.width / 2, y: size.height / 2 },
        direction === 1 ? -1 : 1,
      ),
    );
  }

  function onWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    setViewport((current) =>
      zoomViewportAtPointer(current, pointer, event.evt.deltaY),
    );
  }

  function onStagePointerDown(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) {
    if (event.target !== stageRef.current) return;
    const point = worldPointer();
    if (!point) return;
    if (tool === "select") {
      setMarquee({
        start: point,
        current: point,
        additive: event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey,
      });
    } else if (tool === "connector") {
      finishConnector({ kind: "free", ...point });
    } else if (tool !== "pan") {
      createObject(tool, point);
    }
  }

  function onStagePointerMove() {
    const point = worldPointer();
    if (connectorStart) setPointerPreview(point);
    if (!marquee) return;
    if (point)
      setMarquee((current) =>
        current ? { ...current, current: point } : null,
      );
  }

  function onSurfacePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    publishCursor({
      x: (event.clientX - bounds.left - viewport.x) / viewport.scale,
      y: (event.clientY - bounds.top - viewport.y) / viewport.scale,
    });
  }

  function objectBounds(object: CanvasObjectV2) {
    if (object.type !== "connector") return object.geometry;
    const points = resolveConnectorPointsV2(object, objectsById);
    const xs = [points[0]!, points[2]!];
    const ys = [points[1]!, points[3]!];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      x,
      y,
      width: Math.max(1, Math.max(...xs) - x),
      height: Math.max(1, Math.max(...ys) - y),
    };
  }

  function finishMarquee() {
    if (!marquee) return;
    const x = Math.min(marquee.start.x, marquee.current.x);
    const y = Math.min(marquee.start.y, marquee.current.y);
    const width = Math.abs(marquee.current.x - marquee.start.x);
    const height = Math.abs(marquee.current.y - marquee.start.y);
    const directMatches =
      width < 3 && height < 3
        ? []
        : objects
            .filter((object) => {
              const bounds = objectBounds(object);
              return (
                bounds.x < x + width &&
                bounds.x + bounds.width > x &&
                bounds.y < y + height &&
                bounds.y + bounds.height > y
              );
            })
            .map((object) => object.id);
    const matchedGroupIds = new Set(
      directMatches.flatMap((id) => {
        const groupId = objectsById.get(id)?.groupId;
        return groupId ? [groupId] : [];
      }),
    );
    const matches = objects
      .filter(
        (object) =>
          directMatches.includes(object.id) ||
          (object.groupId != null && matchedGroupIds.has(object.groupId)),
      )
      .map((object) => object.id);
    setSelectedIds((current) =>
      marquee.additive ? [...new Set([...current, ...matches])] : matches,
    );
    setMarquee(null);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    )
      return;
    const accelerator = event.metaKey || event.ctrlKey;
    if (accelerator && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (accelerator && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelectedIds(objects.map((object) => object.id));
      return;
    }
    if (accelerator && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void copySelected();
      return;
    }
    if (accelerator && event.key.toLowerCase() === "x") {
      event.preventDefault();
      void cutSelected();
      return;
    }
    if (accelerator && event.key.toLowerCase() === "v") {
      event.preventDefault();
      void pasteSelected();
      return;
    }
    if (accelerator && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelected();
      return;
    }
    if (accelerator && event.key.toLowerCase() === "g") {
      event.preventDefault();
      if (event.shiftKey) ungroupSelected();
      else groupSelected();
      return;
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      selectedObjects.length
    ) {
      event.preventDefault();
      deleteSelected();
      return;
    }
    if (event.key.startsWith("Arrow") && selectedObjects.length) {
      event.preventDefault();
      const amount = event.shiftKey ? 10 : 1;
      const dx =
        event.key === "ArrowLeft"
          ? -amount
          : event.key === "ArrowRight"
            ? amount
            : 0;
      const dy =
        event.key === "ArrowUp"
          ? -amount
          : event.key === "ArrowDown"
            ? amount
            : 0;
      const commands: CommandDefinition[] = [];
      for (const object of selectedObjects) {
        if (event.altKey && object.type !== "connector") {
          commands.push({
            type: "object.resize",
            payload: {
              objectId: object.id,
              width: Math.max(24, object.geometry.width + dx),
              height: Math.max(24, object.geometry.height + dy),
            },
          });
        } else if (object.type === "connector")
          commands.push(
            ...moveConnectorCommands(
              object,
              dx,
              dy,
              selectedObjects.length > 1,
            ),
          );
        else
          commands.push({
            type: "object.move",
            payload: {
              objectId: object.id,
              x: object.geometry.x + dx,
              y: object.geometry.y + dy,
            },
          });
      }
      runCommandBatch(commands);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomAtCenter(1);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomAtCenter(-1);
    } else if (event.key === "0") {
      event.preventDefault();
      setViewport(defaultViewport);
    } else if (event.key === " ") {
      event.preventDefault();
      setTool((current) => (current === "pan" ? "select" : "pan"));
    } else if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      const shortcutTool = {
        v: "select",
        h: "pan",
        s: "sticky",
        r: recentShape,
        c: "connector",
        t: "text",
        b: "table",
      }[event.key.toLowerCase()] as CanvasTool | undefined;
      if (shortcutTool) {
        event.preventDefault();
        chooseTool(shortcutTool);
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
  }

  function shapeNode(object: Extract<CanvasObjectV2, { type: "shape" }>) {
    const common = {
      width: object.geometry.width,
      height: object.geometry.height,
      fill: object.style.fill ?? "transparent",
      stroke: object.style.outline,
      strokeWidth: object.style.outlineWidth,
    };
    if (object.shape === "ellipse") {
      return (
        <Ellipse
          {...common}
          x={object.geometry.width / 2}
          y={object.geometry.height / 2}
          radiusX={object.geometry.width / 2}
          radiusY={object.geometry.height / 2}
        />
      );
    }
    if (object.shape === "diamond") {
      return (
        <Line
          points={[
            object.geometry.width / 2,
            0,
            object.geometry.width,
            object.geometry.height / 2,
            object.geometry.width / 2,
            object.geometry.height,
            0,
            object.geometry.height / 2,
          ]}
          closed
          {...common}
        />
      );
    }
    return <Rect {...common} cornerRadius={12} />;
  }

  function renderTable(object: Extract<CanvasObjectV2, { type: "table" }>) {
    const rows = object.cells.length;
    const columns = Math.max(...object.cells.map((row) => row.length), 1);
    const rowHeight = object.geometry.height / rows;
    const columnWidth = object.geometry.width / columns;
    return (
      <>
        <Rect
          width={object.geometry.width}
          height={object.geometry.height}
          fill={object.style.fill ?? "#ffffff"}
          stroke={object.style.outline}
          strokeWidth={object.style.outlineWidth}
          cornerRadius={6}
        />
        {Array.from({ length: rows - 1 }, (_, index) => (
          <Line
            key={`row-${index}`}
            points={[
              0,
              rowHeight * (index + 1),
              object.geometry.width,
              rowHeight * (index + 1),
            ]}
            stroke={object.style.outline}
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: columns - 1 }, (_, index) => (
          <Line
            key={`column-${index}`}
            points={[
              columnWidth * (index + 1),
              0,
              columnWidth * (index + 1),
              object.geometry.height,
            ]}
            stroke={object.style.outline}
            strokeWidth={1}
          />
        ))}
        {object.cells.flatMap((row, rowIndex) =>
          row.map((cell, columnIndex) => (
            <Text
              key={`${rowIndex}-${columnIndex}`}
              x={columnIndex * columnWidth + 8}
              y={rowIndex * rowHeight + 8}
              width={columnWidth - 16}
              height={rowHeight - 16}
              text={cell}
              fill="#18181b"
              fontFamily={object.style.fontFamily}
              fontSize={object.style.fontSize}
              verticalAlign="middle"
            />
          )),
        )}
      </>
    );
  }

  function renderObject(object: CanvasObjectV2) {
    if (object.type === "connector") {
      const points = resolveConnectorPointsV2(object, objectsById);
      return (
        <Group key={object.id}>
          <Arrow
            points={points}
            stroke={object.style.outline}
            fill={object.style.outline}
            strokeWidth={object.style.outlineWidth}
            pointerLength={10}
            pointerWidth={8}
            hitStrokeWidth={18}
            onClick={(event) => selectObject(event, object)}
            onTap={(event) => selectObject(event, object)}
          />
          {selectedIds.includes(object.id)
            ? (["start", "end"] as const).map((endpoint, index) => (
                <Circle
                  key={endpoint}
                  x={points[index * 2]}
                  y={points[index * 2 + 1]}
                  radius={8}
                  fill="#8b5cf6"
                  stroke="#ffffff"
                  strokeWidth={2}
                  draggable
                  onDragEnd={(event) =>
                    runCommand("connector.endpoint", {
                      objectId: object.id,
                      endpoint,
                      value: {
                        kind: "free",
                        x: event.target.x(),
                        y: event.target.y(),
                      },
                    })
                  }
                />
              ))
            : null}
        </Group>
      );
    }
    if (object.type === "document" || object.type === "annotation") return null;
    return (
      <Group
        key={object.id}
        id={object.id}
        ref={(node) => {
          if (node) objectNodeRefs.current.set(object.id, node);
          else objectNodeRefs.current.delete(object.id);
        }}
        x={object.geometry.x}
        y={object.geometry.y}
        rotation={object.geometry.rotation}
        draggable={tool === "select"}
        onClick={(event) => selectObject(event, object)}
        onTap={(event) => selectObject(event, object)}
        onDragStart={() => {
          if (!selectedIds.includes(object.id)) {
            setSelectedIds(
              object.groupId
                ? objects
                    .filter((candidate) => candidate.groupId === object.groupId)
                    .map((candidate) => candidate.id)
                : [object.id],
            );
          }
        }}
        onDragEnd={(event) =>
          moveSelectionFromDrag(object, event.target.x(), event.target.y())
        }
        onTransformEnd={(event) => {
          const node = event.target;
          const width = Math.max(
            24,
            object.geometry.width * Math.abs(node.scaleX()),
          );
          const height = Math.max(
            24,
            object.geometry.height * Math.abs(node.scaleY()),
          );
          node.scaleX(1);
          node.scaleY(1);
          runCommand("object.move", {
            objectId: object.id,
            x: node.x(),
            y: node.y(),
          });
          runCommand("object.resize", { objectId: object.id, width, height });
        }}
      >
        {object.type === "shape" ? (
          <>
            {shapeNode(object)}
            <Text
              x={12}
              y={12}
              width={object.geometry.width - 24}
              height={object.geometry.height - 24}
              text={object.text}
              fill="#18181b"
              align="center"
              verticalAlign="middle"
              fontFamily={object.style.fontFamily}
              fontSize={object.style.fontSize}
              listening={false}
            />
          </>
        ) : object.type === "text" ? (
          <>
            <Rect
              width={object.geometry.width}
              height={object.geometry.height}
              fill={object.style.fill ?? "transparent"}
              stroke={object.style.outline}
              strokeWidth={object.style.outlineWidth}
              cornerRadius={6}
            />
            <Text
              x={10}
              y={10}
              width={object.geometry.width - 20}
              height={object.geometry.height - 20}
              text={object.text}
              fill="#18181b"
              fontFamily={object.style.fontFamily}
              fontSize={object.style.fontSize}
              verticalAlign="middle"
              listening={false}
            />
          </>
        ) : (
          renderTable(object)
        )}
        {selectedIds.includes(object.id) && object.type === "shape"
          ? anchors.map((anchor) => {
              const point = anchorPointV2(
                { ...object, geometry: { ...object.geometry, x: 0, y: 0 } },
                anchor,
              );
              return (
                <Circle
                  key={anchor}
                  x={point.x}
                  y={point.y}
                  radius={6}
                  fill="#a78bfa"
                  stroke="#ffffff"
                  strokeWidth={2}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    finishConnector({
                      kind: "attached",
                      objectId: object.id,
                      anchor,
                    });
                  }}
                />
              );
            })
          : null}
      </Group>
    );
  }

  const connectorPreviewPoints =
    connectorStart && pointerPreview
      ? (() => {
          const start = resolveConnectorEndpointV2(connectorStart, objectsById);
          return [start.x, start.y, pointerPreview.x, pointerPreview.y];
        })()
      : null;
  const marqueeRect = marquee
    ? {
        x: Math.min(marquee.start.x, marquee.current.x),
        y: Math.min(marquee.start.y, marquee.current.y),
        width: Math.abs(marquee.current.x - marquee.start.x),
        height: Math.abs(marquee.current.y - marquee.start.y),
      }
    : null;

  return (
    <section
      aria-labelledby="canvas-title"
      className="thinking-workspace relative h-full min-h-[640px] overflow-hidden text-[var(--workspace-foreground)]"
      data-testid="thinking-workspace"
    >
      <div
        className="pointer-events-none absolute inset-x-4 top-4 z-30 flex items-start justify-between gap-4"
        data-testid="workspace-top-chrome"
      >
        <div className="pointer-events-auto flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-chrome)] p-2 shadow-[var(--workspace-shadow)] backdrop-blur-xl">
          <Link
            href="/app"
            aria-label="Back to canvases"
            className={buttonVariants({
              variant: "outline",
              size: "icon",
              className:
                "border-[var(--workspace-border)] bg-white text-zinc-700 hover:bg-violet-50 dark:border-[var(--workspace-border)] dark:bg-white dark:text-zinc-700 dark:hover:bg-violet-50",
            })}
          >
            <ArrowLeft aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1
              id="canvas-title"
              className="max-w-[min(42vw,28rem)] truncate font-semibold text-zinc-900"
            >
              {title}
            </h1>
            <p className="text-xs text-zinc-500">Thinking Canvas workspace</p>
          </div>
        </div>

        <div className="pointer-events-auto flex max-w-[min(58vw,48rem)] flex-wrap items-center justify-end gap-2 rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-chrome)] p-2 shadow-[var(--workspace-shadow)] backdrop-blur-xl">
          <span
            className="inline-flex h-9 items-center gap-2 rounded-xl px-2.5 text-sm text-zinc-600"
            aria-label={`${participants.length} participants present`}
            title={`${participants.length} participants present`}
          >
            <Users aria-hidden="true" className="size-4 text-violet-600" />
            <span data-testid="workspace-participant-count">
              {participants.length}
            </span>
          </span>
          <p
            role="status"
            aria-live="polite"
            title={
              pendingCount
                ? `${pendingCount} local update${pendingCount === 1 ? "" : "s"} waiting for a durable acknowledgment`
                : `Durably synchronized through sequence ${lastSequence}`
            }
            data-testid="canvas-save-status"
            data-pending-count={pendingCount}
            className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium ${
              saveStatus === "Saved"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : saveStatus === "Failed"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {saveStatus === "Saved" ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : (
              <Cloud aria-hidden="true" className="size-3.5" />
            )}
            {saveStatus}
          </p>
          {saveStatus === "Failed" || saveStatus === "Unsynced" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 border-amber-200 bg-white text-amber-800 dark:border-amber-200 dark:bg-white dark:text-amber-800"
              onClick={() => void retry()}
            >
              Retry sync
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Copy canvas link"
            title="Copy canvas link"
            className="border-[var(--workspace-border)] bg-white text-zinc-700 hover:bg-violet-50 dark:border-[var(--workspace-border)] dark:bg-white dark:text-zinc-700 dark:hover:bg-violet-50"
            onClick={() => void copyShareLink()}
          >
            <Share2 aria-hidden="true" />
          </Button>
          <span
            className="hidden max-w-48 truncate px-1 text-xs text-zinc-500 xl:block"
            title={userIdentity}
          >
            {userIdentity}
          </span>
          <form action={signOut}>
            <Button
              type="submit"
              size="icon"
              variant="outline"
              aria-label={`Sign out ${userIdentity}`}
              title="Sign out"
              className="border-[var(--workspace-border)] bg-white text-zinc-700 hover:bg-violet-50 dark:border-[var(--workspace-border)] dark:bg-white dark:text-zinc-700 dark:hover:bg-violet-50"
            >
              <LogOut aria-hidden="true" />
            </Button>
          </form>
        </div>
      </div>

      <p
        role="status"
        aria-live="polite"
        data-testid="share-link-status"
        className="pointer-events-none absolute top-24 right-4 z-30 max-w-sm rounded-xl bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg empty:hidden"
      >
        {shareNotice}
      </p>

      <WorkspacePrimaryDock
        activeTool={tool}
        recentShape={recentShape}
        simulatedAiEnabled={simulatedAiEnabled}
        onChooseTool={chooseTool}
        onChooseShape={chooseShape}
        onAddSimulatedAiIdea={addSimulatedAiIdea}
      />

      <div className="absolute right-4 bottom-4 z-30 flex items-center gap-1 rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-chrome)] p-1.5 text-zinc-700 shadow-[var(--workspace-shadow)] backdrop-blur-xl [&_button]:border-zinc-200 [&_button]:bg-white [&_button]:text-zinc-700 dark:[&_button]:border-zinc-200 dark:[&_button]:bg-white dark:[&_button]:text-zinc-700 [&_button:hover]:bg-violet-50 dark:[&_button:hover]:bg-violet-50">
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
          className="min-w-14 text-center text-xs text-zinc-500"
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
          onClick={() => setViewport(defaultViewport)}
        >
          <Maximize2 aria-hidden="true" />
        </Button>
      </div>

      <div
        className="absolute bottom-20 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-nowrap items-center gap-2 overflow-x-auto rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-chrome)] p-2 text-zinc-700 shadow-[var(--workspace-shadow)] backdrop-blur-xl [&_button]:border-zinc-200 [&_button]:bg-white [&_button]:text-zinc-700 dark:[&_button]:border-zinc-200 dark:[&_button]:bg-white dark:[&_button]:text-zinc-700 [&_button:hover]:bg-violet-50 dark:[&_button:hover]:bg-violet-50"
        role="toolbar"
        aria-label="Selection and history actions"
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={
            selectedIds.length < 2 ||
            selectedObjects.some((object) => object.groupId != null)
          }
          aria-keyshortcuts="Control+G Meta+G"
          onClick={groupSelected}
        >
          Group
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selectedObjects.some((object) => object.groupId != null)}
          aria-keyshortcuts="Control+Shift+G Meta+Shift+G"
          onClick={ungroupSelected}
        >
          Ungroup
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selectedIds.length}
          onClick={() => reorderSelected("front")}
        >
          Bring to front
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selectedIds.length}
          onClick={() => reorderSelected("back")}
        >
          Send to back
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selectedIds.length}
          aria-keyshortcuts="Control+D Meta+D"
          onClick={duplicateSelected}
        >
          Duplicate
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selectedIds.length}
          aria-keyshortcuts="Control+C Meta+C"
          onClick={() => void copySelected()}
        >
          Copy
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selectedIds.length}
          aria-keyshortcuts="Control+X Meta+X"
          onClick={() => void cutSelected()}
        >
          Cut
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-keyshortcuts="Control+V Meta+V"
          onClick={() => void pasteSelected()}
        >
          Paste
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!undoStack.length}
          aria-keyshortcuts="Control+Z Meta+Z"
          onClick={undo}
        >
          Undo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!redoStack.length}
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
          onClick={redo}
        >
          Redo
        </Button>
        <output
          className="ml-auto text-xs text-zinc-500"
          aria-live="polite"
          data-testid="selection-status"
        >
          {selectedIds.length
            ? `${selectedIds.length} selected`
            : historyNotice || "No selection"}
        </output>
      </div>

      <div className="absolute inset-0">
        <div
          ref={containerRef}
          tabIndex={0}
          role="application"
          aria-label={`Canvas: ${title}. Choose a tool, then use the canvas. Arrow keys move a selection or pan; Delete removes a selection.`}
          onKeyDown={onKeyDown}
          onPointerMove={onSurfacePointerMove}
          className="absolute inset-0 overflow-hidden bg-[var(--workspace-canvas)] bg-[radial-gradient(circle,var(--workspace-dot)_1px,transparent_1px)] bg-[length:24px_24px] focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none focus-visible:ring-inset"
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
            onMouseDown={onStagePointerDown}
            onTouchStart={onStagePointerDown}
            onMouseMove={onStagePointerMove}
            onTouchMove={onStagePointerMove}
            onMouseUp={finishMarquee}
            onTouchEnd={finishMarquee}
            onDragEnd={(event) => {
              if (event.target !== stageRef.current) return;
              setViewport((current) => ({
                ...current,
                x: event.target.x(),
                y: event.target.y(),
              }));
            }}
          >
            <Layer>
              {objects.map(renderObject)}
              {remoteCursors.map((cursor) => (
                <Group
                  key={cursor.userId}
                  x={cursor.x}
                  y={cursor.y}
                  listening={false}
                >
                  <Circle radius={5} fill="#a78bfa" />
                  <Text
                    x={9}
                    y={-7}
                    text="Collaborator"
                    fontSize={12}
                    fill="#ddd6fe"
                  />
                </Group>
              ))}
              {connectorPreviewPoints ? (
                <Line
                  points={connectorPreviewPoints}
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dash={[8, 6]}
                  listening={false}
                />
              ) : null}
              {marqueeRect ? (
                <Rect
                  {...marqueeRect}
                  fill="rgba(139, 92, 246, 0.12)"
                  stroke="#a78bfa"
                  strokeWidth={1}
                  dash={[6, 4]}
                  listening={false}
                />
              ) : null}
              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                boundBoxFunc={(oldBox, newBox) =>
                  newBox.width < 24 || newBox.height < 24 ? oldBox : newBox
                }
              />
            </Layer>
          </Stage>
          {objects.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
              <div className="max-w-sm rounded-2xl border border-[var(--workspace-border)] bg-white/90 px-6 py-5 text-zinc-900 shadow-xl backdrop-blur">
                <p className="font-medium">An empty canvas</p>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Choose shape, text, connector, or table, then click the
                  canvas.
                </p>
              </div>
            </div>
          ) : null}
          {instrumentationEnabled ? (
            <dl className="pointer-events-none absolute top-24 left-4 grid grid-cols-2 gap-x-4 rounded-lg border border-zinc-200 bg-white/90 px-3 py-2 text-xs text-zinc-700 shadow-lg backdrop-blur">
              <div>
                <dt className="text-zinc-400">Objects</dt>
                <dd data-testid="product-object-count">{objects.length}</dd>
              </div>
              <div>
                <dt className="text-zinc-400">Frame</dt>
                <dd data-testid="product-frame-time">
                  {frameTime === null ? "—" : `${frameTime} ms`}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Pending</dt>
                <dd data-testid="product-pending-count">{pendingCount}</dd>
              </div>
              <div>
                <dt className="text-zinc-400">Present</dt>
                <dd data-testid="product-participant-count">
                  {participants.length}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Cursors</dt>
                <dd data-testid="product-remote-cursor-count">
                  {remoteCursors.length}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Cursor sends</dt>
                <dd data-testid="product-cursor-publish-count">
                  {publishedCursorCount}/{attemptedCursorCount} ·{" "}
                  {cursorPublishStatus}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>

        <aside
          aria-label="Canvas inspector"
          className="absolute top-28 right-4 bottom-24 z-20 w-72 overflow-y-auto rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-chrome)] p-4 text-zinc-900 shadow-[var(--workspace-shadow)] backdrop-blur-xl [&_button]:border-zinc-200 [&_button]:bg-white [&_button]:text-zinc-700 dark:[&_button]:border-zinc-200 dark:[&_button]:bg-white dark:[&_button]:text-zinc-700 [&_button:hover]:bg-violet-50 dark:[&_button:hover]:bg-violet-50"
        >
          <h2 className="font-medium">Objects</h2>
          {objects.length ? (
            <ul className="mt-3 space-y-2">
              {objects.map((object) => (
                <li key={object.id}>
                  <button
                    type="button"
                    data-testid={`object-list-item-${object.id}`}
                    aria-pressed={selectedIds.includes(object.id)}
                    onClick={(event) => {
                      updateSelectionForObject(
                        object,
                        event.shiftKey || event.metaKey || event.ctrlKey,
                      );
                      setTool("select");
                    }}
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700 hover:border-violet-500 aria-pressed:border-violet-500 aria-pressed:bg-violet-50"
                  >
                    {objectLabel(object)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No objects yet.</p>
          )}

          {selectedObject ? (
            <div
              className="mt-5 space-y-4 border-t border-zinc-200 pt-4"
              data-testid="canvas-inspector-selection"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium capitalize">
                  {selectedIds.length > 1
                    ? `Mixed selection · ${selectedObject.type} focused`
                    : selectedObject.type}
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={deleteSelected}
                >
                  Delete
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
                <div>
                  <dt>X</dt>
                  <dd data-testid="selected-position-x">
                    {Math.round(selectedObject.geometry.x)}
                  </dd>
                </div>
                <div>
                  <dt>Y</dt>
                  <dd data-testid="selected-position-y">
                    {Math.round(selectedObject.geometry.y)}
                  </dd>
                </div>
                <div>
                  <dt>Width</dt>
                  <dd data-testid="selected-width">
                    {Math.round(selectedObject.geometry.width)}
                  </dd>
                </div>
                <div>
                  <dt>Height</dt>
                  <dd data-testid="selected-height">
                    {Math.round(selectedObject.geometry.height)}
                  </dd>
                </div>
              </dl>
              {selectedObject.type === "shape" ||
              selectedObject.type === "text" ? (
                <label className="block text-xs text-zinc-600">
                  Content
                  <textarea
                    aria-label="Object content"
                    value={selectedObject.text}
                    onChange={(event) =>
                      runCommand("object.patch", {
                        objectId: selectedObject.id,
                        objectType: selectedObject.type,
                        text: event.target.value,
                      })
                    }
                    className="mt-1 min-h-20 w-full rounded-md border border-zinc-200 bg-white p-2 text-sm text-zinc-900"
                  />
                </label>
              ) : null}
              {selectedObject.type === "table" ? (
                <label className="block text-xs text-zinc-600">
                  Cells
                  <textarea
                    aria-label="Table cells"
                    value={tableText(selectedObject)}
                    onChange={(event) =>
                      runCommand("object.patch", {
                        objectId: selectedObject.id,
                        objectType: "table",
                        cells: event.target.value
                          .split("\n")
                          .map((row) => row.split("\t")),
                      })
                    }
                    className="mt-1 min-h-24 w-full rounded-md border border-zinc-200 bg-white p-2 font-mono text-sm text-zinc-900"
                  />
                </label>
              ) : null}
              {selectedObject.type !== "connector" ? (
                <label className="flex items-center justify-between gap-3 text-xs text-zinc-600">
                  Fill
                  <input
                    aria-label="Fill color"
                    type="color"
                    value={selectedObject.style.fill ?? "#ffffff"}
                    onChange={(event) =>
                      runCommand("object.style", {
                        objectId: selectedObject.id,
                        style: { fill: event.target.value },
                      })
                    }
                  />
                </label>
              ) : null}
              <label className="flex items-center justify-between gap-3 text-xs text-zinc-600">
                Outline
                <input
                  aria-label="Outline color"
                  type="color"
                  value={selectedObject.style.outline}
                  onChange={(event) =>
                    runCommand("object.style", {
                      objectId: selectedObject.id,
                      style: { outline: event.target.value },
                    })
                  }
                />
              </label>
              {selectedObject.type !== "connector" ? (
                <>
                  <label className="block text-xs text-zinc-600">
                    Typeface
                    <select
                      aria-label="Typeface"
                      value={selectedObject.style.fontFamily}
                      onChange={(event) =>
                        runCommand("object.style", {
                          objectId: selectedObject.id,
                          style: { fontFamily: event.target.value },
                        })
                      }
                      className="mt-1 w-full rounded-md border border-zinc-200 bg-white p-2 text-sm text-zinc-900"
                    >
                      <option value="Inter, ui-sans-serif, system-ui, sans-serif">
                        Inter
                      </option>
                      <option value="Georgia, ui-serif, serif">Georgia</option>
                      <option value="ui-monospace, SFMono-Regular, monospace">
                        Monospace
                      </option>
                    </select>
                  </label>
                  <label className="block text-xs text-zinc-600">
                    Text size
                    <input
                      aria-label="Text size"
                      type="number"
                      min={8}
                      max={400}
                      value={selectedObject.style.fontSize}
                      onChange={(event) =>
                        runCommand("object.style", {
                          objectId: selectedObject.id,
                          style: { fontSize: Number(event.target.value) },
                        })
                      }
                      className="mt-1 w-full rounded-md border border-zinc-200 bg-white p-2 text-sm text-zinc-900"
                    />
                  </label>
                </>
              ) : null}
              {selectedObject.type === "shape" ? (
                <fieldset>
                  <legend className="text-xs text-zinc-600">
                    Connector anchors
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {anchors.map((anchor) => (
                      <Button
                        key={anchor}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          finishConnector({
                            kind: "attached",
                            objectId: selectedObject.id,
                            anchor,
                          })
                        }
                      >
                        {connectorStart
                          ? `Attach ${anchor}`
                          : `Start ${anchor}`}
                      </Button>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {selectedObject.type === "connector" ? (
                <div className="space-y-2">
                  <output
                    data-testid="selected-connector-points"
                    className="block text-xs text-zinc-600"
                  >
                    {resolveConnectorPointsV2(selectedObject, objectsById)
                      .map((value) => Math.round(value))
                      .join(",")}
                  </output>
                  {(["start", "end"] as const).map((endpoint) =>
                    selectedObject[endpoint].kind === "attached" ? (
                      <Button
                        key={endpoint}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const point = resolveConnectorEndpointV2(
                            selectedObject[endpoint],
                            objectsById,
                          );
                          runCommand("connector.endpoint", {
                            objectId: selectedObject.id,
                            endpoint,
                            value: { kind: "free", ...point },
                          });
                        }}
                      >
                        Detach {endpoint}
                      </Button>
                    ) : null,
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
