import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5541/poplens_dev",
  },
  // PostGIS maintains its own tables/views; keep drizzle away from them.
  tablesFilter: ["!spatial_ref_sys", "!geography_columns", "!geometry_columns"],
});
