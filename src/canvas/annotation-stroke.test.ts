import { describe, expect, it } from "vitest";

import {
  annotationOutlinePoints,
  canonicalizeAnnotationSamples,
  maxAnnotationSamples,
  normalizeAnnotationPressure,
  simplifyAnnotationSamples,
} from "@/canvas/annotation-stroke";

describe("annotation stroke geometry", () => {
  it("uses supplied pen pressure and deterministic simulated mouse pressure", () => {
    expect(normalizeAnnotationPressure("pen", 0.8)).toBe(0.8);
    expect(normalizeAnnotationPressure("touch", 0.25)).toBe(0.25);
    expect(normalizeAnnotationPressure("mouse", 0.9)).toBe(0.5);
    expect(normalizeAnnotationPressure("pen", 0)).toBe(0.5);
  });

  it("simplifies duplicate samples, preserves endpoints, and caps payloads", () => {
    const samples = Array.from(
      { length: maxAnnotationSamples + 500 },
      (_, i) => ({
        x: i,
        y: i % 7,
        pressure: 0.5,
      }),
    );
    const simplified = simplifyAnnotationSamples(samples);

    expect(simplified).toHaveLength(maxAnnotationSamples);
    expect(simplified[0]).toEqual(samples[0]);
    expect(simplified.at(-1)).toEqual(samples.at(-1));
  });

  it("normalizes world samples into editable local points and rejects a tap", () => {
    expect(
      canonicalizeAnnotationSamples(
        [
          { x: 10, y: 20, pressure: 0.5 },
          { x: 10.1, y: 20.1, pressure: 0.5 },
        ],
        5,
      ),
    ).toBeNull();

    const stroke = canonicalizeAnnotationSamples(
      [
        { x: 10, y: 20, pressure: 0.2 },
        { x: 30, y: 40, pressure: 0.8 },
      ],
      5,
    );

    expect(stroke).toEqual({
      geometry: { x: 5, y: 15, width: 30, height: 30, rotation: 0 },
      points: [5, 5, 25, 25],
      pressures: [0.2, 0.8],
    });
  });

  it("derives stable renderer geometry without storing the outline", () => {
    const samples = [
      { x: 5, y: 5, pressure: 0.2 },
      { x: 15, y: 12, pressure: 0.6 },
      { x: 25, y: 5, pressure: 0.8 },
    ];
    const first = annotationOutlinePoints(samples, 5);
    const second = annotationOutlinePoints(samples, 5);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(samples.length * 2);
    expect(first.every(Number.isFinite)).toBe(true);
  });
});
