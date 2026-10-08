/** Pure URL builder for the facilities GeoJSON route (unit-tested). */

export interface FacilityFilters {
  /** State id or official code. */
  state?: string | number | null;
  /** LGA id or official code. */
  lga?: string | number | null;
  careLevels?: Array<"primary" | "secondary" | "tertiary">;
  ownerships?: string[];
  type?: string | null;
}

export function facilitiesUrl(f: FacilityFilters = {}): string {
  const q = new URLSearchParams();
  if (f.state != null && f.state !== "") q.set("state", String(f.state));
  if (f.lga != null && f.lga !== "") q.set("lga", String(f.lga));
  if (f.careLevels?.length) q.set("care", [...f.careLevels].sort().join(","));
  if (f.ownerships?.length) q.set("own", [...f.ownerships].sort().join(","));
  if (f.type) q.set("type", f.type);
  const s = q.toString();
  return s ? `/api/geo/facilities?${s}` : "/api/geo/facilities";
}
