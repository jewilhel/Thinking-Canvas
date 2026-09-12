"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

const schema = z.object({
  enabled: z.boolean(),
  reason: z.string().optional(),
  spentCents: z.number().optional(),
  reservedCents: z.number().optional(),
  build: z.string().optional(),
});
type Availability = z.infer<typeof schema>;
const unavailable = {
  enabled: false,
  reason:
    "Voice is temporarily unavailable. We'll keep checking automatically; you can also try the voice button again.",
};

export async function readVoiceAvailability(
  canvasId: string,
  signal: AbortSignal,
): Promise<Availability> {
  // Only this read-only preflight is retried, never paid session creation.
  for (let attempt = 0; attempt < 2 && !signal.aborted; attempt++) {
    try {
      const response = await fetch(`/api/canvases/${canvasId}/voice`, {
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      const applicationJson = response.headers
        .get("content-type")
        ?.includes("application/json");
      if (applicationJson && response.status === 401)
        return { enabled: false, reason: "Please sign in again to use voice." };
      if (applicationJson && response.status === 403)
        return {
          enabled: false,
          reason: "Voice requires editor access and canvas AI enabled.",
        };
      if (response.ok) return schema.parse(await response.json());
    } catch {
      // Network failures, gateway HTML and timeouts get one bounded retry.
    }
  }
  return unavailable;
}

export function useVoiceAvailability(canvasId: string) {
  const [availability, setAvailability] = useState<Availability>({
    enabled: false,
    reason: "Checking voice availability…",
  });
  const [accessError, setAccessError] = useState("");
  const pending = useRef<{
    controller: AbortController;
    promise: Promise<Availability>;
  } | null>(null);
  const check = useCallback(() => {
    if (pending.current) return pending.current.promise;
    const controller = new AbortController();
    const promise = readVoiceAvailability(canvasId, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setAvailability(next);
          if (next.enabled) setAccessError("");
        }
        return next;
      })
      .finally(() => {
        if (pending.current?.controller === controller) pending.current = null;
      });
    pending.current = { controller, promise };
    return promise;
  }, [canvasId]);
  useEffect(() => {
    const refresh = () => {
      void check();
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      pending.current?.controller.abort();
      pending.current = null;
    };
  }, [check]);
  return { availability, check, accessError, setAccessError };
}
