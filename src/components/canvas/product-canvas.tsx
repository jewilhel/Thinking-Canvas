"use client";

import type Konva from "konva";
import {
  ArrowLeft,
  Check,
  CircleHelp,
  Cloud,
  Copy,
  Ellipsis,
  ExternalLink,
  Link2,
  ListChecks,
  ListTree,
  LogOut,
  Maximize2,
  Minus,
  Plus,
  Share2,
  AlignJustify,
  Trash2,
  Type,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  canvasGridMetrics,
  canvasWheelIntent,
  connectionHandlePointV2,
  maxCanvasScale,
  minCanvasScale,
  pointWithinObjectHoverZone,
  previewGeometryDuringTransform,
  proportionalTextLayoutDuringResize,
  resolveConnectorEndpointV2,
  resolveConnectorPointsV2,
  selectionAffordanceScale,
  zoomViewportAtPointer,
  zoomViewportAtPointerContinuously,
  type CanvasAnchor,
  type Point,
  type Viewport,
} from "@/canvas/geometry";
import { useCanvasRecovery } from "@/collaboration/use-canvas-recovery";
import {
  ColorStylePanel,
  type ColorPair,
} from "@/components/canvas/color-style-panel";
import { ObjectContextMenu } from "@/components/canvas/object-context-menu";
import {
  TextStylePanel,
  type TextStylePatch,
} from "@/components/canvas/text-style-panel";
import {
  WorkspacePrimaryDock,
  type CanvasShapeTool,
  type CanvasTool,
} from "@/components/canvas/workspace-primary-dock";
import { WorkspacePanel } from "@/components/canvas/workspace-panel";
import { CanvasAiReviews } from "@/components/ai/canvas-ai-reviews";
import { CanvasComments } from "@/components/comments/canvas-comments";
import { Button, buttonVariants } from "@/components/ui/button";
import type { CanvasRole } from "@/domain/command";

type Props = {
  canvasId: string;
  title: string;
  userId: string;
  userIdentity: string;
  canvasRole: CanvasRole;
  supabaseUrl: string;
  supabasePublishableKey: string;
  simulatedAiEnabled: boolean;
};
type ConnectorEndpoint = Extract<
  CanvasObjectV2,
  { type: "connector" }
>["start"];
type Marquee = { start: Point; current: Point; additive: boolean };
type CommandDefinition = { type: string; payload: unknown };
type InlineTextEditor = {
  objectId: string;
  objectType: "shape" | "text";
  draft: string;
  initialValue: string;
  listStyle: "none" | "bullet" | "numbered";
  initialListStyle: "none" | "bullet" | "numbered";
};
type ContextPanel =
  "fill" | "outline" | "text" | "table" | "connector" | "more";
type SharedPanel = "objects" | "comments" | "review" | "help";
type ObjectContextMenuPosition = { x: number; y: number; maxHeight: number };

const defaultViewport: Viewport = { x: 80, y: 80, scale: 1 };
const anchors: CanvasAnchor[] = ["top", "right", "bottom", "left"];
const connectionAnchorOffsetPx = 28;
const connectionAnchorRadiusPx = 7;
const connectionAnchorHitWidthPx = 28;
const connectionAnchorHoverDistancePx = 44;
const selectionHandleSizePx = 14;
const selectionHandleStrokeWidthPx = 3;

function formatListText(
  text: string,
  listStyle: "none" | "bullet" | "numbered" | undefined,
) {
  if (!text || !listStyle || listStyle === "none") return text;
  return text
    .split("\n")
    .map((line, index) =>
      listStyle === "bullet" ? `• ${line}` : `${index + 1}. ${line}`,
    )
    .join("\n");
}

function stripListMarkers(
  text: string,
  listStyle: "none" | "bullet" | "numbered",
) {
  if (listStyle === "none") return text;
  return text
    .split("\n")
    .map((line) =>
      listStyle === "bullet"
        ? line.replace(/^\s*(?:•|[-*])\s+/, "")
        : line.replace(/^\s*\d+[.)]\s+/, ""),
    )
    .join("\n");
}

function openSafeTextLink(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
  window.open(parsed.href, "_blank", "noopener,noreferrer");
}

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
    fill: type === "connector" || type === "text" ? null : "#ffffff",
    outline: "#475569",
    outlineWidth: type === "text" ? 0 : 2,
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: 16,
    fontWeight: "normal" as const,
    textAlign: type === "shape" ? ("center" as const) : ("left" as const),
    listStyle: "none" as const,
    linkUrl: null,
    textColor: "#18181b",
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
  canvasRole,
  supabaseUrl,
  supabasePublishableKey,
  simulatedAiEnabled,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const wheelGestureRef = useRef<{
    intent: "pan" | "zoom";
    lastEventAt: number;
  } | null>(null);
  const inlineEditorRef = useRef<HTMLTextAreaElement>(null);
  const contextPanelTriggerRef = useRef<HTMLButtonElement | null>(null);
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
  const [inlineTextEditor, setInlineTextEditor] =
    useState<InlineTextEditor | null>(null);
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  const [contextPanel, setContextPanel] = useState<ContextPanel | null>(null);
  const [objectContextMenu, setObjectContextMenu] =
    useState<ObjectContextMenuPosition | null>(null);
  const [sharedPanel, setSharedPanel] = useState<SharedPanel | null>(null);
  const [sharedPanelInvoker, setSharedPanelInvoker] =
    useState<HTMLButtonElement | null>(null);
  const [reviewGuidancePaused, setReviewGuidancePaused] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [dragPreviewPositions, setDragPreviewPositions] = useState<
    Record<string, Point>
  >({});
  const [resizePreviewGeometries, setResizePreviewGeometries] = useState<
    Record<string, CanvasObjectV2["geometry"]>
  >({});
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
  const selectionAffordanceFactor = selectionAffordanceScale(viewport.scale);
  const selectionAffordancesVisible = selectionAffordanceFactor > 0;
  const selectionAffordanceWorldSize = (screenSize: number) =>
    (screenSize * selectionAffordanceFactor) / viewport.scale;
  const canvasGrid = canvasGridMetrics(viewport);
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
    supabasePublishableKey,
    supabaseUrl,
    userId,
  });
  const instrumentationEnabled = process.env.NODE_ENV !== "production";
  const objectsById = useMemo(
    () => new Map(objects.map((object) => [object.id, object])),
    [objects],
  );
  const displayObjects = useMemo(
    () =>
      objects.map((object) => {
        const preview = dragPreviewPositions[object.id];
        return preview && object.type !== "connector"
          ? {
              ...object,
              geometry: {
                ...object.geometry,
                x: preview.x,
                y: preview.y,
              },
            }
          : object;
      }),
    [dragPreviewPositions, objects],
  );
  const connectorLayoutObjectsById = useMemo(
    () =>
      new Map(
        displayObjects.map((object) => {
          const preview = resizePreviewGeometries[object.id];
          return [
            object.id,
            preview && object.type !== "connector"
              ? { ...object, geometry: preview }
              : object,
          ] as const;
        }),
      ),
    [displayObjects, resizePreviewGeometries],
  );
  const selectedId = selectedIds.at(-1) ?? null;
  const inlineEditorObjectId = inlineTextEditor?.objectId ?? null;
  const selectedObjects = selectedIds.flatMap((id) => {
    const object = objectsById.get(id);
    return object ? [object] : [];
  });
  const selectedObject = selectedId ? objectsById.get(selectedId) : undefined;
  const selectedBounds = selectedObjects.length
    ? selectedObjects.reduce(
        (bounds, object) => {
          const next = objectBounds(object);
          return {
            x: Math.min(bounds.x, next.x),
            y: Math.min(bounds.y, next.y),
            right: Math.max(bounds.right, next.x + next.width),
            bottom: Math.max(bounds.bottom, next.y + next.height),
          };
        },
        (() => {
          const first = objectBounds(selectedObjects[0]!);
          return {
            x: first.x,
            y: first.y,
            right: first.x + first.width,
            bottom: first.y + first.height,
          };
        })(),
      )
    : null;
  const contextualToolbarPosition = selectedBounds
    ? {
        left: Math.min(
          Math.max(
            viewport.x +
              ((selectedBounds.x + selectedBounds.right) / 2) * viewport.scale,
            190,
          ),
          Math.max(190, size.width - 190),
        ),
        top: Math.max(112, viewport.y + selectedBounds.y * viewport.scale - 66),
      }
    : null;
  const fillObjects = selectedObjects.filter(
    (object) => object.type === "shape" || object.type === "table",
  );
  const outlineObjects = selectedObjects.filter(
    (object) =>
      object.type !== "text" &&
      object.type !== "document" &&
      object.type !== "annotation",
  );
  const textStyleObjects = selectedObjects.filter(
    (object) =>
      object.type === "shape" ||
      object.type === "text" ||
      object.type === "table",
  );

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
      node &&
        selectionAffordancesVisible &&
        selectedObject?.type !== "connector" &&
        inlineTextEditor?.objectId !== selectedId
        ? [node]
        : [],
    );
    transformer.getLayer()?.batchDraw();
  }, [
    inlineTextEditor?.objectId,
    selectedId,
    selectedObject,
    selectionAffordancesVisible,
  ]);

  useEffect(() => {
    if (!inlineEditorObjectId) return;
    const editor = inlineEditorRef.current;
    if (!editor) return;
    editor.focus();
    editor.select();
  }, [inlineEditorObjectId]);

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
    setContextPanel(null);
    setObjectContextMenu(null);
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

  function startInlineEditing(
    object: Extract<CanvasObjectV2, { type: "shape" | "text" }>,
  ) {
    setSelectedIds([object.id]);
    setTool("select");
    const listStyle = object.style.listStyle ?? "none";
    const editableText = formatListText(object.text, listStyle);
    setInlineTextEditor({
      objectId: object.id,
      objectType: object.type,
      draft: editableText,
      initialValue: editableText,
      listStyle,
      initialListStyle: listStyle,
    });
  }

  function finishInlineEditing(commit: boolean) {
    if (!inlineTextEditor) return;
    if (commit) {
      const text = stripListMarkers(
        inlineTextEditor.draft,
        inlineTextEditor.listStyle,
      );
      const initialText = stripListMarkers(
        inlineTextEditor.initialValue,
        inlineTextEditor.initialListStyle,
      );
      const commands: CommandDefinition[] = [];
      if (text !== initialText) {
        commands.push({
          type: "object.patch",
          payload: {
            objectId: inlineTextEditor.objectId,
            objectType: inlineTextEditor.objectType,
            text,
          },
        });
      }
      if (inlineTextEditor.listStyle !== inlineTextEditor.initialListStyle) {
        commands.push({
          type: "object.style",
          payload: {
            objectId: inlineTextEditor.objectId,
            style: { listStyle: inlineTextEditor.listStyle },
          },
        });
      }
      if (commands.length) runCommandBatch(commands);
    }
    setInlineTextEditor(null);
    requestAnimationFrame(() => containerRef.current?.focus());
  }

  function toggleContextPanel(panel: ContextPanel, trigger: HTMLButtonElement) {
    contextPanelTriggerRef.current = trigger;
    setObjectContextMenu(null);
    setContextPanel((current) => (current === panel ? null : panel));
  }

  function closeContextPanel(restoreFocus = true) {
    setContextPanel(null);
    if (restoreFocus) {
      requestAnimationFrame(() => contextPanelTriggerRef.current?.focus());
    }
  }

  function completeContextAction(action: () => void) {
    action();
    closeContextPanel(false);
  }

  function applyStyleToObjects(
    targets: CanvasObjectV2[],
    style: TextStylePatch & {
      fill?: string | null;
      outline?: string;
    },
  ) {
    if (!targets.length) return;
    runCommandBatch(
      targets.map((object) => ({
        type: "object.style",
        payload: { objectId: object.id, style },
      })),
    );
  }

  function applyColorPair(targets: CanvasObjectV2[], pair: ColorPair) {
    applyStyleToObjects(targets, {
      fill: pair.fill,
      outline: pair.outline,
    });
  }

  function commonStyleValue<K extends keyof CanvasObjectV2["style"]>(
    targets: CanvasObjectV2[],
    field: K,
  ) {
    const values = targets.map((object) => object.style[field]);
    const first = values[0];
    return values.every((value) => value === first) ? first : undefined;
  }

  function connectionHandlePoint(object: CanvasObjectV2, anchor: CanvasAnchor) {
    return connectionHandlePointV2(
      object,
      anchor,
      selectionAffordanceWorldSize(connectionAnchorOffsetPx),
    );
  }

  function connectorEndpointHandlePoint(
    endpoint: ConnectorEndpoint,
    fallback: Point,
  ) {
    if (endpoint.kind === "attached") {
      const target = connectorLayoutObjectsById.get(endpoint.objectId);
      if (target?.type === "shape")
        return connectionHandlePoint(target, endpoint.anchor);
    }
    return fallback;
  }

  function nearestExteriorAnchor(object: CanvasObjectV2, point: Point) {
    return anchors.reduce((nearest, anchor) => {
      const candidate = connectionHandlePoint(object, anchor);
      const nearestPoint = connectionHandlePoint(object, nearest);
      return Math.hypot(candidate.x - point.x, candidate.y - point.y) <
        Math.hypot(nearestPoint.x - point.x, nearestPoint.y - point.y)
        ? anchor
        : nearest;
    }, anchors[0]!);
  }

  function endpointAtDrop(point: Point, excludedObjectId?: string) {
    const snapDistance = 24 / viewport.scale;
    let nearest: { endpoint: ConnectorEndpoint; distance: number } | undefined;
    for (const object of objects) {
      if (object.type !== "shape" || object.id === excludedObjectId) continue;
      for (const anchor of anchors) {
        const handle = connectionHandlePoint(object, anchor);
        const distance = Math.hypot(handle.x - point.x, handle.y - point.y);
        if (
          distance <= snapDistance &&
          (!nearest || distance < nearest.distance)
        ) {
          nearest = {
            endpoint: { kind: "attached", objectId: object.id, anchor },
            distance,
          };
        }
      }
    }
    return nearest?.endpoint ?? { kind: "free", ...point };
  }

  function beginConnectorDrag(
    event: Konva.KonvaEventObject<DragEvent>,
    object: Extract<CanvasObjectV2, { type: "shape" }>,
    anchor: CanvasAnchor,
  ) {
    event.cancelBubble = true;
    setSelectedIds([object.id]);
    setTool("connector");
    setConnectorStart({ kind: "attached", objectId: object.id, anchor });
    const point = eventWorldPointer(event);
    if (point) setPointerPreview(point);
  }

  function finishConnectorDrag(
    event: Konva.KonvaEventObject<DragEvent>,
    sourceObjectId: string,
  ) {
    event.cancelBubble = true;
    const point = eventWorldPointer(event);
    if (point) finishConnector(endpointAtDrop(point, sourceObjectId));
  }

  function finishEndpointDrag(
    event: Konva.KonvaEventObject<DragEvent>,
    connectorId: string,
    endpoint: "start" | "end",
  ) {
    event.cancelBubble = true;
    const point = eventWorldPointer(event);
    if (!point) return;
    runCommand("connector.endpoint", {
      objectId: connectorId,
      endpoint,
      value: endpointAtDrop(point),
    });
  }

  function worldPointer() {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - viewport.x) / viewport.scale,
      y: (pointer.y - viewport.y) / viewport.scale,
    };
  }

  function eventWorldPointer(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent | DragEvent>,
  ) {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return null;
    return {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    };
  }

  function selectObject(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
    object: CanvasObjectV2,
  ) {
    event.cancelBubble = true;
    if (event.evt instanceof MouseEvent && event.evt.ctrlKey) {
      openObjectContextMenu(event, object);
      return;
    }
    if (tool === "connector" && object.type !== "connector") {
      const point = eventWorldPointer(event);
      finishConnector({
        kind: "attached",
        objectId: object.id,
        anchor: point ? nearestExteriorAnchor(object, point) : "right",
      });
      return;
    }
    if (tool === "select") {
      const modifier = event.evt.shiftKey || event.evt.metaKey;
      updateSelectionForObject(object, modifier);
    }
  }

  function showObjectContextMenu(x: number, y: number) {
    const menuWidth = 288;
    const preferredHeight = 520;
    const safeX = Number.isFinite(x) ? x : size.width / 2;
    const safeY = Number.isFinite(y) ? y : size.height / 2;
    const left = Math.min(
      Math.max(8, safeX),
      Math.max(8, size.width - menuWidth - 8),
    );
    const top = Math.min(
      Math.max(8, safeY),
      Math.max(8, size.height - preferredHeight - 16),
    );
    setContextPanel(null);
    setObjectContextMenu({
      x: left,
      y: top,
      maxHeight: Math.max(220, size.height - top - 16),
    });
  }

  function openObjectContextMenu(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
    object: CanvasObjectV2,
  ) {
    event.cancelBubble = true;
    event.evt.preventDefault();
    if (!(event.evt instanceof MouseEvent)) return;
    openObjectContextMenuFromPointer(
      object,
      event.evt.clientX,
      event.evt.clientY,
    );
  }

  function openObjectContextMenuFromPointer(
    object: CanvasObjectV2,
    clientX: number,
    clientY: number,
  ) {
    if (!selectedIds.includes(object.id))
      updateSelectionForObject(object, false);
    setTool("select");
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    showObjectContextMenu(clientX - bounds.left, clientY - bounds.top);
  }

  function objectAtClientPoint(clientX: number, clientY: number) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return undefined;
    const point = {
      x: (clientX - bounds.left - viewport.x) / viewport.scale,
      y: (clientY - bounds.top - viewport.y) / viewport.scale,
    };
    return [...objects].reverse().find((candidate) => {
      const objectBox = objectBounds(candidate);
      const padding = candidate.type === "connector" ? 12 : 0;
      return (
        point.x >= objectBox.x - padding &&
        point.x <= objectBox.x + objectBox.width + padding &&
        point.y >= objectBox.y - padding &&
        point.y <= objectBox.y + objectBox.height + padding
      );
    });
  }

  function updateSelectionForObject(object: CanvasObjectV2, modifier: boolean) {
    setContextPanel(null);
    setObjectContextMenu(null);
    if (object.type === "connector") setHoveredShapeId(null);
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

  function previewSelectionFromDrag(
    object: CanvasObjectV2,
    x: number,
    y: number,
  ) {
    const durableObject = objectsById.get(object.id) ?? object;
    const dx = x - durableObject.geometry.x;
    const dy = y - durableObject.geometry.y;
    const targets = selectedIds.includes(object.id)
      ? selectedObjects
      : object.groupId
        ? objects.filter((candidate) => candidate.groupId === object.groupId)
        : [durableObject];
    setDragPreviewPositions(
      Object.fromEntries(
        targets.flatMap((target) =>
          target.type === "connector"
            ? []
            : [
                [
                  target.id,
                  {
                    x: target.geometry.x + dx,
                    y: target.geometry.y + dy,
                  },
                ],
              ],
        ),
      ),
    );
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
    setContextPanel(null);
    setObjectContextMenu(null);
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

  function zoomToFit() {
    if (!objects.length) {
      setViewport(defaultViewport);
      return;
    }
    const bounds = objects.reduce(
      (current, object) => {
        const next = objectBounds(object);
        return {
          x: Math.min(current.x, next.x),
          y: Math.min(current.y, next.y),
          right: Math.max(current.right, next.x + next.width),
          bottom: Math.max(current.bottom, next.y + next.height),
        };
      },
      (() => {
        const first = objectBounds(objects[0]!);
        return {
          x: first.x,
          y: first.y,
          right: first.x + first.width,
          bottom: first.y + first.height,
        };
      })(),
    );
    const contentWidth = Math.max(1, bounds.right - bounds.x);
    const contentHeight = Math.max(1, bounds.bottom - bounds.y);
    const availableWidth = Math.max(160, size.width - 160);
    const availableHeight = Math.max(160, size.height - 240);
    const scale = Math.min(
      maxCanvasScale,
      Math.max(
        minCanvasScale,
        Math.min(
          availableWidth / contentWidth,
          availableHeight / contentHeight,
        ),
      ),
    );
    setViewport({
      scale,
      x: (size.width - contentWidth * scale) / 2 - bounds.x * scale,
      y: (size.height - contentHeight * scale) / 2 - bounds.y * scale,
    });
  }

  function focusReviewObject(objectId: string) {
    const object = objectsById.get(objectId);
    if (!object) return false;
    const bounds = objectBounds(object);
    const scale = Math.min(1.5, Math.max(0.75, viewport.scale));
    setSelectedIds([objectId]);
    setTool("select");
    setReviewGuidancePaused(false);
    setViewport({
      scale,
      x: size.width / 2 - (bounds.x + bounds.width / 2) * scale,
      y: size.height / 2 - (bounds.y + bounds.height / 2) * scale,
    });
    return true;
  }

  function toggleSharedPanel(panel: SharedPanel, invoker: HTMLButtonElement) {
    if (sharedPanel === panel) {
      setSharedPanel(null);
      return;
    }
    setSharedPanelInvoker(invoker);
    setContextPanel(null);
    if (panel === "review") setReviewGuidancePaused(false);
    setSharedPanel(panel);
  }

  function onWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    if (sharedPanel === "review") setReviewGuidancePaused(true);
    const now = performance.now();
    const previousGesture = wheelGestureRef.current;
    const inferredIntent = canvasWheelIntent(event.evt);
    const intent = event.evt.ctrlKey
      ? "zoom"
      : previousGesture && now - previousGesture.lastEventAt < 160
        ? previousGesture.intent
        : inferredIntent;
    wheelGestureRef.current = { intent, lastEventAt: now };
    if ((tool === "select" || tool === "pan") && intent === "pan") {
      setViewport((current) => ({
        ...current,
        x: current.x - event.evt.deltaX,
        y: current.y - event.evt.deltaY,
      }));
      return;
    }
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    setViewport((current) =>
      event.evt.ctrlKey
        ? zoomViewportAtPointerContinuously(current, pointer, event.evt.deltaY)
        : zoomViewportAtPointer(current, pointer, event.evt.deltaY),
    );
  }

  function onStagePointerDown(
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) {
    if (sharedPanel === "review") setReviewGuidancePaused(true);
    if (event.target !== stageRef.current) return;
    setContextPanel(null);
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
    if (point) {
      setHoveredShapeId((current) => {
        if (!current) return null;
        const hovered = objectsById.get(current);
        return hovered &&
          hovered.type === "shape" &&
          pointWithinObjectHoverZone(
            hovered,
            point,
            connectionAnchorHoverDistancePx / viewport.scale,
          )
          ? current
          : null;
      });
    }
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
    if (
      selectedObjects.length &&
      ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu")
    ) {
      event.preventDefault();
      const keyboardX = contextualToolbarPosition?.left ?? size.width / 2;
      const keyboardY = contextualToolbarPosition
        ? contextualToolbarPosition.top + 48
        : size.height / 2;
      showObjectContextMenu(keyboardX, keyboardY);
      return;
    }
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

  function updateLiveResizeTextLayout(
    node: Konva.Node,
    object: CanvasObjectV2,
    width: number,
    height: number,
    scaleX: number,
    scaleY: number,
  ) {
    const textNodes = (node as Konva.Group).find<Konva.Text>(
      ".resizable-object-text",
    );
    const frames =
      object.type === "shape"
        ? [{ x: 12, y: 12, width: width - 24, height: height - 24 }]
        : object.type === "text"
          ? [{ x: 0, y: 0, width, height }]
          : object.type === "table"
            ? (() => {
                const rows = object.cells.length;
                const columns = Math.max(
                  ...object.cells.map((row) => row.length),
                  1,
                );
                const rowHeight = height / rows;
                const columnWidth = width / columns;
                return object.cells.flatMap((row, rowIndex) =>
                  row.map((_, columnIndex) => ({
                    x: columnIndex * columnWidth + 8,
                    y: rowIndex * rowHeight + 8,
                    width: columnWidth - 16,
                    height: rowHeight - 16,
                  })),
                );
              })()
            : [];

    textNodes.forEach((textNode, index) => {
      const frame = frames[index];
      if (!frame) return;
      textNode.setAttrs(
        proportionalTextLayoutDuringResize(frame, scaleX, scaleY),
      );
    });
    node.getLayer()?.batchDraw();
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
              name="resizable-object-text"
              x={columnIndex * columnWidth + 8}
              y={rowIndex * rowHeight + 8}
              width={columnWidth - 16}
              height={rowHeight - 16}
              text={cell}
              fill={object.style.textColor ?? "#18181b"}
              fontFamily={object.style.fontFamily}
              fontSize={object.style.fontSize}
              fontStyle={object.style.fontWeight === "bold" ? "bold" : "normal"}
              align={object.style.textAlign ?? "left"}
              verticalAlign="middle"
            />
          )),
        )}
      </>
    );
  }

  function renderObject(object: CanvasObjectV2) {
    if (object.type === "connector") {
      const points = resolveConnectorPointsV2(
        object,
        connectorLayoutObjectsById,
      );
      const endpointHandles = ([object.start, object.end] as const).map(
        (endpoint, index) =>
          connectorEndpointHandlePoint(endpoint, {
            x: points[index * 2]!,
            y: points[index * 2 + 1]!,
          }),
      );
      return (
        <Group key={object.id} id={object.id}>
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
            onContextMenu={(event) => openObjectContextMenu(event, object)}
          />
          {selectionAffordancesVisible && selectedIds.includes(object.id)
            ? (["start", "end"] as const).map((endpoint, index) => (
                <Circle
                  key={endpoint}
                  x={endpointHandles[index]!.x}
                  y={endpointHandles[index]!.y}
                  radius={selectionAffordanceWorldSize(8)}
                  fill="#8b5cf6"
                  stroke="#ffffff"
                  strokeWidth={selectionAffordanceWorldSize(2)}
                  hitStrokeWidth={
                    Math.max(18, 24 * selectionAffordanceFactor) /
                    viewport.scale
                  }
                  draggable
                  onDragStart={(event) => {
                    event.cancelBubble = true;
                  }}
                  onDragEnd={(event) =>
                    finishEndpointDrag(event, object.id, endpoint)
                  }
                />
              ))
            : null}
        </Group>
      );
    }
    if (object.type === "document" || object.type === "annotation") return null;
    return (
      <Fragment key={object.id}>
        <Group
          id={object.id}
          ref={(node) => {
            if (node) objectNodeRefs.current.set(object.id, node);
            else objectNodeRefs.current.delete(object.id);
          }}
          x={object.geometry.x}
          y={object.geometry.y}
          rotation={object.geometry.rotation}
          draggable={
            tool === "select" && inlineTextEditor?.objectId !== object.id
          }
          onClick={(event) => selectObject(event, object)}
          onTap={(event) => selectObject(event, object)}
          onContextMenu={(event) => openObjectContextMenu(event, object)}
          onDblClick={(event) => {
            event.cancelBubble = true;
            if (object.type === "shape" || object.type === "text") {
              startInlineEditing(object);
            }
          }}
          onDblTap={(event) => {
            event.cancelBubble = true;
            if (object.type === "shape" || object.type === "text") {
              startInlineEditing(object);
            }
          }}
          onMouseEnter={() => {
            if (object.type === "shape") setHoveredShapeId(object.id);
          }}
          onMouseLeave={() => {
            // The stage-level proximity zone keeps anchors visible while the
            // pointer crosses the intentional gap between the object and handle.
          }}
          onDragStart={() => {
            if (!selectedIds.includes(object.id)) {
              setSelectedIds(
                object.groupId
                  ? objects
                      .filter(
                        (candidate) => candidate.groupId === object.groupId,
                      )
                      .map((candidate) => candidate.id)
                  : [object.id],
              );
            }
          }}
          onDragMove={(event) =>
            previewSelectionFromDrag(
              objectsById.get(object.id) ?? object,
              event.target.x(),
              event.target.y(),
            )
          }
          onDragEnd={(event) => {
            const durableObject = objectsById.get(object.id) ?? object;
            setDragPreviewPositions({});
            moveSelectionFromDrag(
              durableObject,
              event.target.x(),
              event.target.y(),
            );
          }}
          onTransformEnd={(event) => {
            const node = event.target;
            const geometry = previewGeometryDuringTransform(object.geometry, {
              x: node.x(),
              y: node.y(),
              scaleX: node.scaleX(),
              scaleY: node.scaleY(),
            });
            node.scaleX(1);
            node.scaleY(1);
            updateLiveResizeTextLayout(
              node,
              object,
              geometry.width,
              geometry.height,
              1,
              1,
            );
            runCommand("object.move", {
              objectId: object.id,
              x: geometry.x,
              y: geometry.y,
            });
            runCommand("object.resize", {
              objectId: object.id,
              width: geometry.width,
              height: geometry.height,
            });
            setResizePreviewGeometries((current) => {
              const next = { ...current };
              delete next[object.id];
              return next;
            });
          }}
          onTransform={(event) => {
            const node = event.target;
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            const geometry = previewGeometryDuringTransform(object.geometry, {
              x: node.x(),
              y: node.y(),
              scaleX,
              scaleY,
            });
            setResizePreviewGeometries((current) => ({
              ...current,
              [object.id]: geometry,
            }));
            updateLiveResizeTextLayout(
              node,
              object,
              geometry.width,
              geometry.height,
              scaleX,
              scaleY,
            );
          }}
        >
          {object.type === "shape" ? (
            <>
              {shapeNode(object)}
              <Text
                name="resizable-object-text"
                x={12}
                y={12}
                width={object.geometry.width - 24}
                height={object.geometry.height - 24}
                text={formatListText(object.text, object.style.listStyle)}
                fill={object.style.textColor ?? "#18181b"}
                align={object.style.textAlign ?? "center"}
                verticalAlign="middle"
                fontFamily={object.style.fontFamily}
                fontSize={object.style.fontSize}
                fontStyle={
                  object.style.fontWeight === "bold" ? "bold" : "normal"
                }
                textDecoration={object.style.linkUrl ? "underline" : ""}
                opacity={inlineTextEditor?.objectId === object.id ? 0 : 1}
                listening={false}
              />
            </>
          ) : object.type === "text" ? (
            <Text
              name="resizable-object-text"
              width={object.geometry.width}
              height={object.geometry.height}
              text={formatListText(object.text, object.style.listStyle)}
              fill={object.style.textColor ?? "#18181b"}
              fontFamily={object.style.fontFamily}
              fontSize={object.style.fontSize}
              fontStyle={object.style.fontWeight === "bold" ? "bold" : "normal"}
              align={object.style.textAlign ?? "left"}
              textDecoration={object.style.linkUrl ? "underline" : ""}
              verticalAlign="middle"
              opacity={inlineTextEditor?.objectId === object.id ? 0 : 1}
            />
          ) : (
            renderTable(object)
          )}
        </Group>
        {selectionAffordancesVisible &&
        object.type === "shape" &&
        (selectedIds.includes(object.id) ||
          hoveredShapeId === object.id ||
          connectorStart) ? (
          <Group
            x={object.geometry.x}
            y={object.geometry.y}
            rotation={object.geometry.rotation}
          >
            {anchors.map((anchor) => {
              const localObject = {
                ...object,
                geometry: { ...object.geometry, x: 0, y: 0 },
              };
              const point = connectionHandlePointV2(
                localObject,
                anchor,
                selectionAffordanceWorldSize(connectionAnchorOffsetPx),
              );
              return (
                <Circle
                  key={anchor}
                  x={point.x}
                  y={point.y}
                  radius={selectionAffordanceWorldSize(
                    connectionAnchorRadiusPx,
                  )}
                  fill="#a78bfa"
                  stroke="#ffffff"
                  strokeWidth={selectionAffordanceWorldSize(3)}
                  hitStrokeWidth={
                    Math.max(
                      18,
                      connectionAnchorHitWidthPx * selectionAffordanceFactor,
                    ) / viewport.scale
                  }
                  draggable
                  data-anchor={anchor}
                  onDragStart={(event) =>
                    beginConnectorDrag(event, object, anchor)
                  }
                  onDragMove={(event) => {
                    const point = eventWorldPointer(event);
                    if (point) setPointerPreview(point);
                  }}
                  onDragEnd={(event) => finishConnectorDrag(event, object.id)}
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
            })}
          </Group>
        ) : null}
      </Fragment>
    );
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const canvasContainer = container;
    function openFromMouse(event: MouseEvent) {
      if (
        !(event.target instanceof Node) ||
        !canvasContainer.contains(event.target)
      )
        return;
      const object =
        objectAtClientPoint(event.clientX, event.clientY) ?? selectedObject;
      if (!object) return;
      event.preventDefault();
      openObjectContextMenuFromPointer(object, event.clientX, event.clientY);
    }
    function onMouseDown(event: MouseEvent) {
      if (event.button === 2 || event.ctrlKey) openFromMouse(event);
    }
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("contextmenu", openFromMouse, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("contextmenu", openFromMouse, true);
    };
  });

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
  const inlineEditorObject = inlineTextEditor
    ? objectsById.get(inlineTextEditor.objectId)
    : undefined;
  const inlineEditorLayout =
    inlineEditorObject?.type === "shape" || inlineEditorObject?.type === "text"
      ? {
          left:
            viewport.x +
            (inlineEditorObject.geometry.x +
              (inlineEditorObject.type === "shape" ? 12 : 0)) *
              viewport.scale,
          top:
            viewport.y +
            (inlineEditorObject.geometry.y +
              (inlineEditorObject.type === "shape" ? 12 : 0)) *
              viewport.scale,
          width:
            (inlineEditorObject.geometry.width -
              (inlineEditorObject.type === "shape" ? 24 : 0)) *
            viewport.scale,
          height:
            (inlineEditorObject.geometry.height -
              (inlineEditorObject.type === "shape" ? 24 : 0)) *
            viewport.scale,
          transform: `rotate(${inlineEditorObject.geometry.rotation}deg)`,
          transformOrigin: "top left" as const,
          fontFamily: inlineEditorObject.style.fontFamily,
          fontSize: inlineEditorObject.style.fontSize * viewport.scale,
          fontWeight: inlineEditorObject.style.fontWeight ?? "normal",
          color: inlineEditorObject.style.textColor ?? "#18181b",
          textAlign:
            inlineEditorObject.style.textAlign ??
            (inlineEditorObject.type === "shape" ? "center" : "left"),
        }
      : null;

  return (
    <section
      aria-labelledby="canvas-title"
      className="thinking-workspace relative h-full min-h-[480px] overflow-hidden text-[var(--workspace-foreground)]"
      data-testid="thinking-workspace"
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest("[data-object-context-menu]")
        )
          return;
        setObjectContextMenu(null);
      }}
    >
      {selectedObject?.type === "connector" ? (
        <output
          data-testid="selected-connector-handle-points"
          className="sr-only"
        >
          {(() => {
            const points = resolveConnectorPointsV2(
              selectedObject,
              objectsById,
            );
            return ([selectedObject.start, selectedObject.end] as const)
              .flatMap((endpoint, index) => {
                const point = connectorEndpointHandlePoint(endpoint, {
                  x: points[index * 2]!,
                  y: points[index * 2 + 1]!,
                });
                return [Math.round(point.x), Math.round(point.y)];
              })
              .join(",");
          })()}
        </output>
      ) : null}
      {instrumentationEnabled ? (
        <output
          aria-hidden="true"
          data-testid="live-connector-points"
          className="hidden"
        >
          {displayObjects
            .filter(
              (
                object,
              ): object is Extract<CanvasObjectV2, { type: "connector" }> =>
                object.type === "connector",
            )
            .map((connector) =>
              [
                connector.id,
                ...resolveConnectorPointsV2(
                  connector,
                  connectorLayoutObjectsById,
                ).map(Math.round),
              ].join(":"),
            )
            .join(";")}
        </output>
      ) : null}
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
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Open Object navigator"
            aria-expanded={sharedPanel === "objects"}
            aria-controls="workspace-shared-panel"
            title="Object navigator"
            className="size-11 border-[var(--workspace-border)] bg-white text-zinc-700 hover:bg-violet-50 dark:border-[var(--workspace-border)] dark:bg-white dark:text-zinc-700"
            onClick={(event) =>
              toggleSharedPanel("objects", event.currentTarget)
            }
          >
            <ListTree aria-hidden="true" />
          </Button>
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
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Review AI changes"
            aria-expanded={sharedPanel === "review"}
            aria-controls="workspace-shared-panel"
            title="Review AI changes"
            className="border-[var(--workspace-border)] bg-white text-zinc-700 hover:bg-violet-50 dark:border-[var(--workspace-border)] dark:bg-white dark:text-zinc-700 dark:hover:bg-violet-50"
            onClick={(event) =>
              toggleSharedPanel("review", event.currentTarget)
            }
          >
            <ListChecks aria-hidden="true" />
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
        commentsPanelOpen={sharedPanel === "comments"}
        onToggleComments={(invoker) => toggleSharedPanel("comments", invoker)}
      />

      <div className="absolute right-4 bottom-4 z-30 flex items-center gap-1 rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-chrome)] p-1.5 text-zinc-700 shadow-[var(--workspace-shadow)] backdrop-blur-xl [&_button]:size-11 [&_button]:border-zinc-200 [&_button]:bg-white [&_button]:text-zinc-700 dark:[&_button]:border-zinc-200 dark:[&_button]:bg-white dark:[&_button]:text-zinc-700 [&_button:hover]:bg-violet-50 dark:[&_button:hover]:bg-violet-50">
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
          onClick={zoomToFit}
        >
          <Maximize2 aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Open canvas help"
          aria-expanded={sharedPanel === "help"}
          aria-controls="workspace-shared-panel"
          onClick={(event) => toggleSharedPanel("help", event.currentTarget)}
        >
          <CircleHelp aria-hidden="true" />
        </Button>
      </div>

      {sharedPanel && sharedPanel !== "comments" ? (
        <WorkspacePanel
          title={
            sharedPanel === "objects"
              ? "Object navigator"
              : sharedPanel === "review"
                ? "Review AI changes"
                : "Canvas help"
          }
          description={
            sharedPanel === "objects"
              ? "Browse objects and inspect detailed selection geometry."
              : sharedPanel === "review"
                ? "Inspect one coordinated change set and decide each object once."
                : "Keyboard shortcuts for moving around and editing this canvas."
          }
          invoker={sharedPanelInvoker}
          onDismiss={() => setSharedPanel(null)}
        >
          {sharedPanel === "objects" ? (
            <ObjectNavigatorContent
              objects={objects}
              objectsById={objectsById}
              selectedIds={selectedIds}
              selectedObject={selectedObject}
              onSelect={(object, modifier) => {
                updateSelectionForObject(object, modifier);
                setTool("select");
              }}
            />
          ) : sharedPanel === "review" ? (
            <CanvasAiReviews
              canvasId={canvasId}
              canvasRole={canvasRole}
              guidancePaused={reviewGuidancePaused}
              onFocusObject={focusReviewObject}
            />
          ) : (
            <ShortcutHelp />
          )}
        </WorkspacePanel>
      ) : null}

      <CanvasComments
        canvasId={canvasId}
        userId={userId}
        canvasRole={canvasRole}
        supabaseUrl={supabaseUrl}
        supabasePublishableKey={supabasePublishableKey}
        objects={objects}
        selectedIds={selectedIds}
        viewport={viewport}
        size={size}
        panelOpen={sharedPanel === "comments"}
        panelInvoker={sharedPanelInvoker}
        simulatedAiEnabled={simulatedAiEnabled}
        onDismissPanel={() => setSharedPanel(null)}
        onOpenReviews={() => {
          setSharedPanelInvoker(null);
          setSharedPanel("review");
        }}
        onSelectTargets={(targetIds) => {
          if (!targetIds.length) {
            closeContextPanel(false);
            setObjectContextMenu(null);
            setHoveredShapeId(null);
          }
          setSelectedIds(targetIds);
          setTool("select");
        }}
      />

      {objectContextMenu && selectedObjects.length ? (
        <ObjectContextMenu
          {...objectContextMenu}
          canGroup={
            selectedIds.length >= 2 &&
            !selectedObjects.some((object) => object.groupId != null)
          }
          canUngroup={selectedObjects.some((object) => object.groupId != null)}
          onGroup={groupSelected}
          onUngroup={ungroupSelected}
          onReorder={reorderSelected}
          onDuplicate={duplicateSelected}
          onCopy={() => void copySelected()}
          onCut={() => void cutSelected()}
          onDelete={deleteSelected}
          onDismiss={() => {
            setObjectContextMenu(null);
            requestAnimationFrame(() => containerRef.current?.focus());
          }}
        />
      ) : null}

      {tool === "select" && selectedObject && contextualToolbarPosition ? (
        <div
          className="absolute z-40 -translate-x-1/2"
          style={contextualToolbarPosition}
          data-testid="contextual-selection-controls"
        >
          <div
            className="relative flex max-w-[calc(100vw-2rem)] items-center gap-1 rounded-2xl border border-white/10 bg-zinc-900 p-1.5 text-white shadow-2xl [&_button]:border-transparent [&_button]:bg-transparent [&_button]:text-zinc-100 [&_button:hover]:bg-white/10 [&_button[aria-expanded=true]]:bg-violet-600 [&_button[aria-expanded=true]]:text-white"
            role="toolbar"
            aria-label="Selection controls"
            onKeyDown={(event) => {
              if (event.key === "Escape" && contextPanel) {
                event.preventDefault();
                event.stopPropagation();
                closeContextPanel();
              }
            }}
          >
            <output
              className={
                selectedIds.length === 1
                  ? "sr-only"
                  : "px-2 text-xs whitespace-nowrap text-zinc-300"
              }
              aria-live="polite"
              data-testid="selection-status"
            >
              {selectedIds.length === 1
                ? objectLabel(selectedObject)
                : `${selectedIds.length} selected`}
            </output>
            {fillObjects.length ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Fill"
                aria-expanded={contextPanel === "fill"}
                title="Fill"
                onClick={(event) =>
                  toggleContextPanel("fill", event.currentTarget)
                }
              >
                <span
                  aria-hidden="true"
                  data-testid="current-fill-swatch"
                  className="size-6 rounded-full border-2 border-white/70"
                  style={{
                    backgroundColor:
                      commonStyleValue(fillObjects, "fill") === null
                        ? "transparent"
                        : (commonStyleValue(fillObjects, "fill") ?? "#71717a"),
                  }}
                />
              </Button>
            ) : null}
            {outlineObjects.length ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Stroke color"
                aria-expanded={contextPanel === "outline"}
                title="Stroke color"
                onClick={(event) =>
                  toggleContextPanel("outline", event.currentTarget)
                }
              >
                <AlignJustify aria-hidden="true" />
              </Button>
            ) : null}
            {textStyleObjects.length ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Text style"
                aria-expanded={contextPanel === "text"}
                title="Text style"
                onClick={(event) =>
                  toggleContextPanel("text", event.currentTarget)
                }
              >
                <Type aria-hidden="true" />
              </Button>
            ) : null}
            {selectedIds.length === 1 &&
            (selectedObject.type === "shape" ||
              selectedObject.type === "text") &&
            selectedObject.style.linkUrl ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Open text link"
                title="Open text link"
                onClick={() => openSafeTextLink(selectedObject.style.linkUrl!)}
              >
                <ExternalLink aria-hidden="true" />
              </Button>
            ) : null}
            {selectedObject.type === "table" && selectedIds.length === 1 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-expanded={contextPanel === "table"}
                onClick={(event) =>
                  toggleContextPanel("table", event.currentTarget)
                }
              >
                Edit table
              </Button>
            ) : null}
            {selectedObjects.some(
              (object) =>
                object.type === "shape" || object.type === "connector",
            ) ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Connector controls"
                aria-expanded={contextPanel === "connector"}
                title="Connector controls"
                onClick={(event) =>
                  toggleContextPanel("connector", event.currentTarget)
                }
              >
                <Link2 aria-hidden="true" />
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="More selection actions"
              aria-expanded={contextPanel === "more"}
              title="More actions"
              onClick={(event) =>
                toggleContextPanel("more", event.currentTarget)
              }
            >
              <Ellipsis aria-hidden="true" />
            </Button>

            {contextPanel ? (
              <div
                role="dialog"
                aria-label={`${contextPanel} selection controls`}
                className={`absolute top-full left-1/2 mt-2 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900 p-3 text-white shadow-2xl [&_button]:border-white/10 [&_button]:bg-zinc-800 [&_button]:text-zinc-100 [&_button:hover]:bg-zinc-700 ${contextPanel === "text" ? "w-96 overflow-y-auto" : contextPanel === "fill" || contextPanel === "outline" ? "w-96" : "w-72"}`}
                style={
                  contextPanel === "text"
                    ? {
                        maxHeight: Math.max(
                          220,
                          size.height - contextualToolbarPosition.top - 160,
                        ),
                      }
                    : undefined
                }
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeContextPanel();
                  }
                }}
              >
                {contextPanel === "fill" ? (
                  <ColorStylePanel
                    mode="fill"
                    fill={commonStyleValue(fillObjects, "fill")}
                    outline={commonStyleValue(fillObjects, "outline")}
                    mixedFill={
                      commonStyleValue(fillObjects, "fill") === undefined
                    }
                    mixedOutline={
                      commonStyleValue(fillObjects, "outline") === undefined
                    }
                    onApplyPair={(pair) => applyColorPair(fillObjects, pair)}
                    onApplyFill={(fill) =>
                      applyStyleToObjects(fillObjects, { fill })
                    }
                    onApplyOutline={(outline) =>
                      applyStyleToObjects(fillObjects, { outline })
                    }
                  />
                ) : null}
                {contextPanel === "outline" ? (
                  <ColorStylePanel
                    mode="outline"
                    fill={null}
                    outline={commonStyleValue(outlineObjects, "outline")}
                    mixedFill={false}
                    mixedOutline={
                      commonStyleValue(outlineObjects, "outline") === undefined
                    }
                    onApplyPair={() => undefined}
                    onApplyFill={() => undefined}
                    onApplyOutline={(outline) =>
                      applyStyleToObjects(outlineObjects, { outline })
                    }
                  />
                ) : null}
                {contextPanel === "text" ? (
                  <TextStylePanel
                    key={`${selectedIds.join(":")}:${commonStyleValue(textStyleObjects, "fontSize") ?? "mixed"}:${commonStyleValue(textStyleObjects, "linkUrl") ?? "none"}`}
                    fontFamily={commonStyleValue(
                      textStyleObjects,
                      "fontFamily",
                    )}
                    fontSize={commonStyleValue(textStyleObjects, "fontSize")}
                    fontWeight={commonStyleValue(
                      textStyleObjects,
                      "fontWeight",
                    )}
                    textAlign={commonStyleValue(textStyleObjects, "textAlign")}
                    listStyle={commonStyleValue(textStyleObjects, "listStyle")}
                    linkUrl={commonStyleValue(textStyleObjects, "linkUrl")}
                    textColor={commonStyleValue(textStyleObjects, "textColor")}
                    allowLists={textStyleObjects.every(
                      (object) =>
                        object.type === "shape" || object.type === "text",
                    )}
                    allowLink={
                      textStyleObjects.length === 1 &&
                      (textStyleObjects[0]?.type === "shape" ||
                        textStyleObjects[0]?.type === "text")
                    }
                    onApply={(style) =>
                      applyStyleToObjects(textStyleObjects, style)
                    }
                    onOpenLink={openSafeTextLink}
                  />
                ) : null}
                {contextPanel === "table" && selectedObject.type === "table" ? (
                  <label className="block text-xs text-zinc-300">
                    Table cells
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
                      className="mt-1 min-h-24 w-full rounded-lg border border-white/15 bg-zinc-800 p-2 font-mono text-sm text-white"
                    />
                  </label>
                ) : null}
                {contextPanel === "connector" ? (
                  <div className="space-y-3">
                    {selectedObject.type === "shape" &&
                    selectedIds.length === 1 ? (
                      <fieldset>
                        <legend className="text-xs text-zinc-300">
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
                      <>
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
                      </>
                    ) : null}
                  </div>
                ) : null}
                {contextPanel === "more" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        selectedIds.length < 2 ||
                        selectedObjects.some((object) => object.groupId != null)
                      }
                      aria-keyshortcuts="Control+G Meta+G"
                      onClick={() => completeContextAction(groupSelected)}
                    >
                      Group
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        !selectedObjects.some(
                          (object) => object.groupId != null,
                        )
                      }
                      aria-keyshortcuts="Control+Shift+G Meta+Shift+G"
                      onClick={() => completeContextAction(ungroupSelected)}
                    >
                      Ungroup
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        completeContextAction(() => reorderSelected("front"))
                      }
                    >
                      Bring to front
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        completeContextAction(() => reorderSelected("back"))
                      }
                    >
                      Send to back
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-keyshortcuts="Control+D Meta+D"
                      onClick={() => completeContextAction(duplicateSelected)}
                    >
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-keyshortcuts="Control+C Meta+C"
                      onClick={() =>
                        completeContextAction(() => void copySelected())
                      }
                    >
                      <Copy aria-hidden="true" /> Copy
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-keyshortcuts="Control+X Meta+X"
                      onClick={() =>
                        completeContextAction(() => void cutSelected())
                      }
                    >
                      Cut
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-keyshortcuts="Control+V Meta+V"
                      onClick={() =>
                        completeContextAction(() => void pasteSelected())
                      }
                    >
                      Paste
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!undoStack.length}
                      aria-keyshortcuts="Control+Z Meta+Z"
                      onClick={() => completeContextAction(undo)}
                    >
                      Undo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!redoStack.length}
                      aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
                      onClick={() => completeContextAction(redo)}
                    >
                      Redo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="col-span-2 text-red-600!"
                      onClick={() => completeContextAction(deleteSelected)}
                    >
                      <Trash2 aria-hidden="true" /> Delete
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <output
          className="sr-only"
          aria-live="polite"
          data-testid="selection-status"
        >
          {historyNotice || "No selection"}
        </output>
      )}

      <div className="absolute inset-0">
        <div
          ref={containerRef}
          tabIndex={0}
          role="application"
          aria-label={`Canvas: ${title}. Choose a tool, then use the canvas. Arrow keys move a selection or pan; Delete removes a selection.`}
          onKeyDown={onKeyDown}
          onPointerMove={onSurfacePointerMove}
          onPointerLeave={() => setHoveredShapeId(null)}
          className="absolute inset-0 overflow-hidden bg-[var(--workspace-canvas)] focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none focus-visible:ring-inset"
          style={{
            backgroundImage: `radial-gradient(circle, var(--workspace-dot) ${canvasGrid.dotRadius}px, transparent ${canvasGrid.dotRadius}px)`,
            backgroundPosition: `${canvasGrid.x}px ${canvasGrid.y}px`,
            backgroundSize: `${canvasGrid.spacing}px ${canvasGrid.spacing}px`,
          }}
          data-testid="product-canvas-surface"
          data-viewport-x={Math.round(viewport.x)}
          data-viewport-y={Math.round(viewport.y)}
          data-viewport-scale={viewport.scale}
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
              {displayObjects.map(renderObject)}
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
                anchorSize={selectionAffordanceWorldSize(selectionHandleSizePx)}
                anchorStrokeWidth={selectionAffordanceWorldSize(
                  selectionHandleStrokeWidthPx,
                )}
                borderStrokeWidth={selectionAffordanceWorldSize(
                  selectionHandleStrokeWidthPx,
                )}
                anchorFill="#ffffff"
                anchorStroke="#0ea5e9"
                borderStroke="#0ea5e9"
                anchorCornerRadius={selectionAffordanceWorldSize(3)}
                padding={selectionAffordanceWorldSize(2)}
                boundBoxFunc={(oldBox, newBox) =>
                  newBox.width < 24 || newBox.height < 24 ? oldBox : newBox
                }
              />
            </Layer>
          </Stage>
          {inlineTextEditor && inlineEditorLayout ? (
            <textarea
              ref={inlineEditorRef}
              aria-label="Edit object text on canvas"
              data-testid="inline-object-text-editor"
              value={inlineTextEditor.draft}
              onChange={(event) => {
                const draft = event.target.value;
                setInlineTextEditor((current) => {
                  if (!current) return null;
                  const listStyle = /^\s*1[.)]\s/.test(draft)
                    ? "numbered"
                    : /^\s*[-*]\s/.test(draft)
                      ? "bullet"
                      : current.listStyle;
                  return { ...current, draft, listStyle };
                });
              }}
              onBlur={() => finishInlineEditing(true)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") {
                  event.preventDefault();
                  finishInlineEditing(false);
                } else if (
                  event.key === "Enter" &&
                  (event.metaKey || event.ctrlKey)
                ) {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (
                  event.key === "Enter" &&
                  inlineTextEditor.listStyle !== "none"
                ) {
                  event.preventDefault();
                  const editor = event.currentTarget;
                  const before = inlineTextEditor.draft.slice(
                    0,
                    editor.selectionStart,
                  );
                  const after = inlineTextEditor.draft.slice(
                    editor.selectionEnd,
                  );
                  const marker =
                    inlineTextEditor.listStyle === "bullet"
                      ? "• "
                      : `${before.split("\n").length + 1}. `;
                  const insertion = `\n${marker}`;
                  const cursor = before.length + insertion.length;
                  setInlineTextEditor((current) =>
                    current
                      ? { ...current, draft: `${before}${insertion}${after}` }
                      : null,
                  );
                  requestAnimationFrame(() => {
                    editor.setSelectionRange(cursor, cursor);
                  });
                }
              }}
              style={inlineEditorLayout}
              className="absolute z-20 resize-none overflow-hidden border-0 bg-transparent p-0 leading-tight text-zinc-900 outline-2 outline-offset-4 outline-violet-500 focus:outline"
            />
          ) : null}
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
      </div>
    </section>
  );
}

function ObjectNavigatorContent({
  objects,
  objectsById,
  selectedIds,
  selectedObject,
  onSelect,
}: {
  objects: CanvasObjectV2[];
  objectsById: Map<string, CanvasObjectV2>;
  selectedIds: string[];
  selectedObject: CanvasObjectV2 | undefined;
  onSelect: (object: CanvasObjectV2, modifier: boolean) => void;
}) {
  return (
    <div className="text-zinc-900">
      <h3 className="text-sm font-medium">Objects</h3>
      {objects.length ? (
        <ul className="mt-3 space-y-2">
          {objects.map((object) => (
            <li key={object.id}>
              <button
                type="button"
                data-testid={`object-list-item-${object.id}`}
                aria-pressed={selectedIds.includes(object.id)}
                onClick={(event) =>
                  onSelect(
                    object,
                    event.shiftKey || event.metaKey || event.ctrlKey,
                  )
                }
                className="min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700 hover:border-violet-500 aria-pressed:border-violet-500 aria-pressed:bg-violet-50"
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
          <h3 className="text-sm font-medium capitalize">
            {selectedIds.length > 1
              ? `Mixed selection · ${selectedObject.type} focused`
              : selectedObject.type}
          </h3>
          <dl className="grid grid-cols-2 gap-3 text-xs text-zinc-600">
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
          {selectedObject.type === "connector" ? (
            <div>
              <p className="text-xs font-medium text-zinc-500">
                Resolved connector points
              </p>
              <output
                data-testid="selected-connector-points"
                className="mt-1 block text-xs text-zinc-600"
              >
                {resolveConnectorPointsV2(selectedObject, objectsById)
                  .map((value) => Math.round(value))
                  .join(",")}
              </output>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const shortcutGroups = [
  ["V / H / Space", "Select or pan"],
  ["S / R / C / T / B", "Sticky, recent shape, connector, text, or table"],
  ["Arrow / Shift+Arrow", "Move by 1 or 10 pixels"],
  ["Alt+Arrow", "Resize the selected object"],
  ["Mod+A / C / X / V / D", "Select all, copy, cut, paste, or duplicate"],
  ["Mod+G / Mod+Shift+G", "Group or ungroup"],
  ["Mod+Z / Mod+Shift+Z", "Undo or redo"],
  ["+ / - / 0", "Zoom in, zoom out, or reset view"],
  ["Delete", "Delete the selection"],
  ["Escape", "Close the active panel or cancel inline editing"],
] as const;

function ShortcutHelp() {
  return (
    <dl className="space-y-3">
      {shortcutGroups.map(([shortcut, description]) => (
        <div
          key={shortcut}
          className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-4 border-b border-zinc-100 pb-3 text-sm last:border-0"
        >
          <dt>
            <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-800">
              {shortcut}
            </kbd>
          </dt>
          <dd className="text-zinc-600">{description}</dd>
        </div>
      ))}
    </dl>
  );
}
