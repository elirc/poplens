/**
 * Minimal attribution footer for embeds: PopLens backlink (opens on
 * PopLens, not inside the iframe) and the demo-data note when synthetic.
 */
export function EmbedFooter({ href, synthetic }: { href: string; synthetic: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      {synthetic ? (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">
          Demo data — synthetic, not real statistics
        </span>
      ) : (
        <span />
      )}
      <a href={href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
        <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-600" />
        PopLens
      </a>
    </div>
  );
}
