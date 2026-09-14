import { organizeCanvasSchema } from "./canvas-organization-schema";
import {
  fullyContains,
  isObjectParent,
  worldPoint,
  type ObjectParent,
} from "@/canvas/icon-containment";
import type { CanvasGroupV2, CanvasObjectV2 } from "@/canvas/canvas-document";
import type { ProductCanvasMutation } from "@/domain/canvas-command";
import { stableAiToolCommandId } from "./trusted-execution";
function nestedGeometry(
  geometry: CanvasObjectV2["geometry"],
  parent: ObjectParent,
) {
  if (fullyContains(parent, geometry)) return geometry;
  const angle =
    ((geometry.rotation - parent.geometry.rotation) * Math.PI) / 180;
  const corners = [
    [0, 0],
    [geometry.width, 0],
    [0, geometry.height],
    [geometry.width, geometry.height],
  ].map(([x, y]) => ({
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle),
  }));
  const minX = Math.min(...corners.map((p) => p.x)),
    minY = Math.min(...corners.map((p) => p.y));
  const width = Math.max(...corners.map((p) => p.x)) - minX,
    height = Math.max(...corners.map((p) => p.y)) - minY;
  const padding = Math.min(
    16,
    parent.geometry.width / 10,
    parent.geometry.height / 10,
  );
  const scale = Math.min(
    1,
    (parent.geometry.width - 2 * padding) / width,
    (parent.geometry.height - 2 * padding) / height,
  );
  if (geometry.width * scale < 8 || geometry.height * scale < 8)
    throw new Error(
      "The parent is too small to contain this object at a usable size.",
    );
  const origin = worldPoint(
    parent,
    (parent.geometry.width - width * scale) / 2 - minX * scale,
    (parent.geometry.height - height * scale) / 2 - minY * scale,
  );
  return {
    ...geometry,
    ...origin,
    width: geometry.width * scale,
    height: geometry.height * scale,
  };
}
export async function organizeCanvasCommands(input: {
  arguments: unknown;
  objects: CanvasObjectV2[];
  groups?: CanvasGroupV2[];
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
    const parent = input.objects.find((object) => object.id === args.parentId);
    if (args.action === "nest" && (!parent || !isObjectParent(parent)))
      throw new Error("Choose a top-level shape as the parent.");
    const handledGroups = new Set<string>();
    for (const object of targets) {
      const groupId = object!.groupId;
      if (groupId) {
        if (handledGroups.has(groupId)) continue;
        handledGroups.add(groupId);
        if (args.action === "nest" && parent && isObjectParent(parent)) {
          const group = input.groups?.find((group) => group.id === groupId);
          if (!group) throw new Error("The group frame is unavailable.");
          if (group.parentId)
            commands.push({ type: "group.detach", payload: { groupId } });
          const geometry = nestedGeometry(group.geometry, parent);
          if (geometry !== group.geometry)
            commands.push({
              type: "group.transform",
              payload: {
                groupId,
                x: geometry.x,
                y: geometry.y,
                width: geometry.width,
                height: geometry.height,
              },
            });
        }
        commands.push(
          args.action === "nest"
            ? {
                type: "group.nest",
                payload: { groupId, parentId: args.parentId! },
              }
            : { type: "group.detach", payload: { groupId } },
        );
      } else {
        if (args.action === "nest" && parent && isObjectParent(parent)) {
          if ("parentId" in object! && object!.parentId)
            commands.push({
              type: "object.detach",
              payload: { objectId: object!.id },
            });
          const geometry = nestedGeometry(object!.geometry, parent);
          if (geometry !== object!.geometry)
            commands.push({
              type: "object.transform",
              payload: { objectId: object!.id, ...geometry },
            });
        }
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
  }
  return { commands, summary: args.summary };
}
