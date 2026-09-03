import type { Provider, UserState } from "@lexical/yjs";
import { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

type SyncListener = (isSynced: boolean) => void;
type StatusListener = (event: { status: string }) => void;
type UpdateListener = (event: unknown) => void;
type ReloadListener = (document: Y.Doc) => void;

type ListenerMap = {
  sync: Set<SyncListener>;
  status: Set<StatusListener>;
  update: Set<UpdateListener>;
  reload: Set<ReloadListener>;
};

/**
 * Adapts the canvas's already-authorized Y.Doc to Lexical's collaboration
 * contract. Network transport and durable persistence remain owned by
 * useCanvasRecovery; this provider must never create a second sync channel.
 */
export class CanvasLexicalProvider implements Provider {
  readonly awareness;
  private connected = false;
  private readonly listeners: ListenerMap = {
    sync: new Set(),
    status: new Set(),
    update: new Set(),
    reload: new Set(),
  };

  constructor(readonly document: Y.Doc) {
    this.awareness = new Awareness(
      document,
    ) as unknown as Provider["awareness"];
  }

  connect() {
    if (this.connected) return;
    this.connected = true;
    this.listeners.status.forEach((listener) =>
      listener({ status: "connected" }),
    );
    this.listeners.sync.forEach((listener) => listener(true));
  }

  disconnect() {
    if (!this.connected) return;
    this.connected = false;
    this.awareness.setLocalState(null);
    this.listeners.status.forEach((listener) =>
      listener({ status: "disconnected" }),
    );
  }

  on(type: "sync", listener: SyncListener): void;
  on(type: "status", listener: StatusListener): void;
  on(type: "update", listener: UpdateListener): void;
  on(type: "reload", listener: ReloadListener): void;
  on(
    type: keyof ListenerMap,
    listener: SyncListener | StatusListener | UpdateListener | ReloadListener,
  ) {
    (this.listeners[type] as Set<typeof listener>).add(listener);
  }

  off(type: "sync", listener: SyncListener): void;
  off(type: "status", listener: StatusListener): void;
  off(type: "update", listener: UpdateListener): void;
  off(type: "reload", listener: ReloadListener): void;
  off(
    type: keyof ListenerMap,
    listener: SyncListener | StatusListener | UpdateListener | ReloadListener,
  ) {
    (this.listeners[type] as Set<typeof listener>).delete(listener);
  }
}

export function createCanvasLexicalProviderFactory(canvasDocument: Y.Doc) {
  return (documentId: string, documentMap: Map<string, Y.Doc>) => {
    documentMap.set(documentId, canvasDocument);
    return new CanvasLexicalProvider(canvasDocument);
  };
}

export type CanvasLexicalAwarenessState = UserState;
