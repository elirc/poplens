"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, Send, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import type { CardKind, CardSpec } from "@/components/content/types";
import {
  cardYearsAction,
  deleteCardAction,
  saveCardAction,
  setCardStatusAction,
  suggestCardAction,
} from "../actions";
import type { EditorIndicator, EditorPlace } from "./story-editor";

export interface CardDraft {
  id?: number;
  title: string;
  slug: string;
  caption: string;
  spec: CardSpec;
  status: "draft" | "published";
}

const KIND_LABELS: Record<CardKind, string> = {
  top5: "Top 5 places (highest values)",
  vs_national: "One place vs Nigeria",
  single_stat: "Single figure",
  trend: "Trend over time",
};

const slugFrom = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** Normalise the spec for the chosen kind (drop fields that don't apply). */
function cleanSpec(s: CardSpec): CardSpec {
  const out: CardSpec = { kind: s.kind, indicatorCode: s.indicatorCode };
  if (s.kind === "top5") {
    if (s.level && s.level !== "state") out.level = s.level;
  } else {
    const place = s.placeCodes?.[0] ?? (s.kind === "vs_national" ? "NG-KN" : "NG");
    out.placeCodes = [place];
  }
  if (s.year != null && s.kind !== "trend") out.year = s.year;
  return out;
}

export function CardGenerator({
  initial,
  indicators,
  places,
}: {
  initial: CardDraft;
  indicators: EditorIndicator[];
  places: EditorPlace[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<CardDraft>(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [years, setYears] = useState<number[]>([]);
  const [lgaCode, setLgaCode] = useState("");

  const spec = useMemo(() => cleanSpec(draft.spec), [draft.spec]);
  const placeCode = spec.placeCodes?.[0] ?? "";

  const update = (patch: Partial<CardDraft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (patch.title !== undefined && !slugTouched) next.slug = slugFrom(patch.title);
      return next;
    });
    setDirty(true);
  };
  const updateSpec = (patch: Partial<CardSpec>) => update({ spec: cleanSpec({ ...spec, ...patch }) });

  // Year picker follows indicator + level/place.
  useEffect(() => {
    let active = true;
    cardYearsAction({
      indicatorCode: spec.indicatorCode,
      level: spec.kind === "top5" ? (spec.level ?? "state") : undefined,
      placeCode: spec.kind === "top5" ? undefined : placeCode || undefined,
    })
      .then((r) => {
        if (active) setYears(r.ok ? r.data : []);
      })
      .catch(() => active && setYears([]));
    return () => {
      active = false;
    };
  }, [spec.indicatorCode, spec.kind, spec.level, placeCode]);

  // Debounced live preview URL (the real OG route, rendering from live data).
  const previewQuery = useMemo(
    () => new URLSearchParams({ spec: JSON.stringify(spec), title: draft.title }).toString(),
    [spec, draft.title],
  );
  const [debounced, setDebounced] = useState(previewQuery);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(previewQuery), 600);
    return () => window.clearTimeout(t);
  }, [previewQuery]);

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

  function suggest() {
    run(
      () => suggestCardAction(spec),
      (data) => {
        update({ title: data.title, caption: data.caption });
        setMessage({ ok: true, text: "Title and caption suggested from live data — edit as needed." });
      },
    );
  }

  function save(then?: (id: number) => void) {
    run(
      () => saveCardAction({ id: draft.id, title: draft.title, slug: draft.slug, caption: draft.caption, spec }),
      (data) => {
        setDirty(false);
        setSlugTouched(true);
        setDraft((d) => ({ ...d, id: data.id, slug: data.slug }));
        if (then) then(data.id);
        else setMessage({ ok: true, text: "Saved." });
        if (!draft.id) router.replace(`/editor/content/cards/${data.id}`);
      },
    );
  }

  function setStatus(publish: boolean) {
    const go = (id: number) =>
      run(
        () => setCardStatusAction({ id, publish }),
        (data) => {
          setDraft((d) => ({ ...d, status: data.status }));
          setMessage({ ok: true, text: publish ? "Published — the card is live." : "Unpublished — back to draft." });
          router.refresh();
        },
      );
    if (dirty || !draft.id) save(go);
    else go(draft.id);
  }

  function remove() {
    if (!draft.id || !window.confirm("Delete this card permanently?")) return;
    run(
      () => deleteCardAction({ id: draft.id }),
      () => router.push("/editor/content"),
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={draft.status === "published" ? "success" : "warning"}>{draft.status}</Badge>
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
        {message && <Alert variant={message.ok ? "default" : "destructive"}>{message.text}</Alert>}

        <fieldset className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">What the card shows</legend>
          <label className="space-y-1 text-xs sm:col-span-2">
            <span className="text-muted-foreground">Kind</span>
            <Select value={spec.kind} onChange={(e) => updateSpec({ kind: e.target.value as CardKind })}>
              {(Object.keys(KIND_LABELS) as CardKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-xs sm:col-span-2">
            <span className="text-muted-foreground">Indicator</span>
            <Select value={spec.indicatorCode} onChange={(e) => updateSpec({ indicatorCode: e.target.value, year: undefined })}>
              {indicators.map((i) => (
                <option key={i.code} value={i.code}>
                  {i.name}
                </option>
              ))}
            </Select>
          </label>
          {spec.kind === "top5" ? (
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Rank across</span>
              <Select
                value={spec.level ?? "state"}
                onChange={(e) => updateSpec({ level: e.target.value as "state" | "lga", year: undefined })}
              >
                <option value="state">States</option>
                <option value="lga">LGAs</option>
              </Select>
            </label>
          ) : (
            <div className="space-y-1 text-xs">
              <span className="text-muted-foreground">Place</span>
              <Select value={places.some((p) => p.code === placeCode) ? placeCode : ""} onChange={(e) => e.target.value && updateSpec({ placeCodes: [e.target.value], year: undefined })}>
                <option value="">{placeCode && !places.some((p) => p.code === placeCode) ? placeCode : "Choose…"}</option>
                {places
                  .filter((p) => !(spec.kind === "vs_national" && p.code === "NG"))
                  .map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
              </Select>
              <Input
                placeholder="or an LGA code, Enter"
                value={lgaCode}
                onChange={(e) => setLgaCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && lgaCode.trim()) {
                    e.preventDefault();
                    updateSpec({ placeCodes: [lgaCode.trim().toUpperCase()], year: undefined });
                    setLgaCode("");
                  }
                }}
              />
            </div>
          )}
          {spec.kind !== "trend" && (
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Year</span>
              <Select
                value={spec.year != null ? String(spec.year) : ""}
                onChange={(e) => updateSpec({ year: e.target.value ? Number(e.target.value) : undefined })}
              >
                <option value="">Latest available (updates automatically)</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </fieldset>

        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={suggest} disabled={pending}>
            <Sparkles aria-hidden /> Suggest title &amp; caption from live data
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="card-title">Title</Label>
          <Input id="card-title" value={draft.title} maxLength={140} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="card-slug">Slug</Label>
          <Input
            id="card-slug"
            value={draft.slug}
            onChange={(e) => {
              setSlugTouched(true);
              update({ slug: slugFrom(e.target.value) });
            }}
          />
          <p className="text-xs text-muted-foreground">/cards/{draft.slug || "…"}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="card-caption">Caption</Label>
          <Textarea id="card-caption" rows={4} maxLength={500} value={draft.caption} onChange={(e) => update({ caption: e.target.value })} />
          <p className="text-xs text-muted-foreground">
            Shown beside the image and in share previews. Keep the source and, for demo data, the SYNTHETIC note.
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
          {draft.status === "published" && draft.slug && (
            <Link href={`/cards/${draft.slug}`} target="_blank" className={buttonVariants({ variant: "ghost" })}>
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

      <div className="min-w-0 space-y-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Live preview (from published data)</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic, uncached staff preview */}
        <img
          src={`/api/og/preview?${debounced}&size=wide`}
          alt="Wide card preview"
          width={1200}
          height={630}
          className="h-auto w-full rounded-lg border border-border bg-muted"
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic, uncached staff preview */}
        <img
          src={`/api/og/preview?${debounced}&size=square`}
          alt="Square card preview"
          width={1080}
          height={1080}
          className="h-auto w-full max-w-xs rounded-lg border border-border bg-muted"
        />
        <p className="text-xs text-muted-foreground">{draft.caption || "No caption yet."}</p>
      </div>
    </div>
  );
}
