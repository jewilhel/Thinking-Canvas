import { z } from "zod";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import type { ProductCanvasMutation } from "@/domain/canvas-command";
import { stableAiToolCommandId } from "./trusted-execution";
export const organizeCanvasSchema = z.strictObject({
  action: z.enum(["group", "ungroup", "nest", "detach"]),
  objectIds: z.array(z.uuid()).min(1).max(100),
  parentId: z.uuid().nullable(),
  summary: z.string().trim().min(1).max(2000),
});
export async function organizeCanvasCommands(input: {
  arguments: unknown;
  objects: CanvasObjectV2[];
  runId: string;
  callKey: string;
}) {
  const args = organizeCanvasSchema.parse(input.arguments);
  if (new Set(args.objectIds).size !== args.objectIds.length)
    throw new Error("Organization targets must be unique.");
  const targets = args.objectIds.map((id) =>
    input.objects.find((object) => object.id === id),
  );
  if (targets.some((object) => !object))
    throw new Error("An organization target no longer exists.");
  const commands: ProductCanvasMutation[] = [];
  if (args.action === "group") {
    commands.push({
      type: "selection.group",
      payload: {
        objectIds: args.objectIds,
        groupId: await stableAiToolCommandId({
          runId: input.runId,
          callKey: `${input.callKey}:group`,
        }),
      },
    });
  } else if (args.action === "ungroup") {
    const groups = new Set(
      targets
        .map((object) => object!.groupId)
        .filter((id): id is string => !!id),
    );
    if (!groups.size) throw new Error("The selected objects are not grouped.");
    for (const groupId of groups)
      commands.push({ type: "selection.ungroup", payload: { groupId } });
  } else {
    if (
      args.action === "nest" &&
      (!args.parentId ||
        !input.objects.some((object) => object.id === args.parentId))
    )
      throw new Error("Nesting requires an existing parent.");
    const handledGroups = new Set<string>();
    for (const object of targets) {
      const groupId = object!.groupId;
      if (groupId) {
        if (handledGroups.has(groupId)) continue;
        handledGroups.add(groupId);
        commands.push(
          args.action === "nest"
            ? {
                type: "group.nest",
                payload: { groupId, parentId: args.parentId! },
              }
            : { type: "group.detach", payload: { groupId } },
        );
      } else
        commands.push(
          args.action === "nest"
            ? {
                type: "object.nest",
                payload: { objectId: object!.id, parentId: args.parentId! },
              }
            : { type: "object.detach", payload: { objectId: object!.id } },
        );
    }
  }
  return { commands, summary: args.summary };
}
