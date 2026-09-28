import * as Y from "yjs";
import { expect, it } from "vitest";
import {
  createProductCanvasDocument,
  migrateLegacyShapeLabels,
  listCanvasObjectsV2,
  projectCanvasCompositions,
  isIntrinsicShapeLabel,
  setCanvasObjectField,
} from "@/canvas/canvas-document";
import { materializeReviewNewShapes } from "./new-shape-stage";
import { validateCanvasReviewStage } from "./proposals";
import { buildUndoAiChangeSetUpdate } from "./review-state";
const canvasId = "20000000-0000-4000-8000-000000000001",
  actorId = "10000000-0000-4000-8000-000000000001",
  runId = "80000000-0000-4000-8000-000000000001";
it("creates Scotty, formats the visible migrated label, persists and undoes typography", async () => {
  const document = createProductCanvasDocument(canvasId);
  const created = await materializeReviewNewShapes({
    canvasId,
    actorId,
    runId,
    callKey: "create-scotty",
    arguments: {
      summary: "Create Scotty",
      shapes: [
        {
          key: "scotty",
          shape: "rounded-rectangle",
          layer: "front",
          text: "Scotty",
          x: 0,
          y: 0,
          width: 220,
          height: 80,
          fill: "#86efac",
          outline: "#15803d",
          outlineWidth: 2,
          fontFamily: "Inter",
          fontSize: 16,
          fontWeight: "normal",
          textAlign: "center",
          textColor: "#14532d",
        },
      ],
      explanations: [
        { key: "scotty", whatChanged: "Create Scotty", why: "Requested" },
      ],
    },
  });
  Y.applyUpdate(
    document,
    validateCanvasReviewStage({
      document,
      canvasId,
      actorId,
      commands: created.commands,
    }).tentativeUpdate,
  );
  migrateLegacyShapeLabels(document);
  const shape = projectCanvasCompositions(listCanvasObjectsV2(document))[0];
  expect(shape.type === "shape" && shape.text).toBe("Scotty");
  const stage = validateCanvasReviewStage({
    document,
    canvasId,
    actorId,
    commands: [
      {
        type: "object.style",
        payload: { objectId: shape.id, style: { fontWeight: "bold" } },
      },
    ],
  });
  Y.applyUpdate(document, stage.tentativeUpdate);
  const restored = createProductCanvasDocument(canvasId);
  Y.applyUpdate(restored, Y.encodeStateAsUpdate(document));
  const label = listCanvasObjectsV2(restored).find(isIntrinsicShapeLabel)!;
  expect(label.style.fontWeight).toBe("bold");
  expect(
    projectCanvasCompositions(listCanvasObjectsV2(restored))[0].style
      .fontWeight,
  ).toBe("bold");
  // An unrelated fill change must survive typography undo.
  setCanvasObjectField(restored, shape.id, ["style", "fill"], "#bfdbfe");
  const undo = buildUndoAiChangeSetUpdate({
    document: restored,
    objectChanges: stage.objectChanges.map((c) => ({
      ...c,
      id: crypto.randomUUID(),
    })),
  });
  expect(undo.conflicts).toEqual([]);
  Y.applyUpdate(restored, undo.update);
  expect(
    listCanvasObjectsV2(restored).find(isIntrinsicShapeLabel)!.style.fontWeight,
  ).toBe("normal");
  expect(
    projectCanvasCompositions(listCanvasObjectsV2(restored))[0].style.fill,
  ).toBe("#bfdbfe");
});
