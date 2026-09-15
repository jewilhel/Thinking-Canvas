/** Log only application-owned categories; never provider text or conversation content. */
export function delegationDiagnostic(error: unknown) {
  const type = error instanceof Error ? error.constructor.name : "UnknownError";
  const knownTypes = new Set([
    "AiRunConflictError",
    "AiRunAccessError",
    "AiRunLimitError",
    "AiProviderOutputError",
    "AiProviderTimeoutError",
    "AiVisualQualityError",
    "DOMException",
    "ZodError",
    "Error",
  ]);
  const reasons: Record<string, string> = {
    "Name preference requires current participant wording.":
      "name_evidence_not_current",
    "Name must occur in the participant's own statement.":
      "name_not_in_user_quote",
    "The name preference could not be saved.": "name_save_failed",
    "The AI response referenced an unavailable object.":
      "unavailable_reply_reference",
    "Ending requires a voice request.": "ending_without_voice_task",
    "This AI tool is not executable in the current slice.":
      "unsupported_action",
    "AI reply could not be saved.": "reply_save_failed",
    "The invoking comment is no longer open.": "invoking_comment_closed",
    "AI run is not available for completion.": "run_not_completable",
  };
  return {
    errorType: knownTypes.has(type) ? type : "OtherError",
    reason:
      error instanceof Error
        ? (reasons[error.message] ?? "unclassified")
        : "unclassified",
  };
}
