import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmSubmitButton } from "@/components/account/submit-button";
import { AccountNav, Flash, flashFrom, PageTitle, When } from "@/components/account/ui";
import { deleteSavedViewAction } from "@/server/saved-views/actions";
import { KIND_LABELS, savedViewHref, type SavedViewKind } from "@/server/saved-views/params";
import { listSavedViews } from "@/server/saved-views/queries";

export const metadata: Metadata = { title: "Saved views" };

export default async function SavedViewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const flash = flashFrom(await searchParams);
  const views = await listSavedViews(user.id);
  return (
    <div>
      <AccountNav active="/account/views" />
      <PageTitle title="Saved views" />
      <Flash {...flash} />
      {views.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing saved yet. Use <span className="font-medium">Save view</span> on the{" "}
          <Link href="/explore" className="underline">
            map
          </Link>
          , compare, trends or a place profile to keep it here.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Saved</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {views.map((v) => (
              <TableRow key={v.id}>
                <TableCell>
                  <Link href={savedViewHref(v.params)} className="font-medium underline-offset-2 hover:underline">
                    {v.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{KIND_LABELS[v.kind as SavedViewKind] ?? v.kind}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <When d={v.createdAt} />
                </TableCell>
                <TableCell className="text-right">
                  <form action={deleteSavedViewAction} className="inline">
                    <input type="hidden" name="id" value={v.id} />
                    <ConfirmSubmitButton size="sm" variant="ghost" confirmText={`Delete “${v.name}”?`}>
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
