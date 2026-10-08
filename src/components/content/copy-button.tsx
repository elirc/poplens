"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copies `text` (or the current page URL when `currentUrl`) to the clipboard. */
export function CopyButton({
  text,
  currentUrl,
  label = "Copy",
  copiedLabel = "Copied",
  size = "sm",
  variant = "outline",
}: {
  text?: string;
  currentUrl?: boolean;
  label?: string;
  copiedLabel?: string;
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "ghost";
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const value = currentUrl ? window.location.href : (text ?? "");
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Old Android WebViews: fall back to a temporary textarea.
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return (
    <Button type="button" size={size} variant={variant} onClick={copy} aria-live="polite">
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
