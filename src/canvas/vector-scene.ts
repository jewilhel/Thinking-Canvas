import { z } from "zod";

export const vectorSceneSchema = z.strictObject({
  viewBox: z.number().positive(),
  paths: z.array(z.string().min(1).max(100_000)).min(1).max(64),
});

export type VectorScene = z.infer<typeof vectorSceneSchema>;

export function catalogIconToVectorScene(input: {
  viewBox: number;
  paths: string[];
}) {
  return vectorSceneSchema.parse(input);
}
