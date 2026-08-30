"use client";

import { ColorStylePanel } from "@/components/canvas/color-style-panel";
import type { OutlinePattern } from "@/canvas/stroke-style";
import { Button } from "@/components/ui/button";

const thicknesses = [1, 2, 3, 5, 8] as const;
const patterns = ["solid", "dashed", "dotted"] as const;

type Props = {
  outline?: string;
  outlineWidth?: number;
  outlinePattern?: OutlinePattern;
  mixedOutline: boolean;
  mixedWidth: boolean;
  mixedPattern: boolean;
  allowPattern: boolean;
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
        <div className="mt-2 grid grid-cols-5 gap-2">
          {thicknesses.map((width) => (
            <Button
              key={width}
              type="button"
              size="sm"
              variant="outline"
              aria-label={`${width} pixel stroke`}
              aria-pressed={!mixedWidth && outlineWidth === width}
              onClick={() => onApply({ outlineWidth: width })}
            >
              {width}
            </Button>
          ))}
        </div>
      </fieldset>
      {allowPattern ? (
        <fieldset>
          <legend className="text-xs font-medium text-zinc-300">
            Style{mixedPattern ? " — Mixed" : ""}
          </legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {patterns.map((pattern) => (
              <Button
                key={pattern}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={!mixedPattern && outlinePattern === pattern}
                className="capitalize"
                onClick={() => onApply({ outlinePattern: pattern })}
              >
                {pattern}
              </Button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
