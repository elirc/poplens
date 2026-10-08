import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAliases } from "@/server/pipeline/admin";
import { addAliasAction, deleteAliasAction } from "../actions";
import { flashFrom, requireDataEditor } from "../_components/gate";
import { SubmitButton } from "../_components/submit-button";
import { EditorTabs, Flash, PageTitle, When } from "../_components/ui";

export const metadata: Metadata = { title: "Place aliases" };

export default async function AliasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireDataEditor();
  const sp = await searchParams;
  const flash = flashFrom(sp);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const origin = typeof sp.origin === "string" && ["seed", "upload-review", "manual"].includes(sp.origin) ? sp.origin : "";
  const aliases = await listAliases({ q: q || undefined, origin: origin || undefined });
  return (
    <div>
      <EditorTabs active="/editor/aliases" />
      <PageTitle title="Place aliases" />
      <Flash {...flash} />
      <p className="mb-4 text-sm text-muted-foreground">
        Alternative spellings used to match place names in uploads and connector data. Matches you
        confirm in the upload wizard are added here automatically (origin “upload-review”).
      </p>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add an alias</CardTitle>
          <CardDescription>Map a spelling to a place by its official code (e.g. NG-FC, NG-KN-GWALE).</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addAliasAction} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="alias-code">Official code</Label>
              <Input id="alias-code" name="code" required placeholder="NG-FC" className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alias-text">Alias</Label>
              <Input id="alias-text" name="alias" required placeholder="FCT Abuja" className="w-56" />
            </div>
            <SubmitButton size="sm">Add alias</SubmitButton>
          </form>
        </CardContent>
      </Card>
      <form className="mb-3 flex flex-wrap items-end gap-2" role="search">
        <div className="space-y-1.5">
          <Label htmlFor="alias-q">Search</Label>
          <Input id="alias-q" name="q" defaultValue={q} placeholder="name, alias or code" className="w-56" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="alias-origin">Origin</Label>
          <Select id="alias-origin" name="origin" defaultValue={origin} className="w-40">
            <option value="">any</option>
            <option value="seed">seed</option>
            <option value="upload-review">upload-review</option>
            <option value="manual">manual</option>
          </Select>
        </div>
        <Button type="submit" size="sm" variant="outline">
          Filter
        </Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Alias</TableHead>
            <TableHead>Place</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Added</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {aliases.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No aliases match.
              </TableCell>
            </TableRow>
          )}
          {aliases.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.alias}</TableCell>
              <TableCell>
                {a.unitName} <span className="text-xs text-muted-foreground">{a.unitCode} · {a.level}</span>
              </TableCell>
              <TableCell>
                <Badge variant={a.origin === "upload-review" ? "warning" : "secondary"}>{a.origin}</Badge>
              </TableCell>
              <TableCell className="text-xs">
                <When d={a.createdAt} />
              </TableCell>
              <TableCell>
                <form action={deleteAliasAction}>
                  <input type="hidden" name="aliasId" value={a.id} />
                  <Button type="submit" size="sm" variant="ghost">
                    Delete
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
