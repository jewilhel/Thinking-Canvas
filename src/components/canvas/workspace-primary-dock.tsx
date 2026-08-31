"use client";

import {
  Check,
  Circle,
  Cloud,
  Cylinder,
  Diamond,
  Eraser,
  Hand,
  Highlighter,
  Link2,
  MessageCircle,
  MessageSquare,
  MousePointer2,
  Octagon,
  PenLine,
  Pentagon,
  Puzzle,
  RectangleHorizontal,
  Shapes,
  SquareRoundCorner,
  Star,
  StickyNote,
  Table2,
  Type,
  Triangle,
  Hexagon,
} from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { CustomColorPicker } from "@/components/canvas/custom-color-picker";
import { drawingColorPairs } from "@/components/canvas/canvas-colors";
import { IconBrowser } from "@/components/canvas/icon-browser";
import { StrokeThicknessOptions } from "@/components/canvas/stroke-thickness-options";

export type CanvasTool =
  | "select"
  | "pan"
  | "pen"
  | "highlighter"
  | "eraser"
  | "sticky"
  | "rectangle"
  | "rounded-rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "star"
  | "cloud"
  | "speech-bubble"
  | "cylinder"
  | "text"
  | "connector"
  | "table";

export type CanvasShapeTool = Extract<
  CanvasTool,
  | "rectangle"
  | "rounded-rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "star"
  | "cloud"
  | "speech-bubble"
  | "cylinder"
>;

export type CanvasDrawingTool = Extract<
  CanvasTool,
  "pen" | "highlighter" | "eraser"
>;

type Palette = "shape" | "drawing" | "more" | null;

type Props = {
  activeTool: CanvasTool;
  recentShape: CanvasShapeTool;
  simulatedAiEnabled: boolean;
  onChooseTool: (tool: CanvasTool) => void;
  onChooseShape: (shape: CanvasShapeTool) => void;
  onChooseIcon: (iconName: string) => void;
  onAddSimulatedAiIdea: () => void;
  commentPlacementActive: boolean;
  onChooseComments: () => void;
  canDraw: boolean;
  lastDrawingTool: CanvasDrawingTool;
  penColor: string;
  penThickness: number;
  onPenColorChange: (color: string) => void;
  onPenThicknessChange: (thickness: number) => void;
};

const penThicknesses = [3, 5, 8, 12, 16] as const;
const drawingTools = [
  { value: "pen", label: "Pen", icon: PenLine },
  { value: "highlighter", label: "Highlighter", icon: Highlighter },
  { value: "eraser", label: "Eraser", icon: Eraser },
] as const;

const shapeOptions = [
  { value: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
  {
    value: "rounded-rectangle",
    label: "Rounded rectangle",
    icon: SquareRoundCorner,
  },
  { value: "ellipse", label: "Ellipse", icon: Circle },
  { value: "diamond", label: "Diamond", icon: Diamond },
  { value: "triangle", label: "Triangle", icon: Triangle },
  { value: "pentagon", label: "Pentagon", icon: Pentagon },
  { value: "hexagon", label: "Hexagon", icon: Hexagon },
  { value: "octagon", label: "Octagon", icon: Octagon },
  { value: "star", label: "Star", icon: Star },
  { value: "cloud", label: "Cloud", icon: Cloud },
  { value: "speech-bubble", label: "Speech bubble", icon: MessageSquare },
  { value: "cylinder", label: "Cylinder", icon: Cylinder },
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
  onChooseIcon,
  onAddSimulatedAiIdea,
  commentPlacementActive,
  onChooseComments,
  canDraw,
  lastDrawingTool,
  penColor,
  penThickness,
  onPenColorChange,
  onPenThicknessChange,
}: Props) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const paletteInvokerRef = useRef<HTMLButtonElement | null>(null);
  const [openPalette, setOpenPalette] = useState<Palette>(null);
  const [shapeSection, setShapeSection] = useState<"basic" | "icons">("basic");
  const DrawingIcon =
    lastDrawingTool === "highlighter"
      ? Highlighter
      : lastDrawingTool === "eraser"
        ? Eraser
        : PenLine;
  const toolIsPressed = (tool: CanvasTool) =>
    openPalette === null && !commentPlacementActive && activeTool === tool;

  function chooseTool(tool: CanvasTool) {
    const drawingTool =
      tool === "pen" || tool === "highlighter" || tool === "eraser";
    onChooseTool(
      activeTool === tool && tool !== "select" && !drawingTool
        ? "select"
        : tool,
    );
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
    <div className="pointer-events-auto absolute right-64 bottom-4 left-4 z-40 lg:right-auto lg:left-1/2 lg:max-w-[calc(100%-2rem)] lg:-translate-x-1/2">
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
              <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                Choose a shape
              </p>
              <div className="flex gap-2" role="tablist" aria-label="Shapes">
                {(["basic", "icons"] as const).map((section) => (
                  <Button
                    key={section}
                    type="button"
                    size="sm"
                    variant="outline"
                    role="tab"
                    aria-selected={shapeSection === section}
                    className="capitalize aria-selected:border-violet-600 aria-selected:bg-violet-50 aria-selected:text-violet-800"
                    onClick={() => setShapeSection(section)}
                  >
                    {section === "basic" ? "Basic shapes" : "Icons"}
                  </Button>
                ))}
              </div>
              {shapeSection === "basic" ? (
                <div
                  className="mt-2 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3"
                  role="menu"
                >
                  {shapeOptions.map(({ value, label, icon: Icon }) => (
                    <Button
                      key={value}
                      type="button"
                      variant="outline"
                      role="menuitemradio"
                      aria-label={
                        value === "rounded-rectangle" ? "Rounded box" : label
                      }
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
              ) : (
                <IconBrowser
                  onChoose={(icon) => {
                    onChooseIcon(icon.name);
                    setOpenPalette(null);
                  }}
                />
              )}
            </>
          ) : null}

          {openPalette === "drawing" ? (
            <div className="min-w-72 p-1">
              <p className="text-xs font-semibold tracking-wide text-violet-700 uppercase">
                Drawing
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2" role="menu">
                {drawingTools.map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    role="menuitemradio"
                    aria-checked={lastDrawingTool === value}
                    disabled={!canDraw}
                    className="h-11 border-zinc-200 bg-white px-2 text-zinc-700 hover:bg-violet-50 aria-checked:border-violet-600 aria-checked:bg-violet-50 aria-checked:text-violet-800"
                    onClick={() => chooseTool(value)}
                  >
                    <Icon aria-hidden="true" /> {label}
                  </Button>
                ))}
              </div>
              {lastDrawingTool !== "eraser" ? (
                <>
                  <fieldset className="mt-3">
                    <legend className="text-xs font-semibold text-zinc-600">
                      Stroke color
                    </legend>
                    <div className="mt-2 grid grid-cols-6 gap-2">
                      {drawingColorPairs.map(({ name, outline: color }) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={`${name} drawing color`}
                          aria-pressed={penColor === color}
                          className="relative grid size-9 place-items-center rounded-full border border-zinc-300 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-600 aria-pressed:ring-2 aria-pressed:ring-violet-600 aria-pressed:ring-offset-2"
                          style={{ backgroundColor: color }}
                          onClick={() => onPenColorChange(color)}
                        >
                          {penColor === color ? (
                            <Check
                              className="size-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]"
                              aria-hidden="true"
                            />
                          ) : null}
                        </button>
                      ))}
                      <CustomColorPicker
                        label="Custom drawing color"
                        value={penColor}
                        onChange={onPenColorChange}
                      />
                    </div>
                  </fieldset>
                  <fieldset className="mt-3">
                    <legend className="text-xs font-semibold text-zinc-600">
                      Stroke thickness
                    </legend>
                    <div className="mt-2">
                      <StrokeThicknessOptions
                        values={penThicknesses}
                        value={penThickness}
                        tone="light"
                        labelPrefix="Drawing stroke"
                        onChange={onPenThicknessChange}
                      />
                    </div>
                  </fieldset>
                </>
              ) : (
                <p className="mt-3 text-xs text-zinc-500">
                  Drag across one or more strokes to erase them. Undo restores
                  the complete eraser gesture.
                </p>
              )}
              {!canDraw ? (
                <p className="mt-3 text-xs text-zinc-500">
                  Viewers and commenters can see annotations but cannot draw.
                </p>
              ) : null}
            </div>
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
          aria-pressed={
            openPalette === "drawing" ||
            activeTool === "pen" ||
            activeTool === "highlighter" ||
            activeTool === "eraser"
          }
          aria-expanded={openPalette === "drawing"}
          aria-controls="workspace-drawing-palette"
          title={`Drawing — ${lastDrawingTool}`}
          className={iconButtonClass}
          onClick={(event) => {
            if (openPalette !== "drawing") onChooseTool(lastDrawingTool);
            togglePalette("drawing", event.currentTarget);
          }}
        >
          <DrawingIcon aria-hidden="true" />
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
              !commentPlacementActive &&
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
          aria-pressed={commentPlacementActive}
          title="Add comment"
          className={iconButtonClass}
          onClick={() => {
            setOpenPalette(null);
            onChooseComments();
          }}
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
