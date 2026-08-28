"use client";

import {
  ArrowUp,
  Bot,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  MessageCircle,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  commentOrderedContextIds,
  commentTargetObjectIds,
  type CommentCollaborator,
  type CommentPrompt,
  type CommentPromptKind,
  type CommentThread,
  type CommentRecipient,
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
  orderedContextIds: string[];
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
  onAiTransactionApplied: (changeSetId: string) => void;
  onUndoAiTransaction: (changeSetId: string) => Promise<{ conflicts: number }>;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : name.slice(0, 2)
  ).toUpperCase();
}

const HUMAN_AVATAR_STYLES = [
  "bg-sky-700",
  "bg-emerald-700",
  "bg-amber-700",
  "bg-rose-700",
  "bg-indigo-700",
  "bg-teal-700",
] as const;

function humanAvatarStyle(identityKey: string) {
  const index = [...identityKey].reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  return HUMAN_AVATAR_STYLES[index % HUMAN_AVATAR_STYLES.length]!;
}

function Avatar({
  name,
  identityKey = name,
  ai = false,
}: {
  name: string;
  identityKey?: string;
  ai?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-avatar-kind={ai ? "ai" : "human"}
      className={`grid size-9 shrink-0 place-items-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-sm ${ai ? "bg-violet-600" : humanAvatarStyle(identityKey)}`}
    >
      {ai ? "AI" : initials(name)}
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

function aiRunFailureMessage(errorCode: string | null) {
  if (errorCode === "connected_path_not_connected")
    return "The selected path is not connected in selection order.";
  if (errorCode === "connected_path_ambiguous_path")
    return "The selected path has an ambiguous connection.";
  if (errorCode === "connected_path_stale_object")
    return "The selected path includes an object that is no longer available.";
  if (errorCode === "connected_path_cross_canvas_object")
    return "The selected path includes an object from another canvas.";
  if (errorCode === "rate_or_budget_limit")
    return "The AI request limit is reached. Retry after the current five-minute window.";
  if (errorCode === "provider_output_invalid")
    return "The AI returned an invalid structured response. Retry the request.";
  if (errorCode === "visual_quality_blocked")
    return "The visual quality check could not produce a safe reviewable result.";
  if (errorCode === "review_stage_failed")
    return "The review changes could not be staged against the current canvas. Refresh and retry.";
  return "The response could not be completed. Your comment remains saved.";
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

function RecipientComposer({
  label,
  value,
  recipients,
  collaborators,
  pending,
  inputRef,
  placeholder,
  onChange,
  onRecipientsChange,
}: {
  label: string;
  value: string;
  recipients: CommentRecipient[];
  collaborators: CommentCollaborator[];
  pending: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  onChange: (value: string) => void;
  onRecipientsChange: (recipients: CommentRecipient[]) => void;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const available = collaborators.filter(
    (collaborator) =>
      !recipients.some(
        (recipient) =>
          recipient.kind === collaborator.kind &&
          recipient.key === collaborator.key,
      ) &&
      (query === null ||
        collaborator.name.toLowerCase().includes(query.toLowerCase())),
  );

  function updateValue(next: string) {
    onChange(next);
    const match = next.match(/(?:^|\s)@([^\s@]*)$/);
    setQuery(match ? match[1] : null);
    setActiveIndex(0);
  }

  function select(collaborator: CommentCollaborator) {
    onRecipientsChange([
      ...recipients,
      {
        kind: collaborator.kind,
        key: collaborator.key,
        name: collaborator.name,
      },
    ]);
    onChange(
      value.replace(/(?:^|\s)@[^\s@]*$/, (match) =>
        match.startsWith(" ") ? " " : "",
      ),
    );
    setQuery(null);
  }

  return (
    <div
      role="combobox"
      aria-label={`${label} recipients`}
      aria-haspopup="listbox"
      aria-controls={query !== null ? listboxId : undefined}
      aria-expanded={query !== null}
      className="min-w-0 flex-1"
    >
      {recipients.length ? (
        <div className="mb-1 flex flex-wrap items-center gap-1 px-2">
          <span className="text-xs font-medium text-zinc-500">To</span>
          {recipients.map((recipient) => (
            <span
              key={`${recipient.kind}:${recipient.key}`}
              className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-900"
            >
              {recipient.kind === "ai" ? (
                <Bot aria-hidden="true" className="size-3" />
              ) : null}
              {recipient.name}
              <button
                type="button"
                disabled={pending}
                aria-label={`Remove ${recipient.name}`}
                className="rounded-full p-0.5 hover:bg-violet-200 focus-visible:ring-2 focus-visible:ring-violet-500"
                onClick={() =>
                  onRecipientsChange(
                    recipients.filter(
                      (candidate) =>
                        candidate.kind !== recipient.kind ||
                        candidate.key !== recipient.key,
                    ),
                  )
                }
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        ref={inputRef}
        aria-label={label}
        aria-autocomplete="list"
        value={value}
        rows={1}
        maxLength={100_000}
        disabled={pending}
        placeholder={placeholder}
        className="h-10 min-h-10 w-full resize-none bg-transparent px-2 py-1 text-sm transition-[height] outline-none group-focus-within:h-24 placeholder:text-zinc-400"
        onChange={(event) => updateValue(event.target.value)}
        onKeyDown={(event) => {
          if (query === null) return;
          if (event.key === "Escape") {
            event.preventDefault();
            setQuery(null);
          } else if (event.key === "ArrowDown" && available.length) {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % available.length);
          } else if (event.key === "ArrowUp" && available.length) {
            event.preventDefault();
            setActiveIndex(
              (current) => (current - 1 + available.length) % available.length,
            );
          } else if (event.key === "Enter" && available.length) {
            event.preventDefault();
            select(available[activeIndex] ?? available[0]!);
          }
        }}
      />
      {query !== null ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Collaborators"
          className="mx-1 mt-1 max-h-44 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"
        >
          {available.length ? (
            available.map((collaborator, index) => (
              <button
                key={`${collaborator.kind}:${collaborator.key}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-violet-100 text-violet-950" : "hover:bg-zinc-100"}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(collaborator)}
              >
                {collaborator.kind === "ai" ? (
                  <Bot aria-hidden="true" className="size-4 text-violet-600" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="size-4 rounded-full bg-zinc-500"
                  />
                )}
                <span className="font-medium">{collaborator.name}</span>
                <span className="ml-auto text-xs text-zinc-500">
                  {collaborator.role === "primary_ai"
                    ? "Primary AI"
                    : collaborator.role}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-zinc-500">
              No collaborators found.
            </p>
          )}
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
  collaborators,
  onReply,
  onRespond,
  onPromptChange,
  onBodyChange,
  onStatus,
  onDelete,
  onNavigateEvidence,
  onUndoAiTransaction,
  onCancelAiRun,
  onRetryAiRun,
}: {
  thread: CommentThread;
  userId: string;
  role: CanvasRole;
  pending: boolean;
  collaborators: CommentCollaborator[];
  onReply: (
    body: string,
    recipients: CommentRecipient[] | undefined,
  ) => Promise<void>;
  onRespond: (
    prompt: CommentPrompt,
    value: PromptResponseValue,
  ) => Promise<void>;
  onPromptChange: (kind: CommentPromptKind | null) => Promise<void>;
  onBodyChange: (body: string) => Promise<void>;
  onStatus: (status: "resolved" | "dismissed") => Promise<void>;
  onDelete: () => Promise<void>;
  onNavigateEvidence: (objectId: string) => void;
  onUndoAiTransaction: (changeSetId: string) => Promise<{ conflicts: number }>;
  onCancelAiRun: (runId: string) => Promise<void>;
  onRetryAiRun: (runId: string) => Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const inheritedRecipients = thread.activeParticipants.filter(
    (participant) => participant.kind === "ai" || participant.key !== userId,
  );
  const [replyRecipients, setReplyRecipients] =
    useState<CommentRecipient[]>(inheritedRecipients);
  const [routingExplicit, setRoutingExplicit] = useState(false);
  const effectiveReplyRecipients = routingExplicit
    ? replyRecipients
    : inheritedRecipients;
  const [editingBody, setEditingBody] = useState(false);
  const [bodyDraft, setBodyDraft] = useState(thread.body);
  const [undoingChangeSetId, setUndoingChangeSetId] = useState<string | null>(
    null,
  );
  const [undoError, setUndoError] = useState("");
  const [undoNotice, setUndoNotice] = useState("");
  const canComment = role !== "viewer";
  const canResolve =
    role === "owner" || role === "editor" || thread.authorId === userId;
  const canDismiss = role === "owner" || thread.authorId === userId;
  const canDelete = role === "owner" || thread.authorId === userId;
  const canManagePrompt = thread.authorId === userId;
  const latestRuns = [...thread.aiRuns]
    .reverse()
    .filter(
      (run, index, runs) =>
        runs.findIndex(
          (candidate) => candidate.invokingReplyId === run.invokingReplyId,
        ) === index,
    )
    .reverse();
  return (
    <>
      <div className="flex items-start gap-3">
        <Avatar
          name={thread.authorName}
          identityKey={thread.authorKey}
          ai={thread.authorKind === "ai"}
        />
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
        <div className="mt-4 space-y-4">
          {thread.replies.map((item) => (
            <div
              key={item.id}
              data-comment-author-kind={item.authorKind}
              className="flex items-start gap-3"
            >
              <Avatar
                name={item.authorName}
                identityKey={item.authorKey}
                ai={item.authorKind === "ai"}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900">
                  {item.authorName}
                </p>
                <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-zinc-700">
                  {item.body}
                </p>
                {item.authorKind === "ai" &&
                item.aiTransaction?.status === "active" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    disabled={
                      pending ||
                      undoingChangeSetId === item.aiTransaction.changeSetId
                    }
                    onClick={() => {
                      const changeSetId = item.aiTransaction!.changeSetId;
                      setUndoError("");
                      setUndoNotice("");
                      setUndoingChangeSetId(changeSetId);
                      void onUndoAiTransaction(changeSetId)
                        .then(({ conflicts }) => {
                          if (conflicts) {
                            setUndoNotice(
                              `Change undone where safe; ${conflicts} later edit${conflicts === 1 ? " was" : "s were"} preserved.`,
                            );
                          }
                        })
                        .catch((error) =>
                          setUndoError(
                            error instanceof Error
                              ? error.message
                              : "The AI change could not be undone.",
                          ),
                        )
                        .finally(() => setUndoingChangeSetId(null));
                    }}
                  >
                    <RotateCcw aria-hidden="true" /> Undo AI change
                  </Button>
                ) : item.authorKind === "ai" &&
                  item.aiTransaction?.status === "undone" ? (
                  <p className="mt-2 text-xs text-zinc-500">Change undone</p>
                ) : null}
                {item.evidence.length ? (
                  <div
                    className="mt-2 flex flex-wrap gap-2"
                    aria-label="Canvas evidence"
                  >
                    {item.evidence.map((reference) => (
                      <Button
                        key={reference.objectId}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onNavigateEvidence(reference.objectId)}
                      >
                        View {reference.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
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
      {latestRuns
        .filter((run) => run.status !== "completed")
        .map((run) => {
          const active = [
            "queued",
            "projecting",
            "thinking",
            "tool_pending",
            "applying",
          ].includes(run.status);
          return (
            <div
              key={run.id}
              role="status"
              aria-live="polite"
              className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950"
            >
              <div className="flex items-center gap-2 font-semibold">
                {active ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <Bot aria-hidden="true" className="size-4" />
                )}
                {active
                  ? run.status === "queued"
                    ? "Thinking Canvas AI is queued…"
                    : run.status === "projecting"
                      ? "Thinking Canvas AI is reading the canvas…"
                      : "Thinking Canvas AI is responding…"
                  : run.status === "cancelled"
                    ? "AI response cancelled"
                    : "AI response failed"}
              </div>
              {run.status === "failed" ? (
                <p className="mt-1 text-xs text-violet-800">
                  {aiRunFailureMessage(run.errorCode)}
                </p>
              ) : null}
              {run.requestedBy === userId ? (
                <div className="mt-2 flex justify-end">
                  {active ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void onCancelAiRun(run.id)}
                    >
                      <X aria-hidden="true" /> Cancel
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={thread.status !== "open"}
                      onClick={() => void onRetryAiRun(run.id)}
                    >
                      <RotateCcw aria-hidden="true" /> Retry
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      {thread.status === "open" && canComment && !thread.prompt ? (
        <form
          className="group mt-4 w-full rounded-2xl bg-zinc-100 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const body = reply.trim();
            if (!body) return;
            void onReply(
              body,
              routingExplicit ? effectiveReplyRecipients : undefined,
            ).then(() => {
              setReply("");
              setRoutingExplicit(false);
            });
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
            <RecipientComposer
              label="Reply"
              value={reply}
              recipients={routingExplicit ? replyRecipients : []}
              collaborators={collaborators.filter(
                (collaborator) =>
                  collaborator.kind === "ai" || collaborator.key !== userId,
              )}
              pending={pending}
              placeholder="Write a reply or type @"
              onChange={setReply}
              onRecipientsChange={(next) => {
                setReplyRecipients(next);
                setRoutingExplicit(true);
              }}
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
  onDismissPanel,
  onSelectTargets,
  onAiTransactionApplied,
  onUndoAiTransaction,
}: Props) {
  const {
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
  } = useCanvasComments(
    canvasId,
    supabaseUrl,
    supabasePublishableKey,
    onAiTransactionApplied,
  );
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
  const [draftRecipients, setDraftRecipients] = useState<CommentRecipient[]>(
    [],
  );
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
  useEffect(() => {
    if (!selectedThreadId) return;

    function dismissThreadOutside(event: PointerEvent) {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        threadCardRef.current?.contains(target)
      ) {
        return;
      }
      setSelectedThreadId(null);
    }

    document.addEventListener("pointerdown", dismissThreadOutside);
    return () =>
      document.removeEventListener("pointerdown", dismissThreadOutside);
  }, [selectedThreadId]);

  function closeComposer() {
    setComposerOpen(false);
    setComposerTarget(null);
    setDraftRecipients([]);
  }

  function beginComment() {
    setSelectedThreadId(null);
    closeComposer();
    setPlacementMode(true);
  }

  function focusThread(threadId: string) {
    if (panelOpen) onDismissPanel();
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
    const targetObjectIds = object
      ? targetIds?.includes(object.id)
        ? targetIds
        : [object.id]
      : [];
    setComposerTarget({
      targetObjectIds,
      orderedContextIds: commentOrderedContextIds(
        objects,
        selectedIds,
        targetObjectIds,
      ),
      canvasAnchor: object ? null : canvasPoint,
    });
    setPlacementMode(false);
    setComposerOpen(true);
  }

  async function createThread() {
    if (!composerTarget || !draft.trim()) return;
    const result = await execute({
      type: "comment.create",
      commandId: crypto.randomUUID(),
      canvasId,
      body: draft.trim(),
      targetObjectIds: composerTarget.targetObjectIds,
      orderedContextIds: composerTarget.orderedContextIds,
      canvasAnchor: composerTarget.canvasAnchor,
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
    setPromptKind(null);
    closeComposer();
    setVisible(true);
    if (id) focusThread(id);
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
    setSelectedThreadId(null);
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
        ? threads
            .filter((thread) => thread.status === "open")
            .map((thread) => {
              const position = threadAnchor(thread, objectsById, viewport);
              if (!position) return null;
              const markerStyle = commentMarkerStyle(position, size);
              const previewEnabled = selectedThreadId === null;
              return (
                <button
                  key={thread.id}
                  type="button"
                  aria-label={`Open comment by ${thread.authorName}`}
                  aria-expanded={selectedThreadId === thread.id}
                  className={`group absolute z-30 flex h-[3.25rem] w-[3.25rem] items-center gap-3 overflow-hidden rounded-[999px_999px_999px_0.55rem] border border-transparent bg-transparent p-2 text-left text-violet-500 shadow-md transition-[width,height,border-color,background-color,border-radius,box-shadow] duration-200 ease-out focus-visible:ring-3 focus-visible:ring-violet-500 focus-visible:outline-none motion-reduce:transition-none ${previewEnabled ? "hover:h-24 hover:w-80 hover:rounded-[1.5rem_1.5rem_1.5rem_0.55rem] hover:border-zinc-200 hover:bg-white hover:shadow-xl focus-visible:h-24 focus-visible:w-80 focus-visible:rounded-[1.5rem_1.5rem_1.5rem_0.55rem] focus-visible:border-zinc-200 focus-visible:bg-white" : ""}`}
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
                      identityKey={thread.authorKey}
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

      {composerOpen &&
      composerTarget &&
      composerPosition &&
      composerCardPosition ? (
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
              disabled={pending || !draft.trim()}
              aria-label="Submit comment"
            >
              <ArrowUp aria-hidden="true" className="size-6" />
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-2 pt-2 pb-1">
            {composerTarget.orderedContextIds.length > 1 ? (
              <p className="w-full text-xs text-violet-700">
                AI path context: {composerTarget.orderedContextIds.length}
                {" objects in selection order"}
              </p>
            ) : null}
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
            collaborators={collaboration?.collaborators ?? []}
            onReply={(body, recipients) =>
              reply(selectedThread, body, recipients)
            }
            onRespond={respond}
            onPromptChange={(kind) => setPrompt(selectedThread, kind)}
            onBodyChange={(body) => updateBody(selectedThread, body)}
            onStatus={(next) => status(selectedThread, next)}
            onDelete={() => deleteThread(selectedThread)}
            onNavigateEvidence={(objectId) => onSelectTargets([objectId])}
            onUndoAiTransaction={async (changeSetId) => {
              const result = await onUndoAiTransaction(changeSetId);
              await refresh();
              return result;
            }}
            onCancelAiRun={cancelAiRun}
            onRetryAiRun={retryAiRun}
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
          {collaboration ? (
            <div className="mt-3 rounded-xl border border-zinc-200 p-3">
              <div className="flex items-center gap-2">
                <Avatar name="Thinking Canvas AI" identityKey="primary-ai" ai />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">
                    Thinking Canvas AI
                  </p>
                  <p className="text-xs text-zinc-500">
                    Primary AI collaborator · communicates in comments
                  </p>
                </div>
                {collaboration.aiAccess.canManage ? (
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={collaboration.aiAccess.enabled}
                      disabled={pending}
                      onChange={(event) =>
                        void setAiSettings(
                          event.target.checked,
                          collaboration.aiAccess.configuredAuthority,
                        )
                      }
                    />
                    Enabled
                  </label>
                ) : (
                  <span className="text-xs font-medium text-zinc-500">
                    {collaboration.aiAccess.enabled ? "Enabled" : "Disabled"}
                  </span>
                )}
              </div>
              {collaboration.aiAccess.canManage ? (
                <label className="mt-3 block text-xs font-medium text-zinc-600">
                  Authority
                  <select
                    aria-label="AI authority"
                    value={collaboration.aiAccess.configuredAuthority}
                    disabled={pending}
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-800"
                    onChange={(event) =>
                      void setAiSettings(
                        collaboration.aiAccess.enabled,
                        event.target
                          .value as typeof collaboration.aiAccess.configuredAuthority,
                      )
                    }
                  >
                    <option value="comment_only">Comment only</option>
                    <option value="propose_changes">Propose changes</option>
                    <option value="edit_with_review">Edit with undo</option>
                    <option value="trusted_editor">Trusted editor</option>
                  </select>
                </label>
              ) : null}
            </div>
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
                    identityKey={thread.authorKey}
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
