"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Popup } from "react-map-gl/maplibre";

/**
 * Hover (desktop) / tap (mobile) popup: place name, formatted value and the
 * short source line. On touch devices pass `href` so the popup carries the
 * "Open profile" link (a tap selects; it does not navigate).
 */
export interface HoverPopupProps {
  lng: number;
  lat: number;
  title: string;
  value?: ReactNode;
  detail?: ReactNode;
  source?: ReactNode;
  href?: string;
  hint?: string;
  onClose?: () => void;
}

export function HoverPopup({
  lng,
  lat,
  title,
  value,
  detail,
  source,
  href,
  hint,
  onClose,
}: HoverPopupProps) {
  return (
    <Popup
      longitude={lng}
      latitude={lat}
      closeButton={Boolean(onClose)}
      closeOnClick={false}
      onClose={onClose}
      offset={12}
      maxWidth="260px"
      className="poplens-popup"
    >
      <div className="space-y-0.5 text-xs text-neutral-900">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        {value != null && <p className="text-base font-semibold tabular-nums">{value}</p>}
        {detail && <p className="text-neutral-600">{detail}</p>}
        {source && <p className="text-[11px] text-neutral-500">{source}</p>}
        {href && (
          <Link href={href} className="mt-1 inline-block font-medium text-emerald-700 underline">
            Open profile →
          </Link>
        )}
        {hint && !href && <p className="text-[11px] text-neutral-500">{hint}</p>}
      </div>
    </Popup>
  );
}
