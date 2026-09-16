/** An explicit AI ending decision still waits for closing speech and a quiet gap. */
export class ConversationEnd {
  private requestedAt: number | null = null;
  private lastOutput: number | null = null;
  constructor(private end: () => void) {}
  request(now = Date.now(), waitForNewOutput = false) {
    this.requestedAt = now;
    if (waitForNewOutput) this.lastOutput = null;
  }
  get armed() {
    return this.requestedAt !== null;
  }
  pause() {
    this.requestedAt = null;
  }
  cancel() {
    this.requestedAt = this.lastOutput = null;
  }
  output(now = Date.now()) {
    this.lastOutput = now;
  }
  tick(busy: boolean, quiet: boolean, now = Date.now()) {
    if (this.requestedAt === null) return;
    if (busy || now - this.requestedAt > 60000) {
      this.cancel();
      return;
    }
    // An append acknowledgement isn't playback. Require observed closing output,
    // including a farewell already spoken while approval was in flight.
    if (this.lastOutput !== null && now - this.lastOutput >= 2500 && quiet) {
      this.cancel();
      this.end();
    }
  }
}
