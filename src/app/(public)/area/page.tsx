import type { Metadata } from "next";
import { env } from "@/env";
import { getCurrentUser } from "@/lib/session";
import { getAreaQuota } from "@/server/area/quota";
import { AreaTool } from "./area-tool";
import type { AreaQuotaView } from "./_lib/types";

/**
 * /area — area analysis: drop a pin with a 1–50 km radius or draw a shape,
 * then get the estimated population inside, facilities inside by type,
 * people per facility and the LGAs touched. Drawing is open to everyone;
 * running an analysis requires sign-in (free accounts: 3 a day). The shape
 * lives in the URL hash so a link reproduces it (no server storage).
 * Per-user (session + quota), so this page renders dynamically.
 */

export const metadata: Metadata = {
  title: "Area analysis",
  description:
    "Drop a pin or draw a shape anywhere in Nigeria to estimate the population inside, count health facilities by type, and list the LGAs it touches.",
};

export default async function AreaPage() {
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }
  let quota: AreaQuotaView | null = null;
  if (user) {
    try {
      quota = await getAreaQuota(user.id);
    } catch (err) {
      console.error("[area] could not load quota", err);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4">
      <div className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Area analysis</h1>
        <p className="text-sm text-muted-foreground">
          Drop a pin and choose a radius, or draw your own shape. Get the estimated population
          inside, health facilities by type, people per facility and the LGAs it touches.
        </p>
      </div>
      <AreaTool styleUrl={env.MAP_STYLE_URL} signedIn={Boolean(user)} initialQuota={quota} />
    </div>
  );
}
