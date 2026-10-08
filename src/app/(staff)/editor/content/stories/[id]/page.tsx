import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoryForStaff } from "@/server/content/queries";
import { requireContentEditor } from "../../_components/gate";
import { editorOptions } from "../../_components/options";
import { StoryEditor } from "../../_components/story-editor";

export const metadata: Metadata = { title: "Edit story" };

export default async function EditStoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireContentEditor();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const story = await getStoryForStaff(Number(id));
  if (!story) notFound();
  const { indicators, places } = await editorOptions();
  return (
    <div>
      <nav className="mb-3 text-xs text-muted-foreground">
        <Link href="/editor/content" className="hover:text-foreground">Content</Link> / {story.title}
      </nav>
      <StoryEditor
        key={story.id}
        initial={{
          id: story.id,
          title: story.title,
          slug: story.slug,
          summary: story.summary,
          body: story.body,
          coverIndicator: story.coverIndicator ?? "",
          status: story.status,
        }}
        indicators={indicators}
        places={places}
      />
    </div>
  );
}
