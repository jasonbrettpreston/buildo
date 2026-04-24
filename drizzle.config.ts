import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: './src/lib/db/generated',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:@localhost:5432/buildo',
  },
  // Exclude PostGIS-owned system tables/views that drizzle-kit can't
  // parse cleanly. These are provided by the postgis extension itself
  // (not by our migrations) and carry columns with pg's `name` type
  // which drizzle-kit emits as `unknown(...)` — uncompilable TypeScript.
  // We don't reference these from src/ code; the filter prevents the
  // broken codegen from polluting the generated schema. WF3 2026-04-11
  // migration 083.
  tablesFilter: [
    '!geometry_columns',
    '!geography_columns',
    '!spatial_ref_sys',
    // pg_stat_statements views carry `oid` columns that drizzle-kit emits as
    // `unknown(...)` — uncompilable TypeScript. We query these via raw SQL in
    // observe-chain.js only; no TS code references them. WF2 2026-04-24 migration 109.
    '!pg_stat_statements',
    '!pg_stat_statements_info',
  ],
});
