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
  const audio = dependencies.createAudioElement();
  audio.autoplay = true;
  peer.ontrack = (event) => {
    audio.srcObject = event.streams[0] ?? null;
    void audio.play().catch(() => undefined);
  };

  const microphone = await dependencies.getUserMedia({ audio: true });
  const track = microphone.getAudioTracks()[0];
  if (!track) {
    microphone.getTracks().forEach((candidate) => candidate.stop());
    peer.close();
    throw new Error("No microphone audio track is available.");
  }
  peer.addTrack(track, microphone);

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
    microphone.getTracks().forEach((candidate) => candidate.stop());
    peer.close();
    throw new Error("OpenAI rejected the Realtime WebRTC connection.");
  }

  await peer.setRemoteDescription({
    type: "answer",
    sdp: await sdpResponse.text(),
  });

  return {
    sessionId: token.sessionId,
    model: token.model,
    dataChannel,
    disconnect() {
      dataChannel.close();
      microphone.getTracks().forEach((candidate) => candidate.stop());
      peer.close();
      audio.srcObject = null;
    },
  };
}
