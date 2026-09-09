import { describe, expect, it, vi } from "vitest";
import { connectSupervisedVoice } from "./supervised-webrtc";
import { DEFAULT_VOICE_SETTINGS } from "./voice-settings";
import type { RealtimeDependencies } from "./realtime-webrtc";
const canvasId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
function harness() {
  const track = { enabled: true, stop: vi.fn() };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  const channel = {
    readyState: "open",
    close: vi.fn(),
    send: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as RTCDataChannel;
  const peer = {
    close: vi.fn(),
    addTrack: vi.fn(),
    createDataChannel: () => channel,
    createOffer: async () => ({ sdp: "offer", type: "offer" }),
    setLocalDescription: vi.fn(),
    setRemoteDescription: vi.fn(),
    ontrack: null,
    onconnectionstatechange: null,
  } as unknown as RTCPeerConnection;
  const audio = {
    autoplay: false,
    srcObject: null,
    play: vi.fn(async () => {}),
  } as unknown as HTMLAudioElement;
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: sessionId,
        sdp: "answer",
        expiresAt: "2026-09-09T13:10:00+00:00",
        model: "gpt-realtime-2.1",
        reservedCents: 1000,
      }),
    ),
  );
  const dependencies: RealtimeDependencies = {
    fetch,
    getUserMedia: vi.fn(async () => stream),
    createPeerConnection: () => peer,
    createAudioElement: () => audio,
  };
  return { track, stream, channel, peer, fetch, dependencies };
}
describe("supervised voice lifecycle", () => {
  it("stops late-arriving microphone tracks after cancellation without starting paid work", async () => {
    const h = harness();
    const abort = new AbortController();
    let allow!: (stream: MediaStream) => void;
    h.dependencies.getUserMedia = () =>
      new Promise((resolve) => {
        allow = resolve;
      });
    const connect = connectSupervisedVoice(
      canvasId,
      DEFAULT_VOICE_SETTINGS,
      vi.fn(),
      vi.fn(),
      abort.signal,
      undefined,
      h.dependencies,
    );
    abort.abort();
    allow(h.stream);
    await expect(connect).rejects.toThrow();
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.peer.close).toHaveBeenCalledOnce();
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("releases the microphone when server admission fails", async () => {
    const h = harness();
    h.fetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Allowance reserved" }), {
        status: 409,
      }),
    );
    await expect(
      connectSupervisedVoice(
        canvasId,
        DEFAULT_VOICE_SETTINGS,
        vi.fn(),
        vi.fn(),
        new AbortController().signal,
        undefined,
        h.dependencies,
      ),
    ).rejects.toThrow("Allowance reserved");
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.peer.close).toHaveBeenCalledOnce();
  });
  it("supports mute and idempotent leave, requesting server hangup", async () => {
    const h = harness();
    const active = await connectSupervisedVoice(
      canvasId,
      DEFAULT_VOICE_SETTINGS,
      vi.fn(),
      vi.fn(),
      new AbortController().signal,
      sessionId,
      h.dependencies,
    );
    expect(JSON.parse(String(h.fetch.mock.calls[0][1]?.body))).toHaveProperty(
      "restartOf",
      sessionId,
    );
    active.mute(true);
    expect(h.track.enabled).toBe(false);
    active.mute(false);
    expect(h.track.enabled).toBe(true);
    active.close();
    active.close();
    expect(h.track.stop).toHaveBeenCalledOnce();
    expect(h.fetch).toHaveBeenLastCalledWith(
      `/api/canvases/${canvasId}/voice?id=${sessionId}`,
      expect.objectContaining({ method: "DELETE", keepalive: true }),
    );
    expect(() => active.send({ type: "response.create" })).toThrow(
      "disconnected",
    );
  });
});
