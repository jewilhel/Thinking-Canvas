import { describe, expect, it } from "vitest";

import {
  iconVectorScene,
  searchPhosphorIcons,
  type PhosphorIconCatalog,
} from "@/canvas/phosphor-icon-catalog";

const catalog: PhosphorIconCatalog = {
  version: "2.1.1",
  viewBox: 256,
  icons: [
    {
      name: "brain",
      label: "Brain",
      categories: ["health"],
      tags: ["mind", "thinking"],
      paths: ["M0 0H256V256Z"],
    },
    {
      name: "tree",
      label: "Tree",
      categories: ["nature"],
      tags: ["plant"],
      paths: ["M10 10H246V246Z"],
    },
  ],
};

describe("Phosphor icon catalog", () => {
  it("searches names and tags within a category", () => {
    expect(searchPhosphorIcons(catalog, "thinking", "health")).toEqual([
      catalog.icons[0],
    ]);
    expect(searchPhosphorIcons(catalog, "tree", "health")).toEqual([]);
  });

  it("resolves a provider-neutral vector scene", () => {
    expect(iconVectorScene(catalog, "brain")).toEqual({
      viewBox: 256,
      paths: ["M0 0H256V256Z"],
    });
    expect(iconVectorScene(catalog, "missing")).toBeNull();
  });
});
