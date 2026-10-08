import type { ConnectorAdapter } from "../../types";

/**
 * Real World Bank API driver.
 * IMPLEMENTATION NOTE (per spec): check current docs at
 * https://datahelpdesk.worldbank.org/knowledgebase/articles/889392 before
 * implementing. Nigeria series: /v2/country/NGA/indicator/<code>?format=json.
 */
export const realWorldBankConnector: ConnectorAdapter = {
  async run() {
    throw new Error(
      "Real World Bank connector not implemented yet — see src/adapters/connectors/worldbank/real.ts",
    );
  },
};
