import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from "openai";

const quotaCodes = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
]);

/** Fixed labels only: never persist provider messages, bodies, or arbitrary codes. */
export function providerFailureCode(error: unknown): string | null {
  if (error instanceof APIUserAbortError) return "run_interrupted";
  if (error instanceof APIConnectionTimeoutError) return "provider_timeout";
  if (error instanceof APIConnectionError) return "provider_connection_failed";
  if (!(error instanceof APIError)) return null;
  if (quotaCodes.has(error.code ?? "")) return "provider_quota_exhausted";
  if (error.status === 429) return "provider_rate_limited";
  if (error.status === 401 || error.status === 403)
    return "provider_access_denied";
  if (error.status === 408) return "provider_timeout";
  if (error.status && error.status >= 500) return "provider_unavailable";
  return "provider_request_rejected";
}

/** A null delay means stop. Long server delays must not be shortened to fit a run. */
export function providerRetryDelay(
  error: unknown,
  attempt: number,
): number | null {
  if (error instanceof APIUserAbortError) return null;
  if (error instanceof APIError) {
    if (quotaCodes.has(error.code ?? "")) return null;
    if (
      error.status !== undefined &&
      ![408, 409, 429].includes(error.status) &&
      error.status < 500
    )
      return null;
    const retryAfter = error.headers?.get("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      const delay = Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(delay) && delay > 0) {
        return delay <= 10_000 ? delay : null;
      }
    }
  }
  return (
    Math.min(500 * 2 ** (attempt - 1), 4_000) + Math.floor(Math.random() * 250)
  );
}
