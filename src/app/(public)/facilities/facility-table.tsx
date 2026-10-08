"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SourceLine } from "@/components/data/source-line";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CARE_LABELS,
  FACILITY_PAGE_SIZE,
  OWNERSHIP_LABELS,
  facilitiesHref,
  pageCount,
  type FacilityQuery,
} from "./_lib/filters";
import type { FacilityListRow, FacilitySource } from "./_lib/types";
import { facilitySourceLabel } from "./facilities-explorer";

/**
 * Facility list synced to the page's URL filters. Pagination is server-side
 * (~50 rows per page via ?page=); TanStack renders the current page only
 * (manualPagination), and page links are plain hrefs so they work on slow
 * phones before hydration.
 */

const col = createColumnHelper<FacilityListRow>();

export function FacilityTable({
  rows,
  total,
  page,
  query,
  sources,
}: {
  rows: FacilityListRow[];
  total: number;
  page: number;
  query: FacilityQuery;
  sources: FacilitySource[];
}) {
  const pages = pageCount(total);

  const columns = useMemo(
    () => [
      col.accessor("name", {
        header: "Facility",
        cell: (c) => <span className="font-medium">{c.getValue()}</span>,
      }),
      col.accessor("type", { header: "Type" }),
      col.accessor("careLevel", {
        header: "Level",
        cell: (c) => CARE_LABELS[c.getValue()] ?? c.getValue(),
      }),
      col.accessor("ownership", {
        header: "Ownership",
        cell: (c) => OWNERSHIP_LABELS[c.getValue()] ?? c.getValue(),
      }),
      col.accessor("lgaName", {
        header: "LGA",
        cell: (c) => {
          const r = c.row.original;
          if (!r.lgaName) return "—";
          return (
            <Link
              href={`/places/${encodeURIComponent(r.lgaCode ?? "")}`}
              className="text-emerald-800 underline-offset-2 hover:underline"
            >
              {r.lgaName}
            </Link>
          );
        },
      }),
      col.accessor("wardName", {
        header: "Ward",
        cell: (c) => c.getValue() ?? "—",
      }),
    ],
    [],
  );

  // TanStack's hook returns non-memoisable functions; the table is cheap to rebuild.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pages,
    state: { pagination: { pageIndex: page - 1, pageSize: FACILITY_PAGE_SIZE } },
  });

  if (total === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
        No facilities match these filters.
      </p>
    );
  }

  const from = (page - 1) * FACILITY_PAGE_SIZE + 1;
  const to = Math.min(total, page * FACILITY_PAGE_SIZE);
  const hideOnPhone = new Set(["ownership", "wardName"]);

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead key={h.id} className={hideOnPhone.has(h.column.id) ? "hidden sm:table-cell" : ""}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((r) => (
            <TableRow key={r.id}>
              {r.getVisibleCells().map((c) => (
                <TableCell key={c.id} className={hideOnPhone.has(c.column.id) ? "hidden sm:table-cell" : ""}>
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <nav
        aria-label="Facility list pages"
        className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm"
      >
        <span className="text-muted-foreground">
          {from.toLocaleString("en-NG")}–{to.toLocaleString("en-NG")} of {total.toLocaleString("en-NG")}
        </span>
        <div className="flex items-center gap-1">
          <PageLink query={query} page={page - 1} disabled={page <= 1} label="Previous page">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
          </PageLink>
          <span className="px-2 tabular-nums text-muted-foreground">
            {page} / {pages}
          </span>
          <PageLink query={query} page={page + 1} disabled={page >= pages} label="Next page">
            Next <ChevronRight className="h-4 w-4" aria-hidden />
          </PageLink>
        </div>
      </nav>
      <div className="space-y-0.5 border-t border-border px-3 py-2">
        {sources.map((s, i) => (
          <SourceLine key={i} sourceName={facilitySourceLabel(s)} year={s.sourceVersion ?? s.year} />
        ))}
      </div>
    </div>
  );
}

function PageLink({
  query,
  page,
  disabled,
  label,
  children,
}: {
  query: FacilityQuery;
  page: number;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  const cls = "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs";
  if (disabled) {
    return (
      <span aria-disabled className={`${cls} opacity-50`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={facilitiesHref({ ...query, page })} scroll={false} aria-label={label} className={`${cls} hover:bg-muted`}>
      {children}
    </Link>
  );
}
