"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  basicShapePath,
  basicShapePoints,
  type BasicShapeKind,
} from "@/canvas/basic-shape-geometry";
import {
  loadPhosphorIconCatalog,
  searchPhosphorIcons,
  type PhosphorCatalogIcon,
  type PhosphorIconCatalog,
} from "@/canvas/phosphor-icon-catalog";

export type BasicShapeOption = {
  value: BasicShapeKind;
  label: string;
};

type Props = {
  activeShape: BasicShapeKind | null;
  shapes: readonly BasicShapeOption[];
  onChooseShape: (shape: BasicShapeKind) => void;
  onChooseIcon: (icon: PhosphorCatalogIcon) => void;
};

type CatalogResult =
  | { kind: "shape"; key: string; shape: BasicShapeOption }
  | { kind: "icon"; key: string; icon: PhosphorCatalogIcon };

const recentCatalogItemsKey = "thinking-canvas:recent-shape-catalog-items";
const legacyRecentIconsKey = "thinking-canvas:recent-phosphor-icons";
const basicCategory = "basic";

function readRecentKeys() {
  if (typeof window === "undefined") return [];
  try {
    const current = window.localStorage.getItem(recentCatalogItemsKey);
    if (current) return JSON.parse(current) as string[];
    const legacy = JSON.parse(
      window.localStorage.getItem(legacyRecentIconsKey) ?? "[]",
    ) as string[];
    return legacy.map((name) => `icon:${name}`);
  } catch {
    return [];
  }
}

function BasicShapePreview({ shape }: { shape: BasicShapeKind }) {
  const width = 36;
  const height = 28;
  const points = basicShapePoints(shape, width, height);
  const path = basicShapePath(shape, width, height);

  return (
    <svg
      viewBox="0 0 48 36"
      className="size-10 shrink-0 fill-current"
      fill="currentColor"
      aria-hidden="true"
    >
      <g transform="translate(6 4)">
        {shape === "rectangle" || shape === "rounded-rectangle" ? (
          <rect
            width={width}
            height={height}
            rx={shape === "rounded-rectangle" ? 6 : 0}
          />
        ) : null}
        {shape === "ellipse" ? (
          <ellipse cx={width / 2} cy={height / 2} rx={18} ry={14} />
        ) : null}
        {points ? (
          <polygon
            points={Array.from({ length: points.length / 2 }, (_, index) =>
              points.slice(index * 2, index * 2 + 2).join(","),
            ).join(" ")}
          />
        ) : null}
        {path ? <path d={path} /> : null}
        {shape === "cylinder" ? (
          <>
            <rect y="4" width={width} height={height - 8} />
            <ellipse cx={width / 2} cy="4" rx={width / 2} ry="4" />
            <ellipse cx={width / 2} cy={height - 4} rx={width / 2} ry="4" />
          </>
        ) : null}
      </g>
    </svg>
  );
}

export function IconBrowser({
  activeShape,
  shapes,
  onChooseShape,
  onChooseIcon,
}: Props) {
  const [catalog, setCatalog] = useState<PhosphorIconCatalog | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(640);
  const [scrollTop, setScrollTop] = useState(0);
  const [recentKeys, setRecentKeys] = useState<string[]>(readRecentKeys);

  useEffect(() => {
    let active = true;
    void loadPhosphorIconCatalog()
      .then((next) => {
        if (active) setCatalog(next);
      })
      .catch(() => {
        if (active) setError("The icon catalog could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setGridWidth(entry.contentRect.width);
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const categories = useMemo(
    () =>
      catalog
        ? [...new Set(catalog.icons.flatMap((icon) => icon.categories))]
            .filter((value) => value !== "brands")
            .sort()
        : [],
    [catalog],
  );
  const results = useMemo<CatalogResult[]>(() => {
    const normalizedQuery = query.toLowerCase().trim();
    const shapeResults =
      category === null || category === basicCategory
        ? shapes
            .filter(({ value, label }) =>
              `${value} ${label}`.toLowerCase().includes(normalizedQuery),
            )
            .map((shape) => ({
              kind: "shape" as const,
              key: `shape:${shape.value}`,
              shape,
            }))
        : [];
    const iconResults =
      catalog && category !== basicCategory
        ? searchPhosphorIcons(catalog, query, category).map((icon) => ({
            kind: "icon" as const,
            key: `icon:${icon.name}`,
            icon,
          }))
        : [];
    return [...shapeResults, ...iconResults];
  }, [catalog, category, query, shapes]);
  const recentResults = useMemo(() => {
    const allShapes = new Map(
      shapes.map((shape) => [
        `shape:${shape.value}`,
        { kind: "shape" as const, key: `shape:${shape.value}`, shape },
      ]),
    );
    const allIcons = new Map(
      (catalog?.icons ?? []).map((icon) => [
        `icon:${icon.name}`,
        { kind: "icon" as const, key: `icon:${icon.name}`, icon },
      ]),
    );
    return recentKeys.flatMap((key) => {
      const result = allShapes.get(key) ?? allIcons.get(key);
      return result ? [result] : [];
    });
  }, [catalog, recentKeys, shapes]);

  const columnCount = Math.max(4, Math.floor((gridWidth + 8) / 88));
  const rowHeight = 88;
  const totalRows = Math.ceil(results.length / columnCount);
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
  const endRow = Math.min(
    totalRows,
    Math.ceil((scrollTop + 416) / rowHeight) + 2,
  );
  const visibleResults = results.slice(
    startRow * columnCount,
    endRow * columnCount,
  );

  function resetScroll() {
    setScrollTop(0);
    gridRef.current?.scrollTo({ top: 0 });
  }

  function remember(key: string) {
    const next = [key, ...recentKeys.filter((value) => value !== key)].slice(
      0,
      8,
    );
    setRecentKeys(next);
    window.localStorage.setItem(recentCatalogItemsKey, JSON.stringify(next));
  }

  function choose(result: CatalogResult) {
    remember(result.key);
    if (result.kind === "shape") onChooseShape(result.shape.value);
    else onChooseIcon(result.icon);
  }

  function renderTile(result: CatalogResult, recent = false) {
    const label =
      result.kind === "shape" ? result.shape.label : result.icon.label;
    const accessibleLabel =
      result.kind === "shape" ? `${label} — basic shape` : label;
    return (
      <button
        key={result.key}
        data-testid={
          result.kind === "shape"
            ? `basic-shape-tile-${result.shape.value}`
            : "icon-tile"
        }
        type="button"
        title={accessibleLabel}
        aria-label={accessibleLabel}
        aria-pressed={
          result.kind === "shape" && activeShape === result.shape.value
        }
        draggable={result.kind === "icon"}
        className={`${recent ? "w-20 shrink-0" : "min-w-0"} grid h-20 place-items-center gap-1 overflow-hidden rounded-xl border border-zinc-200 bg-white p-2 text-zinc-800 outline-none hover:border-violet-400 hover:bg-violet-50 focus-visible:ring-2 focus-visible:ring-violet-600 aria-pressed:border-violet-600 aria-pressed:bg-violet-50 aria-pressed:text-violet-800`}
        onDragStart={(event) => {
          if (result.kind !== "icon") return;
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(
            "application/x-thinking-canvas-icon",
            result.icon.name,
          );
        }}
        onClick={() => choose(result)}
      >
        {result.kind === "shape" ? (
          <BasicShapePreview shape={result.shape.value} />
        ) : (
          <svg viewBox="0 0 256 256" className="size-9" aria-hidden="true">
            {result.icon.paths.map((path, index) => (
              <path key={index} d={path} fill="currentColor" />
            ))}
          </svg>
        )}
        <span className="max-w-full truncate text-[10px]">{label}</span>
      </button>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 overflow-hidden p-1">
      <label className="block text-xs font-semibold text-zinc-600">
        Search shapes and icons
        <input
          autoFocus
          type="search"
          value={query}
          placeholder="Try rectangle, tree, brain, clock, or sneaker"
          className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-200"
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            resetScroll();
          }}
        />
      </label>
      <div
        className="mt-2 flex max-w-full min-w-0 gap-2 overflow-x-auto pb-1"
        aria-label="Shape and icon categories"
      >
        {[null, basicCategory, ...categories].map((value) => (
          <button
            key={value ?? "all"}
            type="button"
            aria-pressed={category === value}
            className="h-9 shrink-0 rounded-full border border-zinc-300 bg-white px-3 text-xs font-medium capitalize aria-pressed:border-violet-600 aria-pressed:bg-violet-50 aria-pressed:text-violet-800"
            onClick={() => {
              setCategory(value);
              resetScroll();
            }}
          >
            {value === basicCategory ? "Basic" : (value ?? "All")}
          </button>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {!query && !category && recentResults.length ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-zinc-600">Recent</p>
          <div className="mt-2 flex max-w-full min-w-0 gap-2 overflow-x-auto pb-1">
            {recentResults.map((result) => renderTile(result, true))}
          </div>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-zinc-500" aria-live="polite">
        {results.length} results
        {!catalog && !error && category !== basicCategory
          ? " · Loading icons…"
          : ""}
      </p>
      <div
        ref={gridRef}
        data-testid="catalog-results"
        className="mt-2 h-[26rem] w-full min-w-0 overflow-y-auto pr-1"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div style={{ height: startRow * rowHeight }} aria-hidden="true" />
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          }}
        >
          {visibleResults.map((result) => renderTile(result))}
        </div>
        <div
          style={{ height: Math.max(0, (totalRows - endRow) * rowHeight) }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
