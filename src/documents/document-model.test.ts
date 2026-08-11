// @vitest-environment node

import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  listDocumentInternalObjects,
  putDocumentInternalObject,
} from "@/documents/document-model";

const internal = {
  schemaVersion: 1 as const,
  id: "80000000-0000-4000-8000-000000000001",
  documentId: "70000000-0000-4000-8000-000000000001",
  type: "shape" as const,
  text: "Internal evidence",
  x: 24,
  y: 120,
  width: 160,
  height: 72,
};

describe("document-internal objects", () => {
  it("converges through Yjs while excluding parent-canvas attachment fields", () => {
    const source = new Y.Doc();
    putDocumentInternalObject(source, internal);
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(source));

    expect(listDocumentInternalObjects(peer)).toEqual([internal]);
    expect(listDocumentInternalObjects(peer)[0]).not.toHaveProperty("canvasId");
    expect(listDocumentInternalObjects(peer)[0]).not.toHaveProperty(
      "startObjectId",
    );
  });

  it("rejects an internal object that attempts to carry a parent canvas id", () => {
    expect(() =>
      putDocumentInternalObject(new Y.Doc(), {
        ...internal,
        canvasId: "20000000-0000-4000-8000-000000000001",
      } as typeof internal),
    ).toThrow();
  });
});
