"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  loadPhosphorIconCatalog,
  searchPhosphorIcons,
  type PhosphorCatalogIcon,
  type PhosphorIconCatalog,
} from "@/canvas/phosphor-icon-catalog";

type Props = {
  onChoose: (icon: PhosphorCatalogIcon) => void;
};

const recentIconsKey = "thinking-canvas:recent-phosphor-icons";

export function IconBrowser({ onChoose }: Props) {
  const [catalog, setCatalog] = useState<PhosphorIconCatalog | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(640);
  const [scrollTop, setScrollTop] = useState(0);
  const [recentNames, setRecentNames] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(
        window.localStorage.getItem(recentIconsKey) ?? "[]",
      ) as string[];
    } catch {
      return [];
    }
  });

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
  }, [catalog]);

  const categories = useMemo(
    () =>
      catalog
        ? [...new Set(catalog.icons.flatMap((icon) => icon.categories))]
            .filter((value) => value !== "brands")
            .sort()
        : [],
    [catalog],
  );
  const results = useMemo(
    () => (catalog ? searchPhosphorIcons(catalog, query, category) : []),
    [catalog, category, query],
  );
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

  function chooseIcon(icon: PhosphorCatalogIcon) {
    const next = [
      icon.name,
      ...recentNames.filter((name) => name !== icon.name),
    ].slice(0, 8);
    setRecentNames(next);
    window.localStorage.setItem(recentIconsKey, JSON.stringify(next));
    onChoose(icon);
  }

  const recentIcons = recentNames.flatMap((name) => {
    const icon = catalog?.icons.find((candidate) => candidate.name === name);
    return icon ? [icon] : [];
  });

  return (
    <div className="w-[min(44rem,calc(100vw-2rem))] p-1">
      <label className="block text-xs font-semibold text-zinc-600">
        Search icons
        <input
          autoFocus
          type="search"
          value={query}
          placeholder="Try tree, brain, clock, or sneaker"
          className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-200"
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            resetScroll();
          }}
        />
      </label>
      <div
        className="mt-2 flex gap-2 overflow-x-auto pb-1"
        aria-label="Icon categories"
      >
        <button
          type="button"
          aria-pressed={category === null}
          className="h-9 shrink-0 rounded-full border border-zinc-300 bg-white px-3 text-xs font-medium aria-pressed:border-violet-600 aria-pressed:bg-violet-50 aria-pressed:text-violet-800"
          onClick={() => {
            setCategory(null);
            resetScroll();
          }}
        >
          All
        </button>
        {categories.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={category === value}
            className="h-9 shrink-0 rounded-full border border-zinc-300 bg-white px-3 text-xs font-medium capitalize aria-pressed:border-violet-600 aria-pressed:bg-violet-50 aria-pressed:text-violet-800"
            onClick={() => {
              setCategory(value);
              resetScroll();
            }}
          >
            {value}
          </button>
        ))}
      </div>
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      {!catalog && !error ? (
        <p className="mt-4 text-sm text-zinc-500">Loading icons…</p>
      ) : null}
      {catalog ? (
        <>
          {!query && !category && recentIcons.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold text-zinc-600">Recent</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {recentIcons.map((icon) => (
                  <button
                    key={icon.name}
                    type="button"
                    title={icon.label}
                    className="grid size-14 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:border-violet-400 hover:bg-violet-50 focus-visible:ring-2 focus-visible:ring-violet-600"
                    onClick={() => chooseIcon(icon)}
                  >
                    <svg
                      viewBox="0 0 256 256"
                      className="size-8"
                      aria-hidden="true"
                    >
                      {icon.paths.map((path, index) => (
                        <path key={index} d={path} fill="currentColor" />
                      ))}
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <p className="mt-2 text-xs text-zinc-500" aria-live="polite">
            {results.length} icons
          </p>
          <div
            ref={gridRef}
            data-testid="icon-results"
            className="mt-2 h-[26rem] overflow-y-auto pr-1"
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <div style={{ height: startRow * rowHeight }} aria-hidden="true" />
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
              }}
            >
              {visibleResults.map((icon) => (
                <button
                  key={icon.name}
                  data-testid="icon-tile"
                  type="button"
                  title={icon.label}
                  draggable
                  className="grid h-20 place-items-center gap-1 rounded-xl border border-zinc-200 bg-white p-2 text-zinc-800 outline-none hover:border-violet-400 hover:bg-violet-50 focus-visible:ring-2 focus-visible:ring-violet-600"
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData(
                      "application/x-thinking-canvas-icon",
                      icon.name,
                    );
                  }}
                  onClick={() => chooseIcon(icon)}
                >
                  <svg
                    viewBox="0 0 256 256"
                    className="size-9"
                    aria-hidden="true"
                  >
                    {icon.paths.map((path, index) => (
                      <path key={index} d={path} fill="currentColor" />
                    ))}
                  </svg>
                  <span className="max-w-full truncate text-[10px]">
                    {icon.label}
                  </span>
                </button>
              ))}
            </div>
            <div
              style={{ height: Math.max(0, (totalRows - endRow) * rowHeight) }}
              aria-hidden="true"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
