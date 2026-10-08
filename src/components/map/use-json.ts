"use client";

import { useEffect, useState } from "react";

/**
 * Minimal memoised JSON fetcher for map data. Responses are cached per URL
 * for the lifetime of the page (parsed GeoJSON is reused across year/level
 * switches — slow networks should never re-download shapes), and concurrent
 * requests for the same URL share one fetch.
 */

const MAX_ENTRIES = 40;
const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

function remember(url: string, data: unknown) {
  cache.set(url, data);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string;
    cache.delete(oldest);
  }
}

export function fetchJsonCached<T>(url: string): Promise<T> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) as T);
  let p = inflight.get(url);
  if (!p) {
    p = fetch(url, { headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) {
          let msg = `${res.status} ${res.statusText}`;
          try {
            const body = (await res.json()) as { message?: string; error?: string };
            msg = body.message ?? body.error ?? msg;
          } catch {
            /* non-JSON error body */
          }
          throw new Error(msg);
        }
        return res.json() as Promise<unknown>;
      })
      .then((data) => {
        remember(url, data);
        return data;
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, p);
  }
  return p as Promise<T>;
}

export interface JsonState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

export function useJson<T>(url: string | null): JsonState<T> {
  const [state, setState] = useState<{ url: string | null; data?: T; error?: string }>({
    url: null,
  });

  const cached = url && cache.has(url) ? (cache.get(url) as T) : undefined;

  useEffect(() => {
    if (!url || cache.has(url)) return;
    let active = true;
    fetchJsonCached<T>(url).then(
      (data) => {
        if (active) setState({ url, data });
      },
      (err: unknown) => {
        if (active) setState({ url, error: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => {
      active = false;
    };
  }, [url]);

  if (!url) return { data: undefined, error: null, loading: false };
  if (cached !== undefined) return { data: cached, error: null, loading: false };
  const mine = state.url === url;
  const data = mine ? state.data : undefined;
  const error = mine ? (state.error ?? null) : null;
  return { data, error, loading: data === undefined && error === null };
}
