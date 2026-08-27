"use client";

import { Check, Eye, RotateCcw, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CanvasRole } from "@/domain/command";

type ReviewDecision = {
  id: string;
  reviewer_id: string;
  decision: "keep" | "discard" | "revise";
  note: string | null;
  child_run_id: string | null;
  created_at: string;
};

type ObjectChange = {
  id: string;
  object_id: string;
  affected_fields: string[];
  what_changed: string | null;
  why: string | null;
  review_status: string;
  conflict_metadata: { paths?: string[] };
  review_decisions: ReviewDecision[];
};

type Review = {
  id: string;
  status: string;
  source_comment_id: string | null;
  scope_kind: string | null;
  scope_object_ids: string[];
  summary: string | null;
  created_at: string;
  ai_object_changes: ObjectChange[];
};

function scopeLabel(review: Review) {
  if (review.scope_kind === "single_object") return "Single object";
  if (review.scope_kind === "explicit_context") {
    return `${review.scope_object_ids.length} selected objects`;
  }
  return "Nearby canvas area";
}

export function CanvasAiReviews({
  canvasId,
  canvasRole,
  onFocusObject,
}: {
  canvasId: string;
  canvasRole: CanvasRole;
  onFocusObject: (objectId: string) => boolean;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [sceneIndices, setSceneIndices] = useState<Record<string, number>>({});
  const [unavailableId, setUnavailableId] = useState<string | null>(null);
  const decisionKeys = useRef(new Map<string, string>());
  const canDecide = canvasRole === "owner" || canvasRole === "editor";

  const load = useCallback(async () => {
    const response = await fetch(`/api/canvases/${canvasId}/reviews`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      reviews?: Review[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(payload.error ?? "Reviews could not load.");
    setReviews(payload.reviews ?? []);
  }, [canvasId]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        await load();
        if (active) setError("");
      } catch (nextError) {
        if (active) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Reviews could not load.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [load]);

  async function decide(
    review: Review,
    change: ObjectChange,
    index: number,
    decision: "keep" | "discard" | "revise",
  ) {
    setBusyId(change.id);
    setError("");
    const retryKey = `${change.id}:${decision}:${decision === "revise" ? revisionNote : ""}`;
    const idempotencyKey =
      decisionKeys.current.get(retryKey) ?? crypto.randomUUID();
    decisionKeys.current.set(retryKey, idempotencyKey);
    try {
      const response = await fetch(`/api/canvases/${canvasId}/reviews`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          objectChangeId: change.id,
          decision,
          note: decision === "revise" ? revisionNote : null,
          idempotencyKey,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        childRunId?: string | null;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "The review decision failed.");
      if (payload.childRunId) {
        await fetch(`/api/canvases/${canvasId}/ai/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId: payload.childRunId }),
        });
      }
      setRevisionId(null);
      setRevisionNote("");
      decisionKeys.current.delete(retryKey);
      const nextUnresolved = review.ai_object_changes.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index &&
          (candidate.review_status === "activated" ||
            candidate.review_status === "pending"),
      );
      setSceneIndices((current) => ({
        ...current,
        [review.id]:
          nextUnresolved >= 0
            ? nextUnresolved
            : Math.min(index + 1, review.ai_object_changes.length - 1),
      }));
      await load();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The review decision failed.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (loading)
    return <p className="text-sm text-zinc-500">Loading review changes…</p>;
  if (!reviews.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
        AI changes that are visible tentatively on this canvas will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="canvas-ai-reviews">
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}
      {reviews.map((review) => (
        <section
          key={review.id}
          className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
        >
          <div className="flex items-start gap-2">
            <Sparkles
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-violet-600"
            />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-zinc-900">
                {review.summary ?? "AI canvas changes"}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                {scopeLabel(review)} · {review.status.replaceAll("_", " ")}
              </p>
            </div>
          </div>
          <ol className="mt-3 space-y-3">
            {(() => {
              const fallbackIndex = Math.max(
                0,
                review.ai_object_changes.findIndex(
                  (candidate) =>
                    candidate.review_status === "activated" ||
                    candidate.review_status === "pending",
                ),
              );
              const index = Math.min(
                sceneIndices[review.id] ?? fallbackIndex,
                review.ai_object_changes.length - 1,
              );
              const change = review.ai_object_changes[index];
              if (!change) return null;
              const pending =
                change.review_status === "activated" ||
                change.review_status === "pending";
              const revising = revisionId === change.id;
              return (
                <li
                  key={change.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                      Change {index + 1} of {review.ai_object_changes.length}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        setUnavailableId(
                          onFocusObject(change.object_id) ? null : change.id,
                        );
                      }}
                    >
                      <Eye aria-hidden="true" /> View
                    </Button>
                  </div>
                  <p className="mt-2 text-sm font-medium text-zinc-900">
                    {change.what_changed}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">{change.why}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {change.review_status.replaceAll("_", " ")}
                  </p>
                  {unavailableId === change.id ? (
                    <p role="status" className="mt-2 text-xs text-amber-700">
                      Target unavailable. Its before/after review evidence is
                      still preserved.
                    </p>
                  ) : null}
                  {pending && canDecide ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busyId === change.id}
                          onClick={() =>
                            void decide(review, change, index, "keep")
                          }
                        >
                          <Check aria-hidden="true" /> Keep
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === change.id}
                          onClick={() =>
                            void decide(review, change, index, "discard")
                          }
                        >
                          <X aria-hidden="true" /> Discard
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === change.id}
                          onClick={() =>
                            setRevisionId(revising ? null : change.id)
                          }
                        >
                          <RotateCcw aria-hidden="true" /> Request revision
                        </Button>
                      </div>
                      {revising ? (
                        <div className="space-y-2">
                          <label
                            className="block text-xs font-medium text-zinc-700"
                            htmlFor={`revision-${change.id}`}
                          >
                            What should the AI revise?
                          </label>
                          <textarea
                            id={`revision-${change.id}`}
                            value={revisionNote}
                            onChange={(event) =>
                              setRevisionNote(event.target.value)
                            }
                            className="min-h-20 w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm"
                            maxLength={10_000}
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              !revisionNote.trim() || busyId === change.id
                            }
                            onClick={() =>
                              void decide(review, change, index, "revise")
                            }
                          >
                            Send revision
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => {
                        const nextIndex = index - 1;
                        setSceneIndices((current) => ({
                          ...current,
                          [review.id]: nextIndex,
                        }));
                        onFocusObject(
                          review.ai_object_changes[nextIndex]!.object_id,
                        );
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={
                        pending || index >= review.ai_object_changes.length - 1
                      }
                      onClick={() => {
                        const nextIndex = index + 1;
                        setSceneIndices((current) => ({
                          ...current,
                          [review.id]: nextIndex,
                        }));
                        onFocusObject(
                          review.ai_object_changes[nextIndex]!.object_id,
                        );
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </li>
              );
            })()}
          </ol>
        </section>
      ))}
    </div>
  );
}
