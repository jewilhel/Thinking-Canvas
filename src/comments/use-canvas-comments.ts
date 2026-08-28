"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CommentCollaboration,
  CommentCommand,
  CommentThread,
} from "@/comments/comment-model";
import { SupabaseCommentRepository } from "@/comments/supabase-comment-repository";
import { createClient } from "@/lib/supabase/client";

export function useCanvasComments(
  canvasId: string,
  userId: string,
  supabaseUrl: string,
  supabasePublishableKey: string,
  onAiTransactionApplied?: (changeSetId: string) => void,
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
  const [collaboration, setCollaboration] =
    useState<CommentCollaboration | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const runControllers = useRef(new Map<string, AbortController>());
  const recoveredRunIds = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const [next, nextCollaboration] = await Promise.all([
        repository.load(canvasId),
        repository.loadCollaboration(canvasId),
      ]);
      setThreads(next);
      setCollaboration(nextCollaboration);
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
    const controllers = runControllers.current;
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
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
    };
  }, [canvasId, refresh, repository]);

  const processAiRun = useCallback(
    async (runId: string) => {
      const controller = new AbortController();
      runControllers.current.set(runId, controller);
      try {
        const response = await fetch(`/api/canvases/${canvasId}/ai/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error("Thinking Canvas AI could not start.");
        }
        const reader = response.body
          .pipeThrough(new TextDecoderStream())
          .getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line) continue;
            const event = JSON.parse(line) as {
              status?: unknown;
              error?: unknown;
              changeSetId?: unknown;
            };
            if (event.status === "failed" && typeof event.error === "string") {
              setError(event.error);
            }
            if (
              event.status === "completed" &&
              typeof event.changeSetId === "string"
            ) {
              onAiTransactionApplied?.(event.changeSetId);
            }
            await refresh();
          }
        }
        await refresh();
        await repository.broadcastInvalidated();
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Thinking Canvas AI could not respond.",
          );
        }
      } finally {
        runControllers.current.delete(runId);
      }
    },
    [canvasId, onAiTransactionApplied, refresh, repository],
  );

  useEffect(() => {
    const staleBefore = Date.now() - 90_000;
    for (const run of threads.flatMap((thread) => thread.aiRuns)) {
      const active = [
        "queued",
        "projecting",
        "thinking",
        "tool_pending",
        "applying",
      ].includes(run.status);
      if (
        active &&
        run.requestedBy === userId &&
        Date.parse(run.updatedAt) <= staleBefore &&
        !runControllers.current.has(run.id) &&
        !recoveredRunIds.current.has(run.id)
      ) {
        recoveredRunIds.current.add(run.id);
        void processAiRun(run.id);
      }
    }
  }, [processAiRun, threads, userId]);

  const execute = useCallback(
    async (command: CommentCommand) => {
      setPending(true);
      setError("");
      try {
        const result = await repository.execute(command);
        await refresh();
        await repository.broadcastInvalidated();
        const aiRunId =
          result &&
          typeof result === "object" &&
          "ai_run_id" in result &&
          typeof result.ai_run_id === "string"
            ? result.ai_run_id
            : null;
        if (aiRunId) {
          void processAiRun(aiRunId);
        }
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
    [processAiRun, refresh, repository],
  );

  const cancelAiRun = useCallback(
    async (runId: string) => {
      const response = await fetch(`/api/canvases/${canvasId}/ai/runs`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "AI run could not be cancelled.",
        );
      }
      runControllers.current.get(runId)?.abort();
      await refresh();
      await repository.broadcastInvalidated();
    },
    [canvasId, refresh, repository],
  );

  const retryAiRun = useCallback(
    async (runId: string) => {
      const response = await fetch(`/api/canvases/${canvasId}/ai/runs`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: unknown;
        run_id?: unknown;
      } | null;
      if (!response.ok || typeof body?.run_id !== "string") {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "AI run could not be retried.",
        );
      }
      await refresh();
      await repository.broadcastInvalidated();
      void processAiRun(body.run_id);
    },
    [canvasId, processAiRun, refresh, repository],
  );

  const setAiSettings = useCallback(
    async (
      enabled: boolean,
      authority: NonNullable<
        typeof collaboration
      >["aiAccess"]["configuredAuthority"],
    ) => {
      if (!collaboration) return;
      setPending(true);
      setError("");
      try {
        await repository.setAiSettings(
          canvasId,
          enabled,
          authority,
          collaboration.aiAccess.version,
        );
        await refresh();
        await repository.broadcastInvalidated();
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "AI settings could not be changed.",
        );
        throw caught;
      } finally {
        setPending(false);
      }
    },
    [canvasId, collaboration, refresh, repository],
  );

  return {
    threads,
    collaboration,
    loading,
    pending,
    error,
    refresh,
    execute,
    setAiSettings,
    cancelAiRun,
    retryAiRun,
  };
}
