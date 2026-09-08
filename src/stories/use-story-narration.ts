"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StoryScene } from "@/stories/story-model";

export function useStoryNarration(
  canvasId: string,
  scenes: StoryScene[],
  activeSceneId: string | null,
) {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(
    new Map<string, { text: string; buffer: AudioBuffer }>(),
  );
  const [retry, setRetry] = useState(0);
  const [visit, setVisit] = useState(0);
  const [error, setError] = useState("");
  const context = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const buffers = useRef(
    new Map<string, { text: string; buffer: AudioBuffer }>(),
  );
  const scriptKey = JSON.stringify(
    scenes
      .filter((scene) => scene.narration?.trim())
      .map((scene) => ({ id: scene.id, text: scene.narration! })),
  );
  const scripts = useMemo(
    () => JSON.parse(scriptKey) as { id: string; text: string }[],
    [scriptKey],
  );
  const stop = useCallback(() => {
    source.current?.stop();
    source.current?.disconnect();
    source.current = null;
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    const current = new Map(scripts.map((script) => [script.id, script.text]));
    for (const [id, audio] of buffers.current) {
      if (current.get(id) !== audio.text) buffers.current.delete(id);
    }
    const retained = new Map(buffers.current);
    queueMicrotask(() => {
      if (!abort.signal.aborted) {
        setLoaded(retained);
        setError("");
      }
    });
    async function load(script: { id: string; text: string }) {
      if (buffers.current.get(script.id)?.text === script.text) return;
      const url = `/api/canvases/${canvasId}/stories/narration/${script.id}`;
      try {
        for (
          let attempt = 0;
          attempt < 150 && !abort.signal.aborted;
          attempt++
        ) {
          const response = await fetch(url, {
            method: "POST",
            signal: abort.signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              narration: script.text,
              retry: retry > 0 && attempt === 0,
            }),
          });
          if (!response.ok)
            throw new Error("Narration audio could not be prepared.");
          const metadata = (await response.json()) as {
            state: string;
            version: string;
          };
          if (metadata.state === "failed")
            throw new Error("Narration audio could not be prepared.");
          if (metadata.state !== "ready") {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          const audio = await fetch(
            `${url}?version=${encodeURIComponent(metadata.version)}`,
            { signal: abort.signal, cache: "no-store" },
          );
          if (!audio.ok)
            throw new Error("Narration audio could not be loaded.");
          context.current ??= new AudioContext();
          const decoded = await context.current.decodeAudioData(
            await audio.arrayBuffer(),
          );
          if (abort.signal.aborted) return;
          buffers.current.set(script.id, {
            text: script.text,
            buffer: decoded,
          });
          setLoaded(new Map(buffers.current));
          return;
        }
        if (!abort.signal.aborted)
          throw new Error("Narration is still preparing. Try again shortly.");
      } catch (caught) {
        if (!abort.signal.aborted)
          setError(
            caught instanceof Error ? caught.message : "Audio unavailable.",
          );
      }
    }
    // Bound provider/download concurrency while preparing all scenes in advance.
    void (async () => {
      for (
        let index = 0;
        index < scripts.length && !abort.signal.aborted;
        index += 2
      ) {
        await Promise.all(scripts.slice(index, index + 2).map(load));
      }
    })();
    return () => abort.abort();
  }, [canvasId, scripts, retry]);

  const activeText =
    scenes.find((scene) => scene.id === activeSceneId)?.narration ?? null;
  const activeAudio = useMemo(() => {
    const cached = activeSceneId ? loaded.get(activeSceneId) : null;
    return cached?.text === activeText ? cached.buffer : null;
  }, [activeSceneId, activeText, loaded]);
  useEffect(() => {
    stop();
    if (!enabled || !activeAudio || !context.current) return;
    const player = context.current.createBufferSource();
    player.buffer = activeAudio;
    player.connect(context.current.destination);
    source.current = player;
    player.start();
    return stop;
  }, [enabled, activeAudio, visit, stop]);

  useEffect(
    () => () => {
      stop();
      void context.current?.close();
      context.current = null;
      buffers.current.clear();
    },
    [stop],
  );

  async function toggle() {
    if (enabled) {
      stop();
      setEnabled(false);
      return;
    }
    context.current ??= new AudioContext();
    try {
      await context.current.resume();
      setError("");
      setEnabled(true);
    } catch {
      setError(
        "Your browser could not start audio. Try the audio toggle again.",
      );
    }
  }
  const ready = scripts.filter(
    (script) => loaded.get(script.id)?.text === script.text,
  ).length;
  return {
    enabled,
    toggle,
    stop,
    revisit: () => setVisit((value) => value + 1),
    error,
    preparing: ready < scripts.length && !error,
    status:
      scripts.length === 0
        ? "No narration yet"
        : ready < scripts.length
          ? `Preparing audio (${ready}/${scripts.length})`
          : "AI narration ready",
    retry: () => {
      setError("");
      setRetry((value) => value + 1);
    },
  };
}
