"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PrimaryStory } from "@/stories/story-model";
import { StoryRepository } from "@/stories/story-repository";

export function useCanvasStory(canvasId: string) {
  const repository = useMemo(() => new StoryRepository(canvasId), [canvasId]);
  const [story, setStory] = useState<PrimaryStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const loaded = await repository.load(signal);
        setError("");
        setStory(loaded);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setError(
          caught instanceof Error
            ? caught.message
            : "The story could not be loaded.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [repository],
  );

  useEffect(() => {
    const controller = new AbortController();
    void repository
      .load(controller.signal)
      .then((loaded) => {
        setError("");
        setStory(loaded);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setError(
          caught instanceof Error
            ? caught.message
            : "The story could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [repository]);

  const capture = useCallback(
    async (input: Parameters<StoryRepository["capture"]>[0]) => {
      setSaving(true);
      setError("");
      try {
        const saved = await repository.capture(input);
        setStory(saved);
        return saved;
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "The scene could not be saved.",
        );
        return null;
      } finally {
        setSaving(false);
      }
    },
    [repository],
  );

  return { story, loading, saving, error, capture, reload };
}
