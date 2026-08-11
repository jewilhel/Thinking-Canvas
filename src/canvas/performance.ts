export type FrameMeasurement = {
  sampleCount: number;
  averageFps: number;
  p95FrameTimeMs: number;
  longestFrameMs: number;
  sustainedBelow30Fps: boolean;
};

export function summarizeFrameTimes(frameTimes: number[]): FrameMeasurement {
  if (frameTimes.length === 0) {
    return {
      sampleCount: 0,
      averageFps: 0,
      p95FrameTimeMs: 0,
      longestFrameMs: 0,
      sustainedBelow30Fps: false,
    };
  }

  const sorted = [...frameTimes].sort((left, right) => left - right);
  const average =
    frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
  const p95 =
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  let slowRun = 0;
  let sustainedBelow30Fps = false;
  for (const frameTime of frameTimes) {
    slowRun = frameTime > 1000 / 30 ? slowRun + 1 : 0;
    if (slowRun >= 10) sustainedBelow30Fps = true;
  }

  return {
    sampleCount: frameTimes.length,
    averageFps: Math.round((1000 / average) * 10) / 10,
    p95FrameTimeMs: Math.round(p95 * 10) / 10,
    longestFrameMs: Math.round((sorted.at(-1) ?? 0) * 10) / 10,
    sustainedBelow30Fps,
  };
}
