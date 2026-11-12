// SPEC LINK: docs/specs/02-web-admin/34_web_admin_testing_protocol.md §3 (dated note 2026-11-12, McTest), FE-40.
//
// MF-79 · McTest web runner (D-5 a: playwright/test from the installed playwright package, no new package).
// The app always runs against the separate test stack (D-1 a) or against NO database: never the dev DB on 54322.
// - test stack set (scripts/mctest/lib.cjs testStack ok): the app's DB and sign-in point at it; Upstash unset (local limiter).
// - test stack absent: DATABASE_URL points at a closed local port, so nothing can be read or written; only the
//   anonymous runs execute and every signed-in run is SKIP with the reason.
import { defineConfig } from "playwright/test";
import { testStack } from "./scripts/mctest/lib.cjs";

const PORT = Number(process.env.MCTEST_PORT ?? 3100);
const stack = testStack(process.env);
const NO_DB = "postgres://mctest@127.0.0.1:9/mctest_no_db";
const NO_AUTH = "http://127.0.0.1:9"; // a closed local port: no sign-in service, every visitor is anonymous

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    screenshot: "only-on-failure",
    // maxbld.ca resolves to the local app, so the host table (src/lib/auth/host-policy.ts) serves the MaxBLD pages.
    launchOptions: {
      args: [`--host-resolver-rules=MAP maxbld.ca 127.0.0.1:${PORT}`],
    },
  },
  ...(process.env.MCTEST_RUN_DIR
    ? { outputDir: `${process.env.MCTEST_RUN_DIR}/artifacts` }
    : {}),
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/parcels/entitlement`, // ready = the app answers (401 anonymous); never a page, so a page that fails to compile is a crawler finding, not a hang
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: stack.ok ? String(process.env.MCTEST_DATABASE_URL) : NO_DB,
      SUPABASE_DATABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_URL: stack.ok
        ? String(process.env.MCTEST_SUPABASE_URL)
        : NO_AUTH,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: stack.ok
        ? String(process.env.MCTEST_SUPABASE_ANON_KEY ?? "")
        : "mctest-no-auth",
      SUPABASE_SECRET_KEY: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      DEV_MODE: "false",
      NEXT_PUBLIC_DEV_MODE: "false",
    },
  },
});
