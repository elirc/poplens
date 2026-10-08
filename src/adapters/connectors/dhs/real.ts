import type { ConnectorAdapter } from "../../types";

/**
 * Real DHS Program indicator API driver.
 * IMPLEMENTATION NOTE (per spec): before implementing, check the current API
 * documentation at https://api.dhsprogram.com/#/index.html for endpoint and
 * field names — do not guess. Nigeria country code 'NG'; subnational values
 * use breakdown=subnational. The HDX mirror of Nigeria's subnational DHS
 * indicators is the documented fallback if the API is unreachable.
 */
export const realDhsConnector: ConnectorAdapter = {
  async run() {
    throw new Error(
      "Real DHS connector not implemented yet — see src/adapters/connectors/dhs/real.ts",
    );
  },
};
