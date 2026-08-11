import * as Y from "yjs";

import { canvasObjectSchema, type CanvasObject } from "@/domain/canvas-object";

const objectsMapName = "canvas-objects";

export function createCanvasDocument() {
  return new Y.Doc();
}

function getObjectsMap(document: Y.Doc) {
  return document.getMap<unknown>(objectsMapName);
}

export function putCanvasObject(document: Y.Doc, object: CanvasObject) {
  const validated = canvasObjectSchema.parse(object);
  getObjectsMap(document).set(validated.id, validated);
}

export function deleteCanvasObject(document: Y.Doc, objectId: string) {
  getObjectsMap(document).delete(objectId);
}

export function listCanvasObjects(document: Y.Doc): CanvasObject[] {
  return [...getObjectsMap(document).values()]
    .map((value) => canvasObjectSchema.parse(value))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function encodeCanvasState(document: Y.Doc) {
  return Y.encodeStateAsUpdate(document);
}

export function applyCanvasUpdate(document: Y.Doc, update: Uint8Array) {
  Y.applyUpdate(document, update);
}

export function mergeCanvasUpdates(updates: Uint8Array[]) {
  return Y.mergeUpdates(updates);
}

export async function hashBytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes).buffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashCanvasState(document: Y.Doc) {
  return hashBytes(encodeCanvasState(document));
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function bytesToPostgresBytea(bytes: Uint8Array) {
  return `\\x${[...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function postgresByteaToBytes(value: string) {
  if (!value.startsWith("\\x") || value.length % 2 !== 0) {
    throw new Error("PostgreSQL bytea value is not hex encoded.");
  }

  const hex = value.slice(2);
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );
}
