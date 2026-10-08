import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCardForStaff } from "@/server/content/queries";
import { Alert } from "@/components/ui/misc";
import { requireContentEditor } from "../../_components/gate";
import { editorOptions } from "../../_components/options";
import { CardGenerator } from "../../_components/card-generator";

export const metadata: Metadata = { title: "Edit insight card" };

export default async function EditCardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireContentEditor();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const card = await getCardForStaff(Number(id));
  if (!card) notFound();
  const { indicators, places } = await editorOptions();
  return (
    <div>
      <nav className="mb-3 text-xs text-muted-foreground">
        <Link href="/editor/content" className="hover:text-foreground">Content</Link> / {card.title}
      </nav>
      {card.specError && (
        <Alert variant="destructive" className="mb-4">
          The stored spec was invalid ({card.specError}); it has been reset — check it before saving.
        </Alert>
      )}
      <CardGenerator
        key={card.id}
        initial={{
          id: card.id,
          title: card.title,
          slug: card.slug,
          caption: card.caption,
          spec: card.spec ?? { kind: "single_stat", indicatorCode: indicators[0]?.code ?? "pop_total", placeCodes: ["NG"] },
          status: card.status,
        }}
        indicators={indicators}
        places={places}
      />
    </div>
  );
}
