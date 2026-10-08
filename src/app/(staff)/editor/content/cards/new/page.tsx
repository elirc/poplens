import type { Metadata } from "next";
import Link from "next/link";
import { requireContentEditor } from "../../_components/gate";
import { editorOptions } from "../../_components/options";
import { CardGenerator } from "../../_components/card-generator";

export const metadata: Metadata = { title: "New insight card" };

export default async function NewCardPage() {
  await requireContentEditor();
  const { indicators, places } = await editorOptions();
  const first = indicators.find((i) => i.code === "u5mr")?.code ?? indicators[0]?.code ?? "pop_total";
  return (
    <div>
      <nav className="mb-3 text-xs text-muted-foreground">
        <Link href="/editor/content" className="hover:text-foreground">Content</Link> / New insight card
      </nav>
      <CardGenerator
        initial={{ title: "", slug: "", caption: "", spec: { kind: "top5", indicatorCode: first }, status: "draft" }}
        indicators={indicators}
        places={places}
      />
    </div>
  );
}
