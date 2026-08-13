"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ExternalLink,
  Link2,
  List,
  ListOrdered,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export type TextStylePatch = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  listStyle?: "none" | "bullet" | "numbered";
  linkUrl?: string | null;
};

type Props = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  listStyle?: "none" | "bullet" | "numbered";
  linkUrl?: string | null;
  allowLists: boolean;
  allowLink: boolean;
  onApply: (style: TextStylePatch) => void;
  onOpenLink: (url: string) => void;
};

const typefaces = [
  {
    label: "Simple",
    value: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
  { label: "Bookish", value: "Georgia, ui-serif, serif" },
  {
    label: "Technical",
    value: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  {
    label: "Scribbled",
    value: '"Bradley Hand", "Comic Sans MS", cursive',
  },
  {
    label: "Modern",
    value: 'Helvetica, Arial, "Noto Sans", sans-serif',
  },
  {
    label: "Rounded",
    value: '"Arial Rounded MT Bold", Nunito, ui-rounded, sans-serif',
  },
];

const fontSizes = [
  { label: "Small", value: 16 },
  { label: "Medium", value: 24 },
  { label: "Large", value: 40 },
  { label: "Extra large", value: 56 },
  { label: "Huge", value: 72 },
];

export function TextStylePanel({
  fontFamily,
  fontSize,
  fontWeight,
  textAlign,
  listStyle,
  linkUrl,
  allowLists,
  allowLink,
  onApply,
  onOpenLink,
}: Props) {
  const [customSize, setCustomSize] = useState(
    fontSize == null ? "" : String(fontSize),
  );
  const [linkDraft, setLinkDraft] = useState(linkUrl ?? "");

  function commitCustomSize() {
    if (!customSize.trim()) return;
    const next = Number(customSize);
    if (!Number.isFinite(next) || next < 8 || next > 400) return;
    onApply({ fontSize: next });
  }

  function normalizedLink() {
    const value = linkDraft.trim();
    if (!value) return null;
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(value)
      ? value
      : `https://${value}`;
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === "http:" || parsed.protocol === "https:"
        ? parsed.href
        : undefined;
    } catch {
      return undefined;
    }
  }

  const presetValue = fontSizes.some((preset) => preset.value === fontSize)
    ? String(fontSize)
    : "custom";

  return (
    <div
      className="space-y-4 [&_button[aria-pressed=true]]:bg-violet-600! [&_button[aria-pressed=true]]:text-white!"
      data-testid="text-style-panel"
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-zinc-300">
          Typeface
          <select
            aria-label="Typeface"
            value={fontFamily ?? ""}
            onChange={(event) => onApply({ fontFamily: event.target.value })}
            className="mt-1 w-full rounded-lg border border-white/15 bg-zinc-800 p-2 text-sm text-white"
            style={{ fontFamily }}
          >
            <option value="" disabled>
              Mixed
            </option>
            {typefaces.map((typeface) => (
              <option
                key={typeface.label}
                value={typeface.value}
                style={{ fontFamily: typeface.value }}
              >
                {typeface.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-300">
          Size preset
          <select
            aria-label="Text size preset"
            value={presetValue}
            onChange={(event) => {
              if (event.target.value === "custom") return;
              onApply({ fontSize: Number(event.target.value) });
            }}
            className="mt-1 w-full rounded-lg border border-white/15 bg-zinc-800 p-2 text-sm text-white"
          >
            {fontSize == null ? <option value="custom">Mixed</option> : null}
            {fontSizes.map((preset) => (
              <option key={preset.label} value={preset.value}>
                {preset.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
      </div>

      <label className="block text-xs text-zinc-300">
        Custom size
        <input
          aria-label="Custom text size"
          inputMode="numeric"
          type="number"
          min={8}
          max={400}
          value={customSize}
          placeholder="8–400"
          onChange={(event) => setCustomSize(event.target.value)}
          onBlur={commitCustomSize}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitCustomSize();
          }}
          className="mt-1 w-full rounded-lg border border-white/15 bg-zinc-800 p-2 text-sm text-white"
        />
      </label>

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Text formatting"
      >
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Bold"
          aria-pressed={fontWeight === "bold"}
          title="Bold"
          onClick={() =>
            onApply({ fontWeight: fontWeight === "bold" ? "normal" : "bold" })
          }
        >
          <Bold aria-hidden="true" />
        </Button>
        {(["left", "center", "right"] as const).map((alignment) => {
          const Icon =
            alignment === "left"
              ? AlignLeft
              : alignment === "center"
                ? AlignCenter
                : AlignRight;
          return (
            <Button
              key={alignment}
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={`Align ${alignment}`}
              aria-pressed={textAlign === alignment}
              title={`Align ${alignment}`}
              onClick={() => onApply({ textAlign: alignment })}
            >
              <Icon aria-hidden="true" />
            </Button>
          );
        })}
        {allowLists ? (
          <>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Bulleted list"
              aria-pressed={listStyle === "bullet"}
              title="Bulleted list"
              onClick={() =>
                onApply({
                  listStyle: listStyle === "bullet" ? "none" : "bullet",
                })
              }
            >
              <List aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Numbered list"
              aria-pressed={listStyle === "numbered"}
              title="Numbered list"
              onClick={() =>
                onApply({
                  listStyle: listStyle === "numbered" ? "none" : "numbered",
                })
              }
            >
              <ListOrdered aria-hidden="true" />
            </Button>
          </>
        ) : null}
      </div>

      {allowLink ? (
        <div className="space-y-2 border-t border-white/15 pt-3">
          <label className="block text-xs text-zinc-300">
            Link URL
            <input
              aria-label="Text link URL"
              type="url"
              value={linkDraft}
              placeholder="https://example.com"
              onChange={(event) => setLinkDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const next = normalizedLink();
                if (next !== undefined) onApply({ linkUrl: next });
              }}
              className="mt-1 w-full rounded-lg border border-white/15 bg-zinc-800 p-2 text-sm text-white"
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={normalizedLink() === undefined}
              onClick={() => {
                const next = normalizedLink();
                if (next !== undefined) onApply({ linkUrl: next });
              }}
            >
              <Link2 aria-hidden="true" /> Apply link
            </Button>
            {linkUrl ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenLink(linkUrl)}
                >
                  <ExternalLink aria-hidden="true" /> Open
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onApply({ linkUrl: null })}
                >
                  Remove
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
