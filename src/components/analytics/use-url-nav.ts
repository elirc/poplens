"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Navigate to a new analytics URL (all view state lives in the query string)
 * inside a transition, so the current view stays interactive while the
 * server renders the next one; `pending` drives a subtle loading state.
 */
export function useUrlNav() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = useCallback(
    (href: string) => {
      startTransition(() => router.push(href, { scroll: false }));
    },
    [router],
  );
  return { go, pending };
}
