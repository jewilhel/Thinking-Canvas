type TriggerRect = {
  top: number;
  right: number;
  bottom: number;
};

type PickerSize = {
  width: number;
  height: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

export type PickerPlacement = "below" | "above" | "clamped";

export function resolvePickerPosition(
  trigger: TriggerRect,
  picker: PickerSize,
  viewport: ViewportSize,
  margin = 12,
  gap = 8,
) {
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  const left = clamp(
    trigger.right - picker.width,
    margin,
    Math.max(margin, viewport.width - picker.width - margin),
  );
  const below = trigger.bottom + gap;
  const above = trigger.top - picker.height - gap;

  if (below + picker.height <= viewport.height - margin) {
    return { left, top: below, placement: "below" as const };
  }
  if (above >= margin) {
    return { left, top: above, placement: "above" as const };
  }
  return {
    left,
    top: clamp(
      below,
      margin,
      Math.max(margin, viewport.height - picker.height - margin),
    ),
    placement: "clamped" as const,
  };
}
