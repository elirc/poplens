"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IndicatorHit, PlaceHit, SearchResponse } from "./types";

type Hit = PlaceHit | IndicatorHit;

const DEBOUNCE_MS = 200;

function hrefFor(hit: Hit): string {
  return hit.kind === "place"
    ? `/places/${encodeURIComponent(hit.code)}`
    : `/indicators/${encodeURIComponent(hit.code)}`;
}

/**
 * Combined place + indicator search (WAI-ARIA combobox with listbox popup).
 * Debounced 200 ms, aborts stale requests, fully keyboard navigable:
 * ↑/↓ move, Enter opens (first hit when none is active), Esc closes.
 */
export function SearchBox({
  size = "lg",
  placeholder = "Search a state, LGA, ward or indicator",
  className,
}: {
  size?: "sm" | "lg";
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const abortRef = useRef<AbortController | null>(null);

  const hits: Hit[] = results ? [...results.places, ...results.indicators] : [];

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      abortRef.current?.abort();
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStatus("loading");
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as SearchResponse;
        setResults(data);
        setActive(-1);
        setOpen(true);
        setStatus("idle");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function go(hit: Hit) {
    setOpen(false);
    router.push(hrefFor(hit));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open && hits.length) setOpen(true);
      setActive((a) => (hits.length ? (a + 1) % hits.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (hits.length ? (a <= 0 ? hits.length - 1 : a - 1) : -1));
    } else if (e.key === "Enter") {
      const hit = hits[active >= 0 ? active : 0];
      if (hit && open) {
        e.preventDefault();
        go(hit);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  }

  const showList = open && query.trim().length >= 2 && results !== null;
  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const placeCount = results?.places.length ?? 0;

  return (
    <div className={cn("relative w-full", className)}>
      <label htmlFor={`${baseId}-input`} className="sr-only">
        Search places and indicators
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground",
            size === "lg" ? "h-5 w-5" : "h-4 w-4",
          )}
        />
        <input
          id={`${baseId}-input`}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length < 2) setOpen(false);
          }}
          onFocus={() => results && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full rounded-lg border border-border bg-background pr-3 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            size === "lg" ? "h-12 pl-10 text-base" : "h-9 pl-9 text-sm",
          )}
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {showList
          ? hits.length
            ? `${hits.length} results available`
            : "No matches"
          : status === "error"
            ? "Search failed"
            : ""}
      </p>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute z-50 mt-1 max-h-96 w-full overflow-auto rounded-lg border border-border bg-background py-1 text-sm shadow-lg"
        >
          {hits.length === 0 && (
            <li role="presentation" className="px-3 py-2 text-muted-foreground">
              No places or indicators match “{results.query}”.
            </li>
          )}
          {hits.map((hit, i) => (
            <li
              key={`${hit.kind}-${hit.code}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(hit);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-start gap-2 px-3 py-2",
                i === active && "bg-muted",
                i === placeCount && placeCount > 0 && "border-t border-border",
              )}
            >
              {hit.kind === "place" ? (
                <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <BarChart3 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium">{hit.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {hit.kind === "place"
                    ? [hit.context, hit.matchedAlias ? `also “${hit.matchedAlias}”` : null]
                        .filter(Boolean)
                        .join(" · ")
                    : `Indicator · ${hit.unit}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
