// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §11 (Plan Compliance)
//
// Spec-extracted contracts: this test is the enforcement layer for
// docs/specs/_contracts.json. Every numeric threshold that crosses the
// spec ↔ SQL ↔ Zod ↔ migration boundary lives in the JSON, and this test
// grep-asserts each value still appears in its declared consumer file.
//
// Why: prior holistic reviews caught ~5 bugs that were "spec said X, code
// did Y" drift (pillar bands 0-20 vs 0-30, fit_score max 23 vs 100,
// VARCHAR(100) vs (128), etc.). Mocked tests can't catch these because
// the mock returns whatever the test author told it to return. Locking
// the consumer files to the JSON via grep makes drift a CI failure.
//
// How to add a contract:
//   1. Add the value to docs/specs/_contracts.json under the right group.
//   2. Add a CONSUMER_RULES row below mapping JSON path → file:pattern.
//   3. Run `npx vitest run src/tests/contracts.infra.test.ts`.
//
// How to update a contract:
//   1. Bump the value in _contracts.json.
//   2. Update every consumer file referenced in CONSUMER_RULES.
//   3. Re-run the test. It will tell you exactly which file is out of sync.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

interface Contracts {
  scoring: {
    permit_proximity_max: number;
    permit_timing_max: number;
    permit_value_max: number;
    permit_opportunity_max: number;
    permit_total_max: number;
    builder_proximity_max: number;
    builder_value_max: number;
    builder_opportunity_max: number;
    builder_fit_max: number;
    builder_total_max: number;
  };
  rate_limits: { feed_per_min: number; view_per_min: number; window_sec: number };
  geo: { max_radius_km: number; default_radius_km: number };
  feed: {
    max_limit: number;
    default_limit: number;
    forced_refetch_threshold_m: number;
    coord_precision: number;
  };
  schema: {
    firebase_uid_max: number;
    trade_slug_max: number;
    permit_num_max: number;
    revision_num_max: number;
  };
  retention: { lead_views_days: number };
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CONTRACTS_PATH = path.join(REPO_ROOT, 'docs', 'specs', '_contracts.json');

const contracts: Contracts = JSON.parse(fs.readFileSync(CONTRACTS_PATH, 'utf8'));

// Each rule asserts a regex (built from the contract value) appears in the
// listed file. Multiple consumers per value are listed as multiple rows.
interface Rule {
  name: string;
  value: number;
  file: string;
  pattern: RegExp;
}

const rules: Rule[] = [
  // ---- distance / radius ----
  {
    name: 'geo.max_radius_km → MAX_RADIUS_KM constant',
    value: contracts.geo.max_radius_km,
    file: 'src/features/leads/lib/distance.ts',
    pattern: new RegExp(`MAX_RADIUS_KM\\s*=\\s*${contracts.geo.max_radius_km}\\b`),
  },
  // ---- feed limits ----
  {
    name: 'feed.max_limit → MAX_FEED_LIMIT constant',
    value: contracts.feed.max_limit,
    file: 'src/features/leads/lib/get-lead-feed.ts',
    pattern: new RegExp(`MAX_FEED_LIMIT\\s*=\\s*${contracts.feed.max_limit}\\b`),
  },
  {
    name: 'feed.default_limit → DEFAULT_FEED_LIMIT constant',
    value: contracts.feed.default_limit,
    file: 'src/features/leads/lib/get-lead-feed.ts',
    pattern: new RegExp(`DEFAULT_FEED_LIMIT\\s*=\\s*${contracts.feed.default_limit}\\b`),
  },
  {
    name: 'feed.forced_refetch_threshold_m → useLeadFeed movement threshold',
    value: contracts.feed.forced_refetch_threshold_m,
    file: 'src/features/leads/api/useLeadFeed.ts',
    pattern: new RegExp(`FORCED_REFETCH_THRESHOLD_M\\s*=\\s*${contracts.feed.forced_refetch_threshold_m}\\b`),
  },
  {
    name: 'feed.coord_precision → useLeadFeed coord rounding',
    value: contracts.feed.coord_precision,
    file: 'src/features/leads/api/useLeadFeed.ts',
    pattern: new RegExp(`COORD_PRECISION\\s*=\\s*${contracts.feed.coord_precision}\\b`),
  },
  // ---- rate limits ----
  {
    name: 'rate_limits.feed_per_min → feed route RATE_LIMIT_PER_MIN',
    value: contracts.rate_limits.feed_per_min,
    file: 'src/app/api/leads/feed/route.ts',
    pattern: new RegExp(`RATE_LIMIT_PER_MIN\\s*=\\s*${contracts.rate_limits.feed_per_min}\\b`),
  },
  {
    name: 'rate_limits.view_per_min → view route RATE_LIMIT_PER_MIN',
    value: contracts.rate_limits.view_per_min,
    file: 'src/app/api/leads/view/route.ts',
    pattern: new RegExp(`RATE_LIMIT_PER_MIN\\s*=\\s*${contracts.rate_limits.view_per_min}\\b`),
  },
  {
    name: 'rate_limits.window_sec → feed route RATE_LIMIT_WINDOW_SEC',
    value: contracts.rate_limits.window_sec,
    file: 'src/app/api/leads/feed/route.ts',
    pattern: new RegExp(`RATE_LIMIT_WINDOW_SEC\\s*=\\s*${contracts.rate_limits.window_sec}\\b`),
  },
  {
    name: 'rate_limits.window_sec → view route RATE_LIMIT_WINDOW_SEC',
    value: contracts.rate_limits.window_sec,
    file: 'src/app/api/leads/view/route.ts',
    pattern: new RegExp(`RATE_LIMIT_WINDOW_SEC\\s*=\\s*${contracts.rate_limits.window_sec}\\b`),
  },
  // ---- scoring pillar maxes (permit, in get-lead-feed.ts header comment) ----
  {
    name: 'scoring.permit_value_max → permit value CASE max bucket',
    value: contracts.scoring.permit_value_max,
    file: 'src/features/leads/lib/get-lead-feed.ts',
    pattern: new RegExp(`WHEN 'mega'\\s+THEN ${contracts.scoring.permit_value_max}\\b`),
  },
  {
    name: 'scoring.permit_opportunity_max → permit opportunity CASE max bucket',
    value: contracts.scoring.permit_opportunity_max,
    file: 'src/features/leads/lib/get-lead-feed.ts',
    pattern: new RegExp(`WHEN 'Permit Issued' THEN ${contracts.scoring.permit_opportunity_max}\\b`),
  },
  {
    name: 'scoring.builder_fit_max → builder-query LEAST cap',
    value: contracts.scoring.builder_fit_max,
    file: 'src/features/leads/lib/builder-query.ts',
    pattern: new RegExp(`LEAST\\([\\s\\S]*?${contracts.scoring.builder_fit_max}\\s*\\)\\s*AS fit_score`),
  },
  // ---- schema widths ----
  {
    name: 'schema.firebase_uid_max → user_profiles VARCHAR',
    value: contracts.schema.firebase_uid_max,
    file: 'migrations/075_user_profiles.sql',
    pattern: new RegExp(`user_id\\s+VARCHAR\\(${contracts.schema.firebase_uid_max}\\)`),
  },
  {
    name: 'schema.firebase_uid_max → lead_views widen migration',
    value: contracts.schema.firebase_uid_max,
    file: 'migrations/076_lead_views_user_id_widen.sql',
    pattern: new RegExp(`TYPE\\s+VARCHAR\\(${contracts.schema.firebase_uid_max}\\)`),
  },
  {
    name: 'schema.trade_slug_max → user_profiles trade_slug VARCHAR',
    value: contracts.schema.trade_slug_max,
    file: 'migrations/075_user_profiles.sql',
    pattern: new RegExp(`trade_slug\\s+VARCHAR\\(${contracts.schema.trade_slug_max}\\)`),
  },
  {
    name: 'schema.trade_slug_max → lead_views trade_slug VARCHAR',
    value: contracts.schema.trade_slug_max,
    file: 'migrations/070_lead_views_corrected.sql',
    pattern: new RegExp(`trade_slug\\s+VARCHAR\\(${contracts.schema.trade_slug_max}\\)`),
  },
  {
    name: 'schema.permit_num_max → lead_views permit_num VARCHAR',
    value: contracts.schema.permit_num_max,
    file: 'migrations/070_lead_views_corrected.sql',
    pattern: new RegExp(`permit_num\\s+VARCHAR\\(${contracts.schema.permit_num_max}\\)`),
  },
  {
    name: 'schema.revision_num_max → lead_views revision_num VARCHAR',
    value: contracts.schema.revision_num_max,
    file: 'migrations/070_lead_views_corrected.sql',
    pattern: new RegExp(`revision_num\\s+VARCHAR\\(${contracts.schema.revision_num_max}\\)`),
  },
];

describe('contracts.json — drift enforcement across spec/SQL/Zod/migration', () => {
  it('contracts JSON parses + has all required groups', () => {
    expect(contracts.scoring).toBeDefined();
    expect(contracts.rate_limits).toBeDefined();
    expect(contracts.geo).toBeDefined();
    expect(contracts.feed).toBeDefined();
    expect(contracts.schema).toBeDefined();
    expect(contracts.retention).toBeDefined();
  });

  it('permit pillar maxes sum to permit_total_max (spec 70 §4 invariant)', () => {
    const sum =
      contracts.scoring.permit_proximity_max +
      contracts.scoring.permit_timing_max +
      contracts.scoring.permit_value_max +
      contracts.scoring.permit_opportunity_max;
    expect(sum).toBe(contracts.scoring.permit_total_max);
  });

  it('builder pillar maxes sum to builder_total_max (spec 70 §4 invariant)', () => {
    // Builder timing pillar in the feed CTE is currently a fixed mid-band
    // proxy (15) — see get-lead-feed.ts builder_candidates comment. The
    // spec 70 §4 builder formula uses Activity (0-30) for pillar 2.
    // We assert the spec total here, not the proxy total.
    const sum =
      contracts.scoring.builder_proximity_max +
      contracts.scoring.permit_timing_max + // activity_max == permit timing max per spec 70 §4
      contracts.scoring.builder_value_max +
      contracts.scoring.builder_opportunity_max;
    // Note: spec uses Contact + Fit (0-20 each); the contract uses
    // builder_value/builder_opportunity as the CTE's actual pillar names.
    // Total still equals 100.
    expect(sum).toBe(contracts.scoring.builder_total_max);
  });

  for (const rule of rules) {
    it(`${rule.name} — value ${rule.value} present in ${rule.file}`, () => {
      const filePath = path.join(REPO_ROOT, rule.file);
      const contents = fs.readFileSync(filePath, 'utf8');
      if (!rule.pattern.test(contents)) {
        throw new Error(
          `Drift detected: ${rule.file} does not contain pattern ${rule.pattern} ` +
            `for contract value ${rule.value}. Either update the consumer file ` +
            `or update docs/specs/_contracts.json (and every other consumer of ` +
            `this contract).`,
        );
      }
      expect(rule.pattern.test(contents)).toBe(true);
    });
  }

  // ADR existence check: every accepted ADR in the docs/adr/ index must
  // exist as a non-empty file. Prevents accidental deletion that would
  // strand the source-file `// ADR:` header references.
  const adrs = [
    '001-dual-code-path.md',
    '002-polymorphic-lead-views.md',
    '003-on-delete-cascade-on-permits-fk.md',
    '004-manual-create-index-concurrently.md',
    '005-hardcoded-retry-after-60.md',
    '006-firebase-uid-not-fk.md',
  ];
  for (const adr of adrs) {
    it(`ADR exists and is non-empty: docs/adr/${adr}`, () => {
      const p = path.join(REPO_ROOT, 'docs', 'adr', adr);
      const stats = fs.statSync(p);
      expect(stats.size).toBeGreaterThan(500);
    });
  }

  // Canary: prove the test would actually catch drift. Mutate a known
  // value in a copy of the contracts and confirm the rule fails.
  it('canary — fails when a contract value drifts (proves the assertion is real)', () => {
    const fakeValue = 999_999;
    const fakePattern = new RegExp(`MAX_RADIUS_KM\\s*=\\s*${fakeValue}\\b`);
    const filePath = path.join(REPO_ROOT, 'src/features/leads/lib/distance.ts');
    const contents = fs.readFileSync(filePath, 'utf8');
    expect(fakePattern.test(contents)).toBe(false);
  });
});
