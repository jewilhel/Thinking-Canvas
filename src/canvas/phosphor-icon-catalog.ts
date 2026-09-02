import { z } from "zod";

import { catalogIconToVectorScene } from "@/canvas/vector-scene";

const iconSchema = z.strictObject({
  name: z.string(),
  label: z.string(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  paths: z.array(z.string()),
});

const catalogSchema = z.strictObject({
  version: z.literal("2.1.1"),
  viewBox: z.number().positive(),
  icons: z.array(iconSchema),
});

export type PhosphorCatalogIcon = z.infer<typeof iconSchema>;
export type PhosphorIconCatalog = z.infer<typeof catalogSchema>;

let catalogPromise: Promise<PhosphorIconCatalog> | null = null;

export function loadPhosphorIconCatalog() {
  catalogPromise ??= fetch("/phosphor-icons/catalog-v2.1.1.json")
    .then((response) => {
      if (!response.ok)
        throw new Error("The icon catalog could not be loaded.");
      return response.json() as Promise<unknown>;
    })
    .then((value) => catalogSchema.parse(value));
  return catalogPromise;
}

export function iconVectorScene(
  catalog: PhosphorIconCatalog,
  iconName: string,
) {
  const icon = catalog.icons.find((candidate) => candidate.name === iconName);
  return icon
    ? catalogIconToVectorScene({ viewBox: catalog.viewBox, paths: icon.paths })
    : null;
}

export function searchPhosphorIcons(
  catalog: PhosphorIconCatalog,
  query: string,
  category: string | null,
) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return catalog.icons.filter((icon) => {
    if (category && !icon.categories.includes(category)) return false;
    if (!terms.length) return true;
    const haystack =
      `${icon.name} ${icon.label} ${icon.tags.join(" ")}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
