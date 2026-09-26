import { z } from "zod";

const tokenSchema = z.strictObject({
  value: z.string().min(1),
  expiresAt: z.number().int().positive(),
  sessionId: z.string().min(1),
  model: z.string().min(1),
});

export type RealtimeConnection = {
  sessionId: string;
  model: string;
  dataChannel: RTCDataChannel;
  disconnect(): void;
};

export type RealtimeDependencies = {
  fetch: typeof fetch;
  createPeerConnection: () => RTCPeerConnection;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createAudioElement: () => HTMLAudioElement;
};

export function narrationEventOutcome(
  event: unknown,
): "playing" | "ended" | "failed" {
  const parsed = z
    .object({
      type: z.string(),
      response: z.object({ status: z.string() }).optional(),
    })
    .safeParse(event);
  if (!parsed.success) return "playing";
  if (parsed.data.type === "output_audio_buffer.stopped") return "ended";
  if (
    parsed.data.type === "error" ||
    (parsed.data.type === "response.done" &&
      parsed.data.response?.status !== "completed")
  ) {
    return "failed";
  }
  return "playing";
}

function browserDependencies(): RealtimeDependencies {
  return {
    fetch: window.fetch.bind(window),
    createPeerConnection: () => new RTCPeerConnection(),
    getUserMedia: (constraints) =>
      navigator.mediaDevices.getUserMedia(constraints),
    createAudioElement: () => document.createElement("audio"),
  };
}

export async function connectRealtimeVoice(
  canvasId: string,
  onEvent: (event: unknown) => void,
  dependencies = browserDependencies(),
): Promise<RealtimeConnection> {
  const tokenResponse = await dependencies.fetch("/api/spikes/realtime/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ canvasId }),
  });
  const tokenBody: unknown = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok) {
    const error = z.object({ error: z.string() }).safeParse(tokenBody);
    throw new Error(
      error.success ? error.data.error : "Realtime authorization failed.",
    );
  }
  const token = tokenSchema.parse(tokenBody);

  const peer = dependencies.createPeerConnection();
  let audio: HTMLAudioElement | undefined;
  let microphone: MediaStream | undefined;
  let dataChannel: RTCDataChannel | undefined;
  let closed = false;
  const disconnect = () => {
    if (closed) return;
    closed = true;
    peer.ontrack = null;
    dataChannel?.close();
    microphone?.getTracks().forEach((track) => track.stop());
    peer.close();
    if (audio) audio.srcObject = null;
  };
  try {
    audio = dependencies.createAudioElement();
    audio.autoplay = true;
    peer.ontrack = (event) => {
      if (closed || !audio) return;
      audio.srcObject = event.streams[0] ?? null;
      void audio.play().catch(() => undefined);
    };
    microphone = await dependencies.getUserMedia({ audio: true });
    const track = microphone.getAudioTracks()[0];
    if (!track) throw new Error("No microphone audio track is available.");
    peer.addTrack(track, microphone);
    dataChannel = peer.createDataChannel("oai-events");
    dataChannel.addEventListener("message", (event) => {
      if (closed) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data as string);
      } catch {
        return;
      }
      onEvent(parsed);
    });
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    if (!offer.sdp) throw new Error("The browser did not create an SDP offer.");
    const sdpResponse = await dependencies.fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token.value}`,
          "Content-Type": "application/sdp",
        },
      },
    );
    if (!sdpResponse.ok)
      throw new Error("OpenAI rejected the Realtime WebRTC connection.");
    await peer.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text(),
    });
    return {
      sessionId: token.sessionId,
      model: token.model,
      dataChannel,
      disconnect,
    };
  } catch (error) {
    disconnect();
    throw error;
  }
}

export async function connectRealtimeNarration(
  canvasId: string,
  narration: string,
  onEvent: (event: unknown) => void,
  dependencies = browserDependencies(),
): Promise<RealtimeConnection> {
  const script = z.string().trim().min(1).max(100_000).parse(narration);
  const tokenResponse = await dependencies.fetch(
    `/api/canvases/${canvasId}/stories/narration/token`,
    { method: "POST" },
  );
  const tokenBody: unknown = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok) {
    const error = z.object({ error: z.string() }).safeParse(tokenBody);
    throw new Error(
      error.success ? error.data.error : "Narration authorization failed.",
    );
  }
  const token = tokenSchema.parse(tokenBody);
  const peer = dependencies.createPeerConnection();
  const audio = dependencies.createAudioElement();
  audio.autoplay = true;
  peer.ontrack = (event) => {
    audio.srcObject = event.streams[0] ?? null;
    void audio.play().catch(() => undefined);
  };
  peer.addTransceiver("audio", { direction: "recvonly" });
  const dataChannel = peer.createDataChannel("oai-events");
  dataChannel.addEventListener("message", (event) => {
    try {
      onEvent(JSON.parse(event.data as string));
    } catch {
      onEvent(event.data);
    }
  });
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  if (!offer.sdp) throw new Error("The browser did not create an SDP offer.");
  const sdpResponse = await dependencies.fetch(
    "https://api.openai.com/v1/realtime/calls",
    {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${token.value}`,
        "Content-Type": "application/sdp",
      },
    },
  );
  if (!sdpResponse.ok) {
    peer.close();
    throw new Error("OpenAI rejected the narration connection.");
  }
  await peer.setRemoteDescription({
    type: "answer",
    sdp: await sdpResponse.text(),
  });
  const request = JSON.stringify({
    type: "response.create",
    response: {
      conversation: "none",
      output_modalities: ["audio"],
      instructions:
        "Read the supplied scene narration verbatim. Do not add, remove, summarize, or answer it.",
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: script }],
        },
      ],
    },
  });
  const sendRequest = () => dataChannel.send(request);
  if (dataChannel.readyState === "open") sendRequest();
  else dataChannel.addEventListener("open", sendRequest, { once: true });

  return {
    sessionId: token.sessionId,
    model: token.model,
    dataChannel,
    disconnect() {
      if (dataChannel.readyState === "open") {
        dataChannel.send(JSON.stringify({ type: "response.cancel" }));
      }
      dataChannel.close();
      peer.close();
      audio.srcObject = null;
    },
  };
}
