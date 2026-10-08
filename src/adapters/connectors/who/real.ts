import type { ConnectorAdapter } from "../../types";

/**
 * Real WHO Global Health Observatory OData API driver.
 * IMPLEMENTATION NOTE (per spec): check current docs at
 * https://www.who.int/data/gho/info/gho-odata-api before implementing.
 * Values for Nigeria filter: $filter=SpatialDim eq 'NGA'.
 */
export const realWhoConnector: ConnectorAdapter = {
  async run() {
    throw new Error(
      "Real WHO connector not implemented yet — see src/adapters/connectors/who/real.ts",
    );
  },
};
