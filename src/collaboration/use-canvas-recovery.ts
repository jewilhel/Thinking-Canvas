"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";

import { base64ToBytes, bytesToBase64 } from "@/collaboration/canvas-document";
import {
  onLocalDocumentAwareness,
  receiveRemoteDocumentAwareness,
} from "@/collaboration/document-awareness-bridge";
import {
  enqueuePendingCanvasUpdate,
  pendingCanvasUpdateKey,
  readPendingCanvasUpdates,
  writePendingCanvasUpdates,
  type PendingCanvasUpdate,
} from "@/collaboration/pending-update-store";
import {
  loadCanvasWithOverlap,
  type LoadedCanvas,
} from "@/collaboration/persistence";
import {
  SupabaseCanvasRepository,
  type CursorPayload,
} from "@/collaboration/supabase-repository";
import { createClient } from "@/lib/supabase/client";

export type CanvasSaveStatus =
  | "Loading…"
  | "Saved"
  | "Saving…"
  | "Reconnecting…"
  | "Unsynced"
  | "Retrying…"
  | "Failed";

const remoteOrigin = "canvas.remote";
const maximumAutomaticAttempts = 5;

type Participant = {
  userId: string;
  connectedAt: string;
  selectedObjectIds: string[];
};

export function useCanvasRecovery({
  canvasId,
  document,
  selectedObjectIds,
  supabasePublishableKey,
  supabaseUrl,
  userId,
}: {
  canvasId: string;
  document: Y.Doc;
  selectedObjectIds: string[];
  supabasePublishableKey: string;
  supabaseUrl: string;
  userId: string;
}) {
  const key = pendingCanvasUpdateKey(userId, canvasId);
  const repositoryRef = useRef<SupabaseCanvasRepository | null>(null);
  const loadedRef = useRef<LoadedCanvas | null>(null);
  const pendingRef = useRef<PendingCanvasUpdate[]>([]);
  const flushingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconciliationRef = useRef(false);
  const lastSequenceRef = useRef(0);
  const appliedSequencesRef = useRef(new Set<number>());
  const connectionGenerationRef = useRef(0);
  const dependencyChainQueuedRef = useRef(false);
  const activeRef = useRef(true);
  const [status, setStatus] = useState<CanvasSaveStatus>("Loading…");
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSequence, setLastSequence] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<CursorPayload[]>([]);
  const [publishedCursorCount, setPublishedCursorCount] = useState(0);
  const [attemptedCursorCount, setAttemptedCursorCount] = useState(0);
  const [cursorPublishStatus, setCursorPublishStatus] = useState("idle");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const cursorSequenceRef = useRef(0);
  const lastCursorSentAtRef = useRef(Number.NEGATIVE_INFINITY);
  const remoteCursorSequencesRef = useRef(new Map<string, number>());

  const persistPending = useCallback(
    (updates: PendingCanvasUpdate[]) => {
      pendingRef.current = updates;
      writePendingCanvasUpdates(window.localStorage, key, updates);
      setPendingCount(updates.length);
    },
    [key],
  );

  const markSequenceApplied = useCallback((sequence: number) => {
    appliedSequencesRef.current.add(sequence);
    while (appliedSequencesRef.current.has(lastSequenceRef.current + 1)) {
      appliedSequencesRef.current.delete(lastSequenceRef.current + 1);
      lastSequenceRef.current += 1;
    }
    setLastSequence(lastSequenceRef.current);
  }, []);

  const flushPending = useCallback(async () => {
    const repository = repositoryRef.current;
    if (!repository || flushingRef.current || !navigator.onLine) return;
    flushingRef.current = true;

    try {
      while (activeRef.current && pendingRef.current.length) {
        const next = pendingRef.current[0];
        if (!next) break;
        setStatus(next.attempts ? "Retrying…" : "Saving…");
        try {
          const sequence = await repository.appendAndBroadcast(
            canvasId,
            next.id,
            base64ToBytes(next.update),
          );
          markSequenceApplied(sequence);
          persistPending(pendingRef.current.filter(({ id }) => id !== next.id));
        } catch {
          const attempts = next.attempts + 1;
          persistPending([
            { ...next, attempts },
            ...pendingRef.current.slice(1),
          ]);
          setStatus(
            attempts >= maximumAutomaticAttempts ? "Failed" : "Unsynced",
          );
          if (attempts < maximumAutomaticAttempts) {
            const delay = Math.min(8_000, 500 * 2 ** (attempts - 1));
            retryTimerRef.current = setTimeout(
              () => void flushPending(),
              delay,
            );
          }
          return;
        }
      }
      if (!pendingRef.current.length) setStatus("Saved");
    } finally {
      flushingRef.current = false;
    }
  }, [canvasId, markSequenceApplied, persistPending]);

  const connect = useCallback(async () => {
    if (!activeRef.current || !navigator.onLine) {
      setStatus(pendingRef.current.length ? "Unsynced" : "Reconnecting…");
      return;
    }

    const generation = connectionGenerationRef.current + 1;
    connectionGenerationRef.current = generation;
    setStatus(pendingRef.current.length ? "Retrying…" : "Reconnecting…");
    await loadedRef.current?.disconnect();
    if (!activeRef.current || generation !== connectionGenerationRef.current)
      return;
    loadedRef.current = null;

    const repository = new SupabaseCanvasRepository(
      createClient({
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
      }),
      userId,
      (nextParticipants) => {
        setParticipants(nextParticipants);
        const presentUserIds = new Set(
          nextParticipants.map((participant) => participant.userId),
        );
        setRemoteCursors((current) =>
          current.filter((cursor) => presentUserIds.has(cursor.userId)),
        );
      },
      (connectionStatus) => {
        if (connectionStatus === "SUBSCRIBED") return;
        if (
          connectionStatus === "CHANNEL_ERROR" ||
          connectionStatus === "TIMED_OUT"
        ) {
          setStatus(pendingRef.current.length ? "Unsynced" : "Reconnecting…");
        }
      },
      (cursor) => {
        const previous =
          remoteCursorSequencesRef.current.get(cursor.userId) ?? 0;
        if (cursor.sequence <= previous) return;
        remoteCursorSequencesRef.current.set(cursor.userId, cursor.sequence);
        setRemoteCursors((current) => [
          ...current.filter(({ userId }) => userId !== cursor.userId),
          cursor,
        ]);
      },
      (scopeId, update) =>
        receiveRemoteDocumentAwareness(document, scopeId, update),
    );
    repositoryRef.current = repository;

    try {
      const loaded = await loadCanvasWithOverlap(
        repository,
        canvasId,
        (update) => {
          Y.applyUpdate(document, update.update, remoteOrigin);
          markSequenceApplied(update.sequence);
        },
      );
      if (!activeRef.current) {
        await loaded.disconnect();
        return;
      }
      if (generation !== connectionGenerationRef.current) {
        await loaded.disconnect();
        return;
      }

      const localSeed =
        pendingRef.current.length === 0 && loaded.lastSequence === 0
          ? Y.encodeStateAsUpdate(
              document,
              Y.encodeStateVector(loaded.document),
            )
          : null;
      Y.applyUpdate(
        document,
        Y.encodeStateAsUpdate(loaded.document),
        remoteOrigin,
      );
      loadedRef.current = loaded;
      lastSequenceRef.current = loaded.lastSequence;
      appliedSequencesRef.current.clear();
      setLastSequence(loaded.lastSequence);

      if (localSeed && localSeed.byteLength > 2) {
        persistPending(
          enqueuePendingCanvasUpdate(pendingRef.current, {
            id: crypto.randomUUID(),
            update: bytesToBase64(localSeed),
          }),
        );
      }
      await flushPending();
      if (!pendingRef.current.length) setStatus("Saved");
    } catch {
      if (generation !== connectionGenerationRef.current) return;
      repositoryRef.current = null;
      setStatus(pendingRef.current.length ? "Unsynced" : "Reconnecting…");
      reconnectTimerRef.current = setTimeout(
        () => setReconnectAttempt((current) => current + 1),
        2_000,
      );
    }
  }, [
    canvasId,
    document,
    flushPending,
    markSequenceApplied,
    persistPending,
    supabasePublishableKey,
    supabaseUrl,
    userId,
  ]);

  useEffect(() => {
    activeRef.current = true;
    pendingRef.current = readPendingCanvasUpdates(window.localStorage, key);
    setPendingCount(pendingRef.current.length);

    const onDocumentUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === remoteOrigin) return;
      const durableUpdate = dependencyChainQueuedRef.current
        ? update
        : Y.encodeStateAsUpdate(document);
      dependencyChainQueuedRef.current = true;
      persistPending(
        enqueuePendingCanvasUpdate(pendingRef.current, {
          id: crypto.randomUUID(),
          // The first queued edit includes this client's complete dependency
          // chain. Later transaction updates can then remain incremental.
          update: bytesToBase64(durableUpdate),
        }),
      );
      if (!navigator.onLine) setStatus("Unsynced");
      void flushPending();
    };
    const onOffline = () =>
      setStatus(pendingRef.current.length ? "Unsynced" : "Reconnecting…");
    const onOnline = () => void connect();
    const protectUnsynced = (event: BeforeUnloadEvent) => {
      if (!pendingRef.current.length) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const protectNavigation = (event: MouseEvent) => {
      if (!pendingRef.current.length) return;
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (
        anchor &&
        !window.confirm(
          "Changes are still waiting to sync. Leave this canvas anyway?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const protectSubmit = (event: SubmitEvent) => {
      if (!pendingRef.current.length) return;
      if (
        !window.confirm(
          "Changes are still waiting to sync. Continue and risk leaving them behind?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.on("update", onDocumentUpdate);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", protectUnsynced);
    window.document.addEventListener("click", protectNavigation, true);
    window.document.addEventListener("submit", protectSubmit, true);
    const reconciliationTimer = setInterval(async () => {
      const repository = repositoryRef.current;
      if (!repository || !navigator.onLine || reconciliationRef.current) return;
      reconciliationRef.current = true;
      try {
        const updates = await repository.getUpdatesAfter(
          canvasId,
          lastSequenceRef.current,
        );
        for (const update of updates) {
          Y.applyUpdate(document, update.update, remoteOrigin);
          markSequenceApplied(update.sequence);
        }
      } catch {
        // Realtime and the pending queue own visible recovery state.
      } finally {
        reconciliationRef.current = false;
      }
    }, 1_000);
    const removeDocumentAwarenessListener = onLocalDocumentAwareness(
      document,
      (scopeId, update) => {
        void repositoryRef.current?.broadcastDocumentAwareness(scopeId, update);
      },
    );
    void connect();

    return () => {
      activeRef.current = false;
      connectionGenerationRef.current += 1;
      document.off("update", onDocumentUpdate);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", protectUnsynced);
      window.document.removeEventListener("click", protectNavigation, true);
      window.document.removeEventListener("submit", protectSubmit, true);
      clearInterval(reconciliationTimer);
      removeDocumentAwarenessListener();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      void loadedRef.current?.disconnect();
    };
  }, [
    canvasId,
    connect,
    document,
    flushPending,
    key,
    markSequenceApplied,
    persistPending,
    reconnectAttempt,
  ]);

  useEffect(() => {
    void repositoryRef.current?.updatePresence(selectedObjectIds);
  }, [selectedObjectIds]);

  const publishCursor = useCallback(
    (point: { x: number; y: number }) => {
      const repository = repositoryRef.current;
      if (!repository) {
        setCursorPublishStatus("unavailable");
        return;
      }
      const now = performance.now();
      if (now - lastCursorSentAtRef.current < 125) return;
      lastCursorSentAtRef.current = now;
      cursorSequenceRef.current += 1;
      setAttemptedCursorCount((count) => count + 1);
      setPublishedCursorCount((count) => count + 1);
      setCursorPublishStatus("sent");
      void repository.broadcastCursor({
        userId,
        sequence: cursorSequenceRef.current,
        x: point.x,
        y: point.y,
      });
    },
    [userId],
  );

  return {
    status,
    pendingCount,
    lastSequence,
    participants,
    remoteCursors,
    publishedCursorCount,
    attemptedCursorCount,
    cursorPublishStatus,
    publishCursor,
    retry: connect,
  };
}
