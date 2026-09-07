"use client";

import { ArrowUp, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { CommentPanel } from "@/components/comments/comment-panel";
import {
  useCommentWorkspace,
  useCommentDraft,
} from "@/components/comments/comment-workspace";

import type {
  CommentPromptKind,
  CommentRecipient,
  CommentThread,
} from "@/comments/comment-model";
import type { CommentService } from "@/components/comments/comment-workspace";
import { RecipientComposer } from "@/components/comments/canvas-comments";
import { Button } from "@/components/ui/button";
import type { DocumentRangeTarget } from "@/documents/document-range";
import type { CanvasRole } from "@/domain/command";

type Props = {
  canvasId: string;
  userId: string;
  canvasRole: CanvasRole;
  documentObjectId: string;
  documentTitle: string;
  selectedRange: DocumentRangeTarget | null;
  supabaseUrl: string;
  supabasePublishableKey: string;
  onAiTransactionApplied: (changeSetId: string) => void;
  onUndoAiTransaction: (changeSetId: string) => Promise<{ conflicts: number }>;
  onSelectEvidence: (objectId: string) => void;
  open: boolean;
  requestedThreadId?: string | null;
  anchorPosition: { left: number; top: number } | null;
  onOpenChange: (open: boolean) => void;
  onThreadsChange: (threads: CommentThread[]) => void;
};

export function ProductDocumentComments(props: Props) {
  const { service } = useCommentWorkspace();
  return service ? (
    <DocumentCommentComposer {...props} service={service} />
  ) : null;
}

function DocumentCommentComposer({
  canvasId,
  userId,
  canvasRole,
  documentObjectId,
  documentTitle,
  selectedRange,
  service,
  open,
  anchorPosition,
  onOpenChange,
  onThreadsChange,
}: Props & { service: CommentService }) {
  const workspace = useCommentWorkspace();
  const composerKey = `document-composer:${documentObjectId}`;
  const { threads, collaboration, loading, pending, error, execute } = service;
  const [draft, setDraft] = useCommentDraft(
    `document:${documentObjectId}:draft`,
    "",
  );
  const [draftRecipients, setDraftRecipients] = useCommentDraft<
    CommentRecipient[]
  >(`document:${documentObjectId}:recipients`, []);
  const [promptKind, setPromptKind] = useCommentDraft<CommentPromptKind | null>(
    `document:${documentObjectId}:prompt`,
    null,
  );
  const [includeDocumentContext, setIncludeDocumentContext] = useCommentDraft(
    `document:${documentObjectId}:include-document`,
    true,
  );
  const [includeSelectedTextContext, setIncludeSelectedTextContext] =
    useCommentDraft(`document:${documentObjectId}:include-selection`, true);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const documentThreads = useMemo(
    () =>
      threads.filter(
        (thread) => thread.documentRange?.documentObjectId === documentObjectId,
      ),
    [documentObjectId, threads],
  );
  const canComment = canvasRole !== "viewer";

  useEffect(() => {
    onThreadsChange(documentThreads);
  }, [documentThreads, onThreadsChange]);

  useEffect(() => {
    if (open && workspace.active === composerKey)
      requestAnimationFrame(() => composerRef.current?.focus());
  }, [open, workspace.active, composerKey]);

  function close() {
    if (pending) return;
    workspace.show(null);
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
      orderedContextIds: includeDocumentContext ? [documentObjectId] : [],
      canvasAnchor: null,
      documentRange: selectedRange,
      documentAiContext: {
        includeDocument: includeDocumentContext,
        includeSelectedText: includeSelectedTextContext,
      },
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
    if (!id) return;
    workspace.saveDraft(`document:${documentObjectId}:range`, null);
    setDraft("");
    setDraftRecipients([]);
    setPromptKind(null);
    workspace.finishCreation(composerKey, id, anchorPosition ?? undefined);
    onOpenChange(false);
  }

  if (!open || !anchorPosition || workspace.active !== composerKey) return null;

  return (
    <CommentPanel
      title="New comment"
      closeLabel="Close comment composer"
      anchor={anchorPosition}
      onClose={close}
      busy={pending}
      initialHeight={300}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1 px-2">
        <span className="text-xs font-medium text-zinc-500">Context</span>
        {includeDocumentContext ? (
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-900">
            <span className="truncate">{documentTitle}</span>
            <button
              type="button"
              disabled={pending}
              aria-label={`Remove document context ${documentTitle}`}
              className="shrink-0 rounded-full p-0.5 hover:bg-violet-200 focus-visible:ring-2 focus-visible:ring-violet-500"
              onClick={() => setIncludeDocumentContext(false)}
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </span>
        ) : null}
        {includeSelectedTextContext ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-900">
            Selected text
            <button
              type="button"
              disabled={pending}
              aria-label="Remove selected text context"
              className="rounded-full p-0.5 hover:bg-violet-200 focus-visible:ring-2 focus-visible:ring-violet-500"
              onClick={() => setIncludeSelectedTextContext(false)}
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </span>
        ) : null}
      </div>
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
      </div>
      {loading ? (
        <p className="px-2 pb-1 text-xs text-zinc-500">Loading comments…</p>
      ) : null}
      {pending ? (
        <p role="status" className="px-2 pb-1 text-xs text-zinc-500">
          Creating comment…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="px-2 pb-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </CommentPanel>
  );
}
