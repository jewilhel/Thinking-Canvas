"use client";

import { useEffect, useRef } from "react";

type Props = {
  x: number;
  y: number;
  maxHeight: number;
  canGroup: boolean;
  canUngroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  onPlaceInDocument?: () => void;
  onReorder: (direction: "front" | "forward" | "backward" | "back") => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onDismiss: () => void;
};

type MenuAction = {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  action: () => void;
};

export function ObjectContextMenu({
  x,
  y,
  maxHeight,
  canGroup,
  canUngroup,
  onGroup,
  onUngroup,
  onPlaceInDocument,
  onReorder,
  onDuplicate,
  onCopy,
  onCut,
  onDelete,
  onDismiss,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const groups: MenuAction[][] = [
    [
      {
        label: "Group",
        shortcut: "⌘G",
        disabled: !canGroup,
        action: onGroup,
      },
      {
        label: "Ungroup",
        shortcut: "⇧⌘G",
        disabled: !canUngroup,
        action: onUngroup,
      },
    ],
    ...(onPlaceInDocument
      ? [[{ label: "Place inside document", action: onPlaceInDocument }]]
      : []),
    [
      { label: "Bring to front", action: () => onReorder("front") },
      { label: "Bring forward", action: () => onReorder("forward") },
      { label: "Send backward", action: () => onReorder("backward") },
      { label: "Send to back", action: () => onReorder("back") },
    ],
    [
      { label: "Duplicate", shortcut: "⌘D", action: onDuplicate },
      { label: "Copy", shortcut: "⌘C", action: onCopy },
      { label: "Cut", shortcut: "⌘X", action: onCut },
    ],
    [
      {
        label: "Delete",
        shortcut: "⌫",
        destructive: true,
        action: onDelete,
      },
    ],
  ];

  useEffect(() => {
    const focusFrame = requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>("button:not([disabled])")
        ?.focus();
    });
    return () => cancelAnimationFrame(focusFrame);
  }, []);

  function moveFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onDismiss();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const actions = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled])",
      ) ?? [],
    );
    if (!actions.length) return;
    const currentIndex = actions.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? actions.length - 1
          : event.key === "ArrowDown"
            ? (Math.max(currentIndex, -1) + 1) % actions.length
            : (currentIndex <= 0 ? actions.length : currentIndex) - 1;
    event.preventDefault();
    actions[nextIndex]?.focus();
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Selection actions"
      data-object-context-menu
      data-testid="object-context-menu"
      className="absolute z-60 w-72 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-2 text-white shadow-2xl outline-none"
      style={{ left: x, top: y, maxHeight }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={moveFocus}
    >
      {groups.map((group, groupIndex) => (
        <div
          key={group[0]?.label}
          className={
            groupIndex === 0 ? "" : "mt-1 border-t border-white/15 pt-1"
          }
        >
          {group.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`flex min-h-11 w-full items-center justify-between gap-4 rounded-xl px-3 text-left text-sm outline-none hover:bg-white/10 focus-visible:bg-violet-600 disabled:cursor-not-allowed disabled:text-zinc-600 ${
                item.destructive
                  ? "text-red-300 hover:bg-red-500/15 focus-visible:bg-red-600 focus-visible:text-white"
                  : "text-zinc-100"
              }`}
              onClick={() => {
                item.action();
                onDismiss();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut ? (
                <span aria-hidden="true" className="text-xs text-zinc-400">
                  {item.shortcut}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
