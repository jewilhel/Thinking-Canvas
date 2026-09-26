import { describe, expect, it } from "vitest";
import {
  navigationForParticipant,
  validateCanvasNavigation,
} from "./canvas-navigation";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";
const shapeId = "61000000-0000-4000-8000-000000000001";
const documentId = "61000000-0000-4000-8000-000000000002";
const objects = [
  { id: shapeId, type: "shape" },
  { id: documentId, type: "document" },
] as CanvasObjectV2[];
describe("participant canvas navigation", () => {
  it("selects multiple existing objects and opens only documents", () => {
    expect(
      validateCanvasNavigation(
        { action: "select", objectIds: [shapeId, documentId] },
        objects,
      ).objectIds,
    ).toHaveLength(2);
    expect(
      validateCanvasNavigation(
        { action: "open_document", objectIds: [documentId] },
        objects,
      ).action,
    ).toBe("open_document");
    expect(() =>
      validateCanvasNavigation(
        { action: "open_document", objectIds: [shapeId] },
        objects,
      ),
    ).toThrow("one existing document");
    expect(() =>
      validateCanvasNavigation(
        { action: "select", objectIds: [shapeId, shapeId] },
        objects,
      ),
    ).toThrow("unique");
    expect(() =>
      validateCanvasNavigation(
        {
          action: "select",
          objectIds: ["61000000-0000-4000-8000-000000000003"],
        },
        objects,
      ),
    ).toThrow("no longer exists");
  });
  it("allows clearing selection and closing the current document", () => {
    for (const action of ["select", "close_document"])
      expect(
        validateCanvasNavigation({ action, objectIds: [] }, objects).objectIds,
      ).toEqual([]);
  });
  it("ignores another participant, incomplete runs, and historical commands", () => {
    const run = {
      status: "completed",
      requestedBy: "owner",
      updatedAt: "2026-09-14T18:00:00Z",
      navigation: [{ action: "select" as const, objectIds: [shapeId] }],
    };
    const since = Date.parse("2026-09-14T17:00:00Z");
    expect(navigationForParticipant(run, "owner", since)).toEqual(
      run.navigation,
    );
    expect(navigationForParticipant(run, "guest", since)).toEqual([]);
    expect(
      navigationForParticipant({ ...run, status: "running" }, "owner", since),
    ).toEqual([]);
    expect(navigationForParticipant(run, "owner", since + 7200000)).toEqual([]);
  });
});
