// @vitest-environment node
import { expect, it } from "vitest";

it("loads the standalone supervisor without Next.js server-component dependencies", async () => {
  const supervisor = await import("./live-supervisor");
  expect(supervisor.superviseLiveVoice).toBeTypeOf("function");
});
