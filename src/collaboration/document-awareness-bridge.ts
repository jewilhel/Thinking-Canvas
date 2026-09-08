"use client";

import type * as Y from "yjs";

const outboundEvent = "thinking-canvas:document-awareness-outbound";
const inboundEvent = "thinking-canvas:document-awareness-inbound";

type AwarenessEventDetail = {
  document: Y.Doc;
  scopeId: string;
  update: Uint8Array;
};

function dispatch(name: string, detail: AwarenessEventDetail) {
  window.dispatchEvent(new CustomEvent<AwarenessEventDetail>(name, { detail }));
}

function listen(
  name: string,
  document: Y.Doc,
  listener: (scopeId: string, update: Uint8Array) => void,
) {
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<AwarenessEventDetail>).detail;
    if (detail.document === document) listener(detail.scopeId, detail.update);
  };
  window.addEventListener(name, handle);
  return () => window.removeEventListener(name, handle);
}

export function broadcastLocalDocumentAwareness(
  document: Y.Doc,
  scopeId: string,
  update: Uint8Array,
) {
  dispatch(outboundEvent, { document, scopeId, update });
}

export function receiveRemoteDocumentAwareness(
  document: Y.Doc,
  scopeId: string,
  update: Uint8Array,
) {
  dispatch(inboundEvent, { document, scopeId, update });
}

export function onLocalDocumentAwareness(
  document: Y.Doc,
  listener: (scopeId: string, update: Uint8Array) => void,
) {
  return listen(outboundEvent, document, listener);
}

export function onRemoteDocumentAwareness(
  document: Y.Doc,
  listener: (scopeId: string, update: Uint8Array) => void,
) {
  return listen(inboundEvent, document, listener);
}
