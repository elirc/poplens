/**
 * Approximate reference points per state — REFERENCE DATA, not statistics.
 * - centroid: rough geographic centre, used only as Voronoi sites for the
 *   placeholder-geometry fallback (when real boundaries can't be downloaded).
 * - capital: state capital name + approximate location, used to weight the
 *   synthetic population grid toward the main urban centre. If a capital
 *   point falls outside the loaded state boundary, the seed falls back to
 *   ST_PointOnSurface(state).
 * Coordinates are [longitude, latitude] (EPSG:4326), rounded to ~0.01°.
 */
export interface StatePoint {
  centroid: [number, number];
  capital: { name: string; lngLat: [number, number] };
}

export const STATE_POINTS: Record<string, StatePoint> = {
  "NG-AB": { centroid: [7.52, 5.45], capital: { name: "Umuahia", lngLat: [7.49, 5.53] } },
  "NG-AD": { centroid: [12.4, 9.33], capital: { name: "Yola", lngLat: [12.5, 9.2] } },
  "NG-AK": { centroid: [7.85, 4.9], capital: { name: "Uyo", lngLat: [7.91, 5.04] } },
  "NG-AN": { centroid: [6.94, 6.22], capital: { name: "Awka", lngLat: [7.07, 6.21] } },
  "NG-BA": { centroid: [9.99, 10.78], capital: { name: "Bauchi", lngLat: [9.85, 10.31] } },
  "NG-BY": { centroid: [6.07, 4.77], capital: { name: "Yenagoa", lngLat: [6.26, 4.93] } },
  "NG-BE": { centroid: [8.75, 7.34], capital: { name: "Makurdi", lngLat: [8.52, 7.73] } },
  "NG-BO": { centroid: [13.15, 11.88], capital: { name: "Maiduguri", lngLat: [13.15, 11.83] } },
  "NG-CR": { centroid: [8.6, 5.87], capital: { name: "Calabar", lngLat: [8.33, 4.96] } },
  "NG-DE": { centroid: [5.93, 5.7], capital: { name: "Asaba", lngLat: [6.73, 6.2] } },
  "NG-EB": { centroid: [8.08, 6.25], capital: { name: "Abakaliki", lngLat: [8.11, 6.33] } },
  "NG-ED": { centroid: [5.93, 6.63], capital: { name: "Benin City", lngLat: [5.63, 6.34] } },
  "NG-EK": { centroid: [5.31, 7.72], capital: { name: "Ado-Ekiti", lngLat: [5.22, 7.62] } },
  "NG-EN": { centroid: [7.44, 6.54], capital: { name: "Enugu", lngLat: [7.5, 6.44] } },
  "NG-FC": { centroid: [7.19, 8.89], capital: { name: "Abuja", lngLat: [7.49, 9.06] } },
  "NG-GO": { centroid: [11.17, 10.36], capital: { name: "Gombe", lngLat: [11.17, 10.29] } },
  "NG-IM": { centroid: [7.06, 5.57], capital: { name: "Owerri", lngLat: [7.04, 5.48] } },
  "NG-JI": { centroid: [9.56, 12.23], capital: { name: "Dutse", lngLat: [9.34, 11.76] } },
  "NG-KD": { centroid: [7.71, 10.38], capital: { name: "Kaduna", lngLat: [7.44, 10.52] } },
  "NG-KN": { centroid: [8.52, 11.75], capital: { name: "Kano", lngLat: [8.52, 12.0] } },
  "NG-KT": { centroid: [7.62, 12.39], capital: { name: "Katsina", lngLat: [7.6, 12.99] } },
  "NG-KE": { centroid: [4.1, 11.68], capital: { name: "Birnin Kebbi", lngLat: [4.2, 12.45] } },
  "NG-KO": { centroid: [6.69, 7.73], capital: { name: "Lokoja", lngLat: [6.74, 7.8] } },
  "NG-KW": { centroid: [4.39, 8.97], capital: { name: "Ilorin", lngLat: [4.54, 8.5] } },
  "NG-LA": { centroid: [3.58, 6.53], capital: { name: "Ikeja", lngLat: [3.35, 6.6] } },
  "NG-NA": { centroid: [8.32, 8.54], capital: { name: "Lafia", lngLat: [8.52, 8.49] } },
  "NG-NI": { centroid: [5.6, 9.93], capital: { name: "Minna", lngLat: [6.55, 9.61] } },
  "NG-OG": { centroid: [3.47, 6.98], capital: { name: "Abeokuta", lngLat: [3.35, 7.16] } },
  "NG-ON": { centroid: [5.05, 7.1], capital: { name: "Akure", lngLat: [5.2, 7.25] } },
  "NG-OS": { centroid: [4.52, 7.56], capital: { name: "Osogbo", lngLat: [4.56, 7.77] } },
  "NG-OY": { centroid: [3.62, 8.16], capital: { name: "Ibadan", lngLat: [3.95, 7.38] } },
  "NG-PL": { centroid: [9.52, 9.22], capital: { name: "Jos", lngLat: [8.86, 9.9] } },
  "NG-RI": { centroid: [6.92, 4.84], capital: { name: "Port Harcourt", lngLat: [7.05, 4.82] } },
  "NG-SO": { centroid: [5.24, 13.06], capital: { name: "Sokoto", lngLat: [5.24, 13.06] } },
  "NG-TA": { centroid: [10.77, 7.99], capital: { name: "Jalingo", lngLat: [11.36, 8.89] } },
  "NG-YO": { centroid: [11.44, 12.29], capital: { name: "Damaturu", lngLat: [11.96, 11.75] } },
  "NG-ZA": { centroid: [6.22, 12.12], capital: { name: "Gusau", lngLat: [6.66, 12.16] } },
};

/** Nigeria's bounding box used by the placeholder geometry fallback. */
export const NIGERIA_BBOX = {
  minLng: 2.6,
  maxLng: 14.7,
  minLat: 4.2,
  maxLat: 13.9,
} as const;
