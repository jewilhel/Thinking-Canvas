import { describe, expect, it } from "vitest";
import { delegationDiagnostic } from "./delegation-diagnostic";

describe("voice delegation diagnostics", () => {
  it("distinguishes application subclasses whose Error.name is generic", () => {
    class AiRunConflictError extends Error {}
    expect(
      delegationDiagnostic(
        new AiRunConflictError("The invoking comment is no longer open."),
      ),
    ).toEqual({
      errorType: "AiRunConflictError",
      reason: "invoking_comment_closed",
    });
  });
  it("never logs arbitrary provider, transcript or database error text", () => {
    expect(
      delegationDiagnostic(new Error("private conversation and token secret")),
    ).toEqual({
      errorType: "Error",
      reason: "unclassified",
    });
  });
});
