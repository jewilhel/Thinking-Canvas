"use client";

import type { Provider, UserState } from "@lexical/yjs";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

import { base64ToBytes, bytesToBase64 } from "@/collaboration/canvas-document";

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

export class BrowserYjsProvider implements Provider {
  readonly awareness;
  private readonly listeners: ListenerMap = {
    sync: new Set(),
    status: new Set(),
    update: new Set(),
    reload: new Set(),
  };
  private channel: BroadcastChannel | null = null;
  private observingDocument = false;
  private readonly storageKey: string;

  constructor(
    private readonly id: string,
    readonly document: Y.Doc,
  ) {
    this.storageKey = `thinking-canvas:document-spike:${id}`;
    const persisted = window.localStorage.getItem(this.storageKey);
    if (persisted) Y.applyUpdate(this.document, base64ToBytes(persisted), this);
    this.awareness = new Awareness(
      this.document,
    ) as unknown as Provider["awareness"];
    window.addEventListener("pagehide", this.teardown, { once: true });
  }

  private readonly handleDocumentUpdate = (
    update: Uint8Array,
    origin: unknown,
  ) => {
    window.localStorage.setItem(
      this.storageKey,
      bytesToBase64(Y.encodeStateAsUpdate(this.document)),
    );
    this.listeners.update.forEach((listener) => listener(update));
    if (origin !== this) this.channel?.postMessage(bytesToBase64(update));
  };

  private readonly handleStorage = (event: StorageEvent) => {
    if (event.key !== this.storageKey || !event.newValue) return;
    Y.applyUpdate(this.document, base64ToBytes(event.newValue), this);
  };

  private readonly teardown = () => {
    this.channel?.close();
    this.channel = null;
    window.removeEventListener("storage", this.handleStorage);
    if (this.observingDocument) {
      this.document.off("update", this.handleDocumentUpdate);
      this.observingDocument = false;
    }
  };

  connect() {
    if (!this.observingDocument) {
      this.document.on("update", this.handleDocumentUpdate);
      this.observingDocument = true;
    }
    if (!this.channel) {
      this.channel = new BroadcastChannel(this.storageKey);
      this.channel.addEventListener(
        "message",
        (event: MessageEvent<string>) => {
          Y.applyUpdate(this.document, base64ToBytes(event.data), this);
        },
      );
    }
    window.addEventListener("storage", this.handleStorage);
    this.listeners.status.forEach((listener) =>
      listener({ status: "connected" }),
    );
    this.listeners.sync.forEach((listener) => listener(true));
  }

  disconnect() {
    this.awareness.setLocalState(null);
    this.listeners.status.forEach((listener) =>
      listener({ status: "disconnected" }),
    );
  }

  destroy() {
    this.teardown();
    this.awareness.setLocalState(null);
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

export function createDocumentProvider(
  id: string,
  documentMap: Map<string, Y.Doc>,
) {
  const document = new Y.Doc({ guid: id });
  documentMap.set(id, document);
  return new BrowserYjsProvider(id, document);
}

export type DocumentProviderAwarenessState = UserState;
