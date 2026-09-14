import { z } from "zod";
export const organizeCanvasSchema = z.strictObject({
  action: z.enum(["group", "ungroup", "nest", "detach"]),
  objectIds: z.array(z.uuid()).min(1).max(100),
  parentId: z.uuid().nullable(),
  summary: z.string().trim().min(1).max(2000),
});
