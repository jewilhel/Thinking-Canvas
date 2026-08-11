import * as Y from "yjs";

import {
  applyCanvasUpdate,
  createCanvasDocument,
  encodeCanvasState,
  hashBytes,
} from "@/collaboration/canvas-document";

export type SequencedCanvasUpdate = {
  sequence: number;
  update: Uint8Array;
};

export type CanvasSnapshot = {
  version: number;
  lastSequence: number;
  state: Uint8Array;
  stateHash: string;
};

export interface CanvasDurabilityRepository {
  getLatestSnapshot(canvasId: string): Promise<CanvasSnapshot | null>;
  getUpdatesAfter(
    canvasId: string,
    sequence: number,
  ): Promise<SequencedCanvasUpdate[]>;
  getHeadSequence(canvasId: string): Promise<number>;
  subscribe(
    canvasId: string,
    onUpdate: (update: SequencedCanvasUpdate) => void,
  ): Promise<() => Promise<void>>;
}

export type LoadedCanvas = {
  document: Y.Doc;
  lastSequence: number;
  disconnect: () => Promise<void>;
};

export async function buildCompactedSnapshot(
  snapshot: CanvasSnapshot | null,
  updates: SequencedCanvasUpdate[],
) {
  const document = createCanvasDocument();
  if (snapshot) applyCanvasUpdate(document, snapshot.state);

  for (const update of [...updates].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    if (!snapshot || update.sequence > snapshot.lastSequence) {
      applyCanvasUpdate(document, update.update);
    }
  }

  const state = encodeCanvasState(document);
  return {
    document,
    state,
    stateHash: await hashBytes(state),
    lastSequence: Math.max(
      snapshot?.lastSequence ?? 0,
      ...updates.map(({ sequence }) => sequence),
    ),
  };
}

function isContiguous(updates: SequencedCanvasUpdate[], after: number) {
  const sequences = [...new Set(updates.map(({ sequence }) => sequence))].sort(
    (left, right) => left - right,
  );
  return sequences.every((sequence, index) => sequence === after + index + 1);
}

export async function loadCanvasWithOverlap(
  repository: CanvasDurabilityRepository,
  canvasId: string,
  onLiveUpdate?: (update: SequencedCanvasUpdate) => void,
): Promise<LoadedCanvas> {
  const pending: SequencedCanvasUpdate[] = [];
  let loaded = false;
  let document = createCanvasDocument();
  let lastSequence = 0;

  const disconnect = await repository.subscribe(canvasId, (update) => {
    if (!loaded) {
      pending.push(update);
      return;
    }

    applyCanvasUpdate(document, update.update);
    lastSequence = Math.max(lastSequence, update.sequence);
    onLiveUpdate?.(update);
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    document = createCanvasDocument();
    const snapshot = await repository.getLatestSnapshot(canvasId);
    const snapshotSequence = snapshot?.lastSequence ?? 0;

    if (snapshot) applyCanvasUpdate(document, snapshot.state);

    const durableUpdates = await repository.getUpdatesAfter(
      canvasId,
      snapshotSequence,
    );
    const combinedUpdates = [...durableUpdates, ...pending]
      .filter(({ sequence }) => sequence > snapshotSequence)
      .sort((left, right) => left.sequence - right.sequence);
    const uniqueUpdates = combinedUpdates.filter(
      (update, index) =>
        index === 0 || update.sequence !== combinedUpdates[index - 1]?.sequence,
    );
    const headSequence = await repository.getHeadSequence(canvasId);

    if (
      !isContiguous(uniqueUpdates, snapshotSequence) ||
      (uniqueUpdates.at(-1)?.sequence ?? snapshotSequence) < headSequence
    ) {
      continue;
    }

    for (const update of uniqueUpdates) {
      applyCanvasUpdate(document, update.update);
    }
    lastSequence = Math.max(
      snapshotSequence,
      uniqueUpdates.at(-1)?.sequence ?? 0,
    );
    loaded = true;
    pending.length = 0;

    return {
      get document() {
        return document;
      },
      get lastSequence() {
        return lastSequence;
      },
      disconnect,
    };
  }

  await disconnect();
  throw new Error("Canvas durability boundary changed repeatedly during load.");
}
