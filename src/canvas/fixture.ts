import type { CanvasObject } from "@/domain/canvas-object";

export const spikeCanvasId = "20000000-0000-4000-8000-000000000001";
export const spikeActorId = "10000000-0000-4000-8000-000000000001";
export const spikeDocumentId = "70000000-0000-4000-8000-000000000001";
const fixtureTimestamp = "2026-08-11T00:00:00.000Z";

function objectId(index: number) {
  return `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function documentId(index: number) {
  return `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function geometry(index: number) {
  const column = index % 40;
  const row = Math.floor(index / 40);
  return {
    x: column * 190,
    y: row * 130,
    width: 150,
    height: 86,
    rotation: 0,
  };
}

function base(index: number) {
  return {
    schemaVersion: 1 as const,
    id: objectId(index),
    canvasId: spikeCanvasId,
    createdBy: spikeActorId,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
    geometry: geometry(index),
  };
}

export function createMixedCanvasFixture(count = 1_000): CanvasObject[] {
  if (count < 2)
    throw new Error("The mixed fixture requires at least two objects.");
  const attachedCount = Math.floor(count * 0.8);
  const objects: CanvasObject[] = [];

  for (let index = 0; index < attachedCount; index += 1) {
    const kind = index % 4;
    const shared = base(index);
    if (kind === 0) {
      objects.push({
        ...shared,
        type: "shape",
        shape: index % 8 === 0 ? "ellipse" : "rectangle",
        text: `Idea ${index + 1}`,
      });
    } else if (kind === 1) {
      objects.push({ ...shared, type: "text", text: `Evidence ${index + 1}` });
    } else if (kind === 2) {
      objects.push({
        ...shared,
        type: "table",
        cells: [[`Signal ${index + 1}`, "Ready"]],
      });
    } else {
      objects.push({
        ...shared,
        type: "document",
        documentId: index === 3 ? spikeDocumentId : documentId(index),
        title: index === 3 ? "Focused research note" : `Document ${index + 1}`,
      });
    }
  }

  for (let index = attachedCount; index < count; index += 1) {
    const startIndex = (index - attachedCount) % attachedCount;
    const endIndex = (startIndex + 1) % attachedCount;
    const start = objects[startIndex];
    const end = objects[endIndex];
    if (!start || !end) throw new Error("Connector fixture target is missing.");
    objects.push({
      ...base(index),
      type: "connector",
      startObjectId: start.id,
      endObjectId: end.id,
      points: [
        start.geometry.x,
        start.geometry.y,
        end.geometry.x,
        end.geometry.y,
      ],
    });
  }

  return objects;
}
