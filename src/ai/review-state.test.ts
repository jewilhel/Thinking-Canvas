import { validateCanvasReviewStage } from "@/ai/proposals";
import { organizeCanvasCommands } from "@/ai/organize-canvas";
import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import {
  buildDiscardReviewUpdate,
  buildUndoAiChangeSetUpdate,
} from "@/ai/review-state";
import {
  createProductCanvasDocument,
  listCanvasGroupsV2,
  listCanvasObjectsV2,
  putCanvasObjectV2,
  readCanvasObjectV2,
  setCanvasObjectField,
} from "@/canvas/canvas-document";

const canvasId = "20000000-0000-4000-8000-000000000001";
const objectId = "61000000-0000-4000-8000-000000000001";

function object(
  x: number,
  text = "Evidence",
  updatedAt = "2026-08-26T00:00:00.000Z",
) {
  return {
    schemaVersion: 2 as const,
    id: objectId,
    canvasId,
    createdBy: "10000000-0000-4000-8000-000000000001",
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt,
    type: "shape" as const,
    shape: "rectangle" as const,
    text,
    geometry: { x, y: 0, width: 160, height: 96, rotation: 0 },
    style: {
      fill: "#ffffff",
      outline: "#334155",
      outlineWidth: 2,
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 16,
    },
  };
}

describe("review decision state", () => {
  it("undoes a multi-object AI turn as one update", () => {
    const document = createProductCanvasDocument(canvasId);
    const secondObjectId = "61000000-0000-4000-8000-000000000002";
    const first = object(240);
    const second = { ...object(480), id: secondObjectId, text: "Second" };
    putCanvasObjectV2(document, first);
    putCanvasObjectV2(document, second);

    const undo = buildUndoAiChangeSetUpdate({
      document,
      objectChanges: [
        {
          id: "71000000-0000-4000-8000-000000000010",
          objectId,
          beforeState: { object: null, orderIndex: null },
          afterState: { object: first, orderIndex: 0 },
          affectedFields: ["object", "orderIndex"],
        },
        {
          id: "71000000-0000-4000-8000-000000000011",
          objectId: secondObjectId,
          beforeState: { object: null, orderIndex: null },
          afterState: { object: second, orderIndex: 1 },
          affectedFields: ["object", "orderIndex"],
        },
      ],
    });

    Y.applyUpdate(document, undo.update);
    expect(readCanvasObjectV2(document, objectId)).toBeUndefined();
    expect(readCanvasObjectV2(document, secondObjectId)).toBeUndefined();
    expect(undo.conflicts).toEqual([]);
  });

  it("discards the AI field while preserving a later collaborator field", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, object(240));
    setCanvasObjectField(document, objectId, ["text"], "Human clarification");
    const decision = buildDiscardReviewUpdate({
      document,
      objectChangeId: "71000000-0000-4000-8000-000000000001",
      objectId,
      beforeState: { object: object(0), orderIndex: 0 },
      afterState: { object: object(240), orderIndex: 0 },
      affectedFields: ["object.geometry.x"],
    });
    Y.applyUpdate(document, decision.update);
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      text: "Human clarification",
      geometry: { x: 0 },
    });
    expect(decision).toMatchObject({ status: "applied", conflicts: [] });
  });

  it("does not overwrite a later collaborator edit to the same field", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, object(320));
    const decision = buildDiscardReviewUpdate({
      document,
      objectChangeId: "71000000-0000-4000-8000-000000000001",
      objectId,
      beforeState: { object: object(0), orderIndex: 0 },
      afterState: { object: object(240), orderIndex: 0 },
      affectedFields: ["object.geometry.x"],
    });
    expect(decision.status).toBe("partial");
    expect(decision.conflicts).toContain(`${objectId}:geometry.x`);
  });

  it("ignores unrelated geometry and updated metadata when discarding an AI label", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(
      document,
      object(241, "Supporting evidence", "2026-08-26T00:02:00.000Z"),
    );
    const decision = buildDiscardReviewUpdate({
      document,
      objectChangeId: "71000000-0000-4000-8000-000000000002",
      objectId,
      beforeState: { object: object(240, "New idea"), orderIndex: 0 },
      afterState: {
        object: object(240, "Supporting evidence", "2026-08-26T00:01:00.000Z"),
        orderIndex: 0,
      },
      affectedFields: ["object.text"],
    });
    Y.applyUpdate(document, decision.update);
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      text: "New idea",
      geometry: { x: 241 },
      updatedAt: "2026-08-26T00:02:00.000Z",
    });
    expect(decision).toMatchObject({ status: "applied", conflicts: [] });
  });

  it("removes an unchanged AI-created object and restores its prior order", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, object(240));
    const decision = buildDiscardReviewUpdate({
      document,
      objectChangeId: "71000000-0000-4000-8000-000000000003",
      objectId,
      beforeState: { object: null, orderIndex: null },
      afterState: { object: object(240), orderIndex: 0 },
      affectedFields: ["object", "orderIndex"],
    });
    Y.applyUpdate(document, decision.update);
    expect(readCanvasObjectV2(document, objectId)).toBeUndefined();
    expect(decision).toMatchObject({ status: "applied", conflicts: [] });
  });

  it("restores an AI-deleted object at its prior order position", () => {
    const document = createProductCanvasDocument(canvasId);
    const decision = buildDiscardReviewUpdate({
      document,
      objectChangeId: "71000000-0000-4000-8000-000000000004",
      objectId,
      beforeState: { object: object(240), orderIndex: 0 },
      afterState: { object: null, orderIndex: null },
      affectedFields: ["object", "orderIndex"],
    });
    Y.applyUpdate(document, decision.update);
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      id: objectId,
      text: "Evidence",
    });
    expect(decision).toMatchObject({ status: "applied", conflicts: [] });
  });

  it("preserves a human-modified AI-created object and reports the collision", () => {
    const document = createProductCanvasDocument(canvasId);
    putCanvasObjectV2(document, object(240, "Human adopted this object"));
    const decision = buildDiscardReviewUpdate({
      document,
      objectChangeId: "71000000-0000-4000-8000-000000000005",
      objectId,
      beforeState: { object: null, orderIndex: null },
      afterState: { object: object(240), orderIndex: 0 },
      affectedFields: ["object", "orderIndex"],
    });
    expect(decision.conflicts).toContain(`${objectId}:changed`);
    expect(readCanvasObjectV2(document, objectId)).toMatchObject({
      text: "Human adopted this object",
    });
  });
});

describe("AI organization persistence and undo", () => {
  it("groups, ungroups, and reverses both membership and group records", async () => {
    const document = createProductCanvasDocument(canvasId);
    const secondId = "61000000-0000-4000-8000-000000000002";
    putCanvasObjectV2(document, object(0));
    putCanvasObjectV2(document, { ...object(220), id: secondId });
    const before = listCanvasObjectsV2(document).map((o) => ({
      ...o,
      groupId: o.groupId ?? null,
    }));
    const args = {
      action: "group",
      objectIds: [objectId, secondId],
      parentId: null,
      summary: "Group the pair",
    };
    const input = {
      arguments: args,
      objects: listCanvasObjectsV2(document),
      runId: canvasId,
      callKey: "group",
    };
    const grouped = await organizeCanvasCommands(input);
    expect(await organizeCanvasCommands(input)).toEqual(grouped);
    const stage = validateCanvasReviewStage({
      document,
      canvasId,
      actorId: canvasId,
      commands: grouped.commands,
    });
    Y.applyUpdate(document, stage.tentativeUpdate);
    expect(listCanvasGroupsV2(document)).toHaveLength(1);
    const groupId = listCanvasGroupsV2(document)[0].id;
    expect(
      listCanvasObjectsV2(document).every((o) => o.groupId === groupId),
    ).toBe(true);
    const ungrouped = await organizeCanvasCommands({
      ...input,
      objects: listCanvasObjectsV2(document),
      arguments: { ...args, action: "ungroup" },
    });
    const ungroupStage = validateCanvasReviewStage({
      document,
      canvasId,
      actorId: canvasId,
      commands: ungrouped.commands,
    });
    Y.applyUpdate(document, ungroupStage.tentativeUpdate);
    expect(listCanvasGroupsV2(document)).toHaveLength(0);
    const undoStage = (value: typeof stage) =>
      buildUndoAiChangeSetUpdate({
        document,
        organizationHistory: value.organizationHistory,
        objectChanges: value.objectChanges.map((c, i) => ({
          ...c,
          id: String(i),
        })),
      });
    const undoUngroup = undoStage(ungroupStage);
    expect(undoUngroup.conflicts).toEqual([]);
    Y.applyUpdate(document, undoUngroup.update);
    expect(listCanvasGroupsV2(document)).toHaveLength(1);
    const undoGroup = undoStage(stage);
    expect(undoGroup.conflicts).toEqual([]);
    Y.applyUpdate(document, undoGroup.update);
    expect(listCanvasGroupsV2(document)).toHaveLength(0);
    expect(
      listCanvasObjectsV2(document).map((o) => ({
        ...o,
        groupId: o.groupId ?? null,
      })),
    ).toEqual(before);
  });
  it("preserves the whole organization when a member was regrouped later", async () => {
    const document = createProductCanvasDocument(canvasId);
    const secondId = "61000000-0000-4000-8000-000000000002";
    putCanvasObjectV2(document, object(0));
    putCanvasObjectV2(document, { ...object(220), id: secondId });
    const organized = await organizeCanvasCommands({
      arguments: {
        action: "group",
        objectIds: [objectId, secondId],
        parentId: null,
        summary: "Group pair",
      },
      objects: listCanvasObjectsV2(document),
      runId: canvasId,
      callKey: "group",
    });
    const stage = validateCanvasReviewStage({
      document,
      canvasId,
      actorId: canvasId,
      commands: organized.commands,
    });
    Y.applyUpdate(document, stage.tentativeUpdate);
    setCanvasObjectField(document, objectId, ["groupId"], null);
    const before = Y.encodeStateAsUpdate(document);
    const undo = buildUndoAiChangeSetUpdate({
      document,
      organizationHistory: stage.organizationHistory,
      objectChanges: stage.objectChanges.map((c, i) => ({
        ...c,
        id: String(i),
      })),
    });
    expect(undo.conflicts).not.toEqual([]);
    Y.applyUpdate(document, undo.update);
    expect(Y.encodeStateAsUpdate(document)).toEqual(before);
    expect(listCanvasGroupsV2(document)).toHaveLength(1);
  });
});

it("nests and detaches a child using canonical commands and restores its parent on undo", async () => {
  const document = createProductCanvasDocument(canvasId);
  const parentId = "61000000-0000-4000-8000-000000000003";
  putCanvasObjectV2(document, {
    ...object(-100),
    id: parentId,
    geometry: { x: -100, y: -100, width: 600, height: 400, rotation: 0 },
  });
  putCanvasObjectV2(document, object(0));
  const organize = async (action: string) => {
    const result = await organizeCanvasCommands({
      arguments: {
        action,
        objectIds: [objectId],
        parentId: action === "nest" ? parentId : null,
        summary: action,
      },
      objects: listCanvasObjectsV2(document),
      runId: canvasId,
      callKey: action,
    });
    const stage = validateCanvasReviewStage({
      document,
      canvasId,
      actorId: canvasId,
      commands: result.commands,
    });
    Y.applyUpdate(document, stage.tentativeUpdate);
    return stage;
  };
  await organize("nest");
  expect(readCanvasObjectV2(document, objectId)).toMatchObject({ parentId });
  const detached = await organize("detach");
  expect(readCanvasObjectV2(document, objectId)).toMatchObject({
    parentId: null,
  });
  const undo = buildUndoAiChangeSetUpdate({
    document,
    objectChanges: detached.objectChanges.map((c, i) => ({
      ...c,
      id: String(i),
    })),
  });
  expect(undo.conflicts).toEqual([]);
  Y.applyUpdate(document, undo.update);
  expect(readCanvasObjectV2(document, objectId)).toMatchObject({ parentId });
});

it("places an outside child inside a rotated parent and undoes placement with the relationship", async () => {
  const document = createProductCanvasDocument(canvasId);
  const parentId = "61000000-0000-4000-8000-000000000003";
  putCanvasObjectV2(document, {
    ...object(-100),
    id: parentId,
    geometry: { x: -100, y: -100, width: 300, height: 240, rotation: 25 },
  });
  putCanvasObjectV2(document, {
    ...object(900),
    geometry: {
      x: 900,
      y: 700,
      width: 180,
      height: 96,
      rotation: 10,
      flipX: true,
    },
  });
  const before = readCanvasObjectV2(document, objectId)!.geometry;
  const result = await organizeCanvasCommands({
    arguments: {
      action: "nest",
      objectIds: [objectId],
      parentId,
      summary: "Put the child inside its parent",
    },
    objects: listCanvasObjectsV2(document),
    runId: canvasId,
    callKey: "nest-outside",
  });
  const stage = validateCanvasReviewStage({
    document,
    canvasId,
    actorId: canvasId,
    commands: result.commands,
  });
  Y.applyUpdate(document, stage.tentativeUpdate);
  expect(readCanvasObjectV2(document, objectId)).toMatchObject({ parentId });
  expect(readCanvasObjectV2(document, objectId)!.geometry.x).not.toBe(before.x);
  const undo = buildUndoAiChangeSetUpdate({
    document,
    objectChanges: stage.objectChanges.map((c, i) => ({ ...c, id: String(i) })),
  });
  expect(undo.conflicts).toEqual([]);
  Y.applyUpdate(document, undo.update);
  expect(readCanvasObjectV2(document, objectId)!.geometry).toEqual(before);
  expect(
    (readCanvasObjectV2(document, objectId) as { parentId?: string | null })
      .parentId ?? null,
  ).toBeNull();
});

it("moves a complete group into a parent and reverses its frame and member placement together", async () => {
  const document = createProductCanvasDocument(canvasId);
  const secondId = "61000000-0000-4000-8000-000000000002",
    parentId = "61000000-0000-4000-8000-000000000003";
  putCanvasObjectV2(document, object(800));
  putCanvasObjectV2(document, { ...object(1000), id: secondId });
  putCanvasObjectV2(document, {
    ...object(0),
    id: parentId,
    geometry: { x: 0, y: 0, width: 500, height: 400, rotation: 0 },
  });
  const stageAction = async (
    action: string,
    ids: string[],
    parent: string | null,
  ) => {
    const result = await organizeCanvasCommands({
      arguments: { action, objectIds: ids, parentId: parent, summary: action },
      objects: listCanvasObjectsV2(document),
      groups: listCanvasGroupsV2(document),
      runId: canvasId,
      callKey: action,
    });
    const stage = validateCanvasReviewStage({
      document,
      canvasId,
      actorId: canvasId,
      commands: result.commands,
    });
    Y.applyUpdate(document, stage.tentativeUpdate);
    return stage;
  };
  await stageAction("group", [objectId, secondId], null);
  const before = listCanvasGroupsV2(document);
  const stage = await stageAction("nest", [objectId], parentId);
  expect(listCanvasGroupsV2(document)[0]).toMatchObject({ parentId });
  const undo = buildUndoAiChangeSetUpdate({
    document,
    organizationHistory: stage.organizationHistory,
    objectChanges: stage.objectChanges.map((c, i) => ({ ...c, id: String(i) })),
  });
  expect(undo.conflicts).toEqual([]);
  Y.applyUpdate(document, undo.update);
  expect(listCanvasGroupsV2(document)).toEqual(before);
  expect(readCanvasObjectV2(document, objectId)!.geometry.x).toBe(800);
});
