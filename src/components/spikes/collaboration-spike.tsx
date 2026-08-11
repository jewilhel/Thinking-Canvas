"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";

import {
  hashCanvasState,
  listCanvasObjects,
  putCanvasObject,
} from "@/collaboration/canvas-document";
import {
  loadCanvasWithOverlap,
  type LoadedCanvas,
} from "@/collaboration/persistence";
import { SupabaseCanvasRepository } from "@/collaboration/supabase-repository";
import { Button } from "@/components/ui/button";
import type { CanvasObject } from "@/domain/canvas-object";
import { createClient } from "@/lib/supabase/client";

type Props = {
  canvasId: string;
  userId: string;
};

export function CollaborationSpike({ canvasId, userId }: Props) {
  const loadedRef = useRef<LoadedCanvas | null>(null);
  const repositoryRef = useRef<SupabaseCanvasRepository | null>(null);
  const [connection, setConnection] = useState("CONNECTING");
  const [participants, setParticipants] = useState(0);
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const [stateHash, setStateHash] = useState("loading");
  const [lastSequence, setLastSequence] = useState(0);
  const [message, setMessage] = useState("Loading durable canvas state…");

  const refreshEvidence = useCallback(async (loaded: LoadedCanvas) => {
    setObjects(listCanvasObjects(loaded.document));
    setStateHash(await hashCanvasState(loaded.document));
    setLastSequence(loaded.lastSequence);
  }, []);

  const disconnect = useCallback(async () => {
    await loadedRef.current?.disconnect();
    loadedRef.current = null;
    repositoryRef.current = null;
    setConnection("DISCONNECTED");
    setParticipants(0);
    setMessage("Realtime disconnected; durable state remains available.");
  }, []);

  const connect = useCallback(async () => {
    await loadedRef.current?.disconnect();
    setConnection("CONNECTING");
    setMessage("Subscribing before the durability load…");

    try {
      const repository = new SupabaseCanvasRepository(
        createClient(),
        userId,
        (presence) => setParticipants(presence.length),
        setConnection,
      );
      const loaded = await loadCanvasWithOverlap(
        repository,
        canvasId,
        async () => {
          if (loadedRef.current) await refreshEvidence(loadedRef.current);
        },
      );
      repositoryRef.current = repository;
      loadedRef.current = loaded;
      await refreshEvidence(loaded);
      setMessage("Snapshot and subsequent updates loaded without a gap.");
    } catch (error) {
      setConnection("ERROR");
      setMessage(error instanceof Error ? error.message : "Connection failed.");
    }
  }, [canvasId, refreshEvidence, userId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void connect();
    });
    return () => {
      cancelled = true;
      void loadedRef.current?.disconnect();
    };
  }, [connect]);

  async function addCard() {
    const loaded = loadedRef.current;
    const repository = repositoryRef.current;
    if (!loaded || !repository) return;

    const stateVector = Y.encodeStateVector(loaded.document);
    const now = new Date().toISOString();
    const objectNumber = listCanvasObjects(loaded.document).length + 1;
    putCanvasObject(loaded.document, {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      canvasId,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      type: "shape",
      shape: "rectangle",
      text: `Spike card ${objectNumber}`,
      geometry: {
        x: 40 + objectNumber * 16,
        y: 40 + objectNumber * 12,
        width: 180,
        height: 96,
        rotation: 0,
      },
    });
    const update = Y.encodeStateAsUpdate(loaded.document, stateVector);

    try {
      const sequence = await repository.appendAndBroadcast(canvasId, update);
      setObjects(listCanvasObjects(loaded.document));
      setStateHash(await hashCanvasState(loaded.document));
      setLastSequence(sequence);
      setMessage(`Durably appended and broadcast sequence ${sequence}.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The update could not be saved.",
      );
      await connect();
    }
  }

  async function compact() {
    setMessage("Reconstructing and verifying a compacted snapshot…");
    const response = await fetch("/api/spikes/collaboration/compact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ canvasId }),
    });
    const result = (await response.json()) as {
      error?: string;
      version?: number;
      last_sequence?: number;
      pruned_updates?: number;
    };

    if (!response.ok) {
      setMessage(result.error ?? "Compaction failed.");
      return;
    }

    await connect();
    setMessage(
      `Verified snapshot v${result.version} through sequence ${result.last_sequence}; pruned ${result.pruned_updates} covered updates.`,
    );
  }

  return (
    <section
      className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"
      aria-labelledby="collaboration-spike-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wider text-emerald-300 uppercase">
            Slice 3 live evidence
          </p>
          <h2
            id="collaboration-spike-title"
            className="mt-2 text-2xl font-semibold"
          >
            Collaboration durability
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            This removable harness uses a renderer-independent Yjs document, an
            authorized private channel, append-only updates, and verified
            snapshots.
          </p>
        </div>
        <span
          className="rounded-full border border-zinc-700 px-3 py-1 text-xs"
          data-testid="connection-status"
        >
          {connection}
        </span>
      </div>

      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-xl bg-zinc-950 p-3">
          <dt className="text-zinc-500">Objects</dt>
          <dd className="mt-1 text-xl" data-testid="object-count">
            {objects.length}
          </dd>
        </div>
        <div className="rounded-xl bg-zinc-950 p-3">
          <dt className="text-zinc-500">Durable sequence</dt>
          <dd className="mt-1 text-xl" data-testid="last-sequence">
            {lastSequence}
          </dd>
        </div>
        <div className="rounded-xl bg-zinc-950 p-3">
          <dt className="text-zinc-500">Present clients</dt>
          <dd className="mt-1 text-xl" data-testid="participant-count">
            {participants}
          </dd>
        </div>
        <div className="rounded-xl bg-zinc-950 p-3">
          <dt className="text-zinc-500">State hash</dt>
          <dd
            className="mt-1 truncate font-mono text-xs"
            data-testid="state-hash"
          >
            {stateHash}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => void addCard()}
          disabled={connection !== "SUBSCRIBED"}
        >
          Add durable card
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void disconnect()}
          disabled={connection === "DISCONNECTED"}
        >
          Disconnect realtime
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void connect()}
          disabled={connection === "CONNECTING"}
        >
          Reconnect and reload
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void compact()}
          disabled={lastSequence === 0}
        >
          Compact verified state
        </Button>
      </div>

      <p className="mt-5 text-sm text-zinc-300" role="status">
        {message}
      </p>
      <ul className="mt-4 space-y-2" aria-label="Durable canvas objects">
        {objects.map((object) => (
          <li
            key={object.id}
            className="rounded-lg border border-zinc-800 px-3 py-2 text-sm"
          >
            {"text" in object ? object.text : object.type}
          </li>
        ))}
      </ul>
    </section>
  );
}
