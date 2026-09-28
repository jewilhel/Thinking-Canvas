import { createHmac } from "node:crypto";
import {
  defaultLiveCanvasRequest,
  type LiveCanvasRequest,
} from "./live-delegation-contract";
export function liveDelegationSignature(
  key: string,
  sessionId: string,
  delegationId: string,
  request: LiveCanvasRequest = defaultLiveCanvasRequest,
) {
  return createHmac("sha256", key)
    .update(
      JSON.stringify([
        "live-canvas-request-v2",
        sessionId,
        delegationId,
        request.kind,
        request.text,
      ]),
    )
    .digest("hex");
}
