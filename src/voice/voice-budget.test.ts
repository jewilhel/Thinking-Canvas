import { describe, expect, it } from "vitest";
import {
  conservativeUsageCents,
  voiceBudgetAllowsResponse,
} from "./voice-budget";
describe("voice cost guard", () => {
  it("rounds upward and declines unknown usage", () => {
    expect(conservativeUsageCents({ total_tokens: 1 })).toBe(1);
    expect(conservativeUsageCents({ total_tokens: 1000 })).toBe(7);
    expect(conservativeUsageCents({})).toBeNull();
    expect(conservativeUsageCents({ total_tokens: -1 })).toBeNull();
  });
  it("preserves the in-flight allowance before another response", () => {
    expect(voiceBudgetAllowsResponse(1000, 850)).toBe(true);
    expect(voiceBudgetAllowsResponse(1000, 851)).toBe(false);
    expect(voiceBudgetAllowsResponse(1000, NaN)).toBe(false);
  });
});
