"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import {
  base64ToBytes,
  bytesToBase64,
  bytesToPostgresBytea,
  postgresByteaToBytes,
} from "@/collaboration/canvas-document";
import type {
  CanvasDurabilityRepository,
  SequencedCanvasUpdate,
} from "@/collaboration/persistence";
import type { Database } from "@/lib/supabase/database.types";

type PresenceParticipant = {
  userId: string;
  connectedAt: string;
  selectedObjectIds: string[];
};

type BroadcastPayload = {
  kind: "update";
  sequence: number;
  update: string;
};

type AwarenessBroadcastPayload = {
  kind: "document-awareness";
  scopeId: string;
  update: string;
};

export type CursorPayload = {
  userId: string;
  sequence: number;
  x: number;
  y: number;
};

export class SupabaseCanvasRepository implements CanvasDurabilityRepository {
  private channel: RealtimeChannel | null = null;

  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly userId: string,
    private readonly onPresence?: (participants: PresenceParticipant[]) => void,
    private readonly onStatus?: (status: string) => void,
    private readonly onCursor?: (cursor: CursorPayload) => void,
    private readonly onDocumentAwareness?: (
      scopeId: string,
      update: Uint8Array,
    ) => void,
  ) {}

  async getLatestSnapshot(canvasId: string) {
    const { data, error } = await this.supabase
      .from("canvas_snapshots")
      .select("version,last_sequence,state,state_hash")
      .eq("canvas_id", canvasId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      version: data.version,
      lastSequence: data.last_sequence,
      state: postgresByteaToBytes(data.state),
      stateHash: data.state_hash,
    };
  }

  async getUpdatesAfter(canvasId: string, sequence: number) {
    const { data, error } = await this.supabase
      .from("canvas_updates")
      .select("sequence,update_data")
      .eq("canvas_id", canvasId)
      .gt("sequence", sequence)
      .order("sequence", { ascending: true });

    if (error) throw error;
    return data.map((row) => ({
      sequence: row.sequence,
      update: postgresByteaToBytes(row.update_data),
    }));
  }

  async getHeadSequence(canvasId: string) {
    const [snapshot, update] = await Promise.all([
      this.supabase
        .from("canvas_snapshots")
        .select("last_sequence")
        .eq("canvas_id", canvasId)
        .order("last_sequence", { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.supabase
        .from("canvas_updates")
        .select("sequence")
        .eq("canvas_id", canvasId)
        .order("sequence", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (snapshot.error) throw snapshot.error;
    if (update.error) throw update.error;
    return Math.max(
      snapshot.data?.last_sequence ?? 0,
      update.data?.sequence ?? 0,
    );
  }

  async appendAndBroadcast(
    canvasId: string,
    clientUpdateId: string,
    update: Uint8Array,
  ) {
    const { data, error } = await this.supabase.rpc("append_canvas_update", {
      target_canvas_id: canvasId,
      client_update_id: clientUpdateId,
      update_data: bytesToPostgresBytea(update),
    });

    if (error) throw error;
    const persisted = data.at(0);
    if (!persisted) throw new Error("The canvas update was not persisted.");

    const status = await this.channel?.send({
      type: "broadcast",
      event: "yjs-update",
      payload: {
        kind: "update",
        sequence: persisted.sequence,
        update: bytesToBase64(update),
      } satisfies BroadcastPayload,
    });

    if (status !== "ok") {
      throw new Error("The durable update could not be broadcast.");
    }

    return persisted.sequence;
  }

  async subscribe(
    canvasId: string,
    onUpdate: (update: SequencedCanvasUpdate) => void,
  ) {
    const { data } = await this.supabase.auth.getSession();
    if (!data.session) throw new Error("An authenticated session is required.");
    await this.supabase.realtime.setAuth(data.session.access_token);

    const channel = this.supabase.channel(`canvas:${canvasId}`, {
      config: {
        private: true,
        broadcast: { ack: false, self: false },
        presence: { key: this.userId },
      },
    });
    this.channel = channel;

    channel
      .on("broadcast", { event: "yjs-update" }, ({ payload }) => {
        const message = payload as
          | BroadcastPayload
          | { kind: "cursor"; cursor: CursorPayload }
          | AwarenessBroadcastPayload;
        if (message.kind === "update") {
          onUpdate({
            sequence: message.sequence,
            update: base64ToBytes(message.update),
          });
          return;
        }
        if (message.kind === "document-awareness") {
          try {
            const update = base64ToBytes(message.update);
            if (
              message.scopeId.length <= 100 &&
              update.byteLength <= 64 * 1024
            ) {
              this.onDocumentAwareness?.(message.scopeId, update);
            }
          } catch {
            // Ignore malformed ephemeral awareness from other clients.
          }
          return;
        }
        const cursor = message.cursor;
        if (
          cursor.userId !== this.userId &&
          Number.isFinite(cursor.sequence) &&
          Number.isFinite(cursor.x) &&
          Number.isFinite(cursor.y)
        ) {
          this.onCursor?.(cursor);
        }
      })
      .on("presence", { event: "sync" }, () => {
        const participants = Object.values(channel.presenceState()).flatMap(
          (entries) =>
            entries.map((entry) => {
              const presence = entry as unknown as Record<string, unknown>;
              return {
                userId: String(presence.userId ?? "unknown"),
                connectedAt: String(presence.connectedAt ?? "unknown"),
                selectedObjectIds: Array.isArray(presence.selectedObjectIds)
                  ? presence.selectedObjectIds.map(String)
                  : [],
              };
            }),
        );
        this.onPresence?.(participants);
      });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Realtime channel subscription timed out.")),
          10_000,
        );

        channel.subscribe(async (status, error) => {
          if (status === "SUBSCRIBED") {
            window.clearTimeout(timeout);
            const presenceStatus = await channel.track({
              userId: this.userId,
              connectedAt: new Date().toISOString(),
              selectedObjectIds: [],
            });
            if (presenceStatus === "ok") {
              this.onStatus?.(status);
              resolve();
            } else {
              reject(new Error("Presence state could not be tracked."));
            }
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            error
          ) {
            window.clearTimeout(timeout);
            this.onStatus?.(status);
            reject(error ?? new Error(`Realtime channel failed: ${status}`));
          }
        });
      });
    } catch (error) {
      await this.supabase.removeChannel(channel);
      if (this.channel === channel) this.channel = null;
      this.onPresence?.([]);
      throw error;
    }

    return async () => {
      await this.supabase.removeChannel(channel);
      if (this.channel === channel) this.channel = null;
      this.onStatus?.("DISCONNECTED");
      this.onPresence?.([]);
    };
  }

  async updatePresence(selectedObjectIds: string[]) {
    if (!this.channel) return "error" as const;
    return this.channel.track({
      userId: this.userId,
      connectedAt: new Date().toISOString(),
      selectedObjectIds,
    });
  }

  async broadcastCursor(cursor: CursorPayload) {
    if (!this.channel) return "error" as const;
    return this.channel.httpSend("yjs-update", { kind: "cursor", cursor });
  }

  async broadcastDocumentAwareness(scopeId: string, update: Uint8Array) {
    if (!this.channel || update.byteLength > 64 * 1024) return "error" as const;
    return this.channel.httpSend("yjs-update", {
      kind: "document-awareness",
      scopeId,
      update: bytesToBase64(update),
    } satisfies AwarenessBroadcastPayload);
  }
}
