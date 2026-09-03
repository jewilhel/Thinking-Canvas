import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  broadcastLocalDocumentAwareness,
  onLocalDocumentAwareness,
  onRemoteDocumentAwareness,
  receiveRemoteDocumentAwareness,
} from "@/collaboration/document-awareness-bridge";

describe("document awareness bridge", () => {
  it("keeps ephemeral updates scoped to their canvas document and document id", () => {
    const canvasDocument = new Y.Doc();
    const otherCanvas = new Y.Doc();
    const local = vi.fn();
    const remote = vi.fn();
    const wrongCanvas = vi.fn();
    const stopLocal = onLocalDocumentAwareness(canvasDocument, local);
    const stopRemote = onRemoteDocumentAwareness(canvasDocument, remote);
    const stopWrongCanvas = onRemoteDocumentAwareness(otherCanvas, wrongCanvas);
    const update = new Uint8Array([1, 2, 3]);

    broadcastLocalDocumentAwareness(canvasDocument, "document-a", update);
    receiveRemoteDocumentAwareness(canvasDocument, "document-b", update);

    expect(local).toHaveBeenCalledWith("document-a", update);
    expect(remote).toHaveBeenCalledWith("document-b", update);
    expect(wrongCanvas).not.toHaveBeenCalled();

    stopLocal();
    stopRemote();
    stopWrongCanvas();
  });
});
