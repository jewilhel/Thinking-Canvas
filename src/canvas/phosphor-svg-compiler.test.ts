import { describe, expect, it } from "vitest";

import { pathsFromTrustedPhosphorSvg } from "@/canvas/phosphor-svg-compiler";

describe("trusted Phosphor SVG compiler", () => {
  it("deterministically extracts only declarative path data", () => {
    const svg = '<svg viewBox="0 0 256 256"><path d="M0 0H256V256Z" /></svg>';
    expect(pathsFromTrustedPhosphorSvg(svg, "fixture")).toEqual([
      "M0 0H256V256Z",
    ]);
    expect(pathsFromTrustedPhosphorSvg(svg, "fixture")).toEqual(
      pathsFromTrustedPhosphorSvg(svg, "fixture"),
    );
  });

  it.each([
    '<svg><script>alert(1)</script><path d="M0 0Z" /></svg>',
    '<svg><image href="https://example.com/a.png" /></svg>',
    "<svg><foreignObject><div>unsafe</div></foreignObject></svg>",
    '<svg><path d="M0 0Z" onclick="alert(1)" /></svg>',
  ])("rejects unsupported or active SVG content", (svg) => {
    expect(() => pathsFromTrustedPhosphorSvg(svg, "hostile")).toThrow(
      "Unsupported SVG content",
    );
  });
});
