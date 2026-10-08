"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, Link2 } from "lucide-react";
import { Spinner } from "@/components/ui/misc";

/** Small shared control primitives for the analytics pages. */

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T | null;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value == null ? "" : String(value)}
        disabled={disabled || options.length === 0}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value);
          if (opt) onChange(opt.value);
        }}
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm disabled:opacity-60"
      >
        {value == null && <option value="">{options.length ? "Choose…" : "No data"}</option>}
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Segmented toggle (e.g. State / LGA) rendered as radio-like buttons. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border text-sm">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={disabled}
            onClick={() => o.value !== value && onChange(o.value)}
            className={`h-9 px-3 ${i === 0 ? "rounded-l-md" : ""} ${
              i === options.length - 1 ? "rounded-r-md" : ""
            } ${value === o.value ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Copy the current URL (every analytics view is shareable). */
export function ShareLink() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-muted"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}

/** Card wrapping a page's controls, with a pending indicator during navigation. */
export function ControlPanel({ children, pending }: { children: ReactNode; pending?: boolean }) {
  return (
    <section
      aria-label="View options"
      aria-busy={pending || undefined}
      className="relative rounded-lg border border-border bg-card p-3"
    >
      {pending && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="h-3.5 w-3.5" /> Updating…
        </span>
      )}
      {children}
    </section>
  );
}
