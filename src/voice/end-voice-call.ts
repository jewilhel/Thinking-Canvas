type CallProvider = {
  live?: { sessions: { hangup(id: string): Promise<unknown> } };
  realtime: { calls: { hangup(id: string): Promise<unknown> } };
};

/** A missing provider call is already terminated; other failures remain uncertain. */
export async function endVoiceCall(
  provider: CallProvider,
  id: string,
  apiKind: "realtime" | "live" = "realtime",
) {
  try {
    if (apiKind === "live") {
      if (!provider.live) return false;
      await provider.live.sessions.hangup(id);
    } else await provider.realtime.calls.hangup(id);
    return true;
  } catch (error) {
    return (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 404
    );
  }
}
