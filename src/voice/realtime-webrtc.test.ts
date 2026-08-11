import { describe, expect, it, vi } from "vitest";

import {
  connectRealtimeVoice,
  type RealtimeDependencies,
} from "@/voice/realtime-webrtc";

const canvasId = "11111111-1111-4111-8111-111111111111";

function createHarness() {
  const stop = vi.fn();
  const track = { stop } as unknown as MediaStreamTrack;
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  const dataChannel = {
    addEventListener: vi.fn(),
    close: vi.fn(),
  } as unknown as RTCDataChannel;
  const peer = {
    ontrack: null,
    addTrack: vi.fn(),
    createDataChannel: vi.fn(() => dataChannel),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "local-sdp" })),
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
    close: vi.fn(),
  } as unknown as RTCPeerConnection;
  const audio = {
    autoplay: false,
    srcObject: null,
    play: vi.fn(async () => undefined),
  } as unknown as HTMLAudioElement;
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          value: "ek_short_lived",
          expiresAt: 1_786_464_060,
          sessionId: "sess_spike",
          model: "gpt-realtime-2.1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    .mockResolvedValueOnce(new Response("remote-sdp", { status: 200 }));
  const dependencies: RealtimeDependencies = {
    fetch: fetchMock,
    createPeerConnection: () => peer,
    getUserMedia: vi.fn(async () => stream),
    createAudioElement: () => audio,
  };

  return { dependencies, fetchMock, peer, dataChannel, stop, audio };
}

describe("connectRealtimeVoice", () => {
  it("uses an authenticated short-lived token for the browser WebRTC handshake", async () => {
    const harness = createHarness();
    const connection = await connectRealtimeVoice(
      canvasId,
      vi.fn(),
      harness.dependencies,
    );

    expect(harness.fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/spikes/realtime/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ canvasId }),
      }),
    );
    expect(harness.fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.openai.com/v1/realtime/calls",
      expect.objectContaining({
        body: "local-sdp",
        headers: {
          Authorization: "Bearer ek_short_lived",
          "Content-Type": "application/sdp",
        },
      }),
    );
    expect(harness.peer.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "remote-sdp",
    });
    expect(connection).toMatchObject({
      sessionId: "sess_spike",
      model: "gpt-realtime-2.1",
    });

    connection.disconnect();
    expect(harness.stop).toHaveBeenCalled();
    expect(harness.dataChannel.close).toHaveBeenCalled();
    expect(harness.peer.close).toHaveBeenCalled();
  });

  it("does not request microphone access when token authorization fails", async () => {
    const harness = createHarness();
    harness.fetchMock.mockReset().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Canvas access denied." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      connectRealtimeVoice(canvasId, vi.fn(), harness.dependencies),
    ).rejects.toThrow("Canvas access denied.");
    expect(harness.dependencies.getUserMedia).not.toHaveBeenCalled();
  });
});
