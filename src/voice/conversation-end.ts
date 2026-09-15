/** An explicit AI ending decision still waits for closing speech and a quiet gap. */
export class ConversationEnd {
  private requestedAt: number | null = null;
  private lastOutput: number | null = null;
  constructor(private end: () => void) {}
  request(now = Date.now()) {
    this.requestedAt = now;
    this.lastOutput = null;
  }
  cancel() {
    this.requestedAt = this.lastOutput = null;
  }
  output(now = Date.now()) {
    if (this.requestedAt !== null) this.lastOutput = now;
  }
  tick(busy: boolean, quiet: boolean, now = Date.now()) {
    if (this.requestedAt === null) return;
    if (busy || now - this.requestedAt > 60000) {
      this.cancel();
      return;
    }
    // An append acknowledgement isn't playback. Require observed closing output,
    // allow startup latency, then drain the output and leave room for a reply.
    if (
      this.lastOutput !== null &&
      now - this.requestedAt >= 12000 &&
      now - this.lastOutput >= 4000 &&
      quiet
    ) {
      this.cancel();
      this.end();
    }
  }
}
