import type { Metadata } from "next";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { one, PageTitle, When } from "@/components/account/ui";
import { AdminNav, Pagination, pageFrom } from "@/components/admin/pagination";
import { requireAdminPage } from "../_gate";
import { likePattern } from "../queries";

export const metadata: Metadata = { title: "Download log · Admin" };

const PAGE_SIZE = 50;
const FORMATS = ["csv", "xlsx", "pdf"] as const;

function describe(detail: unknown): string {
  if (!detail || typeof detail !== "object") return "";
  const d = detail as { page?: unknown; params?: unknown };
  const params = d.params && typeof d.params === "object" ? JSON.stringify(d.params) : "";
  return `${typeof d.page === "string" ? d.page : ""} ${params}`.trim().slice(0, 160);
}

export default async function AdminDownloadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const format = FORMATS.find((f) => f === one(sp.format));
  const q = one(sp.q)?.trim() ?? "";
  const page = pageFrom(sp.page);
  const conds = [];
  if (format) conds.push(eq(schema.downloadLog.format, format));
  if (q) conds.push(ilike(schema.user.email, likePattern(q)));
  const where = conds.length ? and(...conds) : undefined;

  const [rows, total] = await Promise.all([
    db
      .select({
        id: schema.downloadLog.id,
        createdAt: schema.downloadLog.createdAt,
        format: schema.downloadLog.format,
        detail: schema.downloadLog.detail,
        email: schema.user.email,
        dataset: schema.datasets.title,
      })
      .from(schema.downloadLog)
      .leftJoin(schema.user, eq(schema.user.id, schema.downloadLog.userId))
      .leftJoin(schema.datasets, eq(schema.datasets.id, schema.downloadLog.datasetId))
      .where(where)
      .orderBy(desc(schema.downloadLog.createdAt), desc(schema.downloadLog.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.downloadLog)
      .leftJoin(schema.user, eq(schema.user.id, schema.downloadLog.userId))
      .where(where),
  ]);

  return (
    <div>
      <AdminNav active="/admin/downloads" />
      <PageTitle title="Download log" />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="User email" className="max-w-xs" />
        <Select name="format" defaultValue={format ?? ""} className="w-32" aria-label="Format">
          <option value="">All formats</option>
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">
          Filter
        </button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>What</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                <When d={r.createdAt} />
              </TableCell>
              <TableCell className="break-all text-sm">{r.email ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="outline">{r.format}</Badge>
              </TableCell>
              <TableCell className="text-sm">
                {r.dataset && <p className="font-medium">{r.dataset}</p>}
                <p className="break-all font-mono text-xs text-muted-foreground">{describe(r.detail)}</p>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No downloads logged.</p>}
      <Pagination basePath="/admin/downloads" params={{ q, format }} page={page} pageSize={PAGE_SIZE} total={total[0]?.n ?? 0} />
    </div>
  );
}
