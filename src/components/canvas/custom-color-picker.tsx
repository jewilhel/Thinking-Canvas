"use client";

import { Pipette, X } from "lucide-react";
import Image from "next/image";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  type PickerPlacement,
  resolvePickerPosition,
} from "@/components/canvas/custom-color-picker-position";

type Hsva = {
  h: number;
  s: number;
  v: number;
  a: number;
};

type Props = {
  label: string;
  value: string;
  mixed?: boolean;
  onChange: (color: string) => void;
};

type EyeDropperResult = { sRGBHex: string };
type EyeDropperConstructor = new () => {
  open: () => Promise<EyeDropperResult>;
};

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 448;
const HUE_WIDTH = 280;
const HUE_HEIGHT = 24;
const ALPHA_WIDTH = 280;
const ALPHA_HEIGHT = 24;
const FIELD_WIDTH = 320;
const FIELD_HEIGHT = 270;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function hsvToRgb({ h, s, v }: Pick<Hsva, "h" | "s" | "v">) {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const [r1, g1, b1] =
    segment < 1
      ? [chroma, x, 0]
      : segment < 2
        ? [x, chroma, 0]
        : segment < 3
          ? [0, chroma, x]
          : segment < 4
            ? [0, x, chroma]
            : segment < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const match = v - chroma;
  return {
    r: Math.round((r1 + match) * 255),
    g: Math.round((g1 + match) * 255),
    b: Math.round((b1 + match) * 255),
  };
}

function rgbToHsv(r: number, g: number, b: number, a = 1): Hsva {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;

  if (delta) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    else if (max === green) h = 60 * ((blue - red) / delta + 2);
    else h = 60 * ((red - green) / delta + 4);
  }

  return {
    h: h < 0 ? h + 360 : h,
    s: max === 0 ? 0 : delta / max,
    v: max,
    a: clamp(a),
  };
}

function parseColor(value: string): Hsva | null {
  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i);
  if (hex) {
    const raw =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((part) => `${part}${part}`)
            .join("")
        : hex[1];
    return rgbToHsv(
      Number.parseInt(raw.slice(0, 2), 16),
      Number.parseInt(raw.slice(2, 4), 16),
      Number.parseInt(raw.slice(4, 6), 16),
      raw.length === 8 ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1,
    );
  }

  const rgb = value
    .trim()
    .match(
      /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
    );
  if (!rgb) return null;
  return rgbToHsv(
    Number(rgb[1]),
    Number(rgb[2]),
    Number(rgb[3]),
    rgb[4] == null ? 1 : Number(rgb[4]),
  );
}

function toHex(hsva: Hsva) {
  const { r, g, b } = hsvToRgb(hsva);
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function toColor(hsva: Hsva) {
  const hex = toHex(hsva);
  if (hsva.a >= 0.999) return hex.toLowerCase();
  const alpha = Math.round(hsva.a * 1000) / 1000;
  const { r, g, b } = hsvToRgb(hsva);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function paintHue(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const pixels = context.createImageData(HUE_WIDTH, HUE_HEIGHT);
  for (let x = 0; x < HUE_WIDTH; x += 1) {
    const rgb = hsvToRgb({ h: (x / (HUE_WIDTH - 1)) * 360, s: 1, v: 1 });
    for (let y = 0; y < HUE_HEIGHT; y += 1) {
      const index = (y * HUE_WIDTH + x) * 4;
      pixels.data.set([rgb.r, rgb.g, rgb.b, 255], index);
    }
  }
  context.putImageData(pixels, 0, 0);
}

function paintAlpha(canvas: HTMLCanvasElement, hsva: Hsva) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const rgb = hsvToRgb(hsva);
  const pixels = context.createImageData(ALPHA_WIDTH, ALPHA_HEIGHT);
  for (let x = 0; x < ALPHA_WIDTH; x += 1) {
    const alpha = x / (ALPHA_WIDTH - 1);
    for (let y = 0; y < ALPHA_HEIGHT; y += 1) {
      const checker = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 208 : 247;
      const index = (y * ALPHA_WIDTH + x) * 4;
      pixels.data.set(
        [
          Math.round(rgb.r * alpha + checker * (1 - alpha)),
          Math.round(rgb.g * alpha + checker * (1 - alpha)),
          Math.round(rgb.b * alpha + checker * (1 - alpha)),
          255,
        ],
        index,
      );
    }
  }
  context.putImageData(pixels, 0, 0);
}

function paintField(canvas: HTMLCanvasElement, hue: number) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const pixels = context.createImageData(FIELD_WIDTH, FIELD_HEIGHT);
  for (let x = 0; x < FIELD_WIDTH; x += 1) {
    for (let y = 0; y < FIELD_HEIGHT; y += 1) {
      const rgb = hsvToRgb({
        h: hue,
        s: x / (FIELD_WIDTH - 1),
        v: 1 - y / (FIELD_HEIGHT - 1),
      });
      const index = (y * FIELD_WIDTH + x) * 4;
      pixels.data.set([rgb.r, rgb.g, rgb.b, 255], index);
    }
  }
  context.putImageData(pixels, 0, 0);
}

function pointerRatio(event: PointerEvent<HTMLCanvasElement>, axis: "x" | "y") {
  const rect = event.currentTarget.getBoundingClientRect();
  const point =
    axis === "x" ? event.clientX - rect.left : event.clientY - rect.top;
  return clamp(point / (axis === "x" ? rect.width : rect.height));
}

export function CustomColorPicker({ label, value, mixed, onChange }: Props) {
  const fallback = parseColor(value) ?? rgbToHsv(255, 255, 255);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(fallback);
  const [hexDraft, setHexDraft] = useState(toHex(fallback));
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    placement: PickerPlacement;
  }>({ left: 12, top: 12, placement: "below" });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLCanvasElement>(null);
  const alphaRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;

    function placePanel() {
      const rect = trigger!.getBoundingClientRect();
      const panelHeight =
        panelRef.current?.getBoundingClientRect().height ?? PANEL_HEIGHT;
      setPosition(
        resolvePickerPosition(
          rect,
          { width: PANEL_WIDTH, height: panelHeight },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    }

    function closeOnOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || trigger?.contains(target))
        return;
      setOpen(false);
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      trigger?.focus();
    }

    placePanel();
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", placePanel, true);
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("scroll", placePanel, true);
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (hueRef.current) paintHue(hueRef.current);
    if (alphaRef.current) paintAlpha(alphaRef.current, draft);
    if (fieldRef.current) paintField(fieldRef.current, draft.h);
  }, [draft, open]);

  function update(next: Hsva, commit = false) {
    setDraft(next);
    setHexDraft(toHex(next));
    if (commit) onChange(toColor(next));
  }

  function commitHex() {
    const normalized = hexDraft.startsWith("#") ? hexDraft : `#${hexDraft}`;
    const next = parseColor(normalized);
    if (!next) {
      setHexDraft(toHex(draft));
      return;
    }
    update({ ...next, a: draft.a }, true);
  }

  function keyboardStep(
    event: KeyboardEvent<HTMLCanvasElement>,
    property: "h" | "a" | "s" | "v",
  ) {
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : 0;
    if (!direction) return;
    event.preventDefault();
    const amount = property === "h" ? 3 : 0.02;
    update(
      {
        ...draft,
        [property]:
          property === "h"
            ? (draft.h + direction * amount + 360) % 360
            : clamp(draft[property] + direction * amount),
      },
      true,
    );
  }

  async function useEyeDropper() {
    const EyeDropper = (
      window as typeof window & { EyeDropper?: EyeDropperConstructor }
    ).EyeDropper;
    if (!EyeDropper) return;
    try {
      const result = await new EyeDropper().open();
      const next = parseColor(result.sRGBHex);
      if (next) update({ ...next, a: draft.a }, true);
    } catch {
      // The browser rejects when the user cancels the system picker.
    }
  }

  const hueX = `${(draft.h / 360) * 100}%`;
  const alphaX = `${draft.a * 100}%`;
  const fieldX = `${draft.s * 100}%`;
  const fieldY = `${(1 - draft.v) * 100}%`;
  const eyeDropperAvailable =
    typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
        data-mixed={mixed}
        className="size-9 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        onClick={() => {
          if (!open) {
            const next = parseColor(value);
            if (next) {
              setDraft(next);
              setHexDraft(toHex(next));
            }
          }
          setOpen((current) => !current);
        }}
      >
        <Image
          src="/assets/color-wheel-swatch.png"
          alt=""
          width={36}
          height={36}
          className="size-9 rounded-full"
          aria-hidden="true"
        />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="false"
              data-placement={position.placement}
              aria-labelledby={titleId}
              className="fixed z-100 w-80 overflow-hidden rounded-2xl border border-black/60 bg-zinc-900 text-white shadow-2xl"
              style={{ left: position.left, top: position.top }}
            >
              <div className="space-y-4 p-5 pb-5">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Pick color from screen"
                    title={
                      eyeDropperAvailable
                        ? "Pick color from screen"
                        : "Eyedropper is not supported in this browser"
                    }
                    disabled={!eyeDropperAvailable}
                    className="grid size-10 shrink-0 place-items-center rounded-xl text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-35"
                    onClick={useEyeDropper}
                  >
                    <Pipette className="size-6" aria-hidden="true" />
                  </button>
                  <label className="min-w-0 flex-1">
                    <span id={titleId} className="sr-only">
                      {label} picker
                    </span>
                    <span className="sr-only">Hex color</span>
                    <input
                      aria-label={`${label} hex`}
                      value={hexDraft}
                      spellCheck={false}
                      maxLength={9}
                      className="h-12 w-full rounded-xl border border-transparent bg-zinc-700 px-4 font-mono text-xl text-white uppercase outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/40"
                      onChange={(event) => setHexDraft(event.target.value)}
                      onBlur={commitHex}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        commitHex();
                        event.currentTarget.select();
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="Close color picker"
                    className="grid size-9 place-items-center rounded-xl text-zinc-300 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-500"
                    onClick={() => {
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                  >
                    <X className="size-5" aria-hidden="true" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="relative h-6">
                    <canvas
                      ref={hueRef}
                      width={HUE_WIDTH}
                      height={HUE_HEIGHT}
                      tabIndex={0}
                      role="slider"
                      aria-label="Hue"
                      aria-valuemin={0}
                      aria-valuemax={360}
                      aria-valuenow={Math.round(draft.h)}
                      className="h-6 w-full cursor-crosshair rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                      onKeyDown={(event) => keyboardStep(event, "h")}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        update({ ...draft, h: pointerRatio(event, "x") * 360 });
                      }}
                      onPointerMove={(event) => {
                        if (
                          !event.currentTarget.hasPointerCapture(
                            event.pointerId,
                          )
                        )
                          return;
                        update({ ...draft, h: pointerRatio(event, "x") * 360 });
                      }}
                      onPointerUp={(event) => {
                        if (
                          !event.currentTarget.hasPointerCapture(
                            event.pointerId,
                          )
                        )
                          return;
                        const next = {
                          ...draft,
                          h: pointerRatio(event, "x") * 360,
                        };
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                        update(next, true);
                      }}
                    />
                    <span
                      className="pointer-events-none absolute top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-transparent shadow-md"
                      style={{ left: hueX }}
                      aria-hidden="true"
                    />
                  </div>

                  <div className="relative h-6">
                    <canvas
                      ref={alphaRef}
                      width={ALPHA_WIDTH}
                      height={ALPHA_HEIGHT}
                      tabIndex={0}
                      role="slider"
                      aria-label="Opacity"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(draft.a * 100)}
                      className="h-6 w-full cursor-crosshair rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                      onKeyDown={(event) => keyboardStep(event, "a")}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        update({ ...draft, a: pointerRatio(event, "x") });
                      }}
                      onPointerMove={(event) => {
                        if (
                          !event.currentTarget.hasPointerCapture(
                            event.pointerId,
                          )
                        )
                          return;
                        update({ ...draft, a: pointerRatio(event, "x") });
                      }}
                      onPointerUp={(event) => {
                        if (
                          !event.currentTarget.hasPointerCapture(
                            event.pointerId,
                          )
                        )
                          return;
                        const next = { ...draft, a: pointerRatio(event, "x") };
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                        update(next, true);
                      }}
                    />
                    <span
                      className="pointer-events-none absolute top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white shadow-md"
                      style={{ left: alphaX, backgroundColor: toColor(draft) }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </div>

              <div className="relative h-[270px] bg-black">
                <canvas
                  ref={fieldRef}
                  width={FIELD_WIDTH}
                  height={FIELD_HEIGHT}
                  tabIndex={0}
                  role="slider"
                  aria-label="Saturation and brightness"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(draft.v * 100)}
                  aria-valuetext={`${Math.round(draft.s * 100)}% saturation, ${Math.round(draft.v * 100)}% brightness`}
                  className="size-full cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset"
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft" || event.key === "ArrowRight")
                      keyboardStep(event, "s");
                    else if (
                      event.key === "ArrowUp" ||
                      event.key === "ArrowDown"
                    )
                      keyboardStep(event, "v");
                  }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    update({
                      ...draft,
                      s: pointerRatio(event, "x"),
                      v: 1 - pointerRatio(event, "y"),
                    });
                  }}
                  onPointerMove={(event) => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId))
                      return;
                    update({
                      ...draft,
                      s: pointerRatio(event, "x"),
                      v: 1 - pointerRatio(event, "y"),
                    });
                  }}
                  onPointerUp={(event) => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId))
                      return;
                    const next = {
                      ...draft,
                      s: pointerRatio(event, "x"),
                      v: 1 - pointerRatio(event, "y"),
                    };
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    update(next, true);
                  }}
                />
                <span
                  className="pointer-events-none absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white shadow-md"
                  style={{
                    left: fieldX,
                    top: fieldY,
                    backgroundColor: toHex(draft),
                  }}
                  aria-hidden="true"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
