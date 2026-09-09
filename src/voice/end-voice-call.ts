type CallProvider = {
  realtime: { calls: { hangup(id: string): Promise<unknown> } };
};

/** A missing provider call is already terminated; other failures remain uncertain. */
export async function endVoiceCall(provider: CallProvider, id: string) {
  try {
    await provider.realtime.calls.hangup(id);
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
