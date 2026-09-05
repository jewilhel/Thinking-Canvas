"use client";

import { ArrowUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  CommentPrompt,
  CommentPromptKind,
  CommentRecipient,
  CommentThread,
  PromptResponseValue,
} from "@/comments/comment-model";
import { useCanvasComments } from "@/comments/use-canvas-comments";
import {
  RecipientComposer,
  ThreadBody,
} from "@/components/comments/canvas-comments";
import { Button } from "@/components/ui/button";
import type { DocumentRangeTarget } from "@/documents/document-range";
import type { CanvasRole } from "@/domain/command";

type Props = {
  canvasId: string;
  userId: string;
  canvasRole: CanvasRole;
  documentObjectId: string;
  selectedRange: DocumentRangeTarget | null;
  supabaseUrl: string;
  supabasePublishableKey: string;
  onAiTransactionApplied: (changeSetId: string) => void;
  onUndoAiTransaction: (changeSetId: string) => Promise<{ conflicts: number }>;
  onSelectEvidence: (objectId: string) => void;
  open: boolean;
  anchorPosition: { left: number; top: number } | null;
  onOpenChange: (open: boolean) => void;
  onThreadsChange: (threads: CommentThread[]) => void;
};

export function ProductDocumentComments({
  canvasId,
  userId,
  canvasRole,
  documentObjectId,
  selectedRange,
  supabaseUrl,
  supabasePublishableKey,
  onAiTransactionApplied,
  onUndoAiTransaction,
  onSelectEvidence,
  open,
  anchorPosition,
  onOpenChange,
  onThreadsChange,
}: Props) {
  const {
    threads,
    collaboration,
    loading,
    pending,
    error,
    refresh,
    execute,
    cancelAiRun,
    retryAiRun,
  } = useCanvasComments(
    canvasId,
    supabaseUrl,
    supabasePublishableKey,
    onAiTransactionApplied,
  );
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftRecipients, setDraftRecipients] = useState<CommentRecipient[]>(
    [],
  );
  const [promptKind, setPromptKind] = useState<CommentPromptKind | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const documentThreads = useMemo(
    () =>
      threads.filter(
        (thread) => thread.documentRange?.documentObjectId === documentObjectId,
      ),
    [documentObjectId, threads],
  );
  const selectedThread =
    documentThreads.find((thread) => thread.id === selectedThreadId) ?? null;
  const canComment = canvasRole !== "viewer";

  useEffect(() => {
    onThreadsChange(documentThreads);
  }, [documentThreads, onThreadsChange]);

  useEffect(() => {
    if (open && !selectedThreadId) {
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  }, [open, selectedThreadId]);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || panelRef.current?.contains(target)) {
        return;
      }
      setSelectedThreadId(null);
      setDraft("");
      setDraftRecipients([]);
      setPromptKind(null);
      onOpenChange(false);
    }
    window.addEventListener("pointerdown", dismissOutside, true);
    return () =>
      window.removeEventListener("pointerdown", dismissOutside, true);
  }, [onOpenChange, open]);

  function close() {
    setSelectedThreadId(null);
    setDraft("");
    setDraftRecipients([]);
    setPromptKind(null);
    onOpenChange(false);
  }

  async function createThread() {
    if (!selectedRange || !draft.trim()) return;
    const result = await execute({
      type: "comment.create",
      commandId: crypto.randomUUID(),
      canvasId,
      body: draft.trim(),
      targetObjectIds: [],
      orderedContextIds: [documentObjectId],
      canvasAnchor: null,
      documentRange: selectedRange,
      promptKind,
      authorKind: "human",
      authorKey: null,
      routing: draftRecipients.length
        ? {
            recipientUserIds: draftRecipients
              .filter((recipient) => recipient.kind === "human")
              .map((recipient) => recipient.key),
            includePrimaryAi: draftRecipients.some(
              (recipient) => recipient.kind === "ai",
            ),
          }
        : undefined,
    });
    const id =
      result && typeof result === "object" && "comment_id" in result
        ? String(result.comment_id)
        : null;
    setDraft("");
    setDraftRecipients([]);
    setPromptKind(null);
    if (id) setSelectedThreadId(id);
  }

  async function reply(
    thread: CommentThread,
    body: string,
    recipients: CommentRecipient[] | undefined,
  ) {
    await execute({
      type: "comment.reply",
      commandId: crypto.randomUUID(),
      commentId: thread.id,
      body,
      routing: recipients
        ? {
            recipientUserIds: recipients
              .filter((recipient) => recipient.kind === "human")
              .map((recipient) => recipient.key),
            includePrimaryAi: recipients.some(
              (recipient) => recipient.kind === "ai",
            ),
          }
        : undefined,
    });
  }

  async function respond(prompt: CommentPrompt, value: PromptResponseValue) {
    await execute({
      type: "comment.respond",
      commandId: crypto.randomUUID(),
      promptId: prompt.id,
      promptKind: prompt.kind,
      value,
    });
  }

  if (!open || !anchorPosition) return null;

  const sharedPosition = {
    left: anchorPosition.left,
    top: anchorPosition.top + 48,
  };

  if (selectedThread) {
    return (
      <aside
        ref={panelRef}
        role="dialog"
        aria-label="Comment thread"
        className="absolute z-[90] max-h-[min(28rem,calc(100%-2rem))] w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-2xl"
        style={sharedPosition}
      >
        <div className="mb-3 flex items-center justify-between border-b border-zinc-100 pb-2">
          <p className="font-semibold">Comment</p>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Close comment thread"
            onClick={close}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <ThreadBody
          thread={selectedThread}
          userId={userId}
          role={canvasRole}
          pending={pending}
          collaborators={collaboration?.collaborators ?? []}
          onReply={(body, recipients) =>
            reply(selectedThread, body, recipients)
          }
          onRespond={respond}
          onPromptChange={async (kind) => {
            await execute({
              type: "comment.prompt.set",
              commentId: selectedThread.id,
              promptKind: kind,
            });
          }}
          onBodyChange={async (body) => {
            await execute({
              type: "comment.body.update",
              commentId: selectedThread.id,
              body,
            });
          }}
          onStatus={async (status) => {
            await execute({
              type: "comment.status",
              commentId: selectedThread.id,
              status,
            });
            close();
          }}
          onDelete={async () => {
            await execute({
              type: "comment.delete",
              commentId: selectedThread.id,
            });
            close();
          }}
          onNavigateEvidence={onSelectEvidence}
          onUndoAiTransaction={async (changeSetId) => {
            const result = await onUndoAiTransaction(changeSetId);
            await refresh();
            return result;
          }}
          onCancelAiRun={cancelAiRun}
          onRetryAiRun={retryAiRun}
        />
      </aside>
    );
  }

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-label="New comment"
      className="group absolute z-[90] w-[min(30rem,calc(100%-2rem))] -translate-x-1/2 rounded-3xl border border-zinc-200 bg-white p-2 text-zinc-900 shadow-2xl"
      style={sharedPosition}
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void createThread();
        }}
      >
        <RecipientComposer
          label="Comment"
          value={draft}
          recipients={draftRecipients}
          collaborators={(collaboration?.collaborators ?? []).filter(
            (collaborator) =>
              collaborator.kind === "ai" || collaborator.key !== userId,
          )}
          pending={pending}
          inputRef={composerRef}
          placeholder="Add a comment or type @"
          onChange={setDraft}
          onRecipientsChange={setDraftRecipients}
        />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="size-12 shrink-0 rounded-full bg-zinc-200 text-zinc-600 hover:bg-zinc-300 hover:text-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-300"
          disabled={pending || !canComment || !selectedRange || !draft.trim()}
          aria-label="Submit comment"
        >
          <ArrowUp aria-hidden="true" className="size-6" />
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-2 pt-2 pb-1">
        <label
          className="text-xs font-medium text-zinc-600"
          htmlFor="document-comment-prompt-kind"
        >
          Prompt
        </label>
        <select
          id="document-comment-prompt-kind"
          value={promptKind ?? ""}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm"
          onChange={(event) =>
            setPromptKind(
              (event.target.value || null) as CommentPromptKind | null,
            )
          }
        >
          <option value="">Reply</option>
          <option value="yes_no">Yes / no</option>
          <option value="review">Review</option>
          <option value="rating">Rating 1–5</option>
        </select>
        <Button
          className="ml-auto"
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Close comment composer"
          onClick={close}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      {loading ? (
        <p className="px-2 pb-1 text-xs text-zinc-500">Loading comments…</p>
      ) : null}
      {error ? (
        <p role="alert" className="px-2 pb-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
