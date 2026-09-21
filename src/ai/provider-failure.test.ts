import { APIConnectionError, APIError, APIUserAbortError } from "openai";
import { describe, expect, it } from "vitest";
import { providerFailureCode, providerRetryDelay } from "@/ai/provider-failure";

const apiError = (status: number, code = "private-code", retryAfter?: string) =>
  new APIError(
    status,
    { code, message: "private document text" },
    undefined,
    new Headers(retryAfter ? { "retry-after": retryAfter } : {}),
  );

describe("provider recovery policy", () => {
  it.each([
    [401, "private-code", "provider_access_denied"],
    [403, "private-code", "provider_access_denied"],
    [400, "private-code", "provider_request_rejected"],
    [429, "rate_limit_exceeded", "provider_rate_limited"],
    [429, "insufficient_quota", "provider_quota_exhausted"],
    [429, "project_spend_limit_exceeded", "provider_quota_exhausted"],
    [503, "server_is_overloaded", "provider_unavailable"],
  ])(
    "classifies %s without copying provider content",
    (status, code, expected) => {
      expect(providerFailureCode(apiError(status, code))).toBe(expected);
    },
  );

  it("distinguishes connection failure from cancellation", () => {
    expect(providerFailureCode(new APIConnectionError({}))).toBe(
      "provider_connection_failed",
    );
    expect(providerRetryDelay(new APIUserAbortError(), 1)).toBeNull();
  });

  it("does not retry permanent request/access/quota failures", () => {
    for (const error of [
      apiError(400),
      apiError(401),
      apiError(403),
      apiError(429, "credit_balance_exhausted"),
    ]) {
      expect(providerRetryDelay(error, 1)).toBeNull();
    }
  });

  it("honors Retry-After without shortening an excessive server delay", () => {
    expect(
      providerRetryDelay(apiError(503, "server_is_overloaded", "2"), 1),
    ).toBe(2000);
    expect(
      providerRetryDelay(apiError(429, "rate_limit_exceeded", "60"), 1),
    ).toBeNull();
  });

  it("uses increasing jittered backoff when the provider supplies no delay", () => {
    const first = providerRetryDelay(apiError(503), 1)!;
    const second = providerRetryDelay(apiError(503), 2)!;
    expect(first).toBeGreaterThanOrEqual(500);
    expect(first).toBeLessThan(750);
    expect(second).toBeGreaterThanOrEqual(1000);
    expect(second).toBeLessThan(1250);
  });
});
