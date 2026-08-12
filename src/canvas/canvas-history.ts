import type * as Y from "yjs";

import {
  deleteCanvasObjectV2,
  listCanvasObjectsV2,
  putCanvasObjectV2,
  readCanvasObjectV2,
  readCanvasOrderV2,
  setCanvasObjectField,
  setCanvasOrderV2,
  type CanvasObjectV2,
} from "@/canvas/canvas-document";
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

export function executeProductCanvasCommandWithHistory(
  document: Y.Doc,
  input: unknown,
) {
  const before = snapshot(document);
  const beforeOrder = readCanvasOrderV2(document);
  const result = executeProductCanvasCommand(document, input);
  const after = snapshot(document);
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
      beforeOrder,
      afterOrder: readCanvasOrderV2(document),
    } satisfies CanvasHistoryEntry,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
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
        if (equal(current, expected)) deleteCanvasObjectV2(document, objectId);
        else conflicts.push(`${objectId}:changed`);
        continue;
      }
      if (!expected || !desired || !current) {
        conflicts.push(`${objectId}:missing`);
        continue;
      }

      for (const path of changedPaths(expected, desired)) {
        const expectedValue = readPath(expected, path);
        const desiredValue = readPath(desired, path);
        const currentValue = readPath(
          readCanvasObjectV2(document, objectId),
          path,
        );
        if (!equal(currentValue, expectedValue)) {
          conflicts.push(`${objectId}:${path.join(".")}`);
          continue;
        }
        setCanvasObjectField(
          document,
          objectId,
          path,
          normalizeReplacement(path, desiredValue),
        );
      }
    }

    if (!equal(expectedOrder, desiredOrder)) {
      const currentOrder = readCanvasOrderV2(document);
      if (equal(currentOrder, desiredOrder)) {
        // Object creation or deletion already produced the desired order.
      } else if (equal(currentOrder, expectedOrder)) {
        setCanvasOrderV2(document, desiredOrder);
      } else if (equal([...currentOrder].sort(), [...desiredOrder].sort())) {
        setCanvasOrderV2(document, desiredOrder);
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
