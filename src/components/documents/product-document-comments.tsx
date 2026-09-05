"use client";

import { MessageCircle, RotateCcw, Send, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type * as Y from "yjs";

import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import type {
  CommentPromptKind,
  CommentThread,
} from "@/comments/comment-model";
import { useCanvasComments } from "@/comments/use-canvas-comments";
import { Button } from "@/components/ui/button";
import type { CanvasRole } from "@/domain/command";
import {
  resolveDocumentRange,
  type DocumentRangeTarget,
} from "@/documents/document-range";

type Props = {
  canvasDocument: Y.Doc;
  canvasId: string;
  canvasRole: CanvasRole;
  documentObjectId: string;
  objects: CanvasObjectV2[];
  selectedObjectIds: string[];
  selectedRange: DocumentRangeTarget | null;
  supabaseUrl: string;
  supabasePublishableKey: string;
  onAiTransactionApplied: (changeSetId: string) => void;
  onUndoAiTransaction: (changeSetId: string) => Promise<{ conflicts: number }>;
  compact?: boolean;
};

function targetLabel(
  thread: CommentThread,
  canvasDocument: Y.Doc,
  objectsById: Map<string, CanvasObjectV2>,
) {
  if (thread.documentRange) {
    const detached = resolveDocumentRange(
      canvasDocument,
      thread.documentRange,
    ).detached;
    return {
      label: detached ? "Detached text range" : "Selected text",
      quote: thread.documentRange.quote,
      detached,
    };
  }
  const object = thread.targetObjectIds
    .map((id) => objectsById.get(id))
    .find(Boolean);
  return {
    label: object ? `Document ${object.type}` : "Detached document object",
    quote: "",
    detached: !object,
  };
}

export function ProductDocumentComments({
  canvasDocument,
  canvasId,
  canvasRole,
  documentObjectId,
  objects,
  selectedObjectIds,
  selectedRange,
  supabaseUrl,
  supabasePublishableKey,
  onAiTransactionApplied,
  onUndoAiTransaction,
  compact = false,
}: Props) {
  const { threads, collaboration, loading, pending, error, execute } =
    useCanvasComments(
      canvasId,
      supabaseUrl,
      supabasePublishableKey,
      onAiTransactionApplied,
    );
  const [open, setOpen] = useState(false);
  const [commentRange, setCommentRange] = useState<DocumentRangeTarget | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<Record<string, string>>({});
  const [promptKind, setPromptKind] = useState<CommentPromptKind | null>(null);
  const [askAi, setAskAi] = useState(false);
  const [undoingChangeSetId, setUndoingChangeSetId] = useState<string | null>(
    null,
  );
  const [undoNotice, setUndoNotice] = useState("");
  const [undoError, setUndoError] = useState("");
  const objectsById = useMemo(
    () => new Map(objects.map((object) => [object.id, object])),
    [objects],
  );
  const internalObjectIds = selectedObjectIds.filter((id) => {
    const object = objectsById.get(id);
    return (
      object?.type !== "document" &&
      object?.documentOwnerId === documentObjectId
    );
  });
  const documentThreads = threads.filter(
    (thread) =>
      thread.documentRange?.documentObjectId === documentObjectId ||
      thread.targetObjectIds.some((id) => {
        const object = objectsById.get(id);
        return (
          object?.type !== "document" &&
          object?.documentOwnerId === documentObjectId
        );
      }),
  );
  const canComment = canvasRole !== "viewer";
  const effectiveRange = commentRange ?? selectedRange;
  const hasTarget = effectiveRange !== null || internalObjectIds.length > 0;

  async function createThread() {
    if (!draft.trim() || !hasTarget) return;
    await execute({
      type: "comment.create",
      commandId: crypto.randomUUID(),
      canvasId,
      body: draft.trim(),
      targetObjectIds: effectiveRange ? [] : internalObjectIds,
      orderedContextIds: effectiveRange
        ? [documentObjectId]
        : [documentObjectId, ...internalObjectIds],
      canvasAnchor: null,
      documentRange: effectiveRange,
      promptKind,
      authorKind: "human",
      authorKey: null,
      routing: askAi
        ? { recipientUserIds: [], includePrimaryAi: true }
        : undefined,
    });
    setDraft("");
    setPromptKind(null);
    setAskAi(false);
  }

  return (
    <>
      <Button
        type="button"
        size={compact ? "icon-sm" : undefined}
        variant="outline"
        className={compact ? undefined : "h-11 border-zinc-300 bg-white"}
        aria-label="Comments"
        title="Comments"
        aria-expanded={open}
        onMouseDown={() => {
          if (!open && selectedRange) setCommentRange(selectedRange);
        }}
        onClick={() => {
          if (open) {
            setOpen(false);
            setCommentRange(null);
          } else {
            if (selectedRange) setCommentRange(selectedRange);
            setOpen(true);
          }
        }}
      >
        <MessageCircle aria-hidden="true" />
        {compact ? (
          <span className="sr-only">
            {documentThreads.length
              ? `${documentThreads.length} document comments`
              : "No document comments"}
          </span>
        ) : (
          <>
            Comments
            {documentThreads.length ? ` (${documentThreads.length})` : ""}
          </>
        )}
      </Button>
      {open ? (
        <aside
          aria-label="Document comments"
          className="absolute top-16 right-3 z-[90] max-h-[calc(100%-5rem)] w-[min(25rem,calc(100%-1.5rem))] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Document comments</h2>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Close document comments"
              onClick={() => {
                setOpen(false);
                setCommentRange(null);
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          {canComment ? (
            <div className="mt-4 rounded-xl border border-zinc-200 p-3">
              <p className="text-xs font-medium text-zinc-600">
                {effectiveRange
                  ? `Comment on “${effectiveRange.quote}”`
                  : internalObjectIds.length
                    ? `Comment on ${internalObjectIds.length} selected document object(s)`
                    : "Select text or a document object to comment"}
              </p>
              <textarea
                aria-label="New document comment"
                value={draft}
                disabled={!hasTarget || pending}
                className="mt-2 min-h-20 w-full rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-violet-500"
                onChange={(event) => setDraft(event.currentTarget.value)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  aria-label="Structured response"
                  value={promptKind ?? ""}
                  className="h-9 rounded-md border border-zinc-300 px-2 text-sm"
                  onChange={(event) =>
                    setPromptKind(
                      (event.currentTarget.value ||
                        null) as CommentPromptKind | null,
                    )
                  }
                >
                  <option value="">Reply</option>
                  <option value="yes_no">Yes / No</option>
                  <option value="review">Review decision</option>
                  <option value="rating">Rating</option>
                </select>
                {collaboration?.aiAccess.enabled ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={askAi}
                      onChange={(event) =>
                        setAskAi(event.currentTarget.checked)
                      }
                    />
                    Ask AI
                  </label>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  disabled={!hasTarget || !draft.trim() || pending}
                  onClick={() => void createThread()}
                >
                  <Send aria-hidden="true" /> Comment
                </Button>
              </div>
            </div>
          ) : null}
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
          {undoError ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {undoError}
            </p>
          ) : null}
          {undoNotice ? (
            <p role="status" className="mt-3 text-sm text-amber-800">
              {undoNotice}
            </p>
          ) : null}
          <div className="mt-4 space-y-3">
            {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
            {!loading && !documentThreads.length ? (
              <p className="text-sm text-zinc-500">No document comments yet.</p>
            ) : null}
            {documentThreads.map((thread) => {
              const target = targetLabel(thread, canvasDocument, objectsById);
              return (
                <article
                  key={thread.id}
                  className="rounded-xl border border-zinc-200 p-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                    <span>{target.label}</span>
                    <span>{thread.status}</span>
                  </div>
                  {target.quote ? (
                    <blockquote
                      className={`mt-2 border-l-2 pl-2 text-sm ${target.detached ? "border-amber-500 text-amber-800" : "border-violet-400 text-zinc-600"}`}
                    >
                      {target.quote}
                    </blockquote>
                  ) : null}
                  <p className="mt-2 text-sm">{thread.body}</p>
                  {thread.replies.map((item) => (
                    <div key={item.id} className="mt-2 border-l pl-2 text-sm">
                      <p>
                        <span className="font-medium">{item.authorName}:</span>{" "}
                        {item.body}
                      </p>
                      {item.aiTransaction?.status === "active" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          disabled={
                            undoingChangeSetId ===
                            item.aiTransaction.changeSetId
                          }
                          onClick={() => {
                            const changeSetId = item.aiTransaction!.changeSetId;
                            setUndoError("");
                            setUndoNotice("");
                            setUndoingChangeSetId(changeSetId);
                            void onUndoAiTransaction(changeSetId)
                              .then(({ conflicts }) =>
                                setUndoNotice(
                                  conflicts
                                    ? `AI change undone; ${conflicts} later edit${conflicts === 1 ? " was" : "s were"} preserved.`
                                    : "AI document change undone.",
                                ),
                              )
                              .catch((undoFailure: unknown) =>
                                setUndoError(
                                  undoFailure instanceof Error
                                    ? undoFailure.message
                                    : "The AI document change could not be undone.",
                                ),
                              )
                              .finally(() => setUndoingChangeSetId(null));
                          }}
                        >
                          <RotateCcw aria-hidden="true" /> Undo AI change
                        </Button>
                      ) : item.aiTransaction?.status === "undone" ? (
                        <p className="mt-1 text-xs text-zinc-500">
                          Change undone
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {thread.prompt && canComment && thread.status === "open" ? (
                    <div
                      className="mt-3 flex flex-wrap gap-2"
                      aria-label="Structured response"
                    >
                      {thread.prompt.kind === "yes_no"
                        ? ["yes", "no"].map((answer) => (
                            <Button
                              key={answer}
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void execute({
                                  type: "comment.respond",
                                  commandId: crypto.randomUUID(),
                                  promptId: thread.prompt!.id,
                                  promptKind: "yes_no",
                                  value: { answer },
                                })
                              }
                            >
                              {answer === "yes" ? "Yes" : "No"}
                            </Button>
                          ))
                        : thread.prompt.kind === "review"
                          ? ["approve", "revise", "discard"].map((decision) => (
                              <Button
                                key={decision}
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void execute({
                                    type: "comment.respond",
                                    commandId: crypto.randomUUID(),
                                    promptId: thread.prompt!.id,
                                    promptKind: "review",
                                    value: { decision },
                                  })
                                }
                              >
                                {decision[0]!.toUpperCase() + decision.slice(1)}
                              </Button>
                            ))
                          : [1, 2, 3, 4, 5].map((rating) => (
                              <Button
                                key={rating}
                                type="button"
                                size="icon-sm"
                                variant="outline"
                                aria-label={`Rate ${rating}`}
                                onClick={() =>
                                  void execute({
                                    type: "comment.respond",
                                    commandId: crypto.randomUUID(),
                                    promptId: thread.prompt!.id,
                                    promptKind: "rating",
                                    value: { rating },
                                  })
                                }
                              >
                                {rating}
                              </Button>
                            ))}
                    </div>
                  ) : null}
                  {thread.status === "open" && canComment ? (
                    <div className="mt-3 flex gap-2">
                      <input
                        aria-label={`Reply to ${thread.body}`}
                        value={reply[thread.id] ?? ""}
                        className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 text-sm"
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setReply((current) => ({
                            ...current,
                            [thread.id]: value,
                          }));
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!reply[thread.id]?.trim() || pending}
                        onClick={() =>
                          void execute({
                            type: "comment.reply",
                            commandId: crypto.randomUUID(),
                            commentId: thread.id,
                            body: reply[thread.id]!.trim(),
                          }).then(() =>
                            setReply((current) => ({
                              ...current,
                              [thread.id]: "",
                            })),
                          )
                        }
                      >
                        Reply
                      </Button>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {thread.status === "open" && canComment ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void execute({
                              type: "comment.status",
                              commentId: thread.id,
                              status: "resolved",
                            })
                          }
                        >
                          Resolve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void execute({
                              type: "comment.status",
                              commentId: thread.id,
                              status: "dismissed",
                            })
                          }
                        >
                          Dismiss
                        </Button>
                      </>
                    ) : null}
                    {canComment ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete comment thread"
                        onClick={() =>
                          void execute({
                            type: "comment.delete",
                            commentId: thread.id,
                          })
                        }
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </aside>
      ) : null}
    </>
  );
}
