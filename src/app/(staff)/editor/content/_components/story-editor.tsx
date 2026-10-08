"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Eye, Save, Send, Trash2, Undo2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { StoryBlocks } from "@/components/content/story-blocks";
import { chartEmbedPath } from "@/components/content/embed-url";
import type { Block, ChartType } from "@/components/content/types";
import {
  deleteStoryAction,
  previewStoryAction,
  saveStoryAction,
  setStoryStatusAction,
} from "../actions";

export interface EditorIndicator {
  code: string;
  name: string;
  category: string;
}
export interface EditorPlace {
  code: string;
  name: string;
  level: string;
}

export interface StoryDraft {
  id?: number;
  title: string;
  slug: string;
  summary: string;
  body: string;
  coverIndicator: string;
  status: "draft" | "published";
}

const slugFrom = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** Build a shortcode string from the insert panel (mirrors the parser contract). */
export function buildShortcode(p: {
  type: ChartType;
  indicator: string;
  places: string[];
  year: string;
  level: "state" | "lga";
}): string {
  const attrs = [`type="${p.type}"`, `indicator="${p.indicator}"`];
  if (p.type !== "top5" && p.places.length > 0) attrs.push(`places="${p.places.join(",")}"`);
  if (p.year.trim()) attrs.push(`year="${p.year.trim()}"`);
  if (p.type === "top5" && p.level !== "state") attrs.push(`level="${p.level}"`);
  return `{{chart ${attrs.join(" ")}}}`;
}

export function StoryEditor({
  initial,
  indicators,
  places,
}: {
  initial: StoryDraft;
  indicators: EditorIndicator[];
  places: EditorPlace[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<StoryDraft>(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Insert-chart panel state.
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [chartIndicator, setChartIndicator] = useState(indicators[0]?.code ?? "");
  const [chartPlaces, setChartPlaces] = useState<string[]>(["NG"]);
  const [extraPlace, setExtraPlace] = useState("");
  const [chartYear, setChartYear] = useState("");
  const [chartLevel, setChartLevel] = useState<"state" | "lga">("state");

  // Preview.
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const update = (patch: Partial<StoryDraft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (patch.title !== undefined && !slugTouched) next.slug = slugFrom(patch.title);
      return next;
    });
    setDirty(true);
  };

  const refreshPreview = useCallback(async (body: string) => {
    try {
      const r = await previewStoryAction(body);
      if (r.ok) {
        setBlocks(r.data);
        setPreviewError(null);
      } else setPreviewError(r.error);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    }
  }, []);

  // Debounced live preview of the markdown structure; charts load as live embeds.
  useEffect(() => {
    const t = window.setTimeout(() => void refreshPreview(draft.body), 700);
    return () => window.clearTimeout(t);
  }, [draft.body, refreshPreview]);

  function insertChart() {
    const code = buildShortcode({
      type: chartType,
      indicator: chartIndicator,
      places: chartPlaces,
      year: chartYear,
      level: chartLevel,
    });
    const ta = bodyRef.current;
    const body = draft.body;
    const at = ta ? ta.selectionStart : body.length;
    const before = body.slice(0, at);
    const after = body.slice(at);
    const pre = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const post = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
    const next = `${before}${pre}${code}${post}${after}`;
    update({ body: next });
    window.requestAnimationFrame(() => {
      if (!ta) return;
      const pos = (before + pre + code).length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }

  function addPlace(code: string) {
    const c = code.trim().toUpperCase();
    if (!c || chartPlaces.includes(c) || chartPlaces.length >= 6) return;
    setChartPlaces([...chartPlaces, c]);
  }

  function run<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done: (data: T) => void) {
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await fn();
        if (r.ok) done(r.data);
        else setMessage({ ok: false, text: r.error });
      } catch (e) {
        setMessage({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
      }
    });
  }

  function save(then?: (id: number) => void) {
    run(
      () =>
        saveStoryAction({
          id: draft.id,
          title: draft.title,
          slug: draft.slug,
          summary: draft.summary,
          body: draft.body,
          coverIndicator: draft.coverIndicator,
        }),
      (data) => {
        setDirty(false);
        setDraft((d) => ({ ...d, id: data.id, slug: data.slug }));
        setSlugTouched(true);
        if (then) then(data.id);
        else setMessage({ ok: true, text: "Saved." });
        if (!draft.id) router.replace(`/editor/content/stories/${data.id}`);
      },
    );
  }

  function setStatus(publish: boolean) {
    const go = (id: number) =>
      run(
        () => setStoryStatusAction({ id, publish }),
        (data) => {
          setDraft((d) => ({ ...d, status: data.status }));
          setMessage({ ok: true, text: publish ? "Published — the story is live." : "Unpublished — back to draft." });
          router.refresh();
        },
      );
    if (dirty || !draft.id) save(go);
    else go(draft.id);
  }

  function remove() {
    if (!draft.id || !window.confirm("Delete this story permanently?")) return;
    run(
      () => deleteStoryAction({ id: draft.id }),
      () => router.push("/editor/content"),
    );
  }

  const placeName = (code: string) => places.find((p) => p.code === code)?.name ?? code;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={draft.status === "published" ? "success" : "warning"}>{draft.status}</Badge>
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
        {message && <Alert variant={message.ok ? "default" : "destructive"}>{message.text}</Alert>}

        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={draft.title} onChange={(e) => update({ title: e.target.value })} maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={draft.slug}
            onChange={(e) => {
              setSlugTouched(true);
              update({ slug: slugFrom(e.target.value) });
            }}
          />
          <p className="text-xs text-muted-foreground">/stories/{draft.slug || "…"}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="summary">Summary</Label>
          <Textarea id="summary" rows={2} value={draft.summary} onChange={(e) => update({ summary: e.target.value })} maxLength={400} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cover">Main indicator (optional)</Label>
          <Select id="cover" value={draft.coverIndicator} onChange={(e) => update({ coverIndicator: e.target.value })}>
            <option value="">— none —</option>
            {indicators.map((i) => (
              <option key={i.code} value={i.code}>
                {i.name}
              </option>
            ))}
          </Select>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">Insert a live chart</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Chart type</span>
              <Select value={chartType} onChange={(e) => setChartType(e.target.value as ChartType)}>
                <option value="bar">Bar — compare places</option>
                <option value="trend">Trend — over time</option>
                <option value="top5">Top 5 — highest values</option>
              </Select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Indicator</span>
              <Select value={chartIndicator} onChange={(e) => setChartIndicator(e.target.value)}>
                {indicators.map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Year {chartType === "trend" ? "(ignored for trends)" : "(blank = latest)"}</span>
              <Input inputMode="numeric" placeholder="e.g. 2018" value={chartYear} onChange={(e) => setChartYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} />
            </label>
            {chartType === "top5" && (
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">Rank across</span>
                <Select value={chartLevel} onChange={(e) => setChartLevel(e.target.value as "state" | "lga")}>
                  <option value="state">States</option>
                  <option value="lga">LGAs</option>
                </Select>
              </label>
            )}
          </div>
          {chartType !== "top5" && (
            <div className="space-y-2 text-xs">
              <span className="text-muted-foreground">Places (up to 6)</span>
              <div className="flex flex-wrap gap-1.5">
                {chartPlaces.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChartPlaces(chartPlaces.filter((x) => x !== c))}
                    className="rounded-full border border-border bg-muted px-2 py-0.5 hover:bg-red-50"
                    aria-label={`Remove ${placeName(c)}`}
                  >
                    {placeName(c)} ×
                  </button>
                ))}
                {chartPlaces.length === 0 && <span className="text-red-700">Add at least one place</span>}
              </div>
              <div className="flex gap-2">
                <Select value="" onChange={(e) => addPlace(e.target.value)} aria-label="Add a place">
                  <option value="">Add Nigeria or a state…</option>
                  {places.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder="or LGA code"
                  value={extraPlace}
                  onChange={(e) => setExtraPlace(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPlace(extraPlace);
                      setExtraPlace("");
                    }
                  }}
                  className="max-w-36"
                />
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={insertChart}
              disabled={!chartIndicator || (chartType !== "top5" && chartPlaces.length === 0)}
            >
              <BarChart3 aria-hidden /> Insert at cursor
            </Button>
            <code className="break-all text-[11px] text-muted-foreground">
              {buildShortcode({ type: chartType, indicator: chartIndicator, places: chartPlaces, year: chartYear, level: chartLevel })}
            </code>
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="body">Body (markdown)</Label>
          <Textarea
            id="body"
            ref={bodyRef}
            rows={22}
            value={draft.body}
            onChange={(e) => update({ body: e.target.value })}
            className="font-mono text-xs leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">
            Supported: ## headings, **bold**, *italic*, `code`, [links](https://…), - lists, 1. lists, &gt; quotes, --- rules,
            and chart shortcodes on their own line. HTML is shown as text.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button type="button" onClick={() => save()} disabled={pending}>
            <Save aria-hidden /> Save draft
          </Button>
          {draft.status === "published" ? (
            <Button type="button" variant="outline" onClick={() => setStatus(false)} disabled={pending}>
              <Undo2 aria-hidden /> Unpublish
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setStatus(true)} disabled={pending}>
              <Send aria-hidden /> Publish
            </Button>
          )}
          {draft.id && (
            <Link href={`/editor/content/stories/${draft.id}/preview`} target="_blank" className={buttonVariants({ variant: "ghost" })}>
              <Eye aria-hidden /> Full preview (saved)
            </Link>
          )}
          {draft.status === "published" && draft.slug && (
            <Link href={`/stories/${draft.slug}`} target="_blank" className={buttonVariants({ variant: "ghost" })}>
              View live
            </Link>
          )}
          {draft.id && (
            <Button type="button" variant="ghost" onClick={remove} disabled={pending} className="ml-auto text-red-700">
              <Trash2 aria-hidden /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-auto rounded-lg border border-border p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Live preview</p>
          <h1 className="text-xl font-semibold leading-tight">{draft.title || "Untitled story"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{draft.summary}</p>
          {previewError && <Alert variant="destructive" className="mt-3">{previewError}</Alert>}
          {blocks && (
            <div className="text-sm">
              <StoryBlocks
                blocks={blocks}
                renderChart={(spec, raw) => (
                  <iframe
                    key={raw}
                    src={chartEmbedPath(spec)}
                    title={`Chart preview: ${raw}`}
                    loading="lazy"
                    className="h-[400px] w-full rounded-md border border-border"
                  />
                )}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
