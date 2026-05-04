// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §Implementation
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import {
  LEAD_FEED_SQL,
  MAX_FEED_LIMIT,
  TIMING_DISPLAY_BY_CONFIDENCE,
  getLeadFeed,
} from '@/features/leads/lib/get-lead-feed';
import { MAX_RADIUS_KM, metersFromKilometers } from '@/features/leads/lib/distance';
import type { LeadFeedInput } from '@/features/leads/types';

interface MockPool {
  query: ReturnType<typeof vi.fn>;
}

function createMockPool(): MockPool {
  return { query: vi.fn() };
}

function qr<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// SQL structure assertions
// ---------------------------------------------------------------------------

describe('LEAD_FEED_SQL — structure', () => {
  it('contains all 4 CTEs', () => {
    expect(LEAD_FEED_SQL).toMatch(/permit_candidates AS/);
    expect(LEAD_FEED_SQL).toMatch(/builder_candidates AS/);
    expect(LEAD_FEED_SQL).toMatch(/unified AS/);
    expect(LEAD_FEED_SQL).toMatch(/ranked AS/);
  });

  it('uses UNION ALL between candidate CTEs', () => {
    expect(LEAD_FEED_SQL).toMatch(/UNION ALL/);
  });

  it('contains all 4 score pillars in both candidates', () => {
    // Each pillar appears in both permit_candidates and builder_candidates
    expect((LEAD_FEED_SQL.match(/proximity_score/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((LEAD_FEED_SQL.match(/timing_score/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((LEAD_FEED_SQL.match(/value_score/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((LEAD_FEED_SQL.match(/opportunity_score/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('computes relevance_score as sum of 4 pillars in ranked CTE', () => {
    expect(LEAD_FEED_SQL).toMatch(
      /\(proximity_score \+ timing_score \+ value_score \+ opportunity_score\) AS relevance_score/,
    );
  });

  it('uses cursor pagination via row tuple comparison', () => {
    // WF3 follow-up 2026-05-04: the cursor lead_id is now wrapped in a
    // CASE+LPAD for builder cursors (backward-compat with pre-deploy
    // clients that hold bare-int cursors like "9"). Permit cursors
    // pass through `$8::text` unchanged — see the dedicated
    // backward-compat test below for the CASE assertion.
    expect(LEAD_FEED_SQL).toMatch(
      /\$6::int IS NULL OR\s*\(relevance_score, lead_type, lead_id\) <\s*\(\$6::int, \$7::text,/,
    );
  });

  it('cursor lead_id is wrapped in CASE+LPAD for builder cursors (WF3 follow-up backward-compat)', () => {
    // Pre-deploy clients hold cursors with bare-int builder lead_ids
    // (e.g. "9"). Phase 6 (commit fefc2a3) switched the projection to
    // LPAD'd format. Without this CASE, a pre-deploy cursor would
    // compare lex order "00..09" < "9" === true and re-page through
    // all builders from the top → duplicate rows in the user's feed at
    // every deploy. The CASE LPAD's the incoming $8 only when the
    // cursor's lead_type is 'builder'; permit cursors are unchanged.
    expect(LEAD_FEED_SQL).toMatch(
      /CASE WHEN \$7::text = 'builder' THEN LPAD\(\$8::text, 20, '0'\) ELSE \$8::text END/,
    );
  });

  it('orders by relevance_score DESC, lead_type DESC, lead_id DESC', () => {
    expect(LEAD_FEED_SQL).toMatch(
      /ORDER BY relevance_score DESC, lead_type DESC, lead_id DESC/,
    );
  });

  it('normalizes permit lead_id via LPAD(revision_num, 2, 0) to collapse DB "0"/"00" drift', () => {
    // Phase 0/1/2 holistic review finding: DB has both '0' and '00' as
    // revision_num values. Without padding, two ingest paths can produce
    // different lead_keys for the same permit revision, breaking
    // competition count dedup and cursor identity.
    expect(LEAD_FEED_SQL).toMatch(
      /permit_num \|\| ':' \|\| LPAD\(p\.revision_num, 2, '0'\)/,
    );
  });

  it('LPADs builder lead_id to 20 chars for numeric-correct cursor sort (WF3 review_followups.md:230)', () => {
    // Pre-WF3 the projection was bare `e.id::text AS lead_id`, which
    // sorts lexicographically: '9' > '10' > '100'. Cursor pagination
    // on relevance ties would silently skip past builders '10..89'
    // when page 1 ended at builder '9'. LPAD to 20 chars (covers any
    // PostgreSQL int8) makes the text comparison numerically correct.
    expect(LEAD_FEED_SQL).toMatch(/LPAD\(e\.id::text, 20, '0'\) AS lead_id/);
    // The legacy bare cast is gone:
    expect(LEAD_FEED_SQL).not.toMatch(/^\s*e\.id::text AS lead_id\b/m);
  });

  it('permit pillar boundaries match spec 70 §4 (value 0-20, opportunity 0-20)', () => {
    // Rescaled from pre-review drafts (value 0-30, opportunity 0-10) to
    // honor the per-pillar contract in spec 70 §4 lines 234-235. The
    // aggregate relevance_score ceiling is still 100 (30+30+20+20).
    expect(LEAD_FEED_SQL).toMatch(/WHEN 'mega'\s+THEN 20/);
    expect(LEAD_FEED_SQL).toMatch(/WHEN 'Permit Issued' THEN 20/);
    // The obsolete 0-30/0-10 bands must NOT reappear.
    expect(LEAD_FEED_SQL).not.toMatch(/WHEN 'mega'\s+THEN 30/);
    expect(LEAD_FEED_SQL).not.toMatch(/WHEN 'Permit Issued' THEN 10/);
  });

  it('limits via $5::int parameter', () => {
    expect(LEAD_FEED_SQL).toMatch(/LIMIT \$5::int/);
  });

  it('joins to trades table by trade_id and filters by t.slug (NOT pt.trade_slug — that column does not exist on permit_trades)', () => {
    // Regression: an earlier draft used `pt.trade_slug = $1` which would
    // fail at runtime because permit_trades has `trade_id INTEGER` only.
    // Caught by the holistic Phase 1 review.
    expect(LEAD_FEED_SQL).toMatch(/JOIN trades t ON t\.id = pt\.trade_id/);
    expect(LEAD_FEED_SQL).toMatch(/t\.slug = \$1/);
    expect(LEAD_FEED_SQL).not.toMatch(/pt\.trade_slug/);
  });

  it('filters permits by is_active + confidence >= 0.5', () => {
    expect(LEAD_FEED_SQL).toMatch(/pt\.is_active = true/);
    expect((LEAD_FEED_SQL.match(/pt\.confidence >= 0\.5/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('excludes cancelled / revoked / closed permits', () => {
    expect(LEAD_FEED_SQL).toMatch(
      /p\.status NOT IN \('Cancelled', 'Revoked', 'Closed'\)/,
    );
  });

  it('uses ST_DWithin in both candidate CTEs', () => {
    expect((LEAD_FEED_SQL.match(/ST_DWithin\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('explicitly casts p.location to ::geography for meter-based distance (NOT degree-based)', () => {
    // Regression: spec 70 unified feed expects radius_km in METERS via ST_DWithin
    // and `<->`. The column is stored as `geometry(Point, 4326)` (migration 067)
    // for GIST index compatibility, but distance math must be meters. Without
    // an explicit `::geography` cast on `p.location`, PostGIS might resolve to
    // the geometry overload of ST_DWithin/`<->` and interpret radius_m as
    // DEGREES (1 degree ≈ 111km). Caught by Gemini Phase 0+1 holistic review.
    expect(LEAD_FEED_SQL).toMatch(/p\.location::geography/);
    // Should NOT have any bare `p.location` distance expressions
    expect(LEAD_FEED_SQL).not.toMatch(/p\.location <->/);
    expect(LEAD_FEED_SQL).not.toMatch(/ST_DWithin\(p\.location,/);
  });

  it('filters builder candidates by WSIB business_size allowlist', () => {
    expect(LEAD_FEED_SQL).toMatch(/business_size IN \('Small Business', 'Medium Business'\)/);
  });

  // ---- Phase 3-iii widened SELECTs ----
  it('joins permits to neighbourhoods (LEFT JOIN, NULL-safe)', () => {
    expect(LEAD_FEED_SQL).toMatch(
      /LEFT JOIN neighbourhoods n ON n\.neighbourhood_id = p\.neighbourhood_id/,
    );
  });

  it('projects neighbourhood_name on permit_candidates', () => {
    expect(LEAD_FEED_SQL).toMatch(/n\.name\s+AS neighbourhood_name/);
  });

  it('projects cost_tier and estimated_cost on permit_candidates', () => {
    expect(LEAD_FEED_SQL).toMatch(/ce\.cost_tier\s+AS cost_tier/);
    // DECIMAL(15,2) explicit cast prevents node-pg returning a string
    expect(LEAD_FEED_SQL).toMatch(/ce\.estimated_cost::float8\s+AS estimated_cost/);
  });

  it('projects active_permits_nearby and avg_project_cost on builder_candidates', () => {
    // COUNT DISTINCT defends against entity_projects duplication
    expect(LEAD_FEED_SQL).toMatch(
      /COUNT\(DISTINCT \(p\.permit_num, p\.revision_num\)\)::int AS active_permits_nearby/,
    );
    // avg_project_cost uses COALESCE(cache, GUARDED_raw) — Bug 1 fix
    // from user-supplied Gemini holistic 2026-04-09 ("Cost Cache
    // Bypass") + independent reviewer C5 (placeholder threshold guard).
    // Look for the key invariants instead of the full expression
    // (the SQL is multi-line and brittle to whitespace).
    expect(LEAD_FEED_SQL).toMatch(/AVG\(COALESCE\([\s\S]*?ce_b\.estimated_cost/);
    expect(LEAD_FEED_SQL).toMatch(/AS avg_project_cost/);
  });

  it('builder cost AVG guards raw fallback against PLACEHOLDER_COST_THRESHOLD (Independent C5)', () => {
    // Pre-fix the FILTER was just `> 0`, which accepted $1 placeholder
    // values from the raw CKAN field when the cache was not yet
    // populated. The cost-model rejects raw values <= 1000; the
    // builder CTE's COALESCE fallback must mirror that threshold.
    expect(LEAD_FEED_SQL).toMatch(
      /CASE WHEN p\.est_const_cost > 1000 THEN p\.est_const_cost::float8 ELSE NULL END/,
    );
  });

  it('JOINs cost_estimates ce_b for the builder cost-cache lookup (Bug 1 fix)', () => {
    expect(LEAD_FEED_SQL).toMatch(
      /LEFT JOIN cost_estimates ce_b\s+ON ce_b\.permit_num = p\.permit_num\s+AND ce_b\.revision_num = p\.revision_num/,
    );
  });

  it('value_score CASE in builder CTE uses the same COALESCE expression as avg_project_cost (Bug 1 + C5 fix)', () => {
    // The pre-fix value_score CASE used AVG(p.est_const_cost) which
    // would have produced a different bucket than avg_project_cost
    // when the cache and raw diverged. Both expressions now use the
    // same COALESCE(cache, GUARDED_raw) shape so a builder's
    // value_score is computed against the SAME numbers their
    // avg_project_cost displays. The 2000000 boundary is the top tier.
    expect(LEAD_FEED_SQL).toMatch(/>= 2000000 THEN 20/);
    // Count the COALESCE(ce_b.estimated_cost...) occurrences — should
    // appear in BOTH the avg_project_cost projection AND each WHEN
    // arm of the value_score CASE (4 buckets + IS NULL = 5 occurrences
    // in the CASE alone, plus 1 in the column projection = at least 6).
    const matches = LEAD_FEED_SQL.match(/COALESCE\(\s*ce_b\.estimated_cost/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(6);
  });

  it('uses a wsib_per_entity CTE instead of the per-row LEFT JOIN LATERAL (Bug 7 fix)', () => {
    // The pre-fix LATERAL fired once per row of the post-JOIN cross
    // product (entities × entity_projects × permits × permit_trades).
    // With 150 permits per builder, that's 150 lateral evaluations
    // for one builder. The CTE fires once per unique linked_entity_id
    // for the whole query. User-supplied Gemini holistic 2026-04-09.
    expect(LEAD_FEED_SQL).toMatch(/wsib_per_entity AS \(/);
    // The CTE uses DISTINCT ON to preserve the LIMIT-1 row-pick semantics.
    expect(LEAD_FEED_SQL).toMatch(
      /SELECT DISTINCT ON \(linked_entity_id\)\s+linked_entity_id,\s+business_size/,
    );
    // Deterministic tiebreaker survives the refactor — DISTINCT ON's
    // ORDER BY puts linked_entity_id first (required) then the same
    // last_enriched_at DESC, id DESC tiebreaker the LATERAL had.
    expect(LEAD_FEED_SQL).toMatch(
      /ORDER BY linked_entity_id, last_enriched_at DESC, id DESC/,
    );
    // The builder CTE references the new CTE via a regular LEFT JOIN.
    expect(LEAD_FEED_SQL).toMatch(
      /LEFT JOIN wsib_per_entity w ON w\.linked_entity_id = e\.id/,
    );
    // The LEFT JOIN LATERAL is GONE — match `LATERAL (` with the
    // open paren so we don't false-positive on the comment block
    // that explains the refactor history.
    expect(LEAD_FEED_SQL).not.toMatch(/LATERAL \(/);
  });

  it('wsib_per_entity CTE preserves the contact-info filter (Bug 7 fix doesnt regress filter)', () => {
    // The original LATERAL filtered to (website OR primary_phone)
    // non-null AND business_size IN allowlist. The CTE must keep
    // both filters or builders without contact info would leak in.
    expect(LEAD_FEED_SQL).toMatch(/business_size IN \('Small Business', 'Medium Business'\)/);
    expect(LEAD_FEED_SQL).toMatch(/\(website IS NOT NULL OR primary_phone IS NOT NULL\)/);
  });

  // ---- Phase 3-vi: is_saved projection (saved-state survives refetch) ----
  it('LEFT JOINs lead_views lv_p in permit_candidates with lead_key equality (Issue 1 fix)', () => {
    expect(LEAD_FEED_SQL).toMatch(/LEFT JOIN lead_views lv_p/);
    expect(LEAD_FEED_SQL).toMatch(/lv_p\.user_id = \$9/);
    // CRITICAL: lead_key equality matches the actual UNIQUE index on
    // lead_views(user_id, lead_key, trade_slug). The decomposed
    // (permit_num, revision_num) pair is NOT a unique key — pre-LPAD
    // normalization rows could collide. Independent reviewer Issue 1.
    //
    // Phase 3-holistic WF3 (Phase A, 2026-04-09): MUST include the
    // 'permit:' prefix to match buildLeadKey() at record-lead-view.ts.
    // The earlier Phase 3-vi implementation (+ this test) codified the
    // wrong format — SQL wrote `{num}:{rev}` while buildLeadKey wrote
    // `permit:{num}:{rev}`, so the LEFT JOIN never matched and is_saved
    // was structurally always false for the entire feed. Silent
    // regression caught by independent reviewer C1/I4.
    expect(LEAD_FEED_SQL).toMatch(
      /lv_p\.lead_key = \('permit:' \|\| p\.permit_num \|\| ':' \|\| LPAD\(p\.revision_num, 2, '0'\)\)/,
    );
    expect(LEAD_FEED_SQL).toMatch(/lv_p\.permit_num = p\.permit_num/);
    expect(LEAD_FEED_SQL).toMatch(/lv_p\.revision_num = p\.revision_num/);
    expect(LEAD_FEED_SQL).toMatch(/lv_p\.trade_slug = \$1/);
    expect(LEAD_FEED_SQL).toMatch(/lv_p\.lead_type = 'permit'/);
  });

  it('LEFT JOINs lead_views lv_b in builder_candidates with lead_key equality (Issue 1 fix)', () => {
    expect(LEAD_FEED_SQL).toMatch(/LEFT JOIN lead_views lv_b/);
    expect(LEAD_FEED_SQL).toMatch(/lv_b\.user_id = \$9/);
    // Same lead_key safety pattern — builder lead_keys are
    // 'builder:' || entity_id::text per buildLeadKey() at
    // record-lead-view.ts. Phase 3-holistic WF3 Phase A fix — the
    // Phase 3-vi SQL wrote bare `e.id::text` and never matched the
    // 'builder:{id}' prefix format the JS writer uses, making
    // is_saved structurally always false for every builder lead.
    expect(LEAD_FEED_SQL).toMatch(
      /lv_b\.lead_key = \('builder:' \|\| e\.id::text\)/,
    );
    expect(LEAD_FEED_SQL).toMatch(/lv_b\.entity_id = e\.id/);
    expect(LEAD_FEED_SQL).toMatch(/lv_b\.trade_slug = \$1/);
    expect(LEAD_FEED_SQL).toMatch(/lv_b\.lead_type = 'builder'/);
  });

  it('projects is_saved on permit_candidates via COALESCE(lv_p.saved, false)', () => {
    expect(LEAD_FEED_SQL).toMatch(/COALESCE\(lv_p\.saved, false\) AS is_saved/);
  });

  it('projects is_saved on builder_candidates via bool_or aggregate', () => {
    // bool_or defends against multiple matching lead_views rows even
    // though the UNIQUE constraint on (user_id, lead_key, trade_slug)
    // currently guarantees at most one. Future-proof.
    expect(LEAD_FEED_SQL).toMatch(/COALESCE\(bool_or\(lv_b\.saved\), false\) AS is_saved/);
  });

  it('passes user_id as $9 parameter to LEAD_FEED_SQL', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(makeInput({ user_id: 'firebase-uid-test-9' }), mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params).toBeDefined();
    expect(params[8]).toBe('firebase-uid-test-9');
  });

  it('mirrors widened columns as NULL on the other branch (UNION ALL shape)', () => {
    // Permit branch must NULL out builder-only stats
    expect(LEAD_FEED_SQL).toMatch(/NULL::int\s+AS active_permits_nearby/);
    expect(LEAD_FEED_SQL).toMatch(/NULL::float8\s+AS avg_project_cost/);
    // Builder branch must NULL out permit-only address/cost columns
    expect(LEAD_FEED_SQL).toMatch(/NULL::text\s+AS neighbourhood_name/);
    expect(LEAD_FEED_SQL).toMatch(/NULL::text\s+AS cost_tier/);
    expect(LEAD_FEED_SQL).toMatch(/NULL::float8\s+AS estimated_cost/);
  });

  it('permit_candidates: contains competition_count correlated subquery scoped to other users', () => {
    // Phase 3: competition signal — COUNT DISTINCT user_id from lead_views
    // where saved=true and user_id != $9. Same lead_key format as is_saved.
    expect(LEAD_FEED_SQL).toMatch(/COUNT\(DISTINCT lv2\.user_id\)::int/);
    expect(LEAD_FEED_SQL).toMatch(/lv2\.saved = true/);
    expect(LEAD_FEED_SQL).toMatch(/lv2\.user_id != \$9::text/);
    expect(LEAD_FEED_SQL).toMatch(/lv2\.lead_type = 'permit'/);
    expect(LEAD_FEED_SQL).toMatch(/AS competition_count/);
  });

  it('builder_candidates: hardcodes competition_count as 0 (UNION ALL shape)', () => {
    // Builder leads don't have per-permit competition counts. The SQL
    // hardcodes 0::int so the UNION ALL shape stays consistent.
    const builderStart = LEAD_FEED_SQL.indexOf('builder_candidates AS (');
    const builderEnd = LEAD_FEED_SQL.indexOf('unified AS (');
    const builderCTE = LEAD_FEED_SQL.slice(builderStart, builderEnd);
    expect(builderCTE).toMatch(/0::int\s+AS competition_count/);
  });

  it('builder_candidates: competition_count appears BEFORE active_permits_nearby (UNION ALL position guard)', () => {
    const builderStart = LEAD_FEED_SQL.indexOf('builder_candidates AS (');
    const builderEnd = LEAD_FEED_SQL.indexOf('unified AS (');
    const builderCTE = LEAD_FEED_SQL.slice(builderStart, builderEnd);
    const competitionPos = builderCTE.indexOf('0::int        AS competition_count');
    const countPos = builderCTE.indexOf('::int AS active_permits_nearby');
    expect(competitionPos).toBeGreaterThan(0);
    expect(countPos).toBeGreaterThan(0);
    expect(competitionPos).toBeLessThan(countPos);
  });

  it('builder_candidates: lifecycle_phase/stalled appear BEFORE active_permits_nearby (UNION ALL position guard)', () => {
    // WF3 2026-04-22 regression: lifecycle_phase (text) and
    // lifecycle_stalled (bool) were added to permit_candidates at
    // positions 13-14 (after estimated_cost) but appended at the END
    // of builder_candidates. This shifts all subsequent columns by +2
    // causing PostgreSQL UNION type error: "UNION types character varying
    // and integer cannot be matched" at position 13.
    //
    // Guard: within the builder_candidates CTE section, the string
    // "lifecycle_phase" must appear at an EARLIER character offset
    // than "active_permits_nearby".
    const builderStart = LEAD_FEED_SQL.indexOf('builder_candidates AS (');
    const builderEnd = LEAD_FEED_SQL.indexOf('unified AS (');
    expect(builderStart).toBeGreaterThan(0);
    expect(builderEnd).toBeGreaterThan(builderStart);
    const builderCTE = LEAD_FEED_SQL.slice(builderStart, builderEnd);

    // Anchor both positions on actual column declarations, not the comment
    // block on lines 263-268 which mentions both identifiers (lifecycle_phase
    // then active_permits_nearby) and would cause false-pass if either column
    // were moved back to the end.
    const lifecyclePos = builderCTE.indexOf('NULL::text    AS lifecycle_phase');
    const countPos = builderCTE.indexOf('::int AS active_permits_nearby');
    expect(lifecyclePos).toBeGreaterThan(0);
    expect(countPos).toBeGreaterThan(0);
    expect(lifecyclePos).toBeLessThan(countPos);
  });
});

describe('TIMING_DISPLAY_BY_CONFIDENCE', () => {
  it('maps every confidence value to a non-empty display string', () => {
    expect(TIMING_DISPLAY_BY_CONFIDENCE.high).toBeTruthy();
    expect(TIMING_DISPLAY_BY_CONFIDENCE.medium).toBeTruthy();
    expect(TIMING_DISPLAY_BY_CONFIDENCE.low).toBeTruthy();
  });

  it('returns distinct phrases per confidence level', () => {
    const values = new Set(Object.values(TIMING_DISPLAY_BY_CONFIDENCE));
    expect(values.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Function behaviour
// ---------------------------------------------------------------------------

const samplePermitRow = {
  lead_type: 'permit',
  lead_id: '24 101234:01',
  permit_num: '24 101234',
  revision_num: '01',
  status: 'Permit Issued',
  permit_type: 'New Building',
  description: 'New SFD',
  street_num: '47',
  street_name: 'Maple Ave',
  // Phase 3-iii widened columns (permit branch)
  neighbourhood_name: 'High Park',
  cost_tier: 'large',
  estimated_cost: 750000,
  active_permits_nearby: null,
  avg_project_cost: null,
  is_saved: false,
  entity_id: null,
  legal_name: null,
  business_size: null,
  primary_phone: null,
  primary_email: null,
  website: null,
  photo_url: null,
  latitude: 43.65,
  longitude: -79.38,
  distance_m: 350,
  proximity_score: 30,
  timing_score: 30,
  value_score: 20,
  // 'Permit Issued' maps to 20 in the SQL CASE (was 10 in a pre-review
  // 0-10 draft; spec 70 §4 line 235 pins opportunity at 0-20). Independent
  // review 2026-04-09 caught this fixture drift — kept the row otherwise
  // identical so the relevance_score sum lines up at 100.
  opportunity_score: 20,
  relevance_score: 100,
  timing_confidence: 'high' as const,
  opportunity_type: 'newbuild' as const,
  // WF2 2026-04-11 — lifecycle columns projected from migration 085.
  // mapRow() now derives timing_display from these via displayLifecyclePhase().
  lifecycle_phase: 'P7a' as string | null,
  lifecycle_stalled: false,
  // Phase 3: competition count and target_window fields.
  competition_count: 0,
};

const sampleBuilderRow = {
  lead_type: 'builder',
  lead_id: '9183',
  permit_num: null,
  revision_num: null,
  status: null,
  permit_type: null,
  description: null,
  street_num: null,
  street_name: null,
  // Phase 3-iii widened columns (builder branch)
  neighbourhood_name: null,
  cost_tier: null,
  estimated_cost: null,
  active_permits_nearby: 4,
  avg_project_cost: 425000,
  is_saved: false,
  entity_id: 9183,
  legal_name: 'ACME CONSTRUCTION',
  business_size: 'Small Business',
  primary_phone: '416-555-1234',
  primary_email: null,
  website: 'https://acme.example',
  photo_url: null,
  latitude: null,
  longitude: null,
  distance_m: 500,
  proximity_score: 25,
  timing_score: 15,
  value_score: 20,
  opportunity_score: 10,   // builder CASE produces {0,10,14,20} only
  relevance_score: 70,    // 25+15+20+10
  timing_confidence: 'high' as const,
  opportunity_type: 'builder-led' as const,
  // Builder branch of the UNION ALL has hardcoded NULL lifecycle_phase
  // because builders aggregate multiple permits — no single phase makes
  // sense. displayLifecyclePhase(null, false) → "Unknown" on the card.
  lifecycle_phase: null as string | null,
  lifecycle_stalled: false,
  // Builder rows carry 0 from the SQL hardcoded value; no per-permit
  // competition count applies to the builder entity.
  competition_count: 0,
};

function makeInput(overrides: Partial<LeadFeedInput> = {}): LeadFeedInput {
  return {
    user_id: 'firebase-uid-abc',
    trade_slug: 'plumbing',
    lat: 43.65,
    lng: -79.38,
    radius_km: 10,
    limit: 15,
    ...overrides,
  };
}

describe('getLeadFeed — function behaviour', () => {
  it('returns mapped LeadFeedItems on happy path', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([samplePermitRow, sampleBuilderRow]));
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]?.lead_type).toBe('permit');
    expect(result.data[1]?.lead_type).toBe('builder');
    expect(result.meta.count).toBe(2);
    expect(result.meta.radius_km).toBe(10);
  });

  it('returns null next_cursor when rows.length < limit', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([samplePermitRow])); // 1 row, limit 15
    const result = await getLeadFeed(makeInput({ limit: 15 }), mock as unknown as Pool);
    expect(result.meta.next_cursor).toBeNull();
  });

  it('next_cursor uses RAW res.rows.length, not post-mapRow data.length (Gemini+DeepSeek 2026-04-09 CRITICAL)', async () => {
    // Pre-fix: mapRow could drop a malformed row → data.length <
    // clampedLimit → next_cursor=null → silent feed truncation. Now
    // the cursor decision uses res.rows.length and the last raw row.
    // Simulate by feeding 3 rows where the middle one is malformed
    // (entity_id=null on a builder row → mapRow drops it).
    const mock = createMockPool();
    const goodPermit = { ...samplePermitRow, lead_id: 'p-good', relevance_score: 95 };
    const malformedBuilder = {
      ...sampleBuilderRow,
      lead_id: 'b-bad',
      entity_id: null, // forces mapRow to drop
      relevance_score: 90,
    };
    const tailPermit = { ...samplePermitRow, lead_id: 'p-tail', relevance_score: 85 };
    mock.query.mockResolvedValueOnce(qr([goodPermit, malformedBuilder, tailPermit]));
    const result = await getLeadFeed(makeInput({ limit: 3 }), mock as unknown as Pool);
    // data has only 2 items (the malformed one was dropped), but
    // res.rows.length === 3 === limit so the cursor MUST be set,
    // pointing at the last RAW row's lead_id.
    expect(result.data).toHaveLength(2);
    expect(result.meta.next_cursor).not.toBeNull();
    expect(result.meta.next_cursor?.lead_id).toBe('p-tail');
    expect(result.meta.next_cursor?.score).toBe(85);
  });

  it('extracts next_cursor from last row when rows.length === limit', async () => {
    const mock = createMockPool();
    const rows = Array.from({ length: 3 }, (_, i) => ({
      ...samplePermitRow,
      lead_id: `permit-${i}`,
      relevance_score: 90 - i,
    }));
    mock.query.mockResolvedValueOnce(qr(rows));
    const result = await getLeadFeed(makeInput({ limit: 3 }), mock as unknown as Pool);
    expect(result.meta.next_cursor).not.toBeNull();
    expect(result.meta.next_cursor?.score).toBe(88);
    expect(result.meta.next_cursor?.lead_type).toBe('permit');
    expect(result.meta.next_cursor?.lead_id).toBe('permit-2');
  });

  it('returns empty result on empty rows', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    expect(result.data).toEqual([]);
    expect(result.meta.next_cursor).toBeNull();
    expect(result.meta.count).toBe(0);
  });

  it('THROWS on pool error so the route layer can return 500 (spec 70 §API Endpoints)', async () => {
    const mock = createMockPool();
    mock.query.mockRejectedValueOnce(new Error('connection refused'));
    await expect(
      getLeadFeed(makeInput(), mock as unknown as Pool),
    ).rejects.toThrow('connection refused');
  });

  it('passes nulls for $6/$7/$8 on first page (no cursor)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(makeInput(), mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[5]).toBeNull();
    expect(params[6]).toBeNull();
    expect(params[7]).toBeNull();
  });

  it('passes cursor values for $6/$7/$8 on subsequent pages', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(
      makeInput({ cursor: { score: 75, lead_type: 'permit', lead_id: '24 101234:01' } }),
      mock as unknown as Pool,
    );
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[5]).toBe(75);
    expect(params[6]).toBe('permit');
    expect(params[7]).toBe('24 101234:01');
  });

  it('clamps limit to MAX_FEED_LIMIT (30) when input exceeds it (DoS prevention)', async () => {
    expect(MAX_FEED_LIMIT).toBe(30);
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(makeInput({ limit: 1_000_000 }), mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[4]).toBe(MAX_FEED_LIMIT);
  });

  it('clamps limit to minimum of 1 when input is 0 or negative', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(makeInput({ limit: 0 }), mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[4]).toBe(1);
  });

  it('clamps radius_km to MAX_RADIUS_KM (50) when input exceeds it', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    const result = await getLeadFeed(makeInput({ radius_km: 100 }), mock as unknown as Pool);
    expect(result.meta.radius_km).toBe(MAX_RADIUS_KM);
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[3]).toBe(metersFromKilometers(MAX_RADIUS_KM));
  });

  it('passes parameters in spec order: $1=trade_slug, $2=lng, $3=lat, $4=radius_m, $5=limit', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(
      makeInput({ trade_slug: 'electrical', lat: 43.7, lng: -79.4, radius_km: 5, limit: 20 }),
      mock as unknown as Pool,
    );
    const params = mock.query.mock.calls[0]?.[1];
    expect(params[0]).toBe('electrical');
    expect(params[1]).toBe(-79.4); // lng
    expect(params[2]).toBe(43.7);  // lat
    expect(params[3]).toBe(5000);  // radius_m
    expect(params[4]).toBe(20);    // limit
  });

  it('handles mixed permit + builder rows in same response', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([samplePermitRow, sampleBuilderRow, samplePermitRow]));
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    expect(result.data).toHaveLength(3);
    expect(result.data.filter((r) => r.lead_type === 'permit')).toHaveLength(2);
    expect(result.data.filter((r) => r.lead_type === 'builder')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 3-iii widened mapRow coverage
// ---------------------------------------------------------------------------

describe('mapRow — widened columns', () => {
  it('passes through neighbourhood_name, cost_tier, estimated_cost on permit rows', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([samplePermitRow]));
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    expect(item?.lead_type).toBe('permit');
    if (item?.lead_type === 'permit') {
      expect(item.neighbourhood_name).toBe('High Park');
      expect(item.cost_tier).toBe('large');
      expect(item.estimated_cost).toBe(750000);
    }
  });

  it('handles permit row with NULL neighbourhood (orphan from geocoder)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, neighbourhood_name: null }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      expect(item.neighbourhood_name).toBeNull();
    }
  });

  it('handles permit row with NULL cost_estimate (no cached estimate)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, cost_tier: null, estimated_cost: null }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      expect(item.cost_tier).toBeNull();
      expect(item.estimated_cost).toBeNull();
    }
  });

  it('narrows unknown cost_tier strings to null (defensive)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, cost_tier: 'gigantic' }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      // Bad enum value from a future SQL drift should not crash mapRow
      expect(item.cost_tier).toBeNull();
    }
  });

  it('coerces estimated_cost from a string (node-pg DECIMAL fallback)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, estimated_cost: '750000.50' }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      expect(item.estimated_cost).toBe(750000.5);
    }
  });

  it('passes through active_permits_nearby and avg_project_cost on builder rows', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([sampleBuilderRow]));
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    expect(item?.lead_type).toBe('builder');
    if (item?.lead_type === 'builder') {
      expect(item.active_permits_nearby).toBe(4);
      expect(item.avg_project_cost).toBe(425000);
    }
  });

  it('handles builder row with NULL avg_project_cost (zero costed permits)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...sampleBuilderRow, avg_project_cost: null }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'builder') {
      expect(item.avg_project_cost).toBeNull();
    }
  });

  it('defaults active_permits_nearby to 0 if SQL drift returns null', async () => {
    // mapRow falls back to 0 instead of dropping the row, since "0
    // active permits" is a sensible card display
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...sampleBuilderRow, active_permits_nearby: null }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'builder') {
      expect(item.active_permits_nearby).toBe(0);
    }
  });

  it('passes is_saved through to mapRow on permit branch (Phase 3-vi)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, is_saved: true }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    expect(item?.is_saved).toBe(true);
  });

  it('passes is_saved through to mapRow on builder branch (Phase 3-vi)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...sampleBuilderRow, is_saved: true }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    expect(item?.is_saved).toBe(true);
  });

  it('derives timing_display from lifecycle_phase via displayLifecyclePhase (WF2 lifecycle rollout)', async () => {
    // Replaces the old "synthesizes timing_display from confidence"
    // assertion. mapRow no longer reads timing_confidence to decide the
    // label — it reads the real lifecycle_phase column (migration 085)
    // and dispatches through displayLifecyclePhase(). That gives every
    // card a distinct, meaningful label instead of "Active build phase".
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([
        { ...samplePermitRow, lifecycle_phase: 'P7a', lifecycle_stalled: false },
        {
          ...samplePermitRow,
          lead_id: 'p2',
          lifecycle_phase: 'P11',
          lifecycle_stalled: false,
        },
        {
          ...samplePermitRow,
          lead_id: 'p3',
          lifecycle_phase: 'P7c',
          lifecycle_stalled: true,
        },
        {
          ...samplePermitRow,
          lead_id: 'p4',
          lifecycle_phase: null,
          lifecycle_stalled: false,
        },
      ]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    expect(result.data[0]?.timing_display).toBe('Freshly issued');
    expect(result.data[1]?.timing_display).toBe('Framing');
    expect(result.data[2]?.timing_display).toBe('Recently issued (stalled)');
    expect(result.data[3]?.timing_display).toBe('Unknown');
  });

  it('passes competition_count through to the PermitLeadFeedItem', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, competition_count: 3 }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      expect(item.competition_count).toBe(3);
    } else {
      throw new Error('expected permit lead');
    }
  });

  it('passes competition_count 0 for builder rows', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...sampleBuilderRow, competition_count: 0 }]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    // competition_count is permit-only; builder type doesn't carry it — just verify no crash
    expect(result.data[0]?.lead_type).toBe('builder');
  });

  it('computes target_window "bid" when lifecycle_phase is before work_phase for the trade', async () => {
    // plumbing work_phase = P12 (index 15). P7a = index 7 → bid
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, lifecycle_phase: 'P7a', competition_count: 0 }]),
    );
    const result = await getLeadFeed(makeInput({ trade_slug: 'plumbing' }), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      expect(item.target_window).toBe('bid');
    } else {
      throw new Error('expected permit lead');
    }
  });

  it('computes target_window "work" when lifecycle_phase meets or exceeds work_phase for the trade', async () => {
    // plumbing work_phase = P12 (index 15). P12 = index 15 → work
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, lifecycle_phase: 'P12', competition_count: 0 }]),
    );
    const result = await getLeadFeed(makeInput({ trade_slug: 'plumbing' }), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      expect(item.target_window).toBe('work');
    } else {
      throw new Error('expected permit lead');
    }
  });

  it('computes target_window "work" when lifecycle_phase is past work_phase', async () => {
    // plumbing work_phase = P12 (index 15). P15 = index 18 → work
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, lifecycle_phase: 'P15', competition_count: 0 }]),
    );
    const result = await getLeadFeed(makeInput({ trade_slug: 'plumbing' }), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      expect(item.target_window).toBe('work');
    } else {
      throw new Error('expected permit lead');
    }
  });

  it('defaults target_window to "bid" when lifecycle_phase is null', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, lifecycle_phase: null, competition_count: 0 }]),
    );
    const result = await getLeadFeed(makeInput({ trade_slug: 'plumbing' }), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      expect(item.target_window).toBe('bid');
    } else {
      throw new Error('expected permit lead');
    }
  });

  it('defaults target_window to "bid" for an unknown trade_slug', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([{ ...samplePermitRow, lifecycle_phase: 'P15', competition_count: 0 }]),
    );
    const result = await getLeadFeed(makeInput({ trade_slug: 'unknown-trade-xyz' }), mock as unknown as Pool);
    const item = result.data[0];
    if (item?.lead_type === 'permit') {
      expect(item.target_window).toBe('bid');
    } else {
      throw new Error('expected permit lead');
    }
  });

  it('passes lifecycle_phase + lifecycle_stalled through to the PermitLeadFeedItem', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(
      qr([
        {
          ...samplePermitRow,
          lifecycle_phase: 'P18',
          lifecycle_stalled: true,
        },
      ]),
    );
    const result = await getLeadFeed(makeInput(), mock as unknown as Pool);
    const permit = result.data[0] as
      | (typeof result.data)[number]
      | undefined;
    // Type narrow — permit branch
    if (permit && 'lifecycle_phase' in permit) {
      expect(permit.lifecycle_phase).toBe('P18');
      expect(permit.lifecycle_stalled).toBe(true);
    } else {
      throw new Error('expected permit lead to expose lifecycle fields');
    }
  });
});
