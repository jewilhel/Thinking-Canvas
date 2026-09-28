import { z } from "zod";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";

export const canvasNavigationSchema = z.strictObject({
  action: z.enum(["select", "open_document", "close_document"]),
  objectIds: z.array(z.uuid()).max(100),
});
export type CanvasNavigation = z.infer<typeof canvasNavigationSchema>;
export function validateCanvasNavigation(
  input: unknown,
  objects: CanvasObjectV2[],
) {
  const navigation = canvasNavigationSchema.parse(input);
  if (new Set(navigation.objectIds).size !== navigation.objectIds.length)
    throw new Error("Navigation targets must be unique.");
  const targets = navigation.objectIds.map((id) =>
    objects.find((object) => object.id === id),
  );
  if (targets.some((object) => !object))
    throw new Error("A navigation target no longer exists.");
  if (
    navigation.action === "open_document" &&
    (targets.length !== 1 || targets[0]?.type !== "document")
  )
    throw new Error("Opening a document requires one existing document.");
  if (
    navigation.action === "close_document" &&
    (targets.length > 1 ||
      targets.some((object) => object?.type !== "document"))
  )
    throw new Error(
      "Closing a document requires its document identity or no target for the current document.",
    );
  return navigation;
}
export function navigationForParticipant(
  input: {
    status: string;
    requestedBy: string;
    updatedAt: string;
    navigation?: CanvasNavigation[];
  },
  userId: string,
  since: number,
) {
  return input.status === "completed" &&
    input.requestedBy === userId &&
    Date.parse(input.updatedAt) >= since
    ? (input.navigation ?? [])
    : [];
}
