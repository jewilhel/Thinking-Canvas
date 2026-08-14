"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description?: string;
  invoker: HTMLButtonElement | null;
  children: ReactNode;
  onDismiss: () => void;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function WorkspacePanel({
  title,
  description,
  invoker,
  children,
  onDismiss,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      requestAnimationFrame(() => invoker?.focus());
    };
  }, [invoker]);

  function containFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    ).filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div
      id="workspace-shared-panel"
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={-1}
      data-testid="workspace-shared-panel"
      className="absolute right-4 bottom-20 z-30 flex max-h-[calc(100%-7rem)] w-[min(24rem,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-chrome-solid)] text-zinc-900 shadow-[var(--workspace-shadow-strong)] max-xl:right-4 max-xl:left-4 max-xl:max-h-[min(65vh,34rem)] max-xl:w-auto"
      onKeyDown={containFocus}
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="font-semibold text-zinc-900">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-sm text-zinc-500">
              {description}
            </p>
          ) : null}
        </div>
        <Button
          ref={closeRef}
          type="button"
          size="icon"
          variant="outline"
          aria-label={`Close ${title}`}
          className="size-11 border-zinc-200 bg-white text-zinc-700 hover:bg-violet-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-700"
          onClick={onDismiss}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <div
        tabIndex={0}
        aria-label={`${title} content`}
        className="min-h-0 flex-1 overflow-y-auto p-4 outline-none focus-visible:ring-3 focus-visible:ring-violet-500 focus-visible:ring-inset"
      >
        {children}
      </div>
    </div>
  );
}
