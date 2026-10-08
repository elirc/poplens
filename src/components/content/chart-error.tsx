/** Visible, non-crashing error box for bad shortcodes / failed charts. */
export function ChartErrorBox({
  title,
  message,
  raw,
  tone = "error",
}: {
  title?: string;
  message: string;
  raw?: string;
  tone?: "error" | "muted";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={
        tone === "error"
          ? "rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950"
          : "rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
      }
    >
      {title && <p className="font-medium">{title}</p>}
      <p>{tone === "error" ? `Chart unavailable: ${message}` : message}</p>
      {raw && <code className="mt-1 block break-all text-xs opacity-80">{raw}</code>}
    </div>
  );
}
