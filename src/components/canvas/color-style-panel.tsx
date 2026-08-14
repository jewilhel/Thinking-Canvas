"use client";

import { Check, Slash } from "lucide-react";

import { CustomColorPicker } from "@/components/canvas/custom-color-picker";

type ColorPair = {
  name: string;
  fill: string;
  outline: string;
};

type Props = {
  mode: "fill" | "outline";
  fill?: string | null;
  outline?: string;
  mixedFill: boolean;
  mixedOutline: boolean;
  onApplyPair: (pair: ColorPair) => void;
  onApplyFill: (fill: string | null) => void;
  onApplyOutline: (outline: string) => void;
};

const colorPairs: ColorPair[] = [
  { name: "Charcoal", fill: "#27272a", outline: "#09090b" },
  { name: "Gray", fill: "#a1a1aa", outline: "#52525b" },
  { name: "Red", fill: "#f87171", outline: "#b91c1c" },
  { name: "Orange", fill: "#fb923c", outline: "#c2410c" },
  { name: "Amber", fill: "#fbbf24", outline: "#b45309" },
  { name: "Green", fill: "#4ade80", outline: "#15803d" },
  { name: "Teal", fill: "#2dd4bf", outline: "#0f766e" },
  { name: "Blue", fill: "#38bdf8", outline: "#0369a1" },
  { name: "Violet", fill: "#8b5cf6", outline: "#6d28d9" },
  { name: "Pink", fill: "#ec4899", outline: "#be185d" },
  { name: "White", fill: "#ffffff", outline: "#a1a1aa" },
  { name: "Light gray", fill: "#e4e4e7", outline: "#71717a" },
  { name: "Light red", fill: "#fecaca", outline: "#dc2626" },
  { name: "Light orange", fill: "#fed7aa", outline: "#ea580c" },
  { name: "Light amber", fill: "#fef3c7", outline: "#d97706" },
  { name: "Light green", fill: "#dcfce7", outline: "#16a34a" },
  { name: "Light teal", fill: "#ccfbf1", outline: "#0d9488" },
  { name: "Light blue", fill: "#dbeafe", outline: "#2563eb" },
  { name: "Light violet", fill: "#ede9fe", outline: "#7c3aed" },
  { name: "Light pink", fill: "#fce7f3", outline: "#db2777" },
];

export function ColorStylePanel({
  mode,
  fill,
  outline,
  mixedFill,
  mixedOutline,
  onApplyPair,
  onApplyFill,
  onApplyOutline,
}: Props) {
  return (
    <div className="space-y-4" data-testid={`${mode}-color-panel`}>
      <div>
        <p className="text-xs font-medium text-zinc-300">
          {mode === "fill" ? "Fill color" : "Stroke color"}
        </p>
        <div
          className="mt-3 grid grid-cols-6 gap-2"
          role="group"
          aria-label={
            mode === "fill" ? "Preset fill swatches" : "Preset outline swatches"
          }
        >
          {mode === "fill" ? (
            <button
              type="button"
              aria-label="No fill"
              aria-pressed={!mixedFill && fill === null}
              title="No fill"
              className="relative size-9 rounded-full border-2 border-zinc-500 bg-zinc-900! outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              onClick={() => onApplyFill(null)}
            >
              <Slash
                className="absolute inset-1.5 size-5 text-zinc-300"
                aria-hidden="true"
              />
            </button>
          ) : null}
          {colorPairs.map((pair) => {
            const selected =
              mode === "fill"
                ? !mixedFill && fill === pair.fill
                : !mixedOutline && outline === pair.outline;
            const color = mode === "fill" ? pair.fill : pair.outline;
            return (
              <button
                key={pair.name}
                type="button"
                aria-label={`${pair.name} ${mode === "fill" ? "fill" : "stroke"}`}
                aria-pressed={selected}
                title={pair.name}
                className="relative size-9 rounded-full border-2 border-white/40 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 aria-pressed:ring-3 aria-pressed:ring-violet-500"
                style={{ backgroundColor: color }}
                onClick={() =>
                  mode === "fill"
                    ? onApplyPair(pair)
                    : onApplyOutline(pair.outline)
                }
              >
                {selected ? (
                  <Check
                    className={`absolute inset-2 size-4 ${pair.fill === "#ffffff" || pair.name.startsWith("Light") ? "text-zinc-900" : "text-white"}`}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
          <CustomColorPicker
            label={
              mode === "fill" ? "Custom fill color" : "Custom stroke color"
            }
            value={
              mode === "fill" ? (fill ?? "#ffffff") : (outline ?? "#475569")
            }
            mixed={mode === "fill" ? mixedFill : mixedOutline}
            onChange={(color) =>
              mode === "fill" ? onApplyFill(color) : onApplyOutline(color)
            }
          />
        </div>
      </div>
    </div>
  );
}

export type { ColorPair };
