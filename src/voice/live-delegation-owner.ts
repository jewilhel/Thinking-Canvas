import { z } from "zod";
import {
  recognizesCanvasDescription,
  cancelsVoiceTask,
} from "./live-delegation-contract";

const fragment = z.object({
  type: z.literal("session.input_transcript.delta"),
  event_id: z.string().max(512),
  delta: z.string().max(4000),
  start_ms: z.number().nonnegative(),
  end_ms: z.number().nonnegative(),
});
const delegation = z.object({
  type: z.literal("session.delegation.created"),
  offset_ms: z.number().nonnegative(),
  delegation: z.object({
    id: z.string().min(1).max(512),
    type: z.literal("delegation"),
    target: z.literal("client"),
  }),
});
type Hooks = {
  run: (id: string, signal: AbortSignal) => Promise<string>;
  append: (
    type:
      | "session.thinking.append"
      | "session.commentary.append"
      | "session.instructions.append",
    id: string | null,
    content: string,
  ) => void;
  cancel: () => Promise<void>;
  quiet: () => boolean;
};
/** Volatile speech correlation only. No fragment is itself authority to execute. */
export class LiveDelegationOwner {
  private fragments: z.infer<typeof fragment>[] = [];
  private seen = new Set<string>();
  private pending = new Map<string, number>();
  private active?: { id: string; controller: AbortController };
  private queued?: { id: string; text: string };
  private testUntil = 0;
  private closed = false;
  private task?: Promise<void>;
  constructor(private hooks: Hooks) {}
  get busy() {
    return !!this.active || this.pending.size > 0 || !!this.queued;
  }
  requestDescription(now = Date.now()) {
    if (this.closed || this.busy) return;
    this.testUntil = now + 15000;
    this.hooks.append(
      "session.instructions.append",
      null,
      "The participant explicitly pressed Describe this canvas. Delegate that read-only canvas description request to the client now. Wait for the application result before describing the canvas.",
    );
    this.hooks.append(
      "session.commentary.append",
      null,
      "The participant has requested a description of the current canvas using the application control. A backend canvas read is needed before answering.",
    );
  }
  async cancel(persist = true) {
    this.testUntil = 0;
    this.pending.clear();
    this.offsets.clear();
    this.queued = undefined;
    this.active?.controller.abort();
    if (persist) await this.hooks.cancel();
  }
  async close() {
    this.closed = true;
    await this.cancel();
    await this.task;
    this.fragments = [];
  }
  receive(value: unknown, now = Date.now()) {
    if (this.closed) return;
    const f = fragment.safeParse(value);
    if (f.success) {
      if (this.fragments.some((x) => x.event_id === f.data.event_id)) return;
      this.fragments.push(f.data);
      this.fragments.sort((a, b) => a.start_ms - b.start_ms);
      this.fragments = this.fragments.slice(-100);
      const recent = this.fragments
        .filter((x) => x.end_ms >= f.data.end_ms - 8000)
        .map((x) => x.delta)
        .join("");
      if (cancelsVoiceTask(recent)) void this.cancel();
      return;
    }
    const d = delegation.safeParse(value);
    if (
      !d.success ||
      this.seen.has(d.data.delegation.id) ||
      this.seen.size >= 100
    )
      return;
    const id = d.data.delegation.id;
    this.seen.add(id);
    if (this.busy) return;
    this.pending.set(id, now + 2000);
    // Capture the relevant timeline, allowing late fragments up to the deadline.
    this.offsets.set(id, d.data.offset_ms);
  }
  private offsets = new Map<string, number>();
  tick(now = Date.now()) {
    if (this.closed) return;
    for (const [id, due] of this.pending) {
      if (now < due || !this.hooks.quiet()) continue;
      this.pending.delete(id);
      const offset = this.offsets.get(id)!;
      this.offsets.delete(id);
      const text = this.fragments
        .filter(
          (x) => x.end_ms >= offset - 12000 && x.start_ms <= offset + 2000,
        )
        .map((x) => x.delta)
        .join("");
      const explicitTest = this.testUntil >= now;
      this.testUntil = 0;
      if (!explicitTest && !recognizesCanvasDescription(text)) {
        this.hooks.append(
          "session.commentary.append",
          id,
          "The application has not performed a task. This preview supports only a read-only canvas description. Ask the participant to say Describe this canvas if that is what they want.",
        );
        continue;
      }
      const controller = new AbortController();
      this.active = { id, controller };
      this.task = this.hooks
        .run(id, controller.signal)
        .then((text) => {
          if (!this.closed && !controller.signal.aborted)
            this.queued = { id, text };
        })
        .catch(() => {
          if (!this.closed && !controller.signal.aborted)
            this.queued = {
              id,
              text: "The canvas description did not complete. No canvas changes were made.",
            };
        })
        .finally(() => {
          if (this.active?.id === id) this.active = undefined;
        });
    }
    if (this.queued && this.hooks.quiet()) {
      const result = this.queued;
      this.queued = undefined;
      // Bound bytes as well as text length: below the provider's 500-token append cap.
      let text = result.text;
      while (new TextEncoder().encode(text).length > 450)
        text = text.slice(0, -1);
      this.hooks.append("session.commentary.append", result.id, text);
    }
  }
}
