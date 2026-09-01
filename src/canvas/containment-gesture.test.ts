import { describe, expect, it } from "vitest";

import {
  hasContainmentModifier,
  isControlClickContextMenu,
  isDeferredControlClickContextMenu,
} from "@/canvas/containment-gesture";

describe("containment modifier gesture", () => {
  it("uses Command on Apple platforms and Control elsewhere", () => {
    expect(
      hasContainmentModifier({ metaKey: true, ctrlKey: false }, "MacIntel"),
    ).toBe(true);
    expect(
      hasContainmentModifier({ metaKey: false, ctrlKey: true }, "MacIntel"),
    ).toBe(false);
    expect(
      hasContainmentModifier({ metaKey: false, ctrlKey: true }, "Win32"),
    ).toBe(true);
    expect(
      hasContainmentModifier({ metaKey: true, ctrlKey: false }, "Linux x86_64"),
    ).toBe(false);
  });

  it("reserves Control-click for the macOS context-menu convention", () => {
    expect(
      isControlClickContextMenu({ metaKey: false, ctrlKey: true }, "MacIntel"),
    ).toBe(true);
    expect(
      isControlClickContextMenu({ metaKey: false, ctrlKey: true }, "Win32"),
    ).toBe(false);
  });

  it("defers non-Apple Control-click until the gesture proves it was not a drag", () => {
    expect(
      isDeferredControlClickContextMenu(
        { metaKey: false, ctrlKey: true },
        "Win32",
      ),
    ).toBe(true);
    expect(
      isDeferredControlClickContextMenu(
        { metaKey: false, ctrlKey: true },
        "MacIntel",
      ),
    ).toBe(false);
  });
});
