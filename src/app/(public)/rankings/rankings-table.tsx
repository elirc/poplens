"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { formatCI, formatValue, NO_DATA, type IndicatorMeta } from "@/lib/format";
import { ordinal } from "@/components/analytics/rank-format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RankingRow } from "@/components/analytics/types";

const col = createColumnHelper<RankingRow>();

/**
 * Sortable rankings table (TanStack). Rank is fixed by the indicator's
 * better direction; sorting by another column only reorders the view.
 */
export function RankingsTable({
  rows,
  meta,
  levelLabel,
  showParent,
  caption,
}: {
  rows: RankingRow[];
  meta: IndicatorMeta;
  levelLabel: string;
  showParent: boolean;
  caption: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "rank", desc: false }]);

  const columns = useMemo(
    () => [
      col.accessor("rank", {
        header: "Rank",
        cell: (ctx) => (
          <span className="tabular-nums" title={`${ordinal(ctx.getValue())} of ${ctx.row.original.outOf}`}>
            {ctx.getValue()}
          </span>
        ),
      }),
      col.accessor("name", {
        header: levelLabel,
        cell: (ctx) => (
          <Link
            href={`/places/${encodeURIComponent(ctx.row.original.code)}`}
            className="font-medium text-emerald-800 underline-offset-2 hover:underline"
          >
            {ctx.getValue()}
          </Link>
        ),
      }),
      ...(showParent
        ? [
            col.accessor((r) => r.parent ?? "", {
              id: "parent",
              header: "State",
              cell: (ctx) => <span className="text-muted-foreground">{ctx.getValue() || "—"}</span>,
            }),
          ]
        : []),
      col.accessor((r) => r.cell.value, {
        id: "value",
        header: meta.unit && meta.valueType !== "percent" ? `Value (${meta.unit})` : "Value",
        cell: (ctx) => {
          const c = ctx.row.original.cell;
          const ci = formatCI(c.lower, c.upper, meta);
          return (
            <span className="tabular-nums">
              {formatValue(c.value, meta)}
              {c.isEstimate && <span className="ml-1 text-[10px] uppercase text-muted-foreground">est.</span>}
              {ci && <span className="ml-1 text-xs text-muted-foreground">{ci}</span>}
            </span>
          );
        },
      }),
      col.accessor((r) => r.cell.year, {
        id: "year",
        header: "Year",
        cell: (ctx) => <span className="tabular-nums">{ctx.getValue()}</span>,
      }),
      col.accessor((r) => r.cell.source, {
        id: "source",
        header: "Source",
        cell: (ctx) => <span className="text-xs text-muted-foreground">{ctx.getValue()}</span>,
      }),
    ],
    [meta, levelLabel, showParent],
  );

  // TanStack Table returns non-memoisable functions by design; the React
  // Compiler lint rule flags this known-safe usage.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });
  const pageCount = table.getPageCount();

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => {
                const dir = h.column.getIsSorted();
                return (
                  <TableHead
                    key={h.id}
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                  >
                    <button
                      type="button"
                      onClick={h.column.getToggleSortingHandler()}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {dir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : dir === "desc" ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-6 text-center text-muted-foreground">
                {NO_DATA}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 border-t border-border p-2 text-xs">
          <button
            type="button"
            className="rounded border border-border px-2 py-1 disabled:opacity-40"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </button>
          <span className="text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {pageCount} · {rows.length} ranked
          </span>
          <button
            type="button"
            className="rounded border border-border px-2 py-1 disabled:opacity-40"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
