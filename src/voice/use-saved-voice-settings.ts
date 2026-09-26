"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_LIVE_SETTINGS,
  liveSettingsSchema,
  type LiveSettings,
} from "./live-protocol";
export function useSavedVoiceSettings(userId: string) {
  const key = `voice-settings:${userId}:live:v1`;
  const [draft, setDraft] = useState<LiveSettings>({
    ...DEFAULT_LIVE_SETTINGS,
  });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const ready = loadedKey === key;
  const [notice, setNotice] = useState("Loading saved settings…");
  const [retry, setRetry] = useState(0);
  const [revision, setRevision] = useState(0);
  const current = useRef(0);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/voice/settings", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error();
        const body = await response.json();
        let cached;
        try {
          cached = JSON.parse(localStorage.getItem(key) ?? "null");
        } catch {}
        const dirty =
          cached?.dirty &&
          liveSettingsSchema.safeParse(cached.settings).success;
        const value = liveSettingsSchema.parse(
          dirty ? cached.settings : (body.settings ?? DEFAULT_LIVE_SETTINGS),
        );
        if (cancelled) return;
        setDraft(value);
        setLoadedKey(key);
        setNotice(dirty ? "Saving…" : "Saved to your account");
        if (dirty) setRevision(++current.current);
      } catch {
        if (!cancelled)
          setNotice("Could not load saved settings. Retry before editing.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, retry]);
  const update = useCallback(
    (value: LiveSettings) => {
      if (!ready) return;
      setDraft(value);
      setNotice(
        liveSettingsSchema.safeParse(value).success
          ? "Saving…"
          : "Check the settings values before saving.",
      );
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ settings: value, dirty: true }),
        );
      } catch {}
      setRevision(++current.current);
    },
    [ready, key],
  );
  useEffect(() => {
    if (!ready || !revision) return;
    const parsed = liveSettingsSchema.safeParse(draft);
    if (!parsed.success) return;
    const timer = setTimeout(() => {
      queue.current = queue.current.then(async () => {
        if (revision !== current.current) return;
        try {
          const response = await fetch("/api/voice/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed.data),
            keepalive: true,
          });
          if (!response.ok) throw new Error();
          if (revision !== current.current) return;
          try {
            localStorage.setItem(
              key,
              JSON.stringify({ settings: parsed.data, dirty: false }),
            );
          } catch {}
          setNotice("Saved to your account");
        } catch {
          if (revision === current.current)
            setNotice(
              "Settings could not be saved. Retry to keep them across sessions.",
            );
        }
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, ready, revision, key]);
  return {
    draft,
    setDraft: update,
    ready,
    notice,
    retry: () =>
      ready ? setRevision(++current.current) : setRetry((n) => n + 1),
  };
}
