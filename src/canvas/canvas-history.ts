import type * as Y from "yjs";

import {
  deleteCanvasObjectV2,
  deleteCanvasGroupV2,
  isIntrinsicShapeLabel,
  listCanvasGroupsV2,
  listCanvasObjectsV2,
  putCanvasGroupV2,
  putCanvasObjectV2,
  readCanvasObjectV2,
  readCanvasOrderV2,
  setCanvasObjectField,
  setCanvasOrderV2,
  type CanvasObjectV2,
  type CanvasGroupV2,
} from "@/canvas/canvas-document";
import { isContainableObject } from "@/canvas/icon-containment";
import {
  executeProductCanvasCommand,
  type ProductCanvasCommand,
} from "@/domain/canvas-command";

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type CanvasHistoryEntry = {
  commandId: string;
  actorId: string;
  beforeObjects: Record<string, CanvasObjectV2 | null>;
  afterObjects: Record<string, CanvasObjectV2 | null>;
  beforeGroups?: Record<string, CanvasGroupV2 | null>;
  afterGroups?: Record<string, CanvasGroupV2 | null>;
  beforeOrder: string[];
  afterOrder: string[];
};

function snapshot(document: Y.Doc) {
  return Object.fromEntries(
    listCanvasObjectsV2(document).map((object) => [
      object.id,
      structuredClone({ ...object, groupId: object.groupId ?? null }),
    ]),
  );
}

function groupSnapshot(document: Y.Doc) {
  return Object.fromEntries(
    listCanvasGroupsV2(document).map((group) => [
      group.id,
      structuredClone(group),
    ]),
  );
}

function intrinsicLabelForParent(document: Y.Doc, parentId: string) {
  return listCanvasObjectsV2(document).find(
    (object) => isIntrinsicShapeLabel(object) && object.parentId === parentId,
  );
}

function matchesBeforeState(
  document: Y.Doc,
  current: CanvasObjectV2 | null,
  expected: CanvasObjectV2,
) {
  if (equal(current, expected)) return true;
  if (
    current?.type !== "shape" ||
    expected.type !== "shape" ||
    current.text !== "" ||
    expected.text === ""
  )
    return false;
  const label = intrinsicLabelForParent(document, current.id);
  return (
    label?.type === "text" &&
    label.text === expected.text &&
    equal({ ...current, text: label.text }, expected)
  );
}

export function executeProductCanvasCommandWithHistory(
  document: Y.Doc,
  input: unknown,
) {
  const before = snapshot(document);
  const beforeGroups = groupSnapshot(document);
  const beforeOrder = readCanvasOrderV2(document);
  const result = executeProductCanvasCommand(document, input);
  const after = snapshot(document);
  const afterGroups = groupSnapshot(document);
  const affectedIds = new Set(result.affectedObjectIds);

  return {
    ...result,
    history: {
      commandId: result.command.commandId,
      actorId: result.command.actor.id,
      beforeObjects: Object.fromEntries(
        [...affectedIds].map((id) => [id, before[id] ?? null]),
      ),
      afterObjects: Object.fromEntries(
        [...affectedIds].map((id) => [id, after[id] ?? null]),
      ),
      beforeGroups: Object.fromEntries(
        result.affectedGroupIds.map((id) => [id, beforeGroups[id] ?? null]),
      ),
      afterGroups: Object.fromEntries(
        result.affectedGroupIds.map((id) => [id, afterGroups[id] ?? null]),
      ),
      beforeOrder,
      afterOrder: readCanvasOrderV2(document),
    } satisfies CanvasHistoryEntry,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJsonValue(value[key])]),
  );
}

function equal(left: unknown, right: unknown) {
  return (
    JSON.stringify(stableJsonValue(left)) ===
    JSON.stringify(stableJsonValue(right))
  );
}

function changedPaths(
  before: unknown,
  after: unknown,
  prefix: string[] = [],
): string[][] {
  if (equal(before, after)) return [];
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((key) =>
      changedPaths(before[key], after[key], [...prefix, key]),
    );
  }
  return [prefix];
}

function readPath(value: unknown, path: string[]) {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function historyPathValue(value: unknown, path: string[]) {
  const result = readPath(value, path);
  return result === undefined &&
    path[0] === "geometry" &&
    (path[1] === "flipX" || path[1] === "flipY")
    ? false
    : result;
}

function normalizeReplacement(path: string[], value: unknown): JsonValue {
  if (value === undefined && path.at(-1) === "groupId") return null;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value) ||
    isRecord(value)
  ) {
    return value as JsonValue;
  }
  throw new Error("History contains an unsupported replacement value.");
}

export function applyCanvasHistoryEntry(
  document: Y.Doc,
  entry: CanvasHistoryEntry,
  direction: "undo" | "redo",
) {
  const expectedObjects =
    direction === "undo" ? entry.afterObjects : entry.beforeObjects;
  const desiredObjects =
    direction === "undo" ? entry.beforeObjects : entry.afterObjects;
  const expectedOrder =
    direction === "undo" ? entry.afterOrder : entry.beforeOrder;
  const desiredOrder =
    direction === "undo" ? entry.beforeOrder : entry.afterOrder;
  const conflicts: string[] = [];

  document.transact(() => {
    const expectedGroups =
      direction === "undo" ? entry.afterGroups : entry.beforeGroups;
    const desiredGroups =
      direction === "undo" ? entry.beforeGroups : entry.afterGroups;
    for (const groupId of Object.keys(expectedGroups ?? {})) {
      const expected = expectedGroups?.[groupId] ?? null;
      const desired = desiredGroups?.[groupId] ?? null;
      const current =
        listCanvasGroupsV2(document).find((group) => group.id === groupId) ??
        null;
      if (!equal(current, expected)) {
        conflicts.push(`${groupId}:group`);
      } else if (desired) {
        putCanvasGroupV2(document, desired);
      } else {
        deleteCanvasGroupV2(document, groupId);
      }
    }
    for (const objectId of Object.keys(expectedObjects)) {
      const expected = expectedObjects[objectId] ?? null;
      const desired = desiredObjects[objectId] ?? null;
      const current = readCanvasObjectV2(document, objectId) ?? null;

      if (expected === null && desired !== null) {
        if (current === null) putCanvasObjectV2(document, desired);
        else conflicts.push(`${objectId}:exists`);
        continue;
      }
      if (expected !== null && desired === null) {
        if (matchesBeforeState(document, current, expected)) {
          if (current?.type === "shape") {
            for (const candidate of listCanvasObjectsV2(document)) {
              if (
                isIntrinsicShapeLabel(candidate) &&
                candidate.parentId === current.id
              )
                deleteCanvasObjectV2(document, candidate.id);
            }
          }
          deleteCanvasObjectV2(document, objectId);
        } else conflicts.push(`${objectId}:changed`);
        continue;
      }
      if (!expected || !desired || !current) {
        conflicts.push(`${objectId}:missing`);
        continue;
      }

      const parentRelationshipChanged =
        isContainableObject(expected) &&
        isContainableObject(desired) &&
        isContainableObject(current) &&
        (expected.parentId !== desired.parentId ||
          !equal(expected.parentRelative, desired.parentRelative) ||
          !equal(expected.childLayout, desired.childLayout));
      if (parentRelationshipChanged) {
        if (
          current.parentId !== expected.parentId ||
          !equal(current.parentRelative, expected.parentRelative)
        ) {
          conflicts.push(`${objectId}:parent`);
        } else {
          putCanvasObjectV2(document, {
            ...current,
            parentId: desired.parentId,
            parentRelative: desired.parentRelative,
            childLayout: desired.childLayout,
          });
        }
      }

      for (const path of changedPaths(expected, desired)) {
        if (
          parentRelationshipChanged &&
          (path[0] === "parentId" ||
            path[0] === "parentRelative" ||
            path[0] === "childLayout")
        )
          continue;
        const expectedValue = historyPathValue(expected, path);
        const desiredValue = historyPathValue(desired, path);
        const label =
          path.length === 1 &&
          path[0] === "text" &&
          expected.type === "shape" &&
          desired.type === "shape"
            ? intrinsicLabelForParent(document, objectId)
            : undefined;
        const currentValue =
          label?.type === "text"
            ? label.text
            : historyPathValue(readCanvasObjectV2(document, objectId), path);
        if (!equal(currentValue, expectedValue)) {
          conflicts.push(`${objectId}:${path.join(".")}`);
          continue;
        }
        setCanvasObjectField(
          document,
          label?.type === "text" ? label.id : objectId,
          path,
          normalizeReplacement(path, desiredValue),
        );
      }
    }

    if (!equal(expectedOrder, desiredOrder)) {
      const currentOrder = readCanvasOrderV2(document);
      const currentObjectIds = listCanvasObjectsV2(document)
        .map((object) => object.id)
        .sort();
      const currentObjectIdSet = new Set(currentObjectIds);
      const normalizedDesiredOrder = desiredOrder.filter((id) =>
        currentObjectIdSet.has(id),
      );
      const desiredObjectIds = [...normalizedDesiredOrder].sort();
      const canApplyDesiredOrder = equal(currentObjectIds, desiredObjectIds);
      if (equal(currentOrder, normalizedDesiredOrder)) {
        // Object creation or deletion already produced the desired order.
      } else if (equal(currentOrder, expectedOrder) && canApplyDesiredOrder) {
        setCanvasOrderV2(document, normalizedDesiredOrder);
      } else if (
        equal([...currentOrder].sort(), desiredObjectIds) &&
        canApplyDesiredOrder
      ) {
        setCanvasOrderV2(document, normalizedDesiredOrder);
      } else {
        conflicts.push("canvas:order");
      }
    }
  }, `canvas.history.${direction}.${entry.commandId}`);

  return {
    status:
      conflicts.length === 0
        ? ("applied" as const)
        : conflicts.length < Object.keys(expectedObjects).length + 1
          ? ("partial" as const)
          : ("conflict" as const),
    conflicts,
  };
}

export function isActorHistoryEntry(
  entry: CanvasHistoryEntry,
  actorId: string,
) {
  return entry.actorId === actorId;
}

export type HistoryCommand = ProductCanvasCommand;
