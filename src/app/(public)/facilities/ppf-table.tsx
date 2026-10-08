"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { formatValue, type IndicatorMeta } from "@/lib/format";
import { SourceLine } from "@/components/data/source-line";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PeoplePerFacilityByLga, PpfRow } from "./_lib/types";

/**
 * Ranked table of LGAs by people per facility (the table view of the
 * choropleth). Rank 1 = most people per facility (most stretched). Only
 * LGAs with a published value are listed; the rest are "No data" on the map.
 */

type RankedRow = PpfRow & { rank: number };
const col = createColumnHelper<RankedRow>();

export function PpfTable({ data }: { data: PeoplePerFacilityByLga }) {
  const meta: IndicatorMeta = {
    unit: data.indicator.unit,
    valueType: data.indicator.valueType,
    decimals: data.indicator.decimals,
  };
  const ranked = useMemo<RankedRow[]>(
    () => data.rows.map((r, i) => ({ ...r, rank: i + 1 })),
    [data.rows],
  );
  const [sorting, setSorting] = useState<SortingState>([{ id: "rank", desc: false }]);
  const [filter, setFilter] = useState("");

  const columns = useMemo(
    () => [
      col.accessor("rank", {
        header: "Rank",
        cell: (c) => <span className="tabular-nums text-muted-foreground">{c.getValue()}</span>,
      }),
      col.accessor("name", {
        header: "LGA",
        cell: (c) => (
          <Link
            href={`/places/${encodeURIComponent(c.row.original.code)}`}
            className="font-medium text-emerald-800 underline-offset-2 hover:underline"
          >
            {c.getValue()}
          </Link>
        ),
      }),
      col.accessor((r) => r.stateName ?? "", { id: "state", header: "State" }),
      col.accessor("value", {
        header: "People per facility",
        cell: (c) => (
          <span className="tabular-nums">
            {formatValue(c.getValue(), meta)}
            {c.row.original.isEstimate && <span className="ml-1 text-xs text-muted-foreground">est.</span>}
          </span>
        ),
      }),
    ],
    // meta is derived from data.indicator; rebuild columns when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.indicator],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: ranked,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    globalFilterFn: (row, _id, value: string) => {
      const q = value.trim().toLowerCase();
      if (!q) return true;
      return (
        row.original.name.toLowerCase().includes(q) ||
        (row.original.stateName ?? "").toLowerCase().includes(q)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 50 } },
  });

  if (data.rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
        No published people-per-facility values{data.year ? ` for ${data.year}` : ""}.
      </p>
    );
  }

  const { pageIndex } = table.getState().pagination;
  const pages = table.getPageCount();

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Find
          <input
            type="search"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              table.setPageIndex(0);
            }}
            placeholder="LGA or state"
            className="h-8 w-44 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>
        <p className="text-xs text-muted-foreground">Rank 1 = most people per facility</p>
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => {
                const dir = h.column.getIsSorted();
                return (
                  <TableHead key={h.id} className={h.column.id === "state" ? "hidden sm:table-cell" : ""}>
                    <button
                      type="button"
                      onClick={h.column.getToggleSortingHandler()}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {dir === "asc" ? (
                        <ArrowUp className="h-3 w-3" aria-label="sorted ascending" />
                      ) : dir === "desc" ? (
                        <ArrowDown className="h-3 w-3" aria-label="sorted descending" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />
                      )}
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((r) => (
            <TableRow key={r.id}>
              {r.getVisibleCells().map((c) => (
                <TableCell key={c.id} className={c.column.id === "state" ? "hidden sm:table-cell" : ""}>
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <nav
        aria-label="Ranking pages"
        className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm"
      >
        <span className="text-muted-foreground">
          {table.getFilteredRowModel().rows.length.toLocaleString("en-NG")} LGAs
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            Prev
          </button>
          <span className="px-2 tabular-nums text-muted-foreground">
            {pages === 0 ? 0 : pageIndex + 1} / {pages}
          </span>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </nav>
      <div className="space-y-0.5 border-t border-border px-3 py-2">
        {data.sources.map((s) => (
          <SourceLine
            key={s.id}
            sourceName={`${s.isSynthetic ? `${s.publisher} (SYNTHETIC demo data)` : s.publisher} — ${s.title}`}
            year={data.year}
            isEstimate={data.rows.some((r) => r.sourceId === s.id && r.isEstimate)}
          />
        ))}
        <p className="text-xs text-muted-foreground">{data.indicator.definition}</p>
      </div>
    </div>
  );
}
