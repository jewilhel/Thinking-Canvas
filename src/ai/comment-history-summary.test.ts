import { describe, expect, it } from "vitest";
import { commentHistorySummary } from "./comment-history-summary";

describe("comment history summary", () => {
  it("orders and labels the conversation without mutating source replies", () => {
    const replies = [
      {
        id: "2",
        authorKind: "human",
        body: "Apply that version.",
        createdAt: "2026-09-07T02:00:00Z",
      },
      {
        id: "1",
        authorKind: "ai",
        body: "Suggested wording.",
        createdAt: "2026-09-07T01:00:00Z",
      },
    ];
    expect(
      commentHistorySummary({
        body: "Improve this.",
        authorKind: "human",
        replies,
      }),
    ).toBe(
      "human: Improve this.\n\nai: Suggested wording.\n\nhuman: Apply that version.",
    );
    expect(replies[0]?.id).toBe("2");
  });
  it("retains the latest suggestion and approval within a bounded history", () => {
    const summary = commentHistorySummary({
      body: "Improve this.",
      authorKind: "human",
      replies: [
        {
          id: "1",
          authorKind: "ai",
          body: "Earlier discussion ".repeat(1000),
          createdAt: "1",
        },
        {
          id: "2",
          authorKind: "ai",
          body: "Final suggested wording.",
          createdAt: "2",
        },
        {
          id: "3",
          authorKind: "human",
          body: "Apply that version.",
          createdAt: "3",
        },
      ],
    });
    expect(summary.length).toBeLessThanOrEqual(10_000);
    expect(summary).toContain("context truncated");
    expect(summary).toContain("ai: Final suggested wording.");
    expect(summary.endsWith("human: Apply that version.")).toBe(true);
  });
});
