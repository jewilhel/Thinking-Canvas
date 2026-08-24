"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { CommentCommand, CommentThread } from "@/comments/comment-model";
import { SupabaseCommentRepository } from "@/comments/supabase-comment-repository";
import { createClient } from "@/lib/supabase/client";

export function useCanvasComments(
  canvasId: string,
  supabaseUrl: string,
  supabasePublishableKey: string,
) {
  const repository = useMemo(
    () =>
      new SupabaseCommentRepository(
        createClient({
          NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
        }),
      ),
    [supabasePublishableKey, supabaseUrl],
  );
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const next = await repository.load(canvasId);
      setThreads(next);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Comments could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [canvasId, repository]);

  useEffect(() => {
    const initialFrame = requestAnimationFrame(() => void refresh());
    let disposed = false;
    let unsubscribe: (() => Promise<void>) | undefined;
    void repository
      .subscribe(canvasId, () => void refresh())
      .then((next) => {
        if (disposed) {
          void next();
          return;
        }
        unsubscribe = next;
      })
      .catch((caught) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "Live comment updates are unavailable.",
        );
      });
    const handleFocus = () => void refresh();
    const recoveryInterval = window.setInterval(() => void refresh(), 1_500);
    window.addEventListener("focus", handleFocus);
    return () => {
      cancelAnimationFrame(initialFrame);
      window.clearInterval(recoveryInterval);
      disposed = true;
      window.removeEventListener("focus", handleFocus);
      void unsubscribe?.();
    };
  }, [canvasId, refresh, repository]);

  const execute = useCallback(
    async (command: CommentCommand) => {
      setPending(true);
      setError("");
      try {
        const result = await repository.execute(command);
        await refresh();
        await repository.broadcastInvalidated();
        return result;
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "The comment change failed.";
        setError(message);
        throw caught;
      } finally {
        setPending(false);
      }
    },
    [refresh, repository],
  );

  return { threads, loading, pending, error, refresh, execute };
}
