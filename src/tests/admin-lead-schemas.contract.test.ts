// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §2.4
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §13
//
// Contract drift test — defends the wrapper-module decision (web admin
// owns its own copy of the four mobile Zod schemas) by importing BOTH
// the web copy AND the mobile original at vitest runtime and asserting
// equivalent accept/reject across a fixture set.
//
// Vitest doesn't honour the web tsconfig's `exclude: ["mobile"]`; that
// only affects type-checking. The relative import below pulls
// `mobile/src/lib/schemas.ts` into the test bundle (NOT the web
// production bundle) so the two copies can be compared side-by-side.
//
// Failure mode: a shape change to `mobile/src/lib/schemas.ts` that
// isn't mirrored in `src/lib/admin/lead-schemas.ts` flips one of the
// `expect(webResult.success).toBe(mobileResult.success)` assertions.
// Fix is always the same: port the diff into the web copy.

import { describe, it, expect, vi, beforeAll } from 'vitest';

// The mobile schemas module imports `@/constants/contracts` — that
// `@/` alias is mobile-tsconfig-scoped and resolves to a file outside
// the web bundle. Mocking the alias for THIS test file (vi.mock is
// hoisted by vitest) lets the mobile schemas load with the constants
// they need without polluting the global vitest alias map. The
// stubbed values mirror the production constants verbatim — drift in
// the constants file would NOT be caught by this test, but Spec 76
// only requires schema-shape parity which is what we cover here.
vi.mock('@/constants/contracts', () => ({
  CONTRACTS: {
    feed: { max_limit: 30 },
    geo: { max_radius_km: 50 },
    schema: {
      firebase_uid_max: 128,
      trade_slug_max: 50,
      permit_num_max: 30,
      revision_num_max: 10,
    },
  },
}));

// Web admin copy (the file under test).
import * as webSchemas from '@/lib/admin/lead-schemas';
// Mobile original (canonical source-of-truth; see Spec 76 §2.4) is
// loaded via dynamic import inside beforeAll. Static `import` would
// trigger tsc to type-check `mobile/src/lib/schemas.ts` against the
// web tsconfig — that file imports `@/constants/contracts` (mobile
// alias), which the web tsconfig can't resolve. Dynamic import keeps
// the path as a runtime string, bypassing tsc's eager trace; vitest +
// the vi.mock above handle resolution at test-run time.
// Lazy-loaded inside beforeAll because the static-import path would
// trigger tsc trace through `@/constants/contracts` (mobile alias).
type MobileSchemaMap = {
  FlightBoardItemSchema: ZodLike;
  FlightBoardResultSchema: ZodLike;
  FlightBoardDetailSchema: ZodLike;
  LeadDetailSchema: ZodLike;
  SearchResultItemSchema: ZodLike;
  SearchResultSchema: ZodLike;
};
let mobileSchemas: MobileSchemaMap;

// Structural type that matches both web zod v3 and mobile zod v4 (the
// two installs are nominally incompatible — different node_modules,
// different minor — but `.safeParse` is identical on both). Cycle 4
// pinning either side is out of scope; the structural type bypasses
// the nominal mismatch without `@ts-ignore` pollution.
interface ZodLike {
  safeParse(input: unknown): SafeParseLike;
}

interface SafeParseLike {
  success: boolean;
  error?: { issues: ReadonlyArray<unknown> };
}

interface SchemaPair {
  /** Schema name for assertion failure context. */
  name: string;
  web: ZodLike;
  mobile: ZodLike;
}

// Built inside beforeAll once `mobileSchemas` resolves; queried by name
// inside each test via `pairFor(name)`.
let SCHEMA_PAIRS: SchemaPair[] = [];

function pairFor(name: string): SchemaPair {
  const pair = SCHEMA_PAIRS.find((p) => p.name === name);
  if (!pair) throw new Error(`unknown schema pair: ${name}`);
  return pair;
}

// ---------------------------------------------------------------------------
// Fixtures — minimal valid + assorted invalid payloads per shape.
// Each schema gets one canonical-valid baseline and a set of mutations
// that should reject (extra trips through both schemas verify identical
// rejection at the field level).
// ---------------------------------------------------------------------------

const VALID_FLIGHT_BOARD_ITEM = {
  permit_num: '20-101234',
  revision_num: '00',
  address: '123 Queen St W',
  lifecycle_phase: 'permit-issued',
  lifecycle_stalled: false,
  predicted_start: '2026-06-15',
  p25_days: 30,
  p75_days: 60,
  temporal_group: 'action_required',
  updated_at: '2026-05-06T12:00:00Z',
};

const VALID_LEAD_DETAIL = {
  lead_id: '20-101234--00',
  lead_type: 'permit',
  permit_num: '20-101234',
  revision_num: '00',
  address: '123 Queen St W',
  location: { lat: 43.6532, lng: -79.3832 },
  work_description: 'New build',
  applicant: 'Acme Construction',
  lifecycle_phase: 'permit-issued',
  lifecycle_stalled: false,
  target_window: 'work',
  opportunity_score: 0.82,
  competition_count: 3,
  predicted_start: '2026-06-15',
  p25_days: 30,
  p75_days: 60,
  cost: {
    estimated: 250000,
    tier: 'mid',
    range_low: 200000,
    range_high: 300000,
    modeled_gfa_sqm: 180.5,
  },
  neighbourhood: {
    name: 'Queen West',
    avg_household_income: 95000,
    median_household_income: 82000,
    period_of_construction: '1900-1945',
  },
  updated_at: '2026-05-06T12:00:00Z',
  is_saved: false,
};

const VALID_SEARCH_RESULT_ITEM = {
  permit_num: '20-101234',
  revision_num: '00',
  address: '123 Queen St W',
  lifecycle_phase: 'permit-issued',
  status: 'open',
};

interface DriftFixture {
  /** Schema-pair name (matches SCHEMA_PAIRS[i].name). */
  schema: string;
  /** Description for the failure message. */
  label: string;
  /** Payload to feed both schemas. */
  payload: unknown;
  /** Expected outcome — drift = mismatch between the two schemas. */
  expectSuccess: boolean;
}

const FIXTURES: DriftFixture[] = [
  // FlightBoardItem — happy path + key shape mutations.
  { schema: 'FlightBoardItem', label: 'valid baseline', payload: VALID_FLIGHT_BOARD_ITEM, expectSuccess: true },
  {
    schema: 'FlightBoardItem',
    label: 'missing required permit_num',
    payload: { ...VALID_FLIGHT_BOARD_ITEM, permit_num: undefined },
    expectSuccess: false,
  },
  {
    schema: 'FlightBoardItem',
    label: 'temporal_group out of enum',
    payload: { ...VALID_FLIGHT_BOARD_ITEM, temporal_group: 'someday' },
    expectSuccess: false,
  },
  {
    schema: 'FlightBoardItem',
    label: 'lifecycle_stalled wrong type',
    payload: { ...VALID_FLIGHT_BOARD_ITEM, lifecycle_stalled: 'no' },
    expectSuccess: false,
  },
  {
    schema: 'FlightBoardItem',
    label: 'predicted_start nullable accepts null',
    payload: { ...VALID_FLIGHT_BOARD_ITEM, predicted_start: null },
    expectSuccess: true,
  },

  // FlightBoardDetail — alias of FlightBoardItem; sanity-check the alias
  // wasn't accidentally narrowed in the web copy.
  { schema: 'FlightBoardDetail', label: 'valid baseline', payload: VALID_FLIGHT_BOARD_ITEM, expectSuccess: true },

  // FlightBoardResult — envelope shape.
  {
    schema: 'FlightBoardResult',
    label: 'valid envelope',
    payload: { data: [VALID_FLIGHT_BOARD_ITEM] },
    expectSuccess: true,
  },
  {
    schema: 'FlightBoardResult',
    label: 'envelope without data',
    payload: {},
    expectSuccess: false,
  },

  // LeadDetail — happy path + 4 mutations covering nested + scalar fields.
  { schema: 'LeadDetail', label: 'valid baseline', payload: VALID_LEAD_DETAIL, expectSuccess: true },
  {
    schema: 'LeadDetail',
    label: 'lead_type out of enum',
    payload: { ...VALID_LEAD_DETAIL, lead_type: 'inspection' },
    expectSuccess: false,
  },
  {
    schema: 'LeadDetail',
    label: 'competition_count negative',
    payload: { ...VALID_LEAD_DETAIL, competition_count: -1 },
    expectSuccess: false,
  },
  {
    schema: 'LeadDetail',
    label: 'cost block nullable accepts null',
    payload: { ...VALID_LEAD_DETAIL, cost: null },
    expectSuccess: true,
  },
  {
    schema: 'LeadDetail',
    label: 'is_saved missing',
    payload: { ...VALID_LEAD_DETAIL, is_saved: undefined },
    expectSuccess: false,
  },

  // SearchResultItem — happy path + mutation.
  { schema: 'SearchResultItem', label: 'valid baseline', payload: VALID_SEARCH_RESULT_ITEM, expectSuccess: true },
  {
    schema: 'SearchResultItem',
    label: 'permit_num wrong type',
    payload: { ...VALID_SEARCH_RESULT_ITEM, permit_num: 12345 },
    expectSuccess: false,
  },

  // SearchResult — envelope.
  {
    schema: 'SearchResult',
    label: 'valid envelope',
    payload: { data: [VALID_SEARCH_RESULT_ITEM] },
    expectSuccess: true,
  },
];

describe('lead-schemas contract — web copy vs mobile original', () => {
  beforeAll(async () => {
    // Path stored in a variable so tsc treats `import()` as opaque and
    // doesn't trace into mobile schemas (which import an alias outside
    // the web tsconfig). Vitest resolves the string at runtime.
    const mobileSchemasPath = '../../mobile/src/lib/schemas';
    const loaded = (await import(/* @vite-ignore */ mobileSchemasPath)) as unknown as MobileSchemaMap;
    mobileSchemas = loaded;
    SCHEMA_PAIRS = [
      { name: 'FlightBoardItem', web: webSchemas.FlightBoardItemSchema, mobile: mobileSchemas.FlightBoardItemSchema },
      { name: 'FlightBoardResult', web: webSchemas.FlightBoardResultSchema, mobile: mobileSchemas.FlightBoardResultSchema },
      { name: 'FlightBoardDetail', web: webSchemas.FlightBoardDetailSchema, mobile: mobileSchemas.FlightBoardDetailSchema },
      { name: 'LeadDetail', web: webSchemas.LeadDetailSchema, mobile: mobileSchemas.LeadDetailSchema },
      { name: 'SearchResultItem', web: webSchemas.SearchResultItemSchema, mobile: mobileSchemas.SearchResultItemSchema },
      { name: 'SearchResult', web: webSchemas.SearchResultSchema, mobile: mobileSchemas.SearchResultSchema },
    ];
  });

  it.each(FIXTURES)(
    '$schema · $label — both schemas agree (success: $expectSuccess)',
    ({ schema, payload, expectSuccess }) => {
      const pair = pairFor(schema);
      const webResult = pair.web.safeParse(payload);
      const mobileResult = pair.mobile.safeParse(payload);

      // Drift assertion — the two schemas MUST agree on accept/reject for
      // the same payload. A failure here means the mobile schema diverged
      // from the web copy (or vice versa); fix by porting the diff.
      expect(webResult.success).toBe(mobileResult.success);
      expect(webResult.success).toBe(expectSuccess);
    },
  );

  // The error-issue-count check is the second-line drift defense — a
  // mutation that fails BOTH schemas should fail with the same number
  // of issues. A subtle drift (web schema added a stricter validator
  // that mobile doesn't have) shows up here even when both still reject.
  it.each(FIXTURES.filter((f) => !f.expectSuccess))(
    '$schema · $label — drift defense: both schemas surface the same issue count',
    ({ schema, payload }) => {
      const pair = pairFor(schema);
      const webResult = pair.web.safeParse(payload);
      const mobileResult = pair.mobile.safeParse(payload);
      // Both rejected — assert the rejection structure matches.
      if (!webResult.success && !mobileResult.success) {
        const webIssues = webResult.error?.issues ?? [];
        const mobileIssues = mobileResult.error?.issues ?? [];
        expect(webIssues.length).toBe(mobileIssues.length);
      }
    },
  );
});
