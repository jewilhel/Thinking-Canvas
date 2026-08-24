"use client";

import {
  ArrowUp,
  Bot,
  Check,
  Eye,
  EyeOff,
  MessageCircle,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

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
type CanvasPoint = { x: number; y: number };
const COMMENT_MARKER_SIZE = 52;
const COMMENT_PREVIEW_WIDTH = 320;
type CommentTarget = {
  targetObjectIds: string[];
  canvasAnchor: CanvasPoint | null;
};

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

export function commentRelativeTime(createdAt: string, now = Date.now()) {
  const elapsedSeconds = Math.max(
    0,
    Math.round((now - new Date(createdAt).getTime()) / 1000),
  );
  if (elapsedSeconds < 10) return "just now";
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "always",
  });
  if (elapsedSeconds < 60) return formatter.format(-elapsedSeconds, "second");
  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return formatter.format(-elapsedMinutes, "minute");
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return formatter.format(-elapsedHours, "hour");
  const elapsedDays = Math.round(elapsedHours / 24);
  if (elapsedDays < 7) return formatter.format(-elapsedDays, "day");
  const elapsedWeeks = Math.round(elapsedDays / 7);
  return formatter.format(-elapsedWeeks, "week");
}

function commentMarkerStyle(
  position: { left: number; top: number },
  size: { width: number; height: number },
) {
  const markerRadius = COMMENT_MARKER_SIZE / 2;
  const expandsLeft =
    position.left + COMMENT_PREVIEW_WIDTH - markerRadius > size.width - 16;
  return expandsLeft
    ? {
        right: size.width - position.left - markerRadius,
        top: position.top - markerRadius,
      }
    : {
        left: position.left - markerRadius,
        top: position.top - markerRadius,
      };
}

export function threadAnchor(
  thread: Pick<CommentThread, "targetObjectIds" | "canvasAnchor">,
  objectsById: Map<string, CanvasObjectV2>,
  viewport: Viewport,
) {
  if (thread.canvasAnchor) {
    return {
      left: viewport.x + thread.canvasAnchor.x * viewport.scale,
      top: viewport.y + thread.canvasAnchor.y * viewport.scale,
    };
  }
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
    left: viewport.x + right * viewport.scale + 12,
    top: viewport.y + top * viewport.scale - 12,
  };
}

type ScreenBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function useElementSize<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  fallback: { width: number; height: number },
  enabled: boolean,
) {
  const [measured, setMeasured] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      setMeasured((current) => {
        const next = { width: bounds.width, height: bounds.height };
        return current.width === next.width && current.height === next.height
          ? current
          : next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, ref]);
  return measured;
}

function objectBoundsForComments(
  object: CanvasObjectV2,
  objectsById: Map<string, CanvasObjectV2>,
) {
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
}

function topmostObjectAtPoint(
  objects: CanvasObjectV2[],
  objectsById: Map<string, CanvasObjectV2>,
  point: CanvasPoint,
) {
  return [...objects].reverse().find((object) => {
    const bounds = objectBoundsForComments(object, objectsById);
    const padding = object.type === "connector" ? 12 : 0;
    return (
      point.x >= bounds.x - padding &&
      point.x <= bounds.x + bounds.width + padding &&
      point.y >= bounds.y - padding &&
      point.y <= bounds.y + bounds.height + padding
    );
  });
}

function threadTargetBounds(
  thread: Pick<CommentThread, "targetObjectIds" | "canvasAnchor">,
  objectsById: Map<string, CanvasObjectV2>,
  viewport: Viewport,
): ScreenBounds | null {
  if (thread.canvasAnchor) {
    const left = viewport.x + thread.canvasAnchor.x * viewport.scale;
    const top = viewport.y + thread.canvasAnchor.y * viewport.scale;
    return { left, top, right: left, bottom: top };
  }
  const bounds = thread.targetObjectIds.flatMap((id) => {
    const object = objectsById.get(id);
    if (!object) return [];
    const geometry = objectBoundsForComments(object, objectsById);
    return [
      {
        left: viewport.x + geometry.x * viewport.scale,
        top: viewport.y + geometry.y * viewport.scale,
        right: viewport.x + (geometry.x + geometry.width) * viewport.scale,
        bottom: viewport.y + (geometry.y + geometry.height) * viewport.scale,
      },
    ];
  });
  if (!bounds.length) return null;
  return {
    left: Math.min(...bounds.map((item) => item.left)),
    top: Math.min(...bounds.map((item) => item.top)),
    right: Math.max(...bounds.map((item) => item.right)),
    bottom: Math.max(...bounds.map((item) => item.bottom)),
  };
}

export function contextualCardPosition(
  anchor: { left: number; top: number },
  target: ScreenBounds,
  size: { width: number; height: number },
  width: number,
  height: number,
) {
  const gap = 16;
  const padding = 16;
  const clampLeft = (left: number) =>
    Math.min(
      Math.max(padding, left),
      Math.max(padding, size.width - width - padding),
    );
  const clampTop = (top: number) =>
    Math.min(
      Math.max(padding, top),
      Math.max(padding, size.height - height - padding),
    );
  const centeredTop = clampTop(anchor.top - 36);
  const centeredLeft = clampLeft(anchor.left - width / 2);

  if (target.right + gap + width <= size.width - padding) {
    return { left: target.right + gap, top: centeredTop };
  }
  if (target.left - gap - width >= padding) {
    return { left: target.left - gap - width, top: centeredTop };
  }
  if (target.bottom + gap + height <= size.height - padding) {
    return { left: centeredLeft, top: target.bottom + gap };
  }
  if (target.top - gap - height >= padding) {
    return { left: centeredLeft, top: target.top - gap - height };
  }

  const horizontalRoom = Math.max(
    target.left - padding,
    size.width - padding - target.right,
  );
  const verticalRoom = Math.max(
    target.top - padding,
    size.height - padding - target.bottom,
  );
  if (horizontalRoom >= verticalRoom) {
    return target.left - padding >= size.width - padding - target.right
      ? { left: clampLeft(target.left - gap - width), top: centeredTop }
      : { left: clampLeft(target.right + gap), top: centeredTop };
  }
  return target.top - padding >= size.height - padding - target.bottom
    ? { left: centeredLeft, top: clampTop(target.top - gap - height) }
    : { left: centeredLeft, top: clampTop(target.bottom + gap) };
}

function promptLabel(kind: CommentPromptKind | null) {
  if (kind === "yes_no") return "Yes / no";
  if (kind === "review") return "Review decision";
  if (kind === "rating") return "Rating (1–5)";
  return "Reply";
}

function PromptKindSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: CommentPromptKind | null;
  disabled: boolean;
  onChange: (kind: CommentPromptKind | null) => void;
}) {
  return (
    <select
      id={id}
      aria-label="Prompt"
      value={value ?? ""}
      disabled={disabled}
      className="-ml-1 h-8 cursor-pointer rounded-lg border-0 bg-transparent px-1 pr-7 text-sm font-semibold text-zinc-800 outline-none hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-default disabled:opacity-60"
      onChange={(event) =>
        onChange((event.target.value || null) as CommentPromptKind | null)
      }
    >
      <option value="">Reply</option>
      <option value="yes_no">Yes / no</option>
      <option value="review">Review</option>
      <option value="rating">Rating 1–5</option>
    </select>
  );
}

function promptResponseMatches(
  left: PromptResponseValue,
  right: PromptResponseValue,
) {
  if ("answer" in left && "answer" in right)
    return left.answer === right.answer;
  if ("decision" in left && "decision" in right)
    return left.decision === right.decision;
  return "rating" in left && "rating" in right && left.rating === right.rating;
}

function PromptControls({
  prompt,
  disabled,
  canManagePrompt,
  onRespond,
  onPromptChange,
}: {
  prompt: CommentPrompt;
  disabled: boolean;
  canManagePrompt: boolean;
  onRespond: (value: PromptResponseValue) => void;
  onPromptChange: (kind: CommentPromptKind | null) => void;
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
    <div className="mt-4 w-full rounded-2xl bg-zinc-100 p-3">
      {canManagePrompt ? (
        <PromptKindSelect
          id={`active-prompt-kind-${prompt.id}`}
          value={prompt.kind}
          disabled={disabled}
          onChange={onPromptChange}
        />
      ) : (
        <p className="text-sm font-semibold text-zinc-700">
          {promptLabel(prompt.kind)}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = prompt.responses.some((response) =>
            promptResponseMatches(response.value, option.value),
          );
          return (
            <Button
              key={option.label}
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={selected}
              className={
                selected
                  ? "rounded-xl border-zinc-700! bg-zinc-700! px-4 text-white! shadow-sm hover:border-zinc-800! hover:bg-zinc-800! hover:text-white!"
                  : "rounded-xl border-zinc-300! bg-zinc-50! px-4 text-zinc-800! hover:border-zinc-400! hover:bg-zinc-200! hover:text-zinc-950!"
              }
              disabled={disabled}
              onClick={() => onRespond(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
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
  onPromptChange,
  onBodyChange,
  onStatus,
  onDelete,
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
  onPromptChange: (kind: CommentPromptKind | null) => Promise<void>;
  onBodyChange: (body: string) => Promise<void>;
  onStatus: (status: "resolved" | "dismissed") => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const [editingBody, setEditingBody] = useState(false);
  const [bodyDraft, setBodyDraft] = useState(thread.body);
  const canComment = role !== "viewer";
  const canResolve =
    role === "owner" || role === "editor" || thread.authorId === userId;
  const canDismiss = role === "owner" || thread.authorId === userId;
  const canDelete = role === "owner" || thread.authorId === userId;
  const canManagePrompt = thread.authorId === userId;
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
          {editingBody ? (
            <form
              className="mt-2"
              onSubmit={(event) => {
                event.preventDefault();
                const body = bodyDraft.trim();
                if (!body) return;
                if (body === thread.body) {
                  setEditingBody(false);
                  return;
                }
                void onBodyChange(body).then(() => setEditingBody(false));
              }}
            >
              <textarea
                autoFocus
                aria-label="Edit initial comment"
                value={bodyDraft}
                rows={3}
                maxLength={100_000}
                className="w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm leading-6 text-zinc-800 outline-none focus-visible:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-300"
                onChange={(event) => setBodyDraft(event.target.value)}
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setBodyDraft(thread.body);
                    setEditingBody(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending || !bodyDraft.trim()}
                >
                  <Check aria-hidden="true" /> Save
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-2 flex items-start gap-2">
              <p className="min-w-0 flex-1 text-sm leading-6 whitespace-pre-wrap text-zinc-800">
                {thread.body}
              </p>
              {canManagePrompt && thread.status === "open" ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 text-zinc-500 hover:text-zinc-800"
                  aria-label="Edit initial comment"
                  disabled={pending}
                  onClick={() => {
                    setBodyDraft(thread.body);
                    setEditingBody(true);
                  }}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
      {thread.prompt ? (
        <PromptControls
          prompt={thread.prompt}
          disabled={!canComment || pending || thread.status !== "open"}
          canManagePrompt={canManagePrompt && thread.status === "open"}
          onRespond={(value) => void onRespond(thread.prompt!, value)}
          onPromptChange={(kind) => void onPromptChange(kind)}
        />
      ) : null}
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
      {thread.status === "open" && canComment && !thread.prompt ? (
        <form
          className="group mt-4 w-full rounded-2xl bg-zinc-100 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const body = reply.trim();
            if (!body) return;
            void onReply(body).then(() => setReply(""));
          }}
        >
          {canManagePrompt ? (
            <PromptKindSelect
              id={`thread-response-kind-${thread.id}`}
              value={null}
              disabled={pending}
              onChange={(kind) => void onPromptChange(kind)}
            />
          ) : (
            <p className="text-sm font-semibold text-zinc-700">Reply</p>
          )}
          <div className="mt-2 flex items-end gap-2">
            <textarea
              aria-label="Reply"
              value={reply}
              rows={1}
              maxLength={100_000}
              placeholder="Write a reply"
              className="h-10 min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm transition-[height] outline-none group-focus-within:h-24 placeholder:text-zinc-400"
              onChange={(event) => setReply(event.target.value)}
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="size-11 shrink-0 rounded-full bg-zinc-200 text-zinc-600 hover:bg-zinc-300 hover:text-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-300"
              disabled={pending || !reply.trim()}
              aria-label="Send reply"
            >
              <ArrowUp aria-hidden="true" className="size-5" />
            </Button>
          </div>
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
        {canDelete ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-red-700 hover:bg-red-50 hover:text-red-800"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  "Permanently delete this comment and its entire thread? This cannot be undone.",
                )
              ) {
                void onDelete();
              }
            }}
          >
            <Trash2 aria-hidden="true" /> Delete
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
  const [placementMode, setPlacementMode] = useState(false);
  const [composerTarget, setComposerTarget] = useState<CommentTarget | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [promptKind, setPromptKind] = useState<CommentPromptKind | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const placementRef = useRef<HTMLButtonElement>(null);
  const composerCardRef = useRef<HTMLDivElement>(null);
  const threadCardRef = useRef<HTMLDivElement>(null);
  const panelWasOpenRef = useRef(panelOpen);
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
  useEffect(() => {
    if (placementMode)
      requestAnimationFrame(() => placementRef.current?.focus());
  }, [placementMode]);
  useEffect(() => {
    if (panelOpen && !panelWasOpenRef.current && canComment) {
      setSelectedThreadId(null);
      closeComposer();
      setPlacementMode(true);
    } else if (!panelOpen && panelWasOpenRef.current) {
      setPlacementMode(false);
    }
    panelWasOpenRef.current = panelOpen;
  }, [canComment, panelOpen]);

  function closeComposer() {
    setComposerOpen(false);
    setComposerTarget(null);
  }

  function beginComment() {
    setSelectedThreadId(null);
    closeComposer();
    setPlacementMode(true);
  }

  function focusThread(threadId: string) {
    onSelectTargets([]);
    setSelectedThreadId(threadId);
  }

  function placeComment(event: ReactMouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const screenPoint = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    const canvasPoint = {
      x: (screenPoint.x - viewport.x) / viewport.scale,
      y: (screenPoint.y - viewport.y) / viewport.scale,
    };
    const object = topmostObjectAtPoint(objects, objectsById, canvasPoint);
    setComposerTarget({
      targetObjectIds: object
        ? targetIds?.includes(object.id)
          ? targetIds
          : [object.id]
        : [],
      canvasAnchor: object ? null : canvasPoint,
    });
    setPlacementMode(false);
    setComposerOpen(true);
  }

  async function createThread(authorKind: "human" | "ai") {
    if (!composerTarget || !draft.trim()) return;
    const result = await execute({
      type: "comment.create",
      commandId: crypto.randomUUID(),
      canvasId,
      body: draft.trim(),
      targetObjectIds: composerTarget.targetObjectIds,
      canvasAnchor: composerTarget.canvasAnchor,
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
    closeComposer();
    setVisible(true);
    if (id) focusThread(id);
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

  async function setPrompt(
    thread: CommentThread,
    promptKind: CommentPromptKind | null,
  ) {
    await execute({
      type: "comment.prompt.set",
      commentId: thread.id,
      promptKind,
    });
  }

  async function updateBody(thread: CommentThread, body: string) {
    await execute({
      type: "comment.body.update",
      commentId: thread.id,
      body,
    });
  }

  async function status(thread: CommentThread, next: "resolved" | "dismissed") {
    await execute({
      type: "comment.status",
      commentId: thread.id,
      status: next,
    });
  }

  async function deleteThread(thread: CommentThread) {
    await execute({
      type: "comment.delete",
      commentId: thread.id,
    });
    setSelectedThreadId(null);
  }

  const composerPosition = composerTarget
    ? threadAnchor(composerTarget, objectsById, viewport)
    : null;
  const composerTargetBounds = composerTarget
    ? threadTargetBounds(composerTarget, objectsById, viewport)
    : null;
  const threadPosition = selectedThread
    ? (threadAnchor(selectedThread, objectsById, viewport) ?? {
        left: Math.max(520, size.width - 32),
        top: 112,
      })
    : null;
  const threadTarget =
    selectedThread && threadPosition
      ? (threadTargetBounds(selectedThread, objectsById, viewport) ?? {
          left: threadPosition.left,
          top: threadPosition.top,
          right: threadPosition.left,
          bottom: threadPosition.top,
          width: 0,
          height: 0,
        })
      : null;
  const composerCardSize = useElementSize(
    composerCardRef,
    { width: 480, height: 150 },
    composerOpen,
  );
  const threadCardSize = useElementSize(
    threadCardRef,
    { width: 384, height: 320 },
    selectedThread !== null,
  );
  const composerCardPosition =
    composerPosition && composerTargetBounds
      ? contextualCardPosition(
          composerPosition,
          composerTargetBounds,
          size,
          composerCardSize.width,
          composerCardSize.height,
        )
      : null;
  const threadCardPosition =
    threadPosition && threadTarget
      ? contextualCardPosition(
          threadPosition,
          threadTarget,
          size,
          threadCardSize.width,
          threadCardSize.height,
        )
      : null;

  return (
    <>
      {placementMode ? (
        <button
          ref={placementRef}
          type="button"
          aria-label="Place comment on canvas"
          className="absolute inset-0 z-20 cursor-crosshair bg-transparent outline-none focus-visible:ring-3 focus-visible:ring-violet-500 focus-visible:ring-inset"
          onClick={placeComment}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setPlacementMode(false);
            }
          }}
        >
          <span className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
            Click an object or anywhere on the canvas · Esc to cancel
          </span>
        </button>
      ) : null}

      {selectedThread ? (
        <div
          aria-hidden="true"
          data-testid="comment-focus-shield"
          className="absolute inset-0 z-20 cursor-default touch-none"
        />
      ) : null}

      {visible
        ? threads.map((thread) => {
            const position = threadAnchor(thread, objectsById, viewport);
            if (!position) return null;
            const markerStyle = commentMarkerStyle(position, size);
            const open = thread.status === "open";
            const previewEnabled = selectedThreadId === null;
            return (
              <button
                key={thread.id}
                type="button"
                aria-label={`Open comment by ${thread.authorName}`}
                aria-expanded={selectedThreadId === thread.id}
                className={`group absolute z-30 flex h-[3.25rem] w-[3.25rem] items-center gap-3 overflow-hidden rounded-[999px_999px_999px_0.55rem] border border-transparent bg-transparent p-2 text-left text-zinc-900 shadow-md transition-[width,height,border-color,background-color,border-radius,box-shadow] duration-200 ease-out focus-visible:ring-3 focus-visible:ring-violet-500 focus-visible:outline-none motion-reduce:transition-none ${previewEnabled ? "hover:h-24 hover:w-80 hover:rounded-[1.5rem_1.5rem_1.5rem_0.55rem] hover:border-zinc-200 hover:bg-white hover:shadow-xl focus-visible:h-24 focus-visible:w-80 focus-visible:rounded-[1.5rem_1.5rem_1.5rem_0.55rem] focus-visible:border-zinc-200 focus-visible:bg-white" : ""} ${open ? "text-violet-500" : "text-zinc-400 opacity-75"}`}
                style={markerStyle}
                onClick={() => {
                  setPlacementMode(false);
                  closeComposer();
                  focusThread(thread.id);
                }}
              >
                <MessageCircle
                  aria-hidden="true"
                  fill="white"
                  strokeWidth={1.25}
                  className={`pointer-events-none absolute inset-0 size-[3.25rem] text-zinc-200 transition-opacity duration-150 ${previewEnabled ? "group-hover:opacity-0 group-focus-visible:opacity-0" : ""}`}
                />
                <span className="relative z-10 shrink-0">
                  <Avatar
                    name={thread.authorName}
                    ai={thread.authorKind === "ai"}
                  />
                </span>
                <span
                  className={`pointer-events-none min-w-0 flex-1 pr-2 opacity-0 transition-opacity delay-0 duration-100 motion-reduce:transition-none ${previewEnabled ? "group-hover:opacity-100 group-hover:delay-75 group-focus-visible:opacity-100" : ""}`}
                >
                  <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
                    <span className="truncate text-sm font-semibold text-zinc-900">
                      {thread.authorName}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {commentRelativeTime(thread.createdAt)}
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm leading-5 text-zinc-700">
                    {thread.body}
                  </span>
                </span>
              </button>
            );
          })
        : null}

      {composerOpen && composerPosition && composerCardPosition ? (
        <div
          ref={composerCardRef}
          role="dialog"
          aria-label="New comment"
          className="group absolute z-50 w-[min(30rem,calc(100%-2rem))] rounded-3xl border border-zinc-200 bg-white p-2 text-zinc-900 shadow-2xl"
          style={composerCardPosition}
        >
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createThread("human");
            }}
          >
            <textarea
              ref={composerRef}
              aria-label="Comment"
              rows={1}
              maxLength={100_000}
              value={draft}
              placeholder="Add a comment"
              className="h-12 min-h-12 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-3 text-base leading-6 outline-none group-focus-within:h-24 placeholder:text-zinc-400"
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="size-12 shrink-0 rounded-full bg-zinc-200 text-zinc-600 hover:bg-zinc-300 hover:text-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-300"
              disabled={pending || !draft.trim()}
              aria-label="Submit comment"
            >
              <ArrowUp aria-hidden="true" className="size-6" />
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-2 pt-2 pb-1">
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
              <option value="">Reply</option>
              <option value="yes_no">Yes / no</option>
              <option value="review">Review</option>
              <option value="rating">Rating 1–5</option>
            </select>
            {canAuthorAi ? (
              <Button
                type="button"
                size="sm"
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
              size="icon-sm"
              variant="ghost"
              aria-label="Close comment composer"
              onClick={closeComposer}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}

      {selectedThread && threadPosition && threadCardPosition ? (
        <div
          ref={threadCardRef}
          role="dialog"
          aria-label="Comment thread"
          className="absolute z-50 max-h-[min(28rem,calc(100%-2rem))] w-[min(24rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-2xl"
          style={threadCardPosition}
        >
          <div className="mb-3 flex items-center justify-between border-b border-zinc-100 pb-2">
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
            onPromptChange={(kind) => setPrompt(selectedThread, kind)}
            onBodyChange={(body) => updateBody(selectedThread, body)}
            onStatus={(next) => status(selectedThread, next)}
            onDelete={() => deleteThread(selectedThread)}
          />
        </div>
      ) : null}

      {panelOpen ? (
        <WorkspacePanel
          title="Comments"
          description="Attach feedback to a selection, an object, or anywhere on the canvas."
          invoker={panelInvoker}
          onDismiss={onDismissPanel}
        >
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!canComment} onClick={beginComment}>
              <MessageCircle aria-hidden="true" />
              {placementMode ? "Click canvas…" : "New comment"}
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
          <p className="mt-3 rounded-xl bg-zinc-100 p-3 text-sm text-zinc-600">
            {placementMode
              ? "Click an object or anywhere on the canvas to add a comment."
              : "Choose New comment to place another comment on an object or the canvas."}
          </p>
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
              const targetAvailable =
                thread.canvasAnchor !== null ||
                thread.targetObjectIds.some((id) => objectsById.has(id));
              return (
                <button
                  key={thread.id}
                  type="button"
                  className="flex w-full items-start gap-3 rounded-xl border border-zinc-200 p-3 text-left transition hover:border-violet-300 hover:bg-violet-50"
                  onClick={() => {
                    setVisible(true);
                    setPlacementMode(false);
                    closeComposer();
                    focusThread(thread.id);
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
