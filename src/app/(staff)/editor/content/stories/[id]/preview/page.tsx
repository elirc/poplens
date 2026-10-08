import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoryForStaff } from "@/server/content/queries";
import { parseStory } from "@/server/content/markdown";
import { StoryBlocks } from "@/components/content/story-blocks";
import { StoryChart } from "@/components/content/story-chart";
import { Badge } from "@/components/ui/badge";
import { requireContentEditor } from "../../../_components/gate";

export const metadata: Metadata = { title: "Story preview", robots: { index: false } };

/** Full server-rendered preview of the SAVED story (drafts included), with live charts. */
export default async function StoryPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireContentEditor();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const story = await getStoryForStaff(Number(id));
  if (!story) notFound();
  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={story.status === "published" ? "success" : "warning"}>{story.status}</Badge>
        Preview of the saved version ·{" "}
        <Link href={`/editor/content/stories/${story.id}`} className="underline">
          back to editor
        </Link>
      </div>
      <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{story.title}</h1>
      <p className="mt-2 text-muted-foreground">{story.summary}</p>
      <StoryBlocks blocks={parseStory(story.body)} renderChart={(spec, raw) => <StoryChart spec={spec} raw={raw} />} />
    </article>
  );
}
