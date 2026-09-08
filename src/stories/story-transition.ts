import type { Viewport } from "@/canvas/geometry";

type FrameRequest = (callback: FrameRequestCallback) => number;
type FrameCancel = (handle: number) => void;

export type ViewportTransition = { cancel: () => void };

export function viewportTransitionDuration(from: Viewport, to: Viewport) {
  const panDistance = Math.hypot(to.x - from.x, to.y - from.y);
  const zoomDistance = Math.abs(Math.log(to.scale / from.scale));
  return Math.round(
    Math.min(950, Math.max(320, 320 + panDistance * 0.18 + zoomDistance * 260)),
  );
}

export function interpolateViewport(
  from: Viewport,
  to: Viewport,
  progress: number,
): Viewport {
  const eased =
    progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
  return {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
    scale: Math.exp(
      Math.log(from.scale) +
        (Math.log(to.scale) - Math.log(from.scale)) * eased,
    ),
  };
}

export function startViewportTransition({
  from,
  to,
  reducedMotion,
  onUpdate,
  onComplete,
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
}: {
  from: Viewport;
  to: Viewport;
  reducedMotion: boolean;
  onUpdate: (viewport: Viewport) => void;
  onComplete?: () => void;
  requestFrame?: FrameRequest;
  cancelFrame?: FrameCancel;
}): ViewportTransition {
  if (reducedMotion) {
    onUpdate(to);
    onComplete?.();
    return { cancel: () => undefined };
  }
  const duration = viewportTransitionDuration(from, to);
  let frameHandle = 0;
  let startedAt: number | null = null;
  let cancelled = false;
  const frame = (time: number) => {
    if (cancelled) return;
    startedAt ??= time;
    const progress = Math.min(1, (time - startedAt) / duration);
    onUpdate(interpolateViewport(from, to, progress));
    if (progress < 1) {
      frameHandle = requestFrame(frame);
    } else {
      onComplete?.();
    }
  };
  frameHandle = requestFrame(frame);
  return {
    cancel: () => {
      cancelled = true;
      cancelFrame(frameHandle);
    },
  };
}
