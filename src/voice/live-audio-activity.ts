/** Inspect transient PCM only. Live output chunks use delta, not audio. */
export function liveAudioActivity(event: {
  type?: string;
  audio?: unknown;
  delta?: unknown;
}) {
  const value =
    event.type === "session.output_audio.delta" ? event.delta : event.audio;
  if (typeof value !== "string") return false;
  const pcm = Buffer.from(value, "base64");
  let sum = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const sample = pcm.readInt16LE(i) / 32768;
    sum += sample * sample;
  }
  return pcm.length >= 2 && Math.sqrt(sum / Math.floor(pcm.length / 2)) > 0.02;
}
