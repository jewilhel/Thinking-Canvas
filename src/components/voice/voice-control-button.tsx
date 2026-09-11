"use client";
import { AudioLines, MicOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  active: boolean;
  connecting: boolean;
  muted: boolean;
  status: string;
  settingsOpen: boolean;
  onAction: (button: HTMLButtonElement) => void;
  onSettings: (button: HTMLButtonElement) => void;
};
export function VoiceControlButton({
  active,
  connecting,
  muted,
  status,
  settingsOpen,
  onAction,
  onSettings,
}: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const label = connecting
    ? "Cancel voice connection"
    : active
      ? "End AI voice"
      : "Start AI voice";
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      aria-label={label}
      aria-description={`${status}. Command-click or Control-click, right-click, or long-press for Voice settings.`}
      aria-expanded={settingsOpen}
      aria-controls="voice-settings-panel"
      title={`${label} · ⌘/Ctrl-click for Voice settings`}
      data-voice-state={
        connecting
          ? "connecting"
          : active
            ? muted
              ? "muted"
              : "listening"
            : "off"
      }
      className={
        active || connecting
          ? "relative border-violet-500 bg-violet-50 text-violet-800"
          : "relative"
      }
      onClick={(event) => {
        clear();
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        if (event.metaKey || event.ctrlKey) onSettings(event.currentTarget);
        else onAction(event.currentTarget);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        clear();
        onSettings(event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (event.key === "F10" && event.shiftKey) {
          event.preventDefault();
          onSettings(event.currentTarget);
        }
      }}
      onPointerDown={(event) => {
        suppressClick.current = false;
        if (event.pointerType !== "touch") return;
        const button = event.currentTarget;
        origin.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
          suppressClick.current = true;
          clear();
          onSettings(button);
        }, 550);
      }}
      onPointerMove={(event) => {
        if (
          origin.current &&
          Math.hypot(
            event.clientX - origin.current.x,
            event.clientY - origin.current.y,
          ) > 10
        ) {
          suppressClick.current = true;
          clear();
        }
      }}
      onPointerUp={clear}
      onPointerCancel={() => {
        suppressClick.current = true;
        clear();
      }}
    >
      <AudioLines
        aria-hidden="true"
        className={
          active && !muted
            ? "motion-safe:animate-pulse"
            : connecting
              ? "opacity-50"
              : ""
        }
      />
      {active && muted && (
        <MicOff
          aria-hidden="true"
          className="absolute right-0.5 bottom-0.5 size-2.5 rounded-full bg-white"
        />
      )}
      {active && !muted && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 size-1 rounded-full bg-current"
        />
      )}
    </Button>
  );
}
