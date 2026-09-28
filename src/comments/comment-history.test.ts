import { describe, expect, it } from "vitest";
import { groupCommentHistory } from "./comment-history";
import type { CommentThread } from "./comment-model";
import { threadAnchor } from "@/components/comments/canvas-comments";
const thread = (id: string, voiceSessionId?: string) =>
  ({
    id,
    voiceSessionId,
    canvasAnchor: { x: 0, y: 0 },
    targetObjectIds: [],
  }) as unknown as CommentThread;
describe("voice activity history", () => {
  it("groups each session without swallowing explicit comments or losing action records", () => {
    const entries = groupCommentHistory([
      thread("a", "session1"),
      thread("explicit"),
      thread("b", "session1"),
      thread("c", "session2"),
    ]);
    expect(entries.map((e) => e.threads.map((t) => t.id))).toEqual([
      ["a", "b"],
      ["explicit"],
      ["c"],
    ]);
    expect(entries[1].sessionId).toBeNull();
  });
  it("never places a voice activity marker at its historical origin", () => {
    expect(
      threadAnchor(thread("a", "session1"), new Map(), {
        x: 10,
        y: 20,
        scale: 1,
      }),
    ).toBeNull();
    expect(
      threadAnchor(thread("explicit"), new Map(), { x: 10, y: 20, scale: 1 }),
    ).toEqual({ left: 10, top: 20 });
  });
});
