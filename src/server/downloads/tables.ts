import {
  getAvailableYears,
  getIndicatorByCode,
  getPublishedValue,
  getTrendSeries,
  getValuesForLevel,
  listIndicators,
  type PublicValue,
} from "@/server/indicators/queries";
import { computeRanks } from "@/server/indicators/ranks";
import { getGeoUnitByCode } from "@/server/geo/queries";
import { exploreHref } from "@/components/indicators/labels";
import type { DownloadSpec } from "@/components/content/types";
import type { Cell, TableColumn } from "./csv";
import type { DatasetMeta } from "./citation";
import { getPublishedDatasetMeta, getPublishedDatasetValues, loadPublishedDatasetMeta } from "./datasets";
import type { GateRefusal } from "./licence";

/**
 * Builds the downloadable table for a DownloadSpec from PUBLISHED values only
 * (indicator queries contract) plus the dataset/source metadata needed for
 * licence gating and citations.
 */

export interface DownloadTable {
  title: string;
  /** Page on PopLens the table corresponds to (for the citation link). */
  pagePath: string;
  columns: TableColumn[];
  rows: Array<Record<string, Cell>>;
  datasets: DatasetMeta[];
  /** Set when the whole table is one dataset (download_log.dataset_id). */
  singleDatasetId: number | null;
}

export type TableResult = { ok: true; table: DownloadTable } | GateRefusal;

const VALUE_COLUMNS: TableColumn[] = [
  { key: "year", header: "year" },
  { key: "period", header: "period_label" },
  { key: "value", header: "value" },
  { key: "lower", header: "lower_bound" },
  { key: "upper", header: "upper_bound" },
  { key: "isEstimate", header: "is_estimate" },
  { key: "source", header: "source" },
  { key: "dataset", header: "dataset" },
  { key: "note", header: "note" },
];

const PLACE_COLUMNS: TableColumn[] = [
  { key: "placeCode", header: "place_code" },
  { key: "placeName", header: "place_name" },
];

const INDICATOR_COLUMNS: TableColumn[] = [
  { key: "indicatorCode", header: "indicator_code" },
  { key: "indicatorName", header: "indicator_name" },
  { key: "unit", header: "unit" },
];

function valueCells(v: PublicValue): Record<string, Cell> {
  return {
    year: Number(v.year),
    period: v.periodLabel,
    value: Number(v.value),
    lower: v.lower == null ? null : Number(v.lower),
    upper: v.upper == null ? null : Number(v.upper),
    isEstimate: Boolean(v.isEstimate),
    source: v.isSynthetic ? `${v.sourcePublisher} (SYNTHETIC demo data)` : v.sourcePublisher,
    dataset: v.datasetTitle,
    note: v.note,
  };
}

const noData = (year: number | null | undefined): Record<string, Cell> => ({
  year: year ?? null,
  value: null,
  note: "No data",
});

const refuse = (status: 400 | 404, message: string): GateRefusal => ({
  ok: false,
  status,
  code: status === 404 ? "empty" : "invalid",
  message,
});

async function finish(
  base: Omit<DownloadTable, "datasets" | "singleDatasetId">,
  datasetIds: number[],
): Promise<TableResult> {
  const datasets = await loadPublishedDatasetMeta(datasetIds);
  if (base.rows.every((r) => r.value == null) || datasets.length === 0) {
    return refuse(404, "There is no published data for this selection, so there is nothing to download.");
  }
  return {
    ok: true,
    table: { ...base, datasets, singleDatasetId: datasets.length === 1 ? datasets[0]!.datasetId : null },
  };
}

export async function buildDownloadTable(spec: DownloadSpec): Promise<TableResult> {
  if (spec.kind === "dataset") return buildDatasetTable(spec.datasetId);

  if (spec.kind === "place") {
    const unit = await getGeoUnitByCode(spec.place);
    if (!unit) return refuse(404, `Unknown place "${spec.place}"`);
    const indicators = await listIndicators();
    const rows: Array<Record<string, Cell>> = [];
    const ids: number[] = [];
    for (const ind of indicators) {
      const v = await getPublishedValue(ind.id, unit.id);
      const head = { indicatorCode: ind.code, indicatorName: ind.name, unit: ind.unit };
      if (v) {
        rows.push({ ...head, ...valueCells(v) });
        ids.push(v.datasetId);
      } else {
        rows.push({ ...head, ...noData(null) });
      }
    }
    return finish(
      {
        title: `${unit.name} — latest value of every indicator`,
        pagePath: `/places/${encodeURIComponent(unit.code)}`,
        columns: [...INDICATOR_COLUMNS, ...VALUE_COLUMNS],
        rows,
      },
      ids,
    );
  }

  const ind = await getIndicatorByCode(spec.indicator);
  if (!ind) return refuse(404, `Unknown indicator "${spec.indicator}"`);
  const head = { indicatorCode: ind.code, indicatorName: ind.name, unit: ind.unit };

  if (spec.kind === "level") {
    let parentId: number | undefined;
    let parentState: string | null = null;
    if (spec.parent) {
      const parent = await getGeoUnitByCode(spec.parent);
      if (!parent) return refuse(404, `Unknown parent place "${spec.parent}"`);
      parentId = parent.id;
      parentState = parent.code;
    }
    const years = await getAvailableYears(ind.id, spec.level);
    const year = spec.year ?? years[years.length - 1] ?? null;
    if (year == null || !years.includes(year)) {
      return refuse(404, `No published ${ind.name} values at this level${spec.year ? ` for ${spec.year}` : ""}.`);
    }
    const values = await getValuesForLevel(ind.id, spec.level, year, { parentId });
    const ranked = computeRanks(
      values.map((r) => ({ geoUnitId: Number(r.geoUnitId), value: Number(r.value) })),
      ind.higherIsBetter,
    );
    const byId = new Map(values.map((r) => [Number(r.geoUnitId), r]));
    const rows = ranked.map((rk) => {
      const r = byId.get(rk.geoUnitId)!;
      return { rank: rk.rank, placeCode: r.code, placeName: r.name, ...head, ...valueCells(r) };
    });
    return finish(
      {
        title: `${ind.name} by ${spec.level}, ${year}`,
        pagePath: exploreHref(ind.code, year, spec.level, parentState),
        columns: [{ key: "rank", header: "rank" }, ...PLACE_COLUMNS, ...INDICATOR_COLUMNS, ...VALUE_COLUMNS],
        rows,
      },
      values.map((v) => v.datasetId),
    );
  }

  // places: one indicator for chosen places — one year, or every year (trend).
  const units = [];
  for (const code of spec.places) {
    const u = await getGeoUnitByCode(code);
    if (!u) return refuse(404, `Unknown place "${code}"`);
    units.push(u);
  }
  const rows: Array<Record<string, Cell>> = [];
  const ids: number[] = [];
  if (spec.year != null) {
    for (const u of units) {
      const v = await getPublishedValue(ind.id, u.id, { year: spec.year });
      const place = { placeCode: u.code, placeName: u.name, ...head };
      if (v) {
        rows.push({ ...place, ...valueCells(v) });
        ids.push(v.datasetId);
      } else rows.push({ ...place, ...noData(spec.year) });
    }
  } else {
    const series = await getTrendSeries(ind.id, units.map((u) => u.id));
    for (const u of units) {
      const mine = series.filter((r) => Number(r.geoUnitId) === u.id);
      const place = { placeCode: u.code, placeName: u.name, ...head };
      if (mine.length === 0) rows.push({ ...place, ...noData(null) });
      for (const v of mine) {
        rows.push({ ...place, ...valueCells(v) });
        ids.push(v.datasetId);
      }
    }
  }
  const q = new URLSearchParams({ indicator: ind.code, places: units.map((u) => u.code).join(",") });
  return finish(
    {
      title: `${ind.name}: ${units.map((u) => u.name).join(", ")}${spec.year ? `, ${spec.year}` : ", all years"}`,
      pagePath: `/trends?${q.toString()}`,
      columns: [...PLACE_COLUMNS, ...INDICATOR_COLUMNS, ...VALUE_COLUMNS],
      rows,
    },
    ids,
  );
}

async function buildDatasetTable(datasetId: number): Promise<TableResult> {
  const meta = await getPublishedDatasetMeta(datasetId);
  if (!meta) return refuse(404, "Dataset not found or not published.");
  const values = await getPublishedDatasetValues(datasetId);
  if (values.length === 0) {
    return refuse(404, "This dataset has no indicator values to download.");
  }
  return {
    ok: true,
    table: {
      title: meta.datasetTitle,
      pagePath: "/updates",
      columns: [
        { key: "level", header: "level" },
        ...PLACE_COLUMNS,
        ...INDICATOR_COLUMNS,
        { key: "year", header: "year" },
        { key: "period", header: "period_label" },
        { key: "sex", header: "sex" },
        { key: "ageGroup", header: "age_group" },
        { key: "residence", header: "residence" },
        { key: "value", header: "value" },
        { key: "lower", header: "lower_bound" },
        { key: "upper", header: "upper_bound" },
        { key: "isEstimate", header: "is_estimate" },
        { key: "note", header: "note" },
      ],
      rows: values.map((v) => ({
        level: v.level,
        placeCode: v.placeCode,
        placeName: v.placeName,
        indicatorCode: v.indicatorCode,
        indicatorName: v.indicatorName,
        unit: v.unit,
        year: Number(v.year),
        period: v.periodLabel,
        sex: v.sex,
        ageGroup: v.ageGroup,
        residence: v.residence,
        value: Number(v.value),
        lower: v.lower == null ? null : Number(v.lower),
        upper: v.upper == null ? null : Number(v.upper),
        isEstimate: v.isEstimate,
        note: v.note,
      })),
      datasets: [meta],
      singleDatasetId: meta.datasetId,
    },
  };
}
