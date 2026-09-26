export function voiceEndMessage(reason: string) {
  if (["session_limit", "Session time limit"].includes(reason))
    return "The voice session has ended. You can pick up in a new session.";
  if (reason === "Session ended") return "The voice session has ended.";
  if (reason === "conversation_finished")
    return "Conversation finished. You can start another session whenever you are ready.";
  if (reason === "idle_limit")
    return "Voice ended after a period without speech.";
  if (reason === "access_changed")
    return "Voice ended because canvas access changed.";
  if (
    [
      "authorization_unavailable",
      "supervisor_check_failed",
      "accounting_unavailable",
    ].includes(reason)
  )
    return "Voice ended because the server could not verify the connection. You can start a new session.";
  if (reason === "budget_limit")
    return "Voice ended because the test allowance was reached.";
  return "The voice connection ended unexpectedly. You can start a new session.";
}
