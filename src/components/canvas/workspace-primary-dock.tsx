"use client";

import {
  Circle,
  Diamond,
  Hand,
  Link2,
  MessageCircle,
  MousePointer2,
  PenLine,
  Puzzle,
  RectangleHorizontal,
  Shapes,
  StickyNote,
  Table2,
  Type,
} from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export type CanvasTool =
  | "select"
  | "pan"
  | "sticky"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "text"
  | "connector"
  | "table";

export type CanvasShapeTool = Extract<
  CanvasTool,
  "rectangle" | "ellipse" | "diamond"
>;

type Palette = "shape" | "drawing" | "comments" | "more" | null;

type Props = {
  activeTool: CanvasTool;
  recentShape: CanvasShapeTool;
  simulatedAiEnabled: boolean;
  onChooseTool: (tool: CanvasTool) => void;
  onChooseShape: (shape: CanvasShapeTool) => void;
  onAddSimulatedAiIdea: () => void;
};

const shapeOptions = [
  { value: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
  { value: "ellipse", label: "Ellipse", icon: Circle },
  { value: "diamond", label: "Diamond", icon: Diamond },
] as const;

const directTools = [
  {
    value: "select",
    label: "Select",
    shortcut: "V",
    icon: MousePointer2,
  },
  { value: "pan", label: "Pan", shortcut: "H", icon: Hand },
] as const;

const creationTools = [
  {
    value: "sticky",
    label: "Sticky note",
    shortcut: "S",
    icon: StickyNote,
  },
  {
    value: "connector",
    label: "Connector",
    shortcut: "C",
    icon: Link2,
  },
  { value: "text", label: "Text", shortcut: "T", icon: Type },
  { value: "table", label: "Table", shortcut: "B", icon: Table2 },
] as const;

function shapeLabel(shape: CanvasShapeTool) {
  return (
    shapeOptions.find((option) => option.value === shape)?.label ?? "Shape"
  );
}

export function WorkspacePrimaryDock({
  activeTool,
  recentShape,
  simulatedAiEnabled,
  onChooseTool,
  onChooseShape,
  onAddSimulatedAiIdea,
}: Props) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const paletteInvokerRef = useRef<HTMLButtonElement | null>(null);
  const [openPalette, setOpenPalette] = useState<Palette>(null);
  const toolIsPressed = (tool: CanvasTool) =>
    openPalette === null && activeTool === tool;

  function chooseTool(tool: CanvasTool) {
    onChooseTool(activeTool === tool && tool !== "select" ? "select" : tool);
    setOpenPalette(null);
  }

  function togglePalette(
    palette: Exclude<Palette, null>,
    invoker: HTMLButtonElement,
  ) {
    paletteInvokerRef.current = invoker;
    if (openPalette === palette) {
      onChooseTool("select");
      setOpenPalette(null);
      return;
    }
    setOpenPalette(palette);
  }

  function closePalette() {
    setOpenPalette(null);
    requestAnimationFrame(() => paletteInvokerRef.current?.focus());
  }

  function moveToolbarFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (
      !["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)
    )
      return;
    if (event.key === "Escape" && openPalette) {
      event.preventDefault();
      closePalette();
      return;
    }
    if (event.key === "Escape") return;
    const buttons = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>(
        ":scope > button:not([disabled]), :scope > div > button:not([disabled])",
      ) ?? [],
    );
    if (!buttons.length) return;
    const currentIndex = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : event.key === "ArrowRight"
            ? (Math.max(currentIndex, -1) + 1) % buttons.length
            : (currentIndex <= 0 ? buttons.length : currentIndex) - 1;
    event.preventDefault();
    buttons[nextIndex]?.focus();
  }

  const iconButtonClass =
    "size-11 border-zinc-200 bg-white text-zinc-700 shadow-none hover:bg-violet-50 hover:text-violet-700 aria-pressed:border-violet-600 aria-pressed:bg-violet-600 aria-pressed:text-white dark:border-zinc-200 dark:bg-white dark:text-zinc-700 dark:hover:bg-violet-50 dark:hover:text-violet-700 dark:aria-pressed:border-violet-600 dark:aria-pressed:bg-violet-600 dark:aria-pressed:text-white";

  return (
    <div className="pointer-events-auto absolute right-44 bottom-4 left-4 z-40 lg:right-auto lg:left-1/2 lg:max-w-[calc(100%-2rem)] lg:-translate-x-1/2">
      {openPalette ? (
        <div
          id={`workspace-${openPalette}-palette`}
          className="absolute bottom-[calc(100%+0.75rem)] left-1/2 w-max max-w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-chrome-solid)] p-3 text-zinc-800 shadow-[var(--workspace-shadow-strong)]"
          data-testid={`workspace-${openPalette}-palette`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closePalette();
            }
          }}
        >
          {openPalette === "shape" ? (
            <>
              <p className="px-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                Choose a shape
              </p>
              <div className="mt-2 flex gap-2" role="menu">
                {shapeOptions.map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    role="menuitemradio"
                    aria-checked={activeTool === value}
                    className="h-11 border-zinc-200 bg-white px-3 text-zinc-700 hover:bg-violet-50 aria-checked:border-violet-600 aria-checked:bg-violet-50 aria-checked:text-violet-800 dark:border-zinc-200 dark:bg-white dark:text-zinc-700 dark:hover:bg-violet-50 dark:aria-checked:border-violet-600 dark:aria-checked:bg-violet-50 dark:aria-checked:text-violet-800"
                    onClick={() => {
                      onChooseShape(value);
                      setOpenPalette(null);
                    }}
                  >
                    <Icon aria-hidden="true" />
                    {label}
                  </Button>
                ))}
              </div>
            </>
          ) : null}

          {openPalette === "drawing" ? (
            <PaletteMessage
              eyebrow="Drawing"
              title="Vector pen arrives in Milestone 6"
              description="This entry is a preview of the workspace vocabulary. It does not add or change canvas content yet."
            />
          ) : null}

          {openPalette === "comments" ? (
            <PaletteMessage
              eyebrow="Comments"
              title="Contextual feedback arrives in Milestone 3"
              description="No comment thread is loaded or saved from this placeholder. The shared panel experience lands in a later slice."
            />
          ) : null}

          {openPalette === "more" ? (
            <div className="min-w-64">
              <PaletteMessage
                eyebrow="More tools"
                title="The dock is ready to grow"
                description="Documents, live conversation, and reusable structures remain in their owning milestones."
              />
              {simulatedAiEnabled ? (
                <div className="mt-3 border-t border-zinc-200 pt-3">
                  <p className="mb-2 text-xs font-semibold tracking-wide text-violet-700 uppercase">
                    Preview instrumentation
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-start border-zinc-200 bg-white text-zinc-700 hover:bg-violet-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-700 dark:hover:bg-violet-50"
                    onClick={() => {
                      onAddSimulatedAiIdea();
                      setOpenPalette(null);
                    }}
                  >
                    Add simulated AI idea
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Canvas tools"
        aria-orientation="horizontal"
        data-testid="workspace-primary-dock"
        className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-chrome)] p-1.5 shadow-[var(--workspace-shadow)] backdrop-blur-xl"
        onKeyDown={moveToolbarFocus}
      >
        {directTools.map(({ value, label, shortcut, icon: Icon }) => (
          <Button
            key={value}
            type="button"
            size="icon"
            variant="outline"
            aria-label={label}
            aria-pressed={toolIsPressed(value)}
            aria-keyshortcuts={shortcut}
            title={`${label} (${shortcut})`}
            className={iconButtonClass}
            onClick={() => chooseTool(value)}
          >
            <Icon aria-hidden="true" />
          </Button>
        ))}

        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Drawing"
          aria-pressed={openPalette === "drawing"}
          aria-expanded={openPalette === "drawing"}
          aria-controls="workspace-drawing-palette"
          title="Drawing (Milestone 6)"
          className={iconButtonClass}
          onClick={(event) => togglePalette("drawing", event.currentTarget)}
        >
          <PenLine aria-hidden="true" />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Sticky note"
          aria-pressed={toolIsPressed("sticky")}
          aria-keyshortcuts="S"
          title="Sticky note (S)"
          className={iconButtonClass}
          onClick={() => chooseTool("sticky")}
        >
          <StickyNote aria-hidden="true" />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Shapes"
          aria-pressed={
            openPalette === "shape" ||
            (openPalette === null &&
              shapeOptions.some((option) => option.value === activeTool))
          }
          aria-expanded={openPalette === "shape"}
          aria-controls="workspace-shape-palette"
          aria-keyshortcuts="R"
          title={`Shapes — recent: ${shapeLabel(recentShape)} (R)`}
          className={iconButtonClass}
          onClick={(event) => togglePalette("shape", event.currentTarget)}
        >
          <Shapes aria-hidden="true" />
        </Button>

        {creationTools
          .slice(1)
          .map(({ value, label, shortcut, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              size="icon"
              variant="outline"
              aria-label={label}
              aria-pressed={toolIsPressed(value)}
              aria-keyshortcuts={shortcut}
              title={`${label} (${shortcut})`}
              className={iconButtonClass}
              onClick={() => chooseTool(value)}
            >
              <Icon aria-hidden="true" />
            </Button>
          ))}

        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Comments"
          aria-pressed={openPalette === "comments"}
          aria-expanded={openPalette === "comments"}
          aria-controls="workspace-comments-palette"
          title="Comments (Milestone 3)"
          className={iconButtonClass}
          onClick={(event) => togglePalette("comments", event.currentTarget)}
        >
          <MessageCircle aria-hidden="true" />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="More tools"
          aria-pressed={openPalette === "more"}
          aria-expanded={openPalette === "more"}
          aria-controls="workspace-more-palette"
          title="More tools"
          className={iconButtonClass}
          onClick={(event) => togglePalette("more", event.currentTarget)}
        >
          <Puzzle aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function PaletteMessage({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-sm p-1">
      <p className="text-xs font-semibold tracking-wide text-violet-700 uppercase">
        {eyebrow}
      </p>
      <p className="mt-1 font-semibold text-zinc-900">{title}</p>
      <p className="mt-1 text-sm leading-5 text-zinc-600">{description}</p>
    </div>
  );
}
