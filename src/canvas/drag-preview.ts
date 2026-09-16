import type { CanvasGroupV2, CanvasObjectV2 } from "./canvas-document";
import { isContainableObject } from "./icon-containment";

export function dragPreviewPositionsForSelection(
  objects: CanvasObjectV2[],
  groups: CanvasGroupV2[],
  selected: CanvasObjectV2[],
  dx: number,
  dy: number,
) {
  const groupParents = new Map(
    groups.map((group) => [group.id, group.parentId]),
  );
  const children = new Map<string, CanvasObjectV2[]>();
  for (const object of objects) {
    const parentId =
      object.type === "annotation"
        ? object.attachedObjectId
        : ((isContainableObject(object) ? object.parentId : null) ??
          (object.groupId ? groupParents.get(object.groupId) : null));
    if (!parentId) continue;
    const siblings = children.get(parentId) ?? [];
    siblings.push(object);
    children.set(parentId, siblings);
  }
  // Walk every generation, regardless of document order. A label may be a
  // grandchild (or deeper), and overlapping selections must move it only once.
  const pending = [...selected];
  const visited = new Set<string>();
  const positions: Record<string, { x: number; y: number }> = {};
  for (let index = 0; index < pending.length; index++) {
    const object = pending[index];
    if (visited.has(object.id)) continue;
    visited.add(object.id);
    if (object.type !== "connector") {
      positions[object.id] = {
        x: object.geometry.x + dx,
        y: object.geometry.y + dy,
      };
    }
    pending.push(...(children.get(object.id) ?? []));
  }
  return positions;
}
