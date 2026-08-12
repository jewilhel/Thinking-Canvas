import { z } from "zod";

const pendingUpdateSchema = z.strictObject({
  id: z.uuid(),
  update: z.string().min(1),
  attempts: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});

const pendingUpdatesSchema = z.array(pendingUpdateSchema);

export type PendingCanvasUpdate = z.infer<typeof pendingUpdateSchema>;

export function pendingCanvasUpdateKey(userId: string, canvasId: string) {
  return `thinking-canvas:pending:${userId}:${canvasId}`;
}

export function readPendingCanvasUpdates(
  storage: Pick<Storage, "getItem" | "removeItem">,
  key: string,
) {
  const stored = storage.getItem(key);
  if (!stored) return [];
  const parsed = pendingUpdatesSchema.safeParse(JSON.parse(stored));
  if (parsed.success) return parsed.data;
  storage.removeItem(key);
  return [];
}

export function writePendingCanvasUpdates(
  storage: Pick<Storage, "setItem" | "removeItem">,
  key: string,
  updates: PendingCanvasUpdate[],
) {
  if (!updates.length) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(pendingUpdatesSchema.parse(updates)));
}

export function enqueuePendingCanvasUpdate(
  updates: PendingCanvasUpdate[],
  update: Omit<PendingCanvasUpdate, "attempts" | "createdAt"> &
    Partial<Pick<PendingCanvasUpdate, "attempts" | "createdAt">>,
) {
  if (updates.some(({ id }) => id === update.id)) return updates;
  return [
    ...updates,
    {
      id: update.id,
      update: update.update,
      attempts: update.attempts ?? 0,
      createdAt: update.createdAt ?? new Date().toISOString(),
    },
  ];
}
