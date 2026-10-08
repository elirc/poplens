import { getCurrentUser } from "@/lib/session";
import { DownloadButtonsClient } from "./download-buttons-client";
import type { DownloadSpec } from "./types";

/**
 * Reusable CSV/Excel download buttons (server component). Shown only to
 * signed-in users; the download route re-checks licence → plan → logs.
 *
 *   <DownloadButtons spec={{ kind: "level", indicator: "u5mr", level: "state", year: 2018 }} />
 *   <DownloadButtons spec={{ kind: "place", place: "NG-KN" }} />
 *   <DownloadButtons spec={{ kind: "dataset", datasetId: 11 }} />
 */
export async function DownloadButtons({
  spec,
  label,
  className,
}: {
  spec: DownloadSpec;
  label?: string;
  className?: string;
}) {
  let signedIn = false;
  try {
    signedIn = (await getCurrentUser()) != null;
  } catch {
    signedIn = false;
  }
  if (!signedIn) return null;
  return <DownloadButtonsClient spec={spec} label={label} className={className} />;
}
