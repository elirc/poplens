import { Fragment, type ReactNode } from "react";
import type { Block, ChartSpec, Inline } from "./types";
import { ChartErrorBox } from "./chart-error";

/**
 * Renders the restricted-markdown AST produced by src/server/content/markdown.ts.
 * Text goes through React (escaped) — there is no HTML pass-through. Charts
 * are delegated to `renderChart` (live server chart on the public page, an
 * iframe/placeholder in the editor preview). No hooks: usable on server and client.
 */
export function StoryBlocks({
  blocks,
  renderChart,
}: {
  blocks: Block[];
  renderChart: (spec: ChartSpec, raw: string, index: number) => ReactNode;
}) {
  let chartIndex = 0;
  const render = (bs: Block[], prefix: string): ReactNode =>
    bs.map((b, i) => {
      const key = `${prefix}${i}`;
      switch (b.t) {
        case "heading": {
          const Tag = (`h${b.level}` as "h2" | "h3" | "h4");
          const cls =
            b.level === 2
              ? "mt-8 text-xl font-semibold tracking-tight"
              : b.level === 3
                ? "mt-6 text-lg font-semibold"
                : "mt-4 font-semibold";
          return (
            <Tag key={key} className={cls}>
              <InlineNodes nodes={b.c} />
            </Tag>
          );
        }
        case "paragraph":
          return (
            <p key={key} className="mt-4 leading-relaxed">
              <InlineNodes nodes={b.c} />
            </p>
          );
        case "quote":
          return (
            <blockquote key={key} className="mt-4 rounded-r-md border-l-4 border-amber-400 bg-amber-50/60 px-4 py-1 text-sm text-amber-950 [&>p:first-child]:mt-2 [&>p:last-child]:mb-2">
              {render(b.c, `${key}-`)}
            </blockquote>
          );
        case "list": {
          const items = b.items.map((it, j) => (
            <li key={j} className="mt-1">
              <InlineNodes nodes={it} />
            </li>
          ));
          return b.ordered ? (
            <ol key={key} className="mt-4 list-decimal space-y-1 pl-6">
              {items}
            </ol>
          ) : (
            <ul key={key} className="mt-4 list-disc space-y-1 pl-6">
              {items}
            </ul>
          );
        }
        case "hr":
          return <hr key={key} className="my-6 border-border" />;
        case "chart":
          return (
            <div key={key} className="mt-6">
              {renderChart(b.spec, b.raw, chartIndex++)}
            </div>
          );
        case "chart_error":
          return (
            <div key={key} className="mt-6">
              <ChartErrorBox message={b.message} raw={b.raw} />
            </div>
          );
      }
    });
  return <>{render(blocks, "")}</>;
}

export function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text":
            return <Fragment key={i}>{n.v}</Fragment>;
          case "strong":
            return (
              <strong key={i} className="font-semibold">
                <InlineNodes nodes={n.c} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <InlineNodes nodes={n.c} />
              </em>
            );
          case "code":
            return (
              <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
                {n.v}
              </code>
            );
          case "link": {
            const external = /^https?:/i.test(n.href);
            return (
              <a
                key={i}
                href={n.href}
                className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
              >
                <InlineNodes nodes={n.c} />
              </a>
            );
          }
        }
      })}
    </>
  );
}
