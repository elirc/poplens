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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Table view of the choropleth (spec: every map has a table view). Same
 * data and same source line as the map; places without a value show
 * "No data" and sort last in either direction.
 */

export interface TableRowData {
  id: number;
  code: string;
  name: string;
  value: number | null;
  lower: number | null;
  upper: number | null;
  isEstimate: boolean;
  source: string | null;
}

const col = createColumnHelper<TableRowData>();

export function ValuesTable({
  rows,
  meta,
  indicatorName,
  levelLabel,
  year,
}: {
  rows: TableRowData[];
  meta: IndicatorMeta;
  indicatorName: string;
  levelLabel: string;
  year: number | null;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "value", desc: true }]);

  const columns = useMemo(
    () => [
      col.display({
        id: "rank",
        header: "#",
        cell: (ctx) => {
          const sortedIdx = ctx.table.getSortedRowModel().rows.findIndex((r) => r.id === ctx.row.id);
          return <span className="tabular-nums text-muted-foreground">{sortedIdx + 1}</span>;
        },
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
      col.accessor((r) => r.value ?? undefined, {
        id: "value",
        header: meta.unit ? `Value (${meta.unit})` : "Value",
        sortUndefined: "last",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <span className={r.value == null ? "text-muted-foreground" : "tabular-nums"}>
              {formatValue(r.value, meta)}
              {r.value != null && r.isEstimate && (
                <span className="ml-1 text-[10px] uppercase text-muted-foreground">est.</span>
              )}
            </span>
          );
        },
      }),
      col.display({
        id: "ci",
        header: "Interval",
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatCI(r.lower, r.upper, meta) || "—"}
            </span>
          );
        },
      }),
      col.accessor((r) => r.source ?? undefined, {
        id: "source",
        header: "Source",
        sortUndefined: "last",
        cell: (ctx) => (
          <span className="text-xs text-muted-foreground">{ctx.row.original.source ?? NO_DATA}</span>
        ),
      }),
    ],
    [meta, levelLabel],
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
        <caption className="sr-only">
          {indicatorName} by {levelLabel.toLowerCase()}
          {year ? `, ${year}` : ""}
        </caption>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => {
                const canSort = h.column.getCanSort();
                const dir = h.column.getIsSorted();
                return (
                  <TableHead
                    key={h.id}
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                  >
                    {canSort ? (
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
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
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
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
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
            Page {table.getState().pagination.pageIndex + 1} of {pageCount} · {rows.length} places
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
