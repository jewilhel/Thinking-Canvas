import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AiRunConflictError,
  AiRunLimitError,
} from "@/ai/collaborator-run-service";
import { ConnectedPathError } from "@/ai/grounding";
import { AiProviderOutputError } from "@/ai/primary-ai-gateway";
import { AiRunTimeoutError } from "@/ai/run-deadline";
import { privacySafeAiRunErrorCode } from "@/ai/run-failure";
import { AiVisualQualityError } from "@/ai/visual-grounding";

describe("privacy-safe AI run failure classification", () => {
  it.each([
    [
      new ConnectedPathError("not_connected", "private detail"),
      "connected_path_not_connected",
    ],
    [new AiRunLimitError("private detail"), "rate_or_budget_limit"],
    [new AiRunTimeoutError(), "provider_timeout"],
    [new DOMException("private detail", "AbortError"), "run_interrupted"],
    [new AiProviderOutputError(), "provider_output_invalid"],
    [new AiVisualQualityError("private detail"), "visual_quality_blocked"],
    [new AiRunConflictError("private detail"), "review_stage_failed"],
    [new Error("private detail"), "provider_run_failed"],
  ])(
    "maps an internal failure without persisting its message",
    (error, code) => {
      expect(privacySafeAiRunErrorCode(error)).toBe(code);
      expect(code).not.toContain("private detail");
    },
  );
});
