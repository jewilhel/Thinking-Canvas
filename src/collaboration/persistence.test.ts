// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  applyCanvasUpdate,
  createCanvasDocument,
  encodeCanvasState,
  hashCanvasState,
  listCanvasObjects,
  putCanvasObject,
} from "@/collaboration/canvas-document";
import {
  buildCompactedSnapshot,
  loadCanvasWithOverlap,
  type CanvasDurabilityRepository,
  type CanvasSnapshot,
  type SequencedCanvasUpdate,
} from "@/collaboration/persistence";
import { captureUpdate, shape } from "@/collaboration/test-fixtures";

const canvasId = "20000000-0000-4000-8000-000000000001";

function updateFixture() {
  const source = createCanvasDocument();
  const first = captureUpdate(source, () =>
    putCanvasObject(
      source,
      shape("50000000-0000-4000-8000-000000000001", "Persisted"),
    ),
  );
  const second = captureUpdate(source, () =>
    putCanvasObject(
      source,
      shape("50000000-0000-4000-8000-000000000002", "During load"),
    ),
  );
  return { source, first, second };
}

describe("overlap-safe canvas persistence", () => {
  it("deduplicates a live update that overlaps the durable fetch", async () => {
    const { first, second } = updateFixture();
    let listener: ((update: SequencedCanvasUpdate) => void) | undefined;
    const repository: CanvasDurabilityRepository = {
      getLatestSnapshot: async () => null,
      getUpdatesAfter: async () => {
        listener?.({ sequence: 2, update: second });
        return [
          { sequence: 1, update: first },
          { sequence: 2, update: second },
        ];
      },
      getHeadSequence: async () => 2,
      subscribe: async (_canvasId, onUpdate) => {
        listener = onUpdate;
        return async () => undefined;
      },
    };

    const loaded = await loadCanvasWithOverlap(repository, canvasId);

    expect(loaded.lastSequence).toBe(2);
    expect(
      listCanvasObjects(loaded.document).map((object) =>
        "text" in object ? object.text : object.type,
      ),
    ).toEqual(["Persisted", "During load"]);
  });

  it("retries from a newer snapshot when compaction races the load", async () => {
    const { source, first, second } = updateFixture();
    const state = encodeCanvasState(source);
    const compacted: CanvasSnapshot = {
      version: 1,
      lastSequence: 2,
      state,
      stateHash: await hashCanvasState(source),
    };
    let snapshotReads = 0;
    const repository: CanvasDurabilityRepository = {
      getLatestSnapshot: async () => {
        snapshotReads += 1;
        return snapshotReads === 1 ? null : compacted;
      },
      getUpdatesAfter: async (_canvasId, sequence) =>
        sequence === 0 ? [{ sequence: 2, update: second }] : [],
      getHeadSequence: async () => 2,
      subscribe: async () => async () => undefined,
    };

    const loaded = await loadCanvasWithOverlap(repository, canvasId);

    expect(snapshotReads).toBe(2);
    expect(loaded.lastSequence).toBe(2);
    expect(listCanvasObjects(loaded.document)).toHaveLength(2);
    expect(first.byteLength).toBeGreaterThan(0);
  });

  it("produces an equivalent snapshot and tolerates repeated updates", async () => {
    const { source, first, second } = updateFixture();
    const compacted = await buildCompactedSnapshot(null, [
      { sequence: 2, update: second },
      { sequence: 1, update: first },
      { sequence: 1, update: first },
    ]);
    const restored = createCanvasDocument();
    applyCanvasUpdate(restored, compacted.state);

    expect(compacted.lastSequence).toBe(2);
    expect(compacted.stateHash).toBe(await hashCanvasState(source));
    expect(await hashCanvasState(restored)).toBe(await hashCanvasState(source));
  });
});
