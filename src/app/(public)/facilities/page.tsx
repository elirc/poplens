import type { Metadata } from "next";
import { env } from "@/env";
import { listGeoUnits } from "@/server/geo/queries";
import {
  facilitySources,
  getPeoplePerFacilityByLga,
  listFacilitiesPage,
  listFacilityTypes,
  resolveFacilityScope,
} from "@/server/facilities/queries";
import { Alert } from "@/components/ui/misc";
import { parseFacilityQuery } from "./_lib/filters";
import { FacilitiesExplorer } from "./facilities-explorer";
import { FacilityTable } from "./facility-table";
import { PpfTable } from "./ppf-table";

/**
 * /facilities — health facilities map with filters (type, level of care,
 * ownership, state/LGA), a server-paginated list synced to the same URL
 * filters, a people-per-facility-by-LGA choropleth + ranked table, and
 * nearest facilities to any tapped point. All state is in the query string
 * (`?lga=NG-KN-GWALE` deep links from place profiles).
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Health facilities",
  description:
    "Map and list Nigeria's health facilities by type, level of care and ownership; see people per facility by LGA and find the nearest facilities to any point.",
};

export default async function FacilitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseFacilityQuery(await searchParams);

  let data;
  try {
    const scope = await resolveFacilityScope(query);
    const [types, states, lgas, list, sources, ppf] = await Promise.all([
      listFacilityTypes(),
      listGeoUnits("state"),
      scope.state ? listGeoUnits("lga", scope.state.id) : Promise.resolve([]),
      query.view === "map" ? listFacilitiesPage(scope.filters, query.page) : Promise.resolve(null),
      facilitySources(scope.filters),
      query.view === "ppf" ? getPeoplePerFacilityByLga(scope.state?.id) : Promise.resolve(null),
    ]);
    data = { scope, types, states, lgas, list, sources, ppf };
  } catch (err) {
    console.error("[facilities] could not load data", err);
    return (
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Health facilities</h1>
        <Alert variant="warning" className="mt-3">
          Facility data is not available right now. Please try again shortly.
        </Alert>
      </div>
    );
  }
  const { scope, types, states, lgas, list, sources, ppf } = data;

  // Canonical query: an LGA deep link implies its state.
  const effective = {
    ...query,
    state: scope.state?.code ?? null,
    lga: scope.lga?.code ?? null,
  };
  const placeLabel = scope.lga
    ? `${scope.lga.name} LGA${scope.state ? `, ${scope.state.name}` : ""}`
    : scope.state
      ? scope.state.name
      : "Nigeria";

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4">
      <div className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Health facilities <span className="font-normal text-muted-foreground">· {placeLabel}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Filter by type, level of care and ownership. Tap anywhere on the map to list the 10
          nearest facilities. Switch to &ldquo;People per facility&rdquo; to compare LGAs.
        </p>
      </div>

      {scope.unknown.length > 0 && (
        <Alert variant="warning" className="mb-3">
          Place code{scope.unknown.length > 1 ? "s" : ""} &ldquo;{scope.unknown.join("”, “")}&rdquo;
          not found — showing {placeLabel}.
        </Alert>
      )}

      <FacilitiesExplorer
        styleUrl={env.MAP_STYLE_URL}
        query={effective}
        states={states.map((s) => ({ code: s.code, name: s.name }))}
        lgas={lgas.map((l) => ({ code: l.code, name: l.name }))}
        types={types}
        sources={sources}
        total={list?.total ?? null}
        ppf={ppf}
      />

      <section className="mt-6" aria-labelledby="facility-list-heading">
        {list ? (
          <>
            <h2 id="facility-list-heading" className="mb-2 text-base font-semibold">
              Facility list
            </h2>
            <FacilityTable
              rows={list.rows}
              total={list.total}
              page={list.page}
              query={effective}
              sources={sources}
            />
          </>
        ) : ppf ? (
          <>
            <h2 id="facility-list-heading" className="mb-2 text-base font-semibold">
              LGAs ranked by people per facility
              {ppf.year ? <span className="font-normal text-muted-foreground"> · {ppf.year}</span> : null}
            </h2>
            <PpfTable data={ppf} />
          </>
        ) : null}
      </section>
    </div>
  );
}
