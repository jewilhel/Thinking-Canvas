import { ConnectedPathError } from "@/ai/grounding";
import { AiProviderOutputError } from "@/ai/primary-ai-gateway";
import {
  AiRunConflictError,
  AiRunLimitError,
} from "@/ai/collaborator-run-service";
import { AiVisualQualityError } from "@/ai/visual-grounding";

export function privacySafeAiRunErrorCode(error: unknown) {
  if (error instanceof ConnectedPathError)
    return `connected_path_${error.code}`;
  if (error instanceof AiRunLimitError) return "rate_or_budget_limit";
  if (error instanceof AiProviderOutputError) return "provider_output_invalid";
  if (error instanceof AiVisualQualityError) return "visual_quality_blocked";
  if (error instanceof AiRunConflictError) return "review_stage_failed";
  return "provider_run_failed";
}
