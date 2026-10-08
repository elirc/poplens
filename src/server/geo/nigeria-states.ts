/**
 * Canonical reference list: Nigeria's 36 states + FCT and the six geopolitical
 * zones, with the codes used throughout PopLens (geo_units.code).
 * Codes follow ISO 3166-2:NG state codes prefixed with "NG-".
 * This is reference data (names/codes), not statistics.
 */

export const NIGERIA_ZONES = [
  { code: "NG-Z-NC", name: "North Central" },
  { code: "NG-Z-NE", name: "North East" },
  { code: "NG-Z-NW", name: "North West" },
  { code: "NG-Z-SE", name: "South East" },
  { code: "NG-Z-SS", name: "South South" },
  { code: "NG-Z-SW", name: "South West" },
] as const;

export type ZoneCode = (typeof NIGERIA_ZONES)[number]["code"];

export interface StateRef {
  code: string;
  name: string;
  zone: ZoneCode;
}

export const NIGERIA_STATES: StateRef[] = [
  { code: "NG-AB", name: "Abia", zone: "NG-Z-SE" },
  { code: "NG-AD", name: "Adamawa", zone: "NG-Z-NE" },
  { code: "NG-AK", name: "Akwa Ibom", zone: "NG-Z-SS" },
  { code: "NG-AN", name: "Anambra", zone: "NG-Z-SE" },
  { code: "NG-BA", name: "Bauchi", zone: "NG-Z-NE" },
  { code: "NG-BY", name: "Bayelsa", zone: "NG-Z-SS" },
  { code: "NG-BE", name: "Benue", zone: "NG-Z-NC" },
  { code: "NG-BO", name: "Borno", zone: "NG-Z-NE" },
  { code: "NG-CR", name: "Cross River", zone: "NG-Z-SS" },
  { code: "NG-DE", name: "Delta", zone: "NG-Z-SS" },
  { code: "NG-EB", name: "Ebonyi", zone: "NG-Z-SE" },
  { code: "NG-ED", name: "Edo", zone: "NG-Z-SS" },
  { code: "NG-EK", name: "Ekiti", zone: "NG-Z-SW" },
  { code: "NG-EN", name: "Enugu", zone: "NG-Z-SE" },
  { code: "NG-FC", name: "Federal Capital Territory", zone: "NG-Z-NC" },
  { code: "NG-GO", name: "Gombe", zone: "NG-Z-NE" },
  { code: "NG-IM", name: "Imo", zone: "NG-Z-SE" },
  { code: "NG-JI", name: "Jigawa", zone: "NG-Z-NW" },
  { code: "NG-KD", name: "Kaduna", zone: "NG-Z-NW" },
  { code: "NG-KN", name: "Kano", zone: "NG-Z-NW" },
  { code: "NG-KT", name: "Katsina", zone: "NG-Z-NW" },
  { code: "NG-KE", name: "Kebbi", zone: "NG-Z-NW" },
  { code: "NG-KO", name: "Kogi", zone: "NG-Z-NC" },
  { code: "NG-KW", name: "Kwara", zone: "NG-Z-NC" },
  { code: "NG-LA", name: "Lagos", zone: "NG-Z-SW" },
  { code: "NG-NA", name: "Nasarawa", zone: "NG-Z-NC" },
  { code: "NG-NI", name: "Niger", zone: "NG-Z-NC" },
  { code: "NG-OG", name: "Ogun", zone: "NG-Z-SW" },
  { code: "NG-ON", name: "Ondo", zone: "NG-Z-SW" },
  { code: "NG-OS", name: "Osun", zone: "NG-Z-SW" },
  { code: "NG-OY", name: "Oyo", zone: "NG-Z-SW" },
  { code: "NG-PL", name: "Plateau", zone: "NG-Z-NC" },
  { code: "NG-RI", name: "Rivers", zone: "NG-Z-SS" },
  { code: "NG-SO", name: "Sokoto", zone: "NG-Z-NW" },
  { code: "NG-TA", name: "Taraba", zone: "NG-Z-NE" },
  { code: "NG-YO", name: "Yobe", zone: "NG-Z-NE" },
  { code: "NG-ZA", name: "Zamfara", zone: "NG-Z-NW" },
];

export const NATION_CODE = "NG";
export const NATION_NAME = "Nigeria";

/** LGA codes are `${stateCode}-${slug}` (e.g. NG-KN-GWALE); ward codes append `-W<nn>`. */
export const lgaCode = (stateCode: string, lgaSlug: string) =>
  `${stateCode}-${lgaSlug.toUpperCase()}`;
