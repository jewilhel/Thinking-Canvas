import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { connectLiveVoice } from "@/voice/live-webrtc";
import { LiveVoice } from "./live-conversation";

vi.mock("@/voice/live-webrtc", () => ({ connectLiveVoice: vi.fn() }));
vi.mock("@/voice/use-voice-availability", () => ({
  useVoiceAvailability: () => ({
    availability: { enabled: true },
    check: async () => ({ enabled: true }),
    setAccessError: vi.fn(),
  }),
}));
vi.mock("@/components/canvas/workspace-panel", () => ({
  WorkspacePanel: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock("./voice-control-button", () => ({
  VoiceControlButton: ({
    active,
    status,
    onAction,
    onSettings,
  }: {
    active: boolean;
    status: string;
    onAction: (button: HTMLButtonElement) => void;
    onSettings: (button: HTMLButtonElement) => void;
  }) => (
    <>
      <span data-testid="voice-control-state">{status}</span>
      <button onClick={(e) => onAction(e.currentTarget)}>
        {active ? "Stop test voice" : "Start test voice"}
      </button>
      <button onClick={(e) => onSettings(e.currentTarget)}>
        Test settings
      </button>
    </>
  ),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("shows task failures with settings closed, preserves later success, and does not repeat dismissed failures", async () => {
  let failedTaskId: string | null = null;
  let polls = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/voice?id=")) {
      polls++;
      return Response.json({
        failedTaskId,
        // The next request can finish before the status poll sees the failure.
        taskStatus: "completed",
        backendPending: false,
      });
    }
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  const close = vi.fn();
  const send = vi.fn();
  vi.mocked(connectLiveVoice).mockResolvedValue({
    id: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    model: "gpt-live-1",
    send,
    mute: vi.fn(),
    close,
  });
  const controls = document.createElement("div");
  document.body.append(controls);
  const view = render(
    <LiveVoice
      canvasId="test"
      userId="test"
      controlTarget={controls}
      canSaveTranscript
      onSaveTranscript={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("Start test voice"));
  fireEvent.click(await screen.findByText("Allow microphone and start"));
  await screen.findByText("Stop test voice");
  failedTaskId = "first-failure";
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy(), {
    timeout: 3000,
  });
  expect(screen.getByRole("alert").textContent).toContain(
    "Earlier completed changes still stand",
  );
  expect(screen.queryByText("Voice and behavior")).toBeNull();
  fireEvent.click(screen.getByText("Dismiss"));
  const previousPolls = polls;
  await waitFor(() => expect(polls).toBeGreaterThan(previousPolls), {
    timeout: 3000,
  });
  expect(screen.queryByRole("alert")).toBeNull();
  failedTaskId = "second-failure";
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy(), {
    timeout: 3000,
  });
  expect(screen.getByTestId("voice-control-state").textContent).toBe(
    "Connected",
  );
  // Visual status must not trigger speech or shut down an otherwise good call.
  expect(send).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Stop test voice"));
  expect(screen.queryByRole("alert")).toBeNull();
  view.unmount();
  controls.remove();
}, 12000);

it("shows reconnecting during a short outage and keeps the same call available to end", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({})),
  );
  const close = vi.fn();
  vi.mocked(connectLiveVoice).mockImplementation(
    async (_canvas, _settings, _event, state) => {
      state("connecting");
      return {
        id: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        model: "gpt-live-1",
        send: vi.fn(),
        mute: vi.fn(),
        close,
      };
    },
  );
  const controls = document.createElement("div");
  document.body.append(controls);
  const view = render(
    <LiveVoice
      canvasId="test"
      userId="test"
      controlTarget={controls}
      canSaveTranscript
      onSaveTranscript={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("Start test voice"));
  fireEvent.click(await screen.findByText("Allow microphone and start"));
  await screen.findByText("Stop test voice");
  const state = vi.mocked(connectLiveVoice).mock.calls[0][3];
  act(() => state("disconnected"));
  expect(screen.getByTestId("voice-control-state").textContent).toBe(
    "Reconnecting",
  );
  expect(screen.getByText("Stop test voice")).toBeTruthy();
  act(() => state("connected"));
  expect(screen.getByTestId("voice-control-state").textContent).toBe(
    "Connected",
  );
  const record = JSON.parse(
    localStorage.getItem(
      "thinking-canvas:voice:test:test:records:v1:live:v2",
    ) ?? "[]",
  )[0];
  expect(record.connectionMs).toBeGreaterThanOrEqual(0);
  expect(record.reconnectMs).toHaveLength(1);
  expect(record.reconnectMs[0]).toBeGreaterThanOrEqual(0);
  expect(connectLiveVoice).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Stop test voice"));
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  controls.remove();
});

it("recovers from denied microphone access and points to typed comments", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({})),
  );
  const close = vi.fn();
  vi.mocked(connectLiveVoice)
    .mockRejectedValueOnce(
      new DOMException("Permission denied", "NotAllowedError"),
    )
    .mockResolvedValueOnce({
      id: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      model: "gpt-live-1",
      send: vi.fn(),
      mute: vi.fn(),
      close,
    });
  const controls = document.createElement("div");
  document.body.append(controls);
  const view = render(
    <LiveVoice
      canvasId="test"
      userId="test"
      controlTarget={controls}
      canSaveTranscript
      onSaveTranscript={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("Start test voice"));
  fireEvent.click(await screen.findByText("Allow microphone and start"));
  await screen.findByText(/Microphone access was denied.*typed comments/);
  expect(screen.getByTestId("voice-control-state").textContent).toBe("Ended");
  fireEvent.click(screen.getByText("Start test voice"));
  await screen.findByText("Stop test voice");
  expect(connectLiveVoice).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/Microphone access was denied/)).toBeNull();
  fireEvent.click(screen.getByText("Stop test voice"));
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  controls.remove();
});

it("defaults to the latest session, exports only the selected session, and ignores an old transport closure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({})),
  );
  vi.mocked(connectLiveVoice).mockImplementation(async () => ({
    id: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    model: "gpt-live-1",
    send: vi.fn(),
    mute: vi.fn(),
    close: vi.fn(),
  }));
  const save = vi.fn();
  const controls = document.createElement("div");
  document.body.append(controls);
  const view = render(
    <LiveVoice
      canvasId="test"
      userId="test"
      controlTarget={controls}
      canSaveTranscript
      onSaveTranscript={save}
    />,
  );
  const start = async (first = false) => {
    fireEvent.click(screen.getByText("Start test voice"));
    if (first)
      fireEvent.click(await screen.findByText("Allow microphone and start"));
    await screen.findByText("Stop test voice");
  };
  const emit = (call: number, text: string) =>
    act(() =>
      vi.mocked(connectLiveVoice).mock.calls[call][2]({
        type: "session.input_transcript.delta",
        event_id: "repeated",
        delta: text,
        start_ms: 0,
        end_ms: 100,
      }),
    );
  await start(true);
  emit(0, "First conversation only");
  fireEvent.click(screen.getByText("Stop test voice"));
  await start();
  emit(1, "Second conversation only");
  act(() => vi.mocked(connectLiveVoice).mock.calls[0][3]("closed"));
  expect(screen.getByText("Stop test voice")).toBeTruthy();
  expect(vi.mocked(connectLiveVoice).mock.calls[1][8]?.text).toContain(
    "First conversation only",
  );
  fireEvent.click(screen.getByText("Test settings"));
  fireEvent.click(screen.getByText("Save selected conversation"));
  fireEvent.click(
    screen.getByText("Save partial transcript as canvas document"),
  );
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0]).toContain("Second conversation only");
  expect(save.mock.calls[0][0]).not.toContain("First conversation only");
  const picker = screen.getByLabelText(
    "Transcript conversation",
  ) as HTMLSelectElement;
  fireEvent.change(picker, { target: { value: picker.options[1].value } });
  fireEvent.click(screen.getByText("Save selected conversation"));
  fireEvent.click(
    screen.getByText("Save partial transcript as canvas document"),
  );
  expect(save.mock.calls[1][0]).toContain("First conversation only");
  expect(save.mock.calls[1][0]).not.toContain("Second conversation only");
  act(() =>
    vi.mocked(connectLiveVoice).mock.calls[1][2]({
      type: "session.closed",
      reason: "close_requested",
      usage: { seconds: 30 },
    }),
  );
  await screen.findByText("Start test voice");
  expect(screen.queryByText("Stop test voice")).toBeNull();
  view.unmount();
  controls.remove();
});

it("remembers consent across canvases and remounts, but not across accounts or without a start click", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({})),
  );
  vi.mocked(connectLiveVoice).mockImplementation(async () => ({
    id: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    model: "gpt-live-1",
    send: vi.fn(),
    mute: vi.fn(),
    close: vi.fn(),
  }));
  const controls = document.createElement("div");
  document.body.append(controls);
  const mount = (canvasId: string, userId = "first-account") =>
    render(
      <LiveVoice
        canvasId={canvasId}
        userId={userId}
        controlTarget={controls}
        canSaveTranscript
        onSaveTranscript={vi.fn()}
      />,
    );
  let view = mount("first-canvas");
  fireEvent.click(screen.getByText("Start test voice"));
  fireEvent.click(await screen.findByText("Allow microphone and start"));
  await screen.findByText("Stop test voice");
  view.unmount();
  view = mount("second-canvas");
  await act(async () => {});
  expect(connectLiveVoice).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Start test voice"));
  await screen.findByText("Stop test voice");
  expect(screen.queryByText("Allow microphone and start")).toBeNull();
  expect(connectLiveVoice).toHaveBeenCalledTimes(2);
  view.unmount();
  view = mount("second-canvas", "different-account");
  fireEvent.click(screen.getByText("Start test voice"));
  await screen.findByText("Allow microphone and start");
  expect(connectLiveVoice).toHaveBeenCalledTimes(2);
  view.unmount();
  controls.remove();
});
