import { createHmac } from "node:crypto";
export function liveDelegationSignature(
  key: string,
  sessionId: string,
  delegationId: string,
) {
  return createHmac("sha256", key)
    .update(
      JSON.stringify(["live-canvas-description-v1", sessionId, delegationId]),
    )
    .digest("hex");
}
