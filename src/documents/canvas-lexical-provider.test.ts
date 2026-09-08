import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  CanvasLexicalProvider,
  createCanvasLexicalProviderFactory,
} from "@/documents/canvas-lexical-provider";

const documentId = "70000000-0000-4000-8000-000000000001";

describe("canvas Lexical provider", () => {
  it("reuses the durable canvas Y.Doc without creating a second transport", () => {
    const canvasDocument = new Y.Doc();
    const documentMap = new Map<string, Y.Doc>();
    const provider = createCanvasLexicalProviderFactory(canvasDocument)(
      documentId,
      documentMap,
    );

    expect(provider).toBeInstanceOf(CanvasLexicalProvider);
    expect(documentMap.get(documentId)).toBe(canvasDocument);
  });

  it("reports Lexical lifecycle state without owning network synchronization", () => {
    const provider = new CanvasLexicalProvider(new Y.Doc());
    const onStatus = vi.fn();
    const onSync = vi.fn();
    provider.on("status", onStatus);
    provider.on("sync", onSync);

    provider.connect();
    provider.connect();
    provider.disconnect();

    expect(onSync).toHaveBeenCalledOnce();
    expect(onSync).toHaveBeenCalledWith(true);
    expect(onStatus.mock.calls).toEqual([
      [{ status: "connected" }],
      [{ status: "disconnected" }],
    ]);
  });
});
