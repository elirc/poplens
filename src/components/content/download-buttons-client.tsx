"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { downloadHref } from "./download-url";
import type { DownloadFormat, DownloadSpec } from "./types";

/**
 * CSV / Excel buttons for one downloadable table. The server re-checks
 * licence, account and plan on every request; refusals (licence, upsell,
 * daily limit) are shown inline with their link. Use this directly inside
 * client components; server components should use <DownloadButtons/>.
 */
export function DownloadButtonsClient({
  spec,
  label = "Download",
  className,
}: {
  spec: DownloadSpec;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState<DownloadFormat | null>(null);
  const [error, setError] = useState<{ message: string; actionUrl: string | null } | null>(null);

  async function run(format: DownloadFormat) {
    setBusy(format);
    setError(null);
    try {
      const res = await fetch(downloadHref(spec, format), { credentials: "same-origin" });
      if (!res.ok) {
        let message = `Download failed (${res.status}).`;
        let actionUrl: string | null = null;
        try {
          const body = (await res.json()) as { message?: string; actionUrl?: string | null; error?: string };
          message = body.message ?? (body.error === "rate_limited" ? "Too many downloads — try again in a minute." : message);
          actionUrl = body.actionUrl ?? null;
        } catch {
          /* non-JSON error */
        }
        setError({ message, actionUrl });
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? `poplens-download.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch {
      setError({ message: "Network error — check your connection and try again.", actionUrl: null });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
        {(["csv", "xlsx"] as const).map((f) => (
          <Button key={f} type="button" size="sm" variant="outline" disabled={busy != null} onClick={() => run(f)}>
            {busy === f ? <Spinner className="h-3 w-3" /> : <Download aria-hidden />}
            {f === "csv" ? "CSV" : "Excel"}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">
          {error.message}{" "}
          {error.actionUrl && (
            <a href={error.actionUrl} className="font-medium underline">
              {error.actionUrl.startsWith("/pricing") ? "See plans" : "Sign in"}
            </a>
          )}
        </p>
      )}
    </div>
  );
}
