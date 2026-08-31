"use client";

import { Check } from "lucide-react";

import { ColorStylePanel } from "@/components/canvas/color-style-panel";
import type { OutlinePattern } from "@/canvas/stroke-style";
import { StrokeThicknessOptions } from "@/components/canvas/stroke-thickness-options";
import { Button } from "@/components/ui/button";

const thicknesses = [1, 2, 3, 5, 8] as const;
const objectThicknesses = [0, ...thicknesses] as const;
const patterns = ["solid", "dashed", "dotted"] as const;

type Props = {
  outline?: string;
  outlineWidth?: number;
  outlinePattern?: OutlinePattern;
  mixedOutline: boolean;
  mixedWidth: boolean;
  mixedPattern: boolean;
  allowPattern: boolean;
  allowZeroWidth: boolean;
  onApply: (style: {
    outline?: string;
    outlineWidth?: number;
    outlinePattern?: OutlinePattern;
  }) => void;
};

export function StrokeStylePanel({
  outline,
  outlineWidth,
  outlinePattern,
  mixedOutline,
  mixedWidth,
  mixedPattern,
  allowPattern,
  allowZeroWidth,
  onApply,
}: Props) {
  return (
    <div className="space-y-4" data-testid="stroke-style-panel">
      <ColorStylePanel
        mode="outline"
        fill={null}
        outline={outline}
        mixedFill={false}
        mixedOutline={mixedOutline}
        onApplyPair={() => undefined}
        onApplyFill={() => undefined}
        onApplyOutline={(color) => onApply({ outline: color })}
      />
      <fieldset>
        <legend className="text-xs font-medium text-zinc-300">
          Thickness{mixedWidth ? " — Mixed" : ""}
        </legend>
        <div className="mt-2">
          <StrokeThicknessOptions
            values={allowZeroWidth ? objectThicknesses : thicknesses}
            value={outlineWidth}
            mixed={mixedWidth}
            labelPrefix="Stroke"
            onChange={(width) => onApply({ outlineWidth: width })}
          />
        </div>
      </fieldset>
      {allowPattern ? (
        <fieldset>
          <legend className="text-xs font-medium text-zinc-300">
            Style{mixedPattern ? " — Mixed" : ""}
          </legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {patterns.map((pattern) => {
              const selected = !mixedPattern && outlinePattern === pattern;
              return (
                <Button
                  key={pattern}
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-pressed={selected}
                  className={
                    selected
                      ? "!border-violet-400 !bg-violet-500/25 !text-white capitalize ring-2 ring-violet-500"
                      : "capitalize"
                  }
                  onClick={() => onApply({ outlinePattern: pattern })}
                >
                  {pattern}
                  {selected ? (
                    <Check className="size-3.5 text-white" aria-hidden="true" />
                  ) : null}
                </Button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
