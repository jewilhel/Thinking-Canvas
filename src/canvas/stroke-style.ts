export type OutlinePattern = "solid" | "dashed" | "dotted";

export function resolvedOutlinePattern(pattern?: OutlinePattern) {
  return pattern ?? "solid";
}

export function konvaStrokeDash(
  pattern: OutlinePattern | undefined,
  width: number,
) {
  if (pattern === "dashed")
    return [Math.max(6, width * 4), Math.max(4, width * 2)];
  if (pattern === "dotted") return [Math.max(1, width), Math.max(4, width * 2)];
  return undefined;
}
