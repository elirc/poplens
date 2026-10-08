"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Server Action reference (a "use server" module) + a type-only import;
// no server code is bundled into the client.
import { saveViewAction } from "@/server/saved-views/actions";
import type { SavedViewKind } from "@/server/saved-views/params";

function queryRecord(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

/**
 * "Save this view" for any explorer/analysis page. Posts the current URL
 * path + query params with the page kind; visitors are pointed to sign-in.
 * Pass `params` to override the query read from the URL.
 */
export interface SaveViewButtonProps {
  kind: SavedViewKind;
  defaultName?: string;
  params?: Record<string, string>;
  className?: string;
}

export function SaveViewButton(props: SaveViewButtonProps) {
  return (
    <Suspense
      fallback={
        <Button variant="outline" size="sm" disabled className={props.className}>
          <Bookmark /> Save view
        </Button>
      }
    >
      <SaveViewInner {...props} />
    </Suspense>
  );
}

function SaveViewInner({ kind, defaultName, params, className }: SaveViewButtonProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName ?? "");
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ ok?: boolean; error?: string; signIn?: boolean }>({});

  const save = () =>
    start(async () => {
      const res = await saveViewAction({
        kind,
        name: name.trim() || defaultName || "Saved view",
        path: pathname,
        query: params ?? queryRecord(new URLSearchParams(search?.toString() ?? "")),
      });
      if (res.ok) {
        setState({ ok: true });
        setOpen(false);
      } else setState({ error: res.error, signIn: res.needsSignIn });
    });

  if (state.signIn) {
    const next = `${pathname}${search.toString() ? `?${search.toString()}` : ""}`;
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(next)}`}
        className={`inline-flex h-8 items-center rounded-md border border-border px-3 text-xs hover:bg-muted ${className ?? ""}`}
      >
        Sign in to save this view
      </Link>
    );
  }

  if (state.ok) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs text-emerald-700 ${className ?? ""}`} role="status">
        <Check className="h-4 w-4" /> Saved ·{" "}
        <Link href="/account/views" className="underline">
          your views
        </Link>
      </span>
    );
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className={className} onClick={() => setOpen(true)}>
        <Bookmark /> Save view
      </Button>
    );
  }

  return (
    <form
      className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Input
        aria-label="View name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name this view"
        maxLength={120}
        className="h-8 w-48"
        autoFocus
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {state.error && (
        <span className="w-full text-xs text-red-700" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
