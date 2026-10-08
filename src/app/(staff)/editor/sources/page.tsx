import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/misc";
import { listSources } from "@/server/pipeline/admin";
import { saveSourceAction } from "../actions";
import { flashFrom, requireDataEditor } from "../_components/gate";
import { SubmitButton } from "../_components/submit-button";
import { EditorTabs, Flash, PageTitle } from "../_components/ui";

export const metadata: Metadata = { title: "Sources & licences" };

type SourceRow = Awaited<ReturnType<typeof listSources>>[number];

function SourceForm({ s }: { s?: SourceRow }) {
  const p = s ? `s${s.id}` : "new";
  return (
    <form action={saveSourceAction} className="grid gap-3 sm:grid-cols-2">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-key`}>Key</Label>
        <Input id={`${p}-key`} name="key" defaultValue={s?.key} required placeholder="nbs" />
        {s && <p className="text-xs text-muted-foreground">Connectors look sources up by key — change with care.</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-publisher`}>Publisher</Label>
        <Input id={`${p}-publisher`} name="publisher" defaultValue={s?.publisher} required />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${p}-title`}>Title</Label>
        <Input id={`${p}-title`} name="title" defaultValue={s?.title} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-url`}>Link</Label>
        <Input id={`${p}-url`} name="url" type="url" defaultValue={s?.url ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-licence`}>Licence</Label>
        <Input id={`${p}-licence`} name="licence" defaultValue={s?.licence} required placeholder="CC BY 4.0" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-licenceUrl`}>Licence link</Label>
        <Input id={`${p}-licenceUrl`} name="licenceUrl" type="url" defaultValue={s?.licenceUrl ?? ""} />
      </div>
      <div className="flex items-center gap-2 self-end">
        <Checkbox id={`${p}-redis`} name="allowsRedistribution" defaultChecked={s?.allowsRedistribution ?? false} />
        <Label htmlFor={`${p}-redis`}>Licence allows redistribution (enables downloads &amp; API)</Label>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${p}-cite`}>Citation template</Label>
        <Textarea id={`${p}-cite`} name="citationTemplate" rows={2} defaultValue={s?.citationTemplate ?? ""} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${p}-notes`}>Notes</Label>
        <Textarea id={`${p}-notes`} name="notes" rows={2} defaultValue={s?.notes ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton size="sm">{s ? "Save changes" : "Add source"}</SubmitButton>
      </div>
    </form>
  );
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireDataEditor();
  const flash = flashFrom(await searchParams);
  const sources = await listSources();
  return (
    <div>
      <EditorTabs active="/editor/sources" />
      <PageTitle title="Sources & licences" />
      <Flash {...flash} />
      <p className="mb-4 text-sm text-muted-foreground">
        Downloads and API access are offered only for datasets whose source licence allows
        redistribution. Every change here is audited.
      </p>
      <div className="mb-6 space-y-3">
        {sources.length === 0 && <p className="text-sm text-muted-foreground">No sources yet.</p>}
        {sources.map((s) => (
          <details key={s.id} className="rounded-lg border border-border">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3">
              <span className="font-medium">{s.publisher}</span>
              <span className="text-sm text-muted-foreground">{s.title}</span>
              <code className="text-xs">{s.key}</code>
              <span className="ml-auto flex items-center gap-2 text-xs">
                {s.licence}
                <Badge variant={s.allowsRedistribution ? "success" : "secondary"}>
                  {s.allowsRedistribution ? "redistribution allowed" : "no redistribution"}
                </Badge>
              </span>
            </summary>
            <div className="border-t border-border p-3">
              <SourceForm s={s} />
            </div>
          </details>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add a source</CardTitle>
        </CardHeader>
        <CardContent>
          <SourceForm />
        </CardContent>
      </Card>
    </div>
  );
}
