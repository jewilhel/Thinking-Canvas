export function estimateAiInputTokens(input: {
  instruction: string;
  projectionSerializedBytes: number;
}) {
  const instructionBytes = new TextEncoder().encode(input.instruction).length;
  return Math.max(
    1,
    Math.ceil((instructionBytes + input.projectionSerializedBytes) / 4),
  );
}
