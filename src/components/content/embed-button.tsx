"use client";

import { useState } from "react";
import { Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./copy-button";
import { iframeSnippet } from "./embed-url";

/**
 * "Embed" button: reveals a copyable <iframe> snippet for an /embed/* path.
 * The absolute origin is taken from the browser at click time.
 */
export function EmbedButton({
  path,
  title,
  height = 420,
}: {
  /** e.g. /embed/chart?type=bar&indicator=u5mr&places=NG-KN */
  path: string;
  title: string;
  height?: number;
}) {
  const [snippet, setSnippet] = useState<string | null>(null);
  return (
    <div className="text-xs">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-expanded={snippet != null}
        onClick={() =>
          setSnippet((s) => (s ? null : iframeSnippet(`${window.location.origin}${path}`, title, height)))
        }
      >
        <Code2 aria-hidden />
        Embed
      </Button>
      {snippet && (
        <div className="mt-2 space-y-2 rounded-md border border-border bg-muted/40 p-2">
          <p className="text-muted-foreground">Paste this into your website&apos;s HTML:</p>
          <textarea
            readOnly
            value={snippet}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full resize-none rounded border border-border bg-background p-2 font-mono text-[11px]"
            aria-label="Embed code"
          />
          <div className="flex items-center gap-2">
            <CopyButton text={snippet} label="Copy embed code" />
            <a
              href={path}
              target="_blank"
              rel="noopener"
              className="text-muted-foreground underline-offset-2 hover:underline"
            >
              Preview
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
