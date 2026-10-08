import type { Metadata } from "next";
import Link from "next/link";
import { requireContentEditor } from "../../_components/gate";
import { editorOptions } from "../../_components/options";
import { StoryEditor } from "../../_components/story-editor";

export const metadata: Metadata = { title: "New story" };

const STARTER = `> **Demo data.** If this story uses the synthetic demo dataset, keep this note.

Write a short introduction here.

## A heading

{{chart type="bar" indicator="pop_total" places="NG-KN,NG-LA" year="2023"}}
`;

export default async function NewStoryPage() {
  await requireContentEditor();
  const { indicators, places } = await editorOptions();
  return (
    <div>
      <nav className="mb-3 text-xs text-muted-foreground">
        <Link href="/editor/content" className="hover:text-foreground">Content</Link> / New story
      </nav>
      <StoryEditor
        initial={{ title: "", slug: "", summary: "", body: STARTER, coverIndicator: "", status: "draft" }}
        indicators={indicators}
        places={places}
      />
    </div>
  );
}
