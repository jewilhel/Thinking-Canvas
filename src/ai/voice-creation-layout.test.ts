import { describe, expect, it } from "vitest";
import { createProductDocumentObject } from "@/documents/product-document";
import { prepareVoiceCreationCommands } from "./voice-creation-layout";
import { assertNoNewDeterministicVisualDefects } from "./visual-grounding";
const canvasId = "20000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000001";
function object(id: string) {
  return structuredClone(
    createProductDocumentObject({
      objectId: id,
      canvasId,
      actorId,
      issuedAt: "2026-09-14T16:00:00Z",
      title: "Partial transcript",
      geometry: { x: 0, y: 0, width: 100, height: 24, rotation: 15 },
    }),
  );
}
describe("voice creation layout", () => {
  it("repairs overlapping, clipped and low-contrast creations without changing existing content", () => {
    const existing = object("30000000-0000-4000-8000-000000000001");
    const newObject = object("30000000-0000-4000-8000-000000000002");
    newObject.style.fill = "#ffffff";
    newObject.style.textColor = "#ffffff";
    expect(() =>
      assertNoNewDeterministicVisualDefects({
        beforeObjects: [existing],
        afterObjects: [existing, newObject],
        targetObjectIds: [newObject.id],
      }),
    ).toThrow();
    const before = structuredClone(existing);
    const [creation] = prepareVoiceCreationCommands(
      [{ type: "object.create", payload: { object: newObject } }],
      [existing],
    );
    if (creation.type !== "object.create") throw new Error("Expected creation");
    expect(() =>
      assertNoNewDeterministicVisualDefects({
        beforeObjects: [existing],
        afterObjects: [existing, creation.payload.object],
        targetObjectIds: [newObject.id],
      }),
    ).not.toThrow();
    expect(existing).toEqual(before);
    expect(creation.payload.object.id).toBe(newObject.id);
    expect(creation.payload.object.type).toBe("document");
  });
  it("keeps valid requested placement and non-creation commands intact", () => {
    const existing = object("30000000-0000-4000-8000-000000000001");
    existing.geometry = {
      x: 300,
      y: 200,
      width: 440,
      height: 560,
      rotation: 0,
    };
    const create = {
      type: "object.create" as const,
      payload: { object: existing },
    };
    const remove = {
      type: "object.delete" as const,
      payload: { objectId: existing.id },
    };
    expect(prepareVoiceCreationCommands([create, remove], [])).toEqual([
      create,
      remove,
    ]);
  });
});
