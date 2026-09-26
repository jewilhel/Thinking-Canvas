import { z } from "zod";
export const organizeCanvasSchema = z.strictObject({
  action: z.enum(["group", "ungroup", "nest", "detach"]),
  objectIds: z.array(z.uuid()).min(1).max(100),
  parentId: z.uuid().nullable(),
  newParent: z
    .strictObject({
      shape: z.enum([
        "rectangle",
        "rounded-rectangle",
        "ellipse",
        "diamond",
        "triangle",
        "pentagon",
        "hexagon",
        "octagon",
        "star",
        "cloud",
        "speech-bubble",
        "cylinder",
      ]),
      fill: z.string().min(1).max(100),
      outline: z.string().min(1).max(100),
      outlineWidth: z.number().min(0).max(20),
      padding: z.number().min(16).max(1000),
    })
    .nullable()
    .optional(),
  summary: z.string().trim().min(1).max(2000),
});
