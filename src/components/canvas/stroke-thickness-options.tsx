"use client";

import { Check, Slash } from "lucide-react";

type Props = {
  values: readonly number[];
  value?: number;
  mixed?: boolean;
  tone?: "dark" | "light";
  labelPrefix: string;
  onChange: (value: number) => void;
};

export function StrokeThicknessOptions({
  values,
  value,
  mixed = false,
  tone = "dark",
  labelPrefix,
  onChange,
}: Props) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-2">
      {values.map((width) => {
        const selected = !mixed && value === width;
        return (
          <button
            key={width}
            type="button"
            aria-label={
              width === 0
                ? `No ${labelPrefix.toLowerCase()}`
                : `${width} pixel ${labelPrefix.toLowerCase()}`
            }
            aria-pressed={selected}
            title={width === 0 ? "No stroke" : `${width}px`}
            className={
              tone === "light"
                ? "relative grid h-11 min-w-10 place-items-center rounded-xl border border-zinc-300 bg-white text-zinc-950 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-violet-600 aria-pressed:border-violet-600 aria-pressed:bg-violet-50 aria-pressed:ring-2 aria-pressed:ring-violet-600"
                : "relative grid h-11 min-w-10 place-items-center rounded-xl border border-zinc-500/60 bg-zinc-800 text-zinc-100 outline-none hover:bg-zinc-700 focus-visible:ring-2 focus-visible:ring-violet-500 aria-pressed:border-violet-400 aria-pressed:bg-violet-500/20 aria-pressed:ring-2 aria-pressed:ring-violet-500"
            }
            onClick={() => onChange(width)}
          >
            {width === 0 ? (
              <Slash
                className={
                  tone === "light"
                    ? "size-5 text-zinc-700"
                    : "size-5 text-zinc-300"
                }
                aria-hidden="true"
              />
            ) : (
              <span
                className="rounded-full bg-current"
                style={{
                  width: Math.max(4, Math.min(18, width * 2 + 2)),
                  height: Math.max(4, Math.min(18, width * 2 + 2)),
                }}
                aria-hidden="true"
              />
            )}
            {selected ? (
              <Check
                className="absolute right-0.5 bottom-0.5 size-3.5 rounded-full bg-violet-600 p-0.5 text-white"
                aria-hidden="true"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
