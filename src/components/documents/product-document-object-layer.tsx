"use client";

import {
  BringToFront,
  Copy,
  Group,
  LogOut,
  Redo2,
  Scissors,
  Trash2,
  Ungroup,
  Undo2,
} from "lucide-react";
import { useState } from "react";

import {
  projectCanvasCompositions,
  type CanvasGroupV2,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";
import {
  basicShapePath,
  basicShapePoints,
} from "@/canvas/basic-shape-geometry";
import { annotationCenterlinePoints } from "@/canvas/annotation-stroke";
import {
  iconVectorScene,
  type PhosphorIconCatalog,
} from "@/canvas/phosphor-icon-catalog";
import {
  documentWorldGeometry,
  isDocumentOwned,
  type ProductDocumentCanvasObject,
} from "@/documents/document-containment";

type Props = {
  documentObject: ProductDocumentCanvasObject;
  objects: CanvasObjectV2[];
  groups: CanvasGroupV2[];
  pageIndex: number;
  pageHeight: number | null;
  canEdit: boolean;
  showTemporaryAnnotations: boolean;
  iconCatalog: PhosphorIconCatalog | null;
  onMove: (objectId: string, x: number, y: number) => void;
  onMoveGroup: (groupId: string, deltaX: number, deltaY: number) => void;
  onRemove: (objectIds: string[]) => void;
  onDelete: (objectIds: string[]) => void;
  onDuplicate: (objectIds: string[]) => void;
  onCopy: (objectIds: string[]) => void;
  onCut: (objectIds: string[]) => void;
  onReorder: (
    objectIds: string[],
    direction: "front" | "forward" | "backward" | "back",
  ) => void;
  onGroup: (objectIds: string[]) => void;
  onUngroup: (objectIds: string[]) => void;
  onSelectionChange: (objectIds: string[]) => void;
  onUndo: () => void;
  onRedo: () => void;
};

type DragState = {
  objectId: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  x: number;
  y: number;
};

function objectLabel(object: CanvasObjectV2) {
  if (object.type === "shape" || object.type === "text") {
    return object.text || (object.type === "shape" ? "Shape" : "Text");
  }
  if (object.type === "icon") return object.iconName.replaceAll("-", " ");
  if (object.type === "table") return `${object.cells.length} row table`;
  if (object.type === "connector") return "Connector";
  if (object.type === "annotation")
    return object.temporary ? "Temporary annotation" : "Annotation";
  return "Object";
}

function EmbeddedObjectContent({
  object,
  iconCatalog,
}: {
  object: CanvasObjectV2;
  iconCatalog: PhosphorIconCatalog | null;
}) {
  if (object.type === "shape") {
    const width = object.documentLocal?.width ?? object.geometry.width;
    const height = object.documentLocal?.height ?? object.geometry.height;
    const points = basicShapePoints(object.shape, width, height);
    const path = basicShapePath(object.shape, width, height);
    return (
      <>
        <svg className="absolute inset-0 size-full" aria-hidden="true">
          {points ? (
            <polygon
              points={points.reduce(
                (value, coordinate, index) =>
                  `${value}${index % 2 === 0 ? " " : ","}${coordinate}`,
                "",
              )}
              fill={object.style.fill ?? "white"}
              stroke={object.style.outline}
              strokeWidth={object.style.outlineWidth}
            />
          ) : path ? (
            <path
              d={path}
              fill={object.style.fill ?? "white"}
              stroke={object.style.outline}
              strokeWidth={object.style.outlineWidth}
            />
          ) : object.shape === "ellipse" ? (
            <ellipse
              cx="50%"
              cy="50%"
              rx="49%"
              ry="49%"
              fill={object.style.fill ?? "white"}
              stroke={object.style.outline}
              strokeWidth={object.style.outlineWidth}
            />
          ) : (
            <rect
              x="1"
              y="1"
              width={Math.max(0, width - 2)}
              height={Math.max(0, height - 2)}
              rx={object.shape === "rounded-rectangle" ? 14 : 2}
              fill={object.style.fill ?? "white"}
              stroke={object.style.outline}
              strokeWidth={object.style.outlineWidth}
            />
          )}
        </svg>
        <span className="relative z-1 line-clamp-3">{objectLabel(object)}</span>
      </>
    );
  }
  if (object.type === "table") {
    return (
      <table className="size-full table-fixed border-collapse text-[10px]">
        <tbody>
          {object.cells.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, columnIndex) => (
                <td
                  key={columnIndex}
                  className="truncate border border-current px-1"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (object.type === "icon") {
    const scene = iconCatalog
      ? iconVectorScene(iconCatalog, object.iconName)
      : null;
    return scene ? (
      <svg
        className="size-full"
        viewBox={`0 0 ${scene.viewBox} ${scene.viewBox}`}
        aria-hidden="true"
      >
        {scene.paths.map((path, index) => (
          <path
            key={`${object.iconName}-${index}`}
            d={path}
            fill={object.style.fill ?? "transparent"}
            stroke={object.style.outline}
            strokeWidth={object.style.outlineWidth}
          />
        ))}
      </svg>
    ) : (
      <span className="line-clamp-3">{objectLabel(object)}</span>
    );
  }
  if (object.type === "annotation") {
    const points = annotationCenterlinePoints(object);
    return (
      <svg
        className="size-full overflow-visible"
        viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
        aria-hidden="true"
      >
        <polyline
          points={Array.from(
            { length: points.length / 2 },
            (_, index) => `${points[index * 2]},${points[index * 2 + 1]}`,
          ).join(" ")}
          fill="none"
          stroke={object.style.outline}
          strokeWidth={object.style.outlineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (object.type === "connector") {
    return (
      <svg className="size-full overflow-visible" aria-hidden="true">
        <line
          x1="0"
          y1="0"
          x2="100%"
          y2="100%"
          stroke={object.style.outline}
          strokeWidth={object.style.outlineWidth}
        />
      </svg>
    );
  }
  return <span className="line-clamp-3">{objectLabel(object)}</span>;
}

export function ProductDocumentObjectLayer({
  documentObject,
  objects,
  groups,
  pageIndex,
  pageHeight,
  canEdit,
  showTemporaryAnnotations,
  iconCatalog,
  onMove,
  onMoveGroup,
  onRemove,
  onDelete,
  onDuplicate,
  onCopy,
  onCut,
  onReorder,
  onGroup,
  onUngroup,
  onSelectionChange,
  onUndo,
  onRedo,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const owned = projectCanvasCompositions(
    objects
      .filter(isDocumentOwned)
      .filter(
        (object) =>
          object.documentOwnerId === documentObject.id &&
          (object.type !== "annotation" ||
            !object.temporary ||
            showTemporaryAnnotations) &&
          (pageHeight === null || object.documentLocal.pageIndex === pageIndex),
      ),
  ).flatMap((object) => (isDocumentOwned(object) ? [object] : []));
  const selectedOwned = owned.filter((object) =>
    selectedIds.includes(object.id),
  );
  const selectedToolbarPosition = selectedOwned.length
    ? {
        left:
          (Math.min(...selectedOwned.map((object) => object.documentLocal.x)) +
            Math.max(
              ...selectedOwned.map(
                (object) => object.documentLocal.x + object.documentLocal.width,
              ),
            )) /
          2,
        top: Math.max(
          128,
          Math.min(...selectedOwned.map((object) => object.documentLocal.y)) -
            (pageHeight === null ? 0 : pageIndex * pageHeight) -
            52,
        ),
      }
    : null;

  return (
    <div
      role="group"
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
      data-testid="document-object-layer"
      aria-label="Canvas objects in document"
    >
      {selectedToolbarPosition ? (
        <div
          role="toolbar"
          aria-label="Embedded object actions"
          className="pointer-events-auto absolute z-[50] flex -translate-x-1/2 gap-1 rounded-xl border border-white/10 bg-zinc-900 p-1 text-white shadow-2xl [&_button:hover]:bg-white/10"
          style={selectedToolbarPosition}
        >
          {[
            { label: "Undo canvas object change", icon: Undo2, action: onUndo },
            { label: "Redo canvas object change", icon: Redo2, action: onRedo },
            {
              label: "Duplicate",
              icon: Copy,
              action: () => onDuplicate(selectedIds),
            },
            { label: "Copy", icon: Copy, action: () => onCopy(selectedIds) },
            { label: "Cut", icon: Scissors, action: () => onCut(selectedIds) },
            {
              label: "Bring to front",
              icon: BringToFront,
              action: () => onReorder(selectedIds, "front"),
            },
            {
              label: "Group",
              icon: Group,
              action: () => onGroup(selectedIds),
              disabled: selectedIds.length < 2,
            },
            {
              label: "Ungroup",
              icon: Ungroup,
              action: () => onUngroup(selectedIds),
            },
            {
              label: "Remove from document",
              icon: LogOut,
              action: () => onRemove(selectedIds),
            },
            {
              label: "Delete embedded objects",
              icon: Trash2,
              action: () => onDelete(selectedIds),
            },
          ].map(({ label, icon: Icon, action, disabled }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              title={label}
              disabled={disabled}
              className="rounded-lg p-2 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:text-zinc-300"
              onClick={action}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
      {owned.map((object) => {
        const local = object.documentLocal;
        const preview =
          drag && selectedIds.includes(object.id)
            ? {
                x: local.x + drag.x - drag.clientX,
                y: local.y + drag.y - drag.clientY,
              }
            : { x: local.x, y: local.y };
        const pageOffset = pageHeight === null ? 0 : pageIndex * pageHeight;
        const selected = selectedIds.includes(object.id);
        return (
          <div
            key={object.id}
            role="group"
            aria-label={`${objectLabel(object)} embedded canvas object`}
            data-testid={`document-object-${object.id}`}
            className={`pointer-events-auto absolute flex items-center justify-center overflow-hidden rounded-md border bg-white/90 p-2 text-center text-xs shadow-sm outline-none ${selected ? "border-violet-600 ring-2 ring-violet-300" : "border-zinc-400"}`}
            style={{
              left: preview.x,
              top: preview.y - pageOffset,
              width: Math.max(8, local.width),
              height: Math.max(8, local.height),
              color: object.style.textColor ?? object.style.outline,
              backgroundColor: object.style.fill ?? "rgba(255,255,255,0.9)",
              borderColor: object.style.outline,
              borderWidth: Math.max(1, object.style.outlineWidth),
              opacity: object.style.opacity ?? 1,
              transform: `rotate(${local.rotation}deg)`,
              touchAction: "none",
            }}
            tabIndex={0}
            onFocus={() => {
              const groupMembers = object.groupId
                ? objects
                    .filter((candidate) => candidate.groupId === object.groupId)
                    .map((candidate) => candidate.id)
                : [object.id];
              if (groupMembers.every((id) => selectedIds.includes(id))) return;
              setSelectedIds(groupMembers);
              onSelectionChange(groupMembers);
            }}
            onPointerDown={(event) => {
              if (!canEdit || event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              setSelectedIds((current) => {
                const groupMembers = object.groupId
                  ? objects
                      .filter(
                        (candidate) => candidate.groupId === object.groupId,
                      )
                      .map((candidate) => candidate.id)
                  : [object.id];
                const next =
                  event.shiftKey || event.metaKey || event.ctrlKey
                    ? groupMembers.every((id) => current.includes(id))
                      ? current.filter((id) => !groupMembers.includes(id))
                      : [...new Set([...current, ...groupMembers])]
                    : groupMembers;
                onSelectionChange(next);
                return next;
              });
              setDrag({
                objectId: object.id,
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                x: event.clientX,
                y: event.clientY,
              });
            }}
            onPointerMove={(event) => {
              if (
                drag?.objectId !== object.id ||
                drag.pointerId !== event.pointerId
              )
                return;
              setDrag((current) =>
                current
                  ? { ...current, x: event.clientX, y: event.clientY }
                  : null,
              );
            }}
            onPointerUp={(event) => {
              if (
                drag?.objectId !== object.id ||
                drag.pointerId !== event.pointerId
              )
                return;
              const nextLocal = {
                ...local,
                x: local.x + event.clientX - drag.clientX,
                y: local.y + event.clientY - drag.clientY,
              };
              const world = documentWorldGeometry(
                documentObject,
                nextLocal,
                object.geometry,
              );
              setDrag(null);
              if (
                object.groupId &&
                groups.some((group) => group.id === object.groupId)
              ) {
                onMoveGroup(
                  object.groupId,
                  event.clientX - drag.clientX,
                  event.clientY - drag.clientY,
                );
              } else {
                onMove(object.id, world.x, world.y);
              }
            }}
            onKeyDown={(event) => {
              if (!canEdit) return;
              const amount = event.shiftKey ? 10 : 1;
              const offset =
                event.key === "ArrowLeft"
                  ? { x: -amount, y: 0 }
                  : event.key === "ArrowRight"
                    ? { x: amount, y: 0 }
                    : event.key === "ArrowUp"
                      ? { x: 0, y: -amount }
                      : event.key === "ArrowDown"
                        ? { x: 0, y: amount }
                        : null;
              if (offset) {
                event.preventDefault();
                event.stopPropagation();
                const world = documentWorldGeometry(
                  documentObject,
                  { ...local, x: local.x + offset.x, y: local.y + offset.y },
                  object.geometry,
                );
                onMove(object.id, world.x, world.y);
              } else if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                event.stopPropagation();
                onDelete([object.id]);
              }
            }}
          >
            <EmbeddedObjectContent object={object} iconCatalog={iconCatalog} />
          </div>
        );
      })}
    </div>
  );
}
