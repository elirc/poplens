import Link from "next/link";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { formatLagosDate } from "@/lib/format";
import { asChangeSummary } from "@/server/pipeline/diff";

/** Shared presentational bits for the data-editor screens (server components). */

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div className="mb-4 space-y-2">
      {ok && <Alert>{ok}</Alert>}
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}

export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function EditorTabs({ active }: { active: string }) {
  const tabs: Array<[string, string]> = [
    ["/editor", "Overview"],
    ["/editor/connectors", "Connectors"],
    ["/editor/uploads", "Uploads"],
    ["/editor/drafts", "Datasets"],
    ["/editor/sources", "Sources"],
    ["/editor/aliases", "Aliases"],
    ["/editor/quality", "Quality"],
  ];
  return (
    <nav aria-label="Data editor" className="-mx-1 mb-5 flex gap-1 overflow-x-auto pb-1 text-sm">
      {tabs.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={active === href ? "page" : undefined}
          className={
            "whitespace-nowrap rounded-md px-3 py-1.5 " +
            (active === href ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground")
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "published" || status === "succeeded"
      ? "success"
      : status === "draft" || status === "running"
        ? "warning"
        : status === "failed" || status === "rolled_back"
          ? "destructive"
          : "secondary";
  return <Badge variant={variant}>{status.replace("_", " ")}</Badge>;
}

export function SyntheticBadge({ show }: { show: boolean }) {
  return show ? (
    <Badge variant="outline" title="Synthetic demo data — not real statistics">
      synthetic
    </Badge>
  ) : null;
}

export function When({ d }: { d: Date | string | null | undefined }) {
  if (!d) return <span className="text-muted-foreground">—</span>;
  const date = new Date(d);
  return (
    <time dateTime={date.toISOString()}>
      {formatLagosDate(date)}{" "}
      {date.toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

/** Compact "+12 / ~3 / −1" change counts. */
export function ChangeCounts({ summary }: { summary: unknown }) {
  const s = asChangeSummary(summary);
  if (!s) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="whitespace-nowrap font-mono text-xs">
      <span className="text-emerald-700">+{s.added}</span> /{" "}
      <span className="text-amber-700">~{s.changed}</span> /{" "}
      <span className="text-red-700">−{s.removed}</span>
    </span>
  );
}

/** Full "what will change" panel for the draft review page. */
export function ChangeSummaryPanel({ summary }: { summary: unknown }) {
  const s = asChangeSummary(summary);
  if (!s) return <p className="text-sm text-muted-foreground">No change summary was recorded for this dataset.</p>;
  const fmt = (v: number | null) => (v == null ? "No data" : v.toLocaleString("en-NG", { maximumFractionDigits: 3 }));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {s.comparedWithDatasetId
          ? `Compared with the published version (dataset #${s.comparedWithDatasetId}, v${s.comparedWithVersion}).`
          : "Nothing in this series is published yet — every row is new."}
      </p>
      <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
        {[
          ["Rows", s.total, ""],
          ["Added", s.added, "text-emerald-700"],
          ["Changed", s.changed, "text-amber-700"],
          ["Removed", s.removed, "text-red-700"],
          ["Unchanged", s.unchanged, "text-muted-foreground"],
        ].map(([label, n, cls]) => (
          <div key={label as string} className="rounded-md border border-border p-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={`text-lg font-semibold ${cls}`}>{(n as number).toLocaleString("en-NG")}</dd>
          </div>
        ))}
      </dl>
      {s.samples.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="mb-1 text-left text-xs text-muted-foreground">
              Sample of changes ({s.kind === "outbreak_reports" ? "values are suspected cases" : "headline value"})
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2">Change</th>
                <th className="p-2">Row</th>
                <th className="p-2 text-right">Published</th>
                <th className="p-2 text-right">This draft</th>
              </tr>
            </thead>
            <tbody>
              {s.samples.map((x, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="p-2">
                    <Badge
                      variant={x.kind === "added" ? "success" : x.kind === "changed" ? "warning" : "destructive"}
                    >
                      {x.kind}
                    </Badge>
                  </td>
                  <td className="p-2 font-mono text-xs">{x.key}</td>
                  <td className="p-2 text-right">{x.kind === "added" ? "—" : fmt(x.oldValue)}</td>
                  <td className="p-2 text-right">{x.kind === "removed" ? "—" : fmt(x.newValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.warnings && s.warnings.length > 0 && (
        <Alert variant="warning">
          <p className="mb-1 font-medium">Import warnings</p>
          <ul className="list-disc space-y-1 pl-5">
            {s.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}
