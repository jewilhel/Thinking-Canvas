import { z } from "zod";
import { LIVE_MODEL, type LiveSettings } from "./live-protocol";
import type { RealtimeDependencies } from "./realtime-webrtc";
const sessionSchema = z.object({
  id: z.uuid(),
  sdp: z.string(),
  expiresAt: z.string().datetime({ offset: true }),
  model: z.string(),
  reservedCents: z.number(),
});
export type SupervisedVoice = {
  id: string;
  expiresAt: string;
  model: string;
  send(event: Record<string, unknown>): void;
  mute(muted: boolean): void;
  close(): void;
};
export async function connectLiveVoice(
  canvasId: string,
  settings: LiveSettings,
  onEvent: (event: unknown) => void,
  onState: (state: RTCPeerConnectionState | "microphone") => void,
  signal: AbortSignal,
  restartOf?: string,
  restartContext?: string,
  dependencies: RealtimeDependencies = {
    fetch: window.fetch.bind(window),
    createPeerConnection: () => new RTCPeerConnection(),
    getUserMedia: (constraints) =>
      navigator.mediaDevices.getUserMedia(constraints),
    createAudioElement: () => document.createElement("audio"),
  },
): Promise<SupervisedVoice> {
  signal.throwIfAborted();
  const peer = dependencies.createPeerConnection();
  const audio = dependencies.createAudioElement();
  let stream: MediaStream | undefined;
  let channel: RTCDataChannel | undefined;
  let id: string | undefined;
  let closed = false;
  let activated = false;
  let started = false;
  let drain: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    clearTimeout(drain);
    channel?.close();
    peer.close();
  };
  const close = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", close);
    peer.ontrack = null;
    peer.onconnectionstatechange = null;
    stream?.getTracks().forEach((track) => track.stop());
    if (started && channel?.readyState === "open")
      channel.send(JSON.stringify({ type: "session.close" }));
    if (!id) dispose();
    else drain = setTimeout(dispose, 8000);
    audio.srcObject = null;
    if (id)
      void dependencies
        .fetch(`/api/canvases/${canvasId}/voice?id=${id}`, {
          method: "DELETE",
          keepalive: true,
        })
        .catch(() => undefined);
  };
  signal.addEventListener("abort", close, { once: true });
  try {
    onState("microphone");
    stream = await dependencies.getUserMedia({ audio: true });
    if (closed) {
      stream.getTracks().forEach((track) => track.stop());
      signal.throwIfAborted();
      throw new Error("Connection cancelled.");
    }
    onState("connecting");
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error("No microphone is available.");
    stream.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    audio.muted = true;
    audio.autoplay = true;
    peer.ontrack = (event) => {
      audio.srcObject = event.streams[0] ?? null;
      void audio.play().catch(() => onEvent({ type: "playback.blocked" }));
    };
    peer.onconnectionstatechange = () => {
      if (activated || peer.connectionState !== "connected")
        onState(peer.connectionState);
    };
    peer.addTrack(track, stream);
    channel = peer.createDataChannel("oai-events");
    channel.addEventListener("message", (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      const type = (parsed as { type?: string })?.type;
      if (type === "session.started") {
        const session = (parsed as { session?: { model?: string } }).session;
        started = session?.model === LIVE_MODEL;
      }
      if (type === "session.closed") dispose();
      onEvent(parsed);
    });
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    if (!offer.sdp)
      throw new Error("The browser could not prepare the connection.");
    const response = await dependencies.fetch(
      `/api/canvases/${canvasId}/voice`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdp: offer.sdp,
          settings,
          ...(restartContext ? { restartContext } : {}),
          ...(restartOf ? { restartOf } : {}),
        }),
        signal,
      },
    );
    const body = await response.json();
    if (!response.ok)
      throw new Error(
        typeof body?.error === "string"
          ? body.error
          : "Voice connection failed.",
        { cause: { sessionId: body?.id } },
      );
    const session = sessionSchema.parse(body);
    id = session.id;
    if (closed) {
      void dependencies
        .fetch(`/api/canvases/${canvasId}/voice?id=${id}`, {
          method: "DELETE",
          keepalive: true,
        })
        .catch(() => undefined);
      throw new Error("Connection cancelled.");
    }
    await peer.setRemoteDescription({ type: "answer", sdp: session.sdp });
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", aborted);
        channel?.removeEventListener("open", opened);
        channel?.removeEventListener("close", aborted);
      };
      const opened = () => {
        done();
        resolve();
      };
      const aborted = () => {
        done();
        reject(new Error("Voice connection ended."));
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error("Voice connection timed out."));
      }, 12000);
      signal.addEventListener("abort", aborted, { once: true });
      channel!.addEventListener("open", opened, { once: true });
      channel!.addEventListener("close", aborted, { once: true });
      if (signal.aborted) aborted();
      else if (channel!.readyState === "open") opened();
    });
    const setupDeadline = Date.now() + 10000;
    while (true) {
      signal.throwIfAborted();
      const response = await dependencies.fetch(
        `/api/canvases/${canvasId}/voice?id=${id}`,
        {
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(Math.max(1, setupDeadline - Date.now())),
          ]),
        },
      );
      if (!response.ok)
        throw new Error("Voice supervision could not be verified.");
      const state = await response.json();
      if (state.ended)
        throw new Error("Voice supervision ended during startup.");
      if (state.ready && started) break;
      if (Date.now() >= setupDeadline)
        throw new Error("Voice supervision timed out.");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    signal.throwIfAborted();
    if (closed) throw new Error("Connection cancelled.");
    activated = true;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    audio.muted = false;
    onState("connected");
    return {
      id,
      expiresAt: session.expiresAt,
      model: session.model,
      close,
      mute(muted) {
        if (channel?.readyState === "open")
          channel.send(
            JSON.stringify({
              type: muted
                ? "session.input_audio.mute"
                : "session.input_audio.unmute",
              event_id: crypto.randomUUID(),
            }),
          );
        stream?.getAudioTracks().forEach((track) => {
          track.enabled = !muted;
        });
      },
      send(event) {
        if (closed || channel?.readyState !== "open")
          throw new Error("Voice is disconnected.");
        channel.send(JSON.stringify(event));
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}
