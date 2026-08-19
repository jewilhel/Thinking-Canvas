"use client";

import {
  Bot,
  Check,
  ChevronUp,
  Eye,
  EyeOff,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  commentTargetObjectIds,
  type CommentPrompt,
  type CommentPromptKind,
  type CommentThread,
  type PromptResponseValue,
} from "@/comments/comment-model";
import { useCanvasComments } from "@/comments/use-canvas-comments";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import { resolveConnectorPointsV2 } from "@/canvas/geometry";
import { WorkspacePanel } from "@/components/canvas/workspace-panel";
import { Button } from "@/components/ui/button";
import type { CanvasRole } from "@/domain/command";

type Viewport = { x: number; y: number; scale: number };

type Props = {
  canvasId: string;
  userId: string;
  canvasRole: CanvasRole;
  supabaseUrl: string;
  supabasePublishableKey: string;
  objects: CanvasObjectV2[];
  selectedIds: string[];
  viewport: Viewport;
  size: { width: number; height: number };
  panelOpen: boolean;
  panelInvoker: HTMLButtonElement | null;
  simulatedAiEnabled: boolean;
  onDismissPanel: () => void;
  onSelectTargets: (targetIds: string[]) => void;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : name.slice(0, 2)
  ).toUpperCase();
}

function Avatar({ name, ai = false }: { name: string; ai?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-9 shrink-0 place-items-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-sm ${ai ? "bg-violet-600" : "bg-zinc-700"}`}
    >
      {ai ? <Bot className="size-4" /> : initials(name)}
    </span>
  );
}

function threadAnchor(
  thread: Pick<CommentThread, "targetObjectIds">,
  objectsById: Map<string, CanvasObjectV2>,
  viewport: Viewport,
  size: { width: number; height: number },
) {
  const targets = thread.targetObjectIds.flatMap((id) => {
    const object = objectsById.get(id);
    return object ? [object] : [];
  });
  if (!targets.length) return null;
  const bounds = targets.map((object) => {
    if (object.type !== "connector") return object.geometry;
    const points = resolveConnectorPointsV2(object, objectsById);
    const x = Math.min(points[0]!, points[2]!);
    const y = Math.min(points[1]!, points[3]!);
    return {
      x,
      y,
      width: Math.max(1, Math.max(points[0]!, points[2]!) - x),
      height: Math.max(1, Math.max(points[1]!, points[3]!) - y),
    };
  });
  const right = Math.max(...bounds.map((bounds) => bounds.x + bounds.width));
  const top = Math.min(...bounds.map((bounds) => bounds.y));
  return {
    left: Math.min(
      Math.max(76, viewport.x + right * viewport.scale + 12),
      size.width - 56,
    ),
    top: Math.min(
      Math.max(92, viewport.y + top * viewport.scale - 12),
      size.height - 96,
    ),
  };
}

function selectedAnchor(
  objects: CanvasObjectV2[],
  selectedIds: string[],
  viewport: Viewport,
  size: { width: number; height: number },
) {
  return threadAnchor(
    { targetObjectIds: selectedIds },
    new Map(objects.map((object) => [object.id, object])),
    viewport,
    size,
  );
}

function promptLabel(kind: CommentPromptKind | null) {
  if (kind === "yes_no") return "Yes / no";
  if (kind === "review") return "Review decision";
  if (kind === "rating") return "Rating (1–5)";
  return "No structured prompt";
}

function responseLabel(value: PromptResponseValue) {
  if ("answer" in value) return value.answer === "yes" ? "Yes" : "No";
  if ("decision" in value)
    return value.decision[0]!.toUpperCase() + value.decision.slice(1);
  return `${value.rating} / 5`;
}

function PromptControls({
  prompt,
  disabled,
  onRespond,
}: {
  prompt: CommentPrompt;
  disabled: boolean;
  onRespond: (value: PromptResponseValue) => void;
}) {
  const options: { label: string; value: PromptResponseValue }[] =
    prompt.kind === "yes_no"
      ? [
          { label: "Yes", value: { answer: "yes" } },
          { label: "No", value: { answer: "no" } },
        ]
      : prompt.kind === "review"
        ? [
            { label: "Approve", value: { decision: "approve" } },
            { label: "Revise", value: { decision: "revise" } },
            { label: "Discard", value: { decision: "discard" } },
          ]
        : [1, 2, 3, 4, 5].map((rating) => ({
            label: String(rating),
            value: { rating },
          }));
  return (
    <div className="mt-3 rounded-xl bg-violet-50 p-3">
      <p className="text-xs font-semibold text-violet-900">
        {promptLabel(prompt.kind)}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.label}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onRespond(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {prompt.responses.length ? (
        <div className="mt-2 space-y-1 text-xs text-violet-800">
          {prompt.responses.map((response) => (
            <p key={response.id}>
              <span className="font-semibold">{response.responderName}:</span>{" "}
              {responseLabel(response.value)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ThreadBody({
  thread,
  userId,
  role,
  pending,
  onReply,
  onRespond,
  onStatus,
}: {
  thread: CommentThread;
  userId: string;
  role: CanvasRole;
  pending: boolean;
  onReply: (body: string) => Promise<void>;
  onRespond: (
    prompt: CommentPrompt,
    value: PromptResponseValue,
  ) => Promise<void>;
  onStatus: (status: "resolved" | "dismissed") => Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const canComment = role !== "viewer";
  const canResolve =
    role === "owner" || role === "editor" || thread.authorId === userId;
  const canDismiss = role === "owner" || thread.authorId === userId;
  return (
    <>
      <div className="flex items-start gap-3">
        <Avatar name={thread.authorName} ai={thread.authorKind === "ai"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="font-semibold text-zinc-900">{thread.authorName}</p>
            <time className="text-xs text-zinc-500" dateTime={thread.createdAt}>
              {new Date(thread.createdAt).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </div>
          <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-zinc-800">
            {thread.body}
          </p>
          {thread.prompt ? (
            <PromptControls
              prompt={thread.prompt}
              disabled={!canComment || pending || thread.status !== "open"}
              onRespond={(value) => void onRespond(thread.prompt!, value)}
            />
          ) : null}
        </div>
      </div>
      {thread.replies.length ? (
        <div className="mt-4 space-y-4 border-l-2 border-zinc-100 pl-4">
          {thread.replies.map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              <Avatar name={item.authorName} />
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {item.authorName}
                </p>
                <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-zinc-700">
                  {item.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {thread.status === "open" && canComment ? (
        <form
          className="mt-4 flex items-end gap-2 rounded-2xl bg-zinc-100 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            const body = reply.trim();
            if (!body) return;
            void onReply(body).then(() => setReply(""));
          }}
        >
          <textarea
            aria-label="Reply"
            value={reply}
            rows={1}
            maxLength={100_000}
            placeholder="Reply"
            className="h-10 min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm transition-[height] outline-none placeholder:text-zinc-400 focus:h-24"
            onChange={(event) => setReply(event.target.value)}
          />
          <Button
            type="submit"
            size="icon"
            disabled={pending || !reply.trim()}
            aria-label="Send reply"
          >
            <ChevronUp aria-hidden="true" />
          </Button>
        </form>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        <span className="mr-auto rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
          {thread.status}
        </span>
        {thread.status === "open" && canResolve ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => void onStatus("resolved")}
          >
            <Check aria-hidden="true" /> Resolve
          </Button>
        ) : null}
        {thread.status === "open" && canDismiss ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => void onStatus("dismissed")}
          >
            Dismiss
          </Button>
        ) : null}
      </div>
    </>
  );
}

export function CanvasComments({
  canvasId,
  userId,
  canvasRole,
  supabaseUrl,
  supabasePublishableKey,
  objects,
  selectedIds,
  viewport,
  size,
  panelOpen,
  panelInvoker,
  simulatedAiEnabled,
  onDismissPanel,
  onSelectTargets,
}: Props) {
  const { threads, loading, pending, error, refresh, execute } =
    useCanvasComments(canvasId, supabaseUrl, supabasePublishableKey);
  const visibilityKey = `thinking-canvas:comments-visible:${userId}:${canvasId}`;
  const [visible, setVisible] = useState(
    () => window.localStorage.getItem(visibilityKey) !== "false",
  );
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [promptKind, setPromptKind] = useState<CommentPromptKind | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const objectsById = useMemo(
    () => new Map(objects.map((object) => [object.id, object])),
    [objects],
  );
  const targetIds = useMemo(
    () => commentTargetObjectIds(objects, selectedIds),
    [objects, selectedIds],
  );
  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const canComment = canvasRole !== "viewer";
  const canAuthorAi =
    simulatedAiEnabled && (canvasRole === "owner" || canvasRole === "editor");
  useEffect(() => {
    window.localStorage.setItem(visibilityKey, String(visible));
  }, [visibilityKey, visible]);
  useEffect(() => {
    if (composerOpen) requestAnimationFrame(() => composerRef.current?.focus());
  }, [composerOpen]);

  async function createThread(authorKind: "human" | "ai") {
    if (!targetIds || !draft.trim()) return;
    const result = await execute({
      type: "comment.create",
      commandId: crypto.randomUUID(),
      canvasId,
      body: draft.trim(),
      targetObjectIds: targetIds,
      promptKind,
      authorKind,
      authorKey: authorKind === "ai" ? "primary-ai" : null,
    });
    const id =
      result && typeof result === "object" && "comment_id" in result
        ? String(result.comment_id)
        : null;
    setDraft("");
    setPromptKind(null);
    setComposerOpen(false);
    setVisible(true);
    if (id) setSelectedThreadId(id);
  }

  async function reply(thread: CommentThread, body: string) {
    await execute({
      type: "comment.reply",
      commandId: crypto.randomUUID(),
      commentId: thread.id,
      body,
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

  async function status(thread: CommentThread, next: "resolved" | "dismissed") {
    await execute({
      type: "comment.status",
      commentId: thread.id,
      status: next,
    });
  }

  const composerPosition = targetIds
    ? selectedAnchor(objects, targetIds, viewport, size)
    : null;
  const threadPosition = selectedThread
    ? (threadAnchor(selectedThread, objectsById, viewport, size) ?? {
        left: Math.max(520, size.width - 32),
        top: 112,
      })
    : null;

  return (
    <>
      {visible
        ? threads.map((thread) => {
            const position = threadAnchor(thread, objectsById, viewport, size);
            if (!position) return null;
            return (
              <button
                key={thread.id}
                type="button"
                aria-label={`Open comment by ${thread.authorName}`}
                className={`absolute z-30 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] bg-white shadow-lg transition hover:scale-105 focus-visible:ring-3 focus-visible:ring-violet-500 focus-visible:outline-none ${thread.status === "open" ? "border-violet-500" : "border-zinc-300 opacity-75"}`}
                style={position}
                onClick={() => {
                  onSelectTargets(
                    thread.targetObjectIds.filter((id) => objectsById.has(id)),
                  );
                  setSelectedThreadId(thread.id);
                }}
              >
                <Avatar
                  name={thread.authorName}
                  ai={thread.authorKind === "ai"}
                />
              </button>
            );
          })
        : null}

      {composerOpen && composerPosition ? (
        <div
          role="dialog"
          aria-label="New comment"
          className="absolute z-50 w-[min(27rem,calc(100%-2rem))] -translate-x-full rounded-3xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-2xl"
          style={{
            left: Math.max(456, composerPosition.left),
            top: composerPosition.top,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold">Comment on selection</p>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Close comment composer"
              onClick={() => setComposerOpen(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <textarea
            ref={composerRef}
            aria-label="Comment"
            rows={4}
            maxLength={100_000}
            value={draft}
            placeholder="Add focused feedback…"
            className="mt-3 w-full resize-none rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-3 focus:ring-violet-100"
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label
              className="text-xs font-medium text-zinc-600"
              htmlFor="comment-prompt-kind"
            >
              Prompt
            </label>
            <select
              id="comment-prompt-kind"
              value={promptKind ?? ""}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm"
              onChange={(event) =>
                setPromptKind(
                  (event.target.value || null) as CommentPromptKind | null,
                )
              }
            >
              <option value="">None</option>
              <option value="yes_no">Yes / no</option>
              <option value="review">Review</option>
              <option value="rating">Rating 1–5</option>
            </select>
            {canAuthorAi ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending || !draft.trim()}
                onClick={() => void createThread("ai")}
              >
                <Bot aria-hidden="true" /> Add as preview AI
              </Button>
            ) : null}
            <Button
              className="ml-auto"
              type="button"
              disabled={pending || !draft.trim()}
              onClick={() => void createThread("human")}
            >
              <Send aria-hidden="true" /> Add comment
            </Button>
          </div>
        </div>
      ) : null}

      {selectedThread && threadPosition ? (
        <div
          role="dialog"
          aria-label="Comment thread"
          className="absolute z-50 max-h-[min(36rem,calc(100%-8rem))] w-[min(31rem,calc(100%-2rem))] -translate-x-full overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl"
          style={{
            left: Math.max(520, threadPosition.left),
            top: threadPosition.top,
          }}
        >
          <div className="mb-4 flex items-center justify-between border-b border-zinc-100 pb-3">
            <p className="font-semibold">Comment</p>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Close comment thread"
              onClick={() => setSelectedThreadId(null)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <ThreadBody
            thread={selectedThread}
            userId={userId}
            role={canvasRole}
            pending={pending}
            onReply={(body) => reply(selectedThread, body)}
            onRespond={respond}
            onStatus={(next) => status(selectedThread, next)}
          />
        </div>
      ) : null}

      {panelOpen ? (
        <WorkspacePanel
          title="Comments"
          description="Feedback stays anchored to one object or a complete group."
          invoker={panelInvoker}
          onDismiss={onDismissPanel}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!canComment || !targetIds}
              onClick={() => setComposerOpen(true)}
            >
              <MessageCircle aria-hidden="true" /> New comment
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setVisible((current) => !current)}
            >
              {visible ? (
                <EyeOff aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )}
              {visible ? "Hide markers" : "Show markers"}
            </Button>
          </div>
          {!targetIds ? (
            <p className="mt-3 rounded-xl bg-zinc-100 p-3 text-sm text-zinc-600">
              Select one object or every object in a group to start a comment.
            </p>
          ) : null}
          {error ? (
            <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <p role="alert">{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void refresh()}
              >
                Retry comments
              </Button>
            </div>
          ) : null}
          <div className="mt-4 space-y-2">
            {loading ? (
              <p className="text-sm text-zinc-500">Loading comments…</p>
            ) : null}
            {!loading && !threads.length ? (
              <p className="text-sm text-zinc-500">No comments yet.</p>
            ) : null}
            {threads.map((thread) => {
              const targetAvailable = thread.targetObjectIds.some((id) =>
                objectsById.has(id),
              );
              return (
                <button
                  key={thread.id}
                  type="button"
                  className="flex w-full items-start gap-3 rounded-xl border border-zinc-200 p-3 text-left transition hover:border-violet-300 hover:bg-violet-50"
                  onClick={() => {
                    setVisible(true);
                    onSelectTargets(
                      thread.targetObjectIds.filter((id) =>
                        objectsById.has(id),
                      ),
                    );
                    setSelectedThreadId(thread.id);
                  }}
                >
                  <Avatar
                    name={thread.authorName}
                    ai={thread.authorKind === "ai"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">
                        {thread.authorName}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                        {thread.status}
                      </span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm leading-5 text-zinc-600">
                      {thread.body}
                    </span>
                    {!targetAvailable ? (
                      <span className="mt-1 block text-xs text-amber-700">
                        Target unavailable
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </WorkspacePanel>
      ) : null}
    </>
  );
}
