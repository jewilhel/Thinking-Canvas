// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  enqueuePendingCanvasUpdate,
  readPendingCanvasUpdates,
  writePendingCanvasUpdates,
} from "@/collaboration/pending-update-store";

function storageFixture() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("pending canvas updates", () => {
  it("persists ordered idempotent update IDs and clears acknowledged work", () => {
    const storage = storageFixture();
    const key = "pending";
    const id = "30000000-0000-4000-8000-000000000001";
    const queued = enqueuePendingCanvasUpdate([], {
      id,
      update: "AQID",
      createdAt: "2026-08-11T20:00:00.000Z",
    });

    expect(enqueuePendingCanvasUpdate(queued, { id, update: "AQID" })).toEqual(
      queued,
    );
    writePendingCanvasUpdates(storage, key, queued);
    expect(readPendingCanvasUpdates(storage, key)).toEqual(queued);
    writePendingCanvasUpdates(storage, key, []);
    expect(readPendingCanvasUpdates(storage, key)).toEqual([]);
  });

  it("drops malformed local data instead of retrying unknown content", () => {
    const storage = storageFixture();
    storage.setItem("pending", JSON.stringify([{ id: "not-a-uuid" }]));
    expect(readPendingCanvasUpdates(storage, "pending")).toEqual([]);
    expect(storage.getItem("pending")).toBeNull();
  });
});
