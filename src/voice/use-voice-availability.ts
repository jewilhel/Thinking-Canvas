"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

const schema = z.object({
  enabled: z.boolean(),
  needsPreviewAccess: z.boolean().optional(),
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
        redirect: "manual",
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (
        response.type === "opaqueredirect" ||
        (response.status >= 300 && response.status < 400)
      )
        return {
          enabled: false,
          needsPreviewAccess: true,
          reason:
            "Preview access expired. Press the voice button to renew it without reloading this canvas.",
        };
      const applicationJson = response.headers
        .get("content-type")
        ?.includes("application/json");
      if (!applicationJson && [401, 403].includes(response.status))
        return {
          enabled: false,
          needsPreviewAccess: true,
          reason:
            "Preview sign-in is required. Press the voice button to renew access without reloading this canvas.",
        };
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
  const renewal = useRef<Window | null>(null);
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
  const renewPreviewAccess = useCallback(async (): Promise<Availability> => {
    // Open synchronously from the participant's click; background checks never open windows.
    const popup = window.open(
      "/voice-access",
      "thinking-canvas-preview-access",
      "popup,width=560,height=640",
    );
    if (!popup)
      return {
        enabled: false,
        needsPreviewAccess: true,
        reason:
          "Allow the preview sign-in window, then press the voice button again. Your canvas has not been reloaded.",
      };
    renewal.current = popup;
    setAccessError(
      "Renewing preview access… Your canvas and unsaved captions stay open.",
    );
    const deadline = Date.now() + 60_000;
    while (renewal.current === popup && Date.now() < deadline) {
      const next = await check();
      if (next.enabled) {
        popup.close();
        renewal.current = null;
        return next;
      }
      if (popup.closed) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    renewal.current = null;
    return {
      enabled: false,
      needsPreviewAccess: true,
      reason:
        "Complete sign-in in the preview access window, then press the voice button again. Your canvas has not been reloaded.",
    };
  }, [check]);
  useEffect(() => {
    const refresh = () => {
      void check();
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      renewal.current?.close();
      renewal.current = null;
      pending.current?.controller.abort();
      pending.current = null;
    };
  }, [check]);
  return {
    availability,
    check,
    renewPreviewAccess,
    accessError,
    setAccessError,
  };
}
