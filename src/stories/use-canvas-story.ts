"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { PrimaryStory } from "@/stories/story-model";
import { StoryRepository } from "@/stories/story-repository";

export function useCanvasStory(
  canvasId: string,
  supabaseUrl: string,
  supabasePublishableKey: string,
) {
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

  useEffect(() => {
    if (!story?.id) return;
    const supabase = createClient({
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
    });
    const channel = supabase
      .channel(`story:${story.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stories",
          filter: `canvas_id=eq.${canvasId}`,
        },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "story_scenes",
          filter: `story_id=eq.${story.id}`,
        },
        () => void reload(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canvasId, reload, story?.id, supabasePublishableKey, supabaseUrl]);

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

  const mutate = useCallback(
    async (input: Parameters<StoryRepository["mutate"]>[0]) => {
      setSaving(true);
      setError("");
      try {
        const saved = await repository.mutate(input);
        setStory(saved);
        return saved;
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "The scene change could not be saved.";
        try {
          setStory(await repository.load());
        } catch {
          // Preserve the actionable mutation failure when reconciliation fails.
        }
        setError(message);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [repository],
  );

  const deleteScene = useCallback(
    async (input: Parameters<StoryRepository["delete"]>[0]) => {
      setSaving(true);
      setError("");
      try {
        const saved = await repository.delete(input);
        setStory(saved);
        return saved;
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "The scene could not be deleted.";
        try {
          setStory(await repository.load());
        } catch {
          // Preserve the actionable mutation failure when reconciliation fails.
        }
        setError(message);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [repository],
  );

  return {
    story,
    loading,
    saving,
    error,
    capture,
    mutate,
    deleteScene,
    reload,
  };
}
