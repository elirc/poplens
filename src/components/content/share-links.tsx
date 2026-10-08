import { CopyButton } from "./copy-button";

/**
 * Share links as plain anchors (no SDKs, no third-party scripts): WhatsApp,
 * X, and copy-link. `url` must be absolute.
 */
export function ShareLinks({ url, text }: { url: string; text: string }) {
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const cls =
    "inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={wa} target="_blank" rel="noopener noreferrer" className={cls}>
        WhatsApp
      </a>
      <a href={x} target="_blank" rel="noopener noreferrer" className={cls}>
        X (Twitter)
      </a>
      <CopyButton text={url} label="Copy link" copiedLabel="Link copied" />
    </div>
  );
}
