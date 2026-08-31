import { describe, expect, it } from "vitest";

import {
  annotationIntersectsEraserSegment,
  annotationOutlinePoints,
  annotationSamples,
  canonicalizeAnnotationSamples,
  maxAnnotationSamples,
  normalizeAnnotationPressure,
  simplifyAnnotationSamples,
} from "@/canvas/annotation-stroke";
import type { CanvasObjectV2 } from "@/canvas/canvas-document";

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

  it("maps a resized centerline while keeping derived ink thickness constant", () => {
    const object = {
      schemaVersion: 2,
      id: "50000000-0000-4000-8000-000000000001",
      canvasId: "20000000-0000-4000-8000-000000000001",
      createdBy: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      type: "annotation",
      strokeVersion: 1,
      pointerType: "pen",
      ink: "highlighter",
      points: [5, 10, 25, 10],
      pressures: [0.5, 0.5],
      baseWidth: 30,
      baseHeight: 20,
      temporary: true,
      attachedObjectId: null,
      geometry: { x: 0, y: 0, width: 60, height: 40, rotation: 0 },
      style: {
        fill: null,
        outline: "#b45309",
        outlineWidth: 8,
        fontFamily: "Inter",
        fontSize: 16,
      },
    } satisfies Extract<CanvasObjectV2, { type: "annotation" }>;

    const samples = annotationSamples(object);
    expect(samples.map(({ x, y }) => [x, y])).toEqual([
      [10, 20],
      [50, 20],
    ]);

    const outline = annotationOutlinePoints(samples, object.style.outlineWidth);
    const ys = outline.filter((_, index) => index % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(9);
  });

  it("detects eraser crossings against transformed annotation centerlines", () => {
    const object = {
      schemaVersion: 2,
      id: "50000000-0000-4000-8000-000000000002",
      canvasId: "20000000-0000-4000-8000-000000000001",
      createdBy: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      type: "annotation",
      strokeVersion: 1,
      pointerType: "pen",
      ink: "pen",
      points: [0, 0, 40, 0],
      pressures: [0.5, 0.5],
      baseWidth: 40,
      baseHeight: 1,
      temporary: true,
      attachedObjectId: null,
      geometry: { x: 100, y: 100, width: 80, height: 1, rotation: 90 },
      style: {
        fill: null,
        outline: "#6d28d9",
        outlineWidth: 6,
        fontFamily: "Inter",
        fontSize: 16,
      },
    } satisfies Extract<CanvasObjectV2, { type: "annotation" }>;

    expect(
      annotationIntersectsEraserSegment(
        object,
        { x: 80, y: 140 },
        { x: 120, y: 140 },
        4,
      ),
    ).toBe(true);
    expect(
      annotationIntersectsEraserSegment(
        object,
        { x: 120, y: 90 },
        { x: 140, y: 90 },
        4,
      ),
    ).toBe(false);
    expect(
      annotationIntersectsEraserSegment(
        object,
        { x: 100, y: 200 },
        { x: 100, y: 220 },
        4,
      ),
    ).toBe(false);
  });
});
