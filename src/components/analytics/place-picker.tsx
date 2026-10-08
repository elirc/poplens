"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Plus, Search, X } from "lucide-react";
import { Spinner } from "@/components/ui/misc";
import type { PlaceHit, SearchResponse } from "@/components/search/types";
import type { PlaceLevel, PlaceOption } from "./types";

/**
 * Multi-place picker shared by Compare (max 4) and Trends (max 6).
 * - Selected places are removable chips.
 * - Nigeria + all states are a native <select> (instant, no network).
 * - LGAs and wards are found through /api/search (debounced, min 2 chars).
 * The `max` cap is enforced here AND in URL parsing (params.ts).
 */

const LEVEL_SHORT: Record<PlaceLevel, string> = {
  nation: "Country",
  zone: "Zone",
  state: "State",
  lga: "LGA",
  ward: "Ward",
};

export function PlaceChips({
  places,
  onRemove,
  colors,
  disabled,
}: {
  places: PlaceOption[];
  onRemove?: (code: string) => void;
  /** Optional colour swatch per chip (matches chart series). */
  colors?: string[];
  disabled?: boolean;
}) {
  if (places.length === 0) {
    return <p className="text-sm text-muted-foreground">No places selected.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Selected places">
      {places.map((p, i) => (
        <li
          key={p.code}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2.5 pr-1 text-sm"
        >
          {colors?.[i] && (
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[i] }}
            />
          )}
          <span className="truncate font-medium">{p.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {p.context ?? LEVEL_SHORT[p.level]}
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(p.code)}
              disabled={disabled}
              aria-label={`Remove ${p.name}`}
              className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PlacePicker({
  selected,
  quickOptions,
  max,
  onChange,
  disabled,
  label = "Places",
}: {
  selected: PlaceOption[];
  /** Nigeria + states for the instant select. */
  quickOptions: PlaceOption[];
  max: number;
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const codes = selected.map((p) => p.code);
  const full = codes.length >= max;

  const add = (code: string) => {
    if (!code || codes.includes(code) || full) return;
    onChange([...codes, code]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground" id={`${id}-label`}>
          {label} ({codes.length} of {max})
        </span>
      </div>
      {full ? (
        <p className="text-xs text-muted-foreground" role="status">
          Up to {max} places — remove one to add another.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="relative">
            <Plus
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <select
              aria-label="Add Nigeria or a state"
              value=""
              disabled={disabled}
              onChange={(e) => add(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm disabled:opacity-60"
            >
              <option value="">Add Nigeria or a state…</option>
              {quickOptions
                .filter((o) => !codes.includes(o.code))
                .map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name}
                    {o.level === "nation" ? " (national)" : ""}
                  </option>
                ))}
            </select>
          </div>
          <PlaceSearch exclude={codes} onPick={add} disabled={disabled} />
        </div>
      )}
    </div>
  );
}

/** Debounced search over /api/search for LGAs and wards (and states by alias). */
function PlaceSearch({
  exclude,
  onPick,
  disabled,
}: {
  exclude: string[];
  onPick: (code: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    },
    [],
  );

  const search = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => {
      const ctrl = new AbortController();
      abort.current = ctrl;
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: ctrl.signal })
        .then((r) => {
          if (!r.ok) throw new Error(r.status === 429 ? "Too many searches — wait a moment." : "Search failed.");
          return r.json() as Promise<SearchResponse>;
        })
        .then((data) => {
          setHits(data.places.filter((p) => p.level !== "zone").slice(0, 8));
          setError(null);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setHits([]);
          setError(err instanceof Error ? err.message : "Search failed.");
          setLoading(false);
        });
    }, 250);
  };

  const pick = (code: string) => {
    onPick(code);
    setQuery("");
    setHits([]);
  };

  const visible = hits.filter((h) => !exclude.includes(h.code));
  const open = query.trim().length >= 2;

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={(e) => search(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && visible[0]) {
            e.preventDefault();
            pick(visible[0].code);
          } else if (e.key === "Escape") {
            search("");
          }
        }}
        placeholder="Search an LGA or ward…"
        aria-label="Search for an LGA or ward to add"
        aria-controls={`${id}-results`}
        aria-expanded={open}
        role="combobox"
        aria-autocomplete="list"
        className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-8 text-sm disabled:opacity-60"
      />
      {loading && <Spinner className="absolute right-2.5 top-2.5 h-3.5 w-3.5" />}
      {open && (
        <ul
          id={`${id}-results`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-background p-1 shadow-md"
        >
          {error ? (
            <li className="px-2 py-1.5 text-xs text-red-700">{error}</li>
          ) : visible.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">
              {loading ? "Searching…" : "No matching places."}
            </li>
          ) : (
            visible.map((h) => (
              <li key={h.code} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => pick(h.code)}
                  className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <MapPin aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{h.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {h.context ?? LEVEL_SHORT[h.level]}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
