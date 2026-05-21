// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §Implementation
// 🔗 SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §3 (CoA UNION arm — WF3 #3, 2026-05-20)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import {
  LEAD_FEED_SQL,
  LEAD_FEED_SQL_WITH_COA,
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
  // WF3 2026-05-08: assertion flipped to enforce the FK-correct join
  // (n.id = p.neighbourhood_id) per migration 109 fk_permits_neighbourhoods.
  // The original assertion codified the wrong join shape — the silent-miss
  // bug class WF3 just repaired. See neighbourhoods-fk-join.infra.test.ts
  // for the consolidated regression-lock across all 4 sites.
  it('joins permits to neighbourhoods on the SERIAL FK (LEFT JOIN, NULL-safe)', () => {
    expect(LEAD_FEED_SQL).toMatch(
      /LEFT JOIN neighbourhoods n ON n\.id = p\.neighbourhood_id/,
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

// ---------------------------------------------------------------------------
// WF3 #3 (Spec 79 §7a Finding K, 2026-05-20) — CoA UNION arm source-shape
//
// 18 assertions on the 3-arm SQL (`LEAD_FEED_SQL_WITH_COA`) plus regression
// guards on the killswitch-off shape (`LEAD_FEED_SQL`). When the killswitch
// `LEAD_FEED_DISABLE_COA=1` is set, the route uses `LEAD_FEED_SQL` (2-arm,
// legacy shape); when unset/`0`, the route uses `LEAD_FEED_SQL_WITH_COA`
// (3-arm with CoA candidates). Default per WF3 #3 plan v2: DISABLED (kill
// switch on). Operators flip the env var off once mobile cards ship.
//
// Plan-review v2 folds covered by these tests:
//   #1 (cursor enum), #4 (bid_value CoA-only), #6 (CTE conditional emission),
//   #7 (test coverage: NULL JOINs, lead_type filter axes), #8 (param doc),
//   #9 (lead_type=permit excludes builder per Spec 91 §3.1 literal read),
//  #11 (regression guard against accidental coa_applications leak)
// ---------------------------------------------------------------------------

describe('LEAD_FEED_SQL_WITH_COA — CoA UNION arm (Spec 91 §3)', () => {
  it('exports LEAD_FEED_SQL_WITH_COA as a 3-arm SQL string', () => {
    expect(typeof LEAD_FEED_SQL_WITH_COA).toBe('string');
    expect(LEAD_FEED_SQL_WITH_COA.length).toBeGreaterThan(LEAD_FEED_SQL.length);
  });

  it('contains coa_candidates AS CTE', () => {
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/coa_candidates AS/);
  });

  it('UNION ALL has exactly 3 arms inside `unified` CTE (permit + builder + coa)', () => {
    // Count `UNION ALL\n    SELECT` patterns — the actual SQL-level UNION
    // operator usage, excluding the word appearing in SQL comments.
    const unionAllOps = (LEAD_FEED_SQL_WITH_COA.match(/UNION ALL\s+SELECT/g) ?? []).length;
    expect(unionAllOps).toBe(2);
  });

  it("coa_candidates projects 'coa'::text AS lead_type", () => {
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/'coa'::text\s+AS\s+lead_type/);
  });

  it("coa_candidates emits canonical lead_id ('coa:' || ca.application_number)", () => {
    // Spec 42 §6.6.A.1 — canonical CoA lead_id format.
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/'coa:'\s*\|\|\s*ca\.application_number/);
  });

  it('coa_candidates projects bid_value from coa_applications (Spec 91 §3.5 5-bar render)', () => {
    // §10 fold #4: bid_value is CoA-only in this WF. Live-verify discovered
    // bid_value lives on coa_applications (NOT trade_forecasts) — fixed
    // inline 2026-05-20 after the test ran against the dev DB.
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/ca\.bid_value/);
  });

  it("coa_candidates LEFT JOINs trade_forecasts on tf.lead_id = ('coa:' || ca.application_number)", () => {
    // Mirrors lead-detail-query.ts:298-300 (proven shape per Spec 42 §6.11 Phase C).
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/LEFT JOIN trade_forecasts tf[\s\S]{0,80}?tf\.lead_id\s*=\s*\('coa:'\s*\|\|\s*ca\.application_number\)/);
  });

  it('coa_candidates LEFT JOINs neighbourhoods on n.id = ca.neighbourhood_id', () => {
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/LEFT JOIN neighbourhoods n[\s\S]{0,80}?n\.id\s*=\s*ca\.neighbourhood_id/);
  });

  it("coa_candidates LEFT JOIN lead_views uses lead_type = 'coa' (read path — mig 070 CHECK blocks writes)", () => {
    // Plan-review fold: detail-query already JOINs lead_views.lead_type='coa';
    // the read path is forward-compatible even though writes 23514 from the
    // mig 070 CHECK constraint. is_saved + competition_count therefore
    // always emit false/0 until the CoA-write WF lands. Documented in the
    // §10 deferral notes.
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/lv_c\.lead_type\s*=\s*'coa'/);
  });

  it('coa_candidates WHERE filters by ST_DWithin (geography) — radius gate', () => {
    // Find the coa_candidates block and assert ST_DWithin appears in it.
    const coaBlock = LEAD_FEED_SQL_WITH_COA.match(/coa_candidates AS \([\s\S]*?\),\s*unified AS/);
    expect(coaBlock).not.toBeNull();
    expect(coaBlock?.[0]).toMatch(/ST_DWithin/);
  });

  it("coa_candidates WHERE includes lead_type filter predicate ($10::text IN ('all', 'coa'))", () => {
    // Spec 91 §3.1 — `?lead_type=coa` returns only `coa:%` rows; `?lead_type=all` returns all.
    const coaBlock = LEAD_FEED_SQL_WITH_COA.match(/coa_candidates AS \([\s\S]*?\),\s*unified AS/);
    expect(coaBlock?.[0]).toMatch(/\$10::text\s+IN\s*\(\s*'all'\s*,\s*'coa'\s*\)/);
  });

  it("permit_candidates WHERE includes filter predicate ($10::text IN ('all', 'permit'))", () => {
    // Spec 91 §3.1 literal — `?lead_type=permit` returns only `permit:%` rows.
    const permitBlock = LEAD_FEED_SQL_WITH_COA.match(/permit_candidates AS \([\s\S]*?\),\s*builder_candidates AS/);
    expect(permitBlock?.[0]).toMatch(/\$10::text\s+IN\s*\(\s*'all'\s*,\s*'permit'\s*\)/);
  });

  it("builder_candidates WHERE restricts to $10::text = 'all' (excluded by permit filter — Spec 91 §3.1 literal)", () => {
    // DeepSeek #9 plan-review fold rationale: spec line 81-83 reads
    // `?lead_type=permit — returns only lead_id LIKE 'permit:%' rows`.
    // Builder lead_ids are zero-padded numeric strings (no 'permit:' prefix),
    // so the spec's literal lead_id pattern excludes builders under the
    // permit filter. §10 note documents this interpretation.
    const builderBlock = LEAD_FEED_SQL_WITH_COA.match(/builder_candidates AS \([\s\S]*?\),\s*unified AS/);
    expect(builderBlock?.[0]).toMatch(/\$10::text\s*=\s*'all'/);
  });

  it('LEAD_FEED_SQL (killswitch-on shape) does NOT contain coa_candidates', () => {
    // Regression guard: when LEAD_FEED_DISABLE_COA=1, the route uses
    // LEAD_FEED_SQL which must NOT reference the CoA arm. This is the
    // legacy 2-arm shape that 75 prior tests assert against.
    expect(LEAD_FEED_SQL).not.toMatch(/coa_candidates/);
  });

  it('LEAD_FEED_SQL (killswitch-on shape) does NOT reference coa_applications', () => {
    expect(LEAD_FEED_SQL).not.toMatch(/coa_applications/);
  });

  it('LEAD_FEED_SQL (killswitch-on shape) STILL accepts $10 filter — permit arm respects ?lead_type=permit (IMPL-review Indep CRIT-2 fold)', () => {
    // The 10-param shape MUST be stable across the killswitch boundary so
    // route.ts can pass a uniform 10-element params array regardless of
    // disableCoa. If a future edit strips $10 from only the 2-arm SQL,
    // the killswitch-on path will hit a `bind message supplies N
    // parameters, but prepared statement requires N-1` error from pg.
    expect(LEAD_FEED_SQL).toMatch(/\$10::text\s+IN\s*\(\s*'all'\s*,\s*'permit'\s*\)/);
    expect(LEAD_FEED_SQL).toMatch(/\$10::text\s*=\s*'all'/);
  });

  it('coa_candidates lv_c JOIN includes trade_slug predicate (IMPL-review Indep HIGH-1 fold)', () => {
    // Without this, post-CoA-write-WF a user saving a CoA under trade A
    // would see is_saved=true on the CoA feed for trade B. Mirrors lv_p
    // (line ~253) and lv_b (line ~450). Dormant today (mig 070 CHECK
    // blocks lead_type='coa' writes); correct for forward-compat.
    const coaBlock = LEAD_FEED_SQL_WITH_COA.match(/coa_candidates AS \([\s\S]*?\),\s*unified AS/);
    expect(coaBlock?.[0]).toMatch(/lv_c\.trade_slug\s*=\s*\$1/);
  });

  it("coa_candidates filters terminal CoA states by P-CODES (P19/P20) NOT status strings (IMPL-review Indep CRIT-1 fold)", () => {
    // coa_applications.lifecycle_phase stores P-codes per mig 085 + the
    // classifier. v1 of this filter used 'Withdrawn'/'Refused'/'Closed'
    // literal status strings against the P-code column — semantic no-op.
    // The correct terminal codes per
    // src/lib/classification/lifecycle-phase.ts:508-517 are P19 + P20.
    const coaBlock = LEAD_FEED_SQL_WITH_COA.match(/coa_candidates AS \([\s\S]*?\),\s*unified AS/);
    expect(coaBlock?.[0]).toMatch(/NOT IN \('P19',\s*'P20'\)/);
    // Status-string predicates would appear in an `IN (...)` or `NOT IN (...)`
    // clause WITHOUT the P-code prefix. Allow status strings in comments
    // (which explain WHY we filter by P-code) by anchoring on the SQL
    // predicate shape: `IN ('Withdrawn'` would only occur in actual code.
    expect(coaBlock?.[0]).not.toMatch(/IN\s*\(\s*'Withdrawn'/);
    expect(coaBlock?.[0]).not.toMatch(/IN\s*\(\s*'Refused'/);
  });

  it('SQL has a parameter-binding comment block listing all 10 $N params (DeepSeek #8 fold)', () => {
    // Drift-prevention: any future change that adds/removes/renames a
    // numbered parameter must also update this comment. Tests catch the
    // comment going stale.
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/\$1[\s\S]*?trade_slug/);
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/\$10[\s\S]{0,200}?lead_type/);
  });

  it('ORDER BY tuple remains (relevance_score DESC, lead_type DESC, lead_id DESC)', () => {
    // Cursor compat: changing the ORDER BY would invalidate every
    // in-flight mobile cursor. Spec 91 §3.1 mentions ?sort=lifecycle_seq
    // alternative ordering — DEFERRED per plan v2 Operating Boundaries.
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(
      /ORDER BY\s+relevance_score\s+DESC\s*,\s*lead_type\s+DESC\s*,\s*lead_id\s+DESC/,
    );
  });

  it('coa_candidates projects target_window from trade_forecasts (Phase F.1 cached)', () => {
    // Reads the persisted target_window from trade_forecasts rather than
    // recomputing in JS — mirrors the permit-side lead-detail-query
    // pattern from Spec 71. NULL when the forecast row is missing for a
    // given (lead_id, trade_slug) combination.
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/tf\.target_window/);
  });

  it('LEAD_FEED_SQL_WITH_COA shares the 4-CTE legacy structure (wsib_per_entity + permit + builder + new coa)', () => {
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/wsib_per_entity AS/);
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/permit_candidates AS/);
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/builder_candidates AS/);
    expect(LEAD_FEED_SQL_WITH_COA).toMatch(/coa_candidates AS/);
  });
});

// ---------------------------------------------------------------------------
// WF3 #3 (2026-05-20) — getLeadFeed function-level CoA behaviour
//
// 6 behaviour assertions: killswitch routing, mapRow CoA branch, defensive
// narrowing on malformed CoA rows, lead_type filter $10 param emission.
// ---------------------------------------------------------------------------

const sampleCoaRow = {
  lead_type: 'coa',
  lead_id: 'coa:A0125-24',
  application_number: 'A0125-24',
  permit_num: null,
  revision_num: null,
  status: null,
  permit_type: null,
  description: 'Two-storey rear addition + interior alts (heritage CoA review)',
  street_num: '52',
  street_name: 'Beech Avenue',
  neighbourhood_name: 'The Beaches',
  cost_tier: null,
  estimated_cost: 320000,
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
  latitude: 43.668,
  longitude: -79.298,
  distance_m: 1240,
  proximity_score: 20,
  timing_score: 15,
  value_score: 12,
  opportunity_score: 14,
  relevance_score: 61,
  timing_confidence: 'medium' as const,
  opportunity_type: 'unknown' as const,
  lifecycle_phase: 'P2' as string | null,
  lifecycle_stalled: false,
  competition_count: 0,
  // CoA-specific
  modeled_gfa_sqm: 185,
  bid_value: 0.72,
  target_window: 'bid' as 'bid' | 'work' | null,
  predicted_start: '2026-09-15',
};

describe('getLeadFeed — CoA branch (WF3 #3 fold #6 + #7)', () => {
  it('uses LEAD_FEED_SQL (no CoA arm) when input.disableCoa = true', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(makeInput({ disableCoa: true }), mock as unknown as Pool);
    const calledSql = mock.query.mock.calls[0]?.[0] as string;
    expect(calledSql).not.toMatch(/coa_candidates/);
  });

  it('uses LEAD_FEED_SQL_WITH_COA when input.disableCoa = false (default in dev/staging)', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(makeInput({ disableCoa: false }), mock as unknown as Pool);
    const calledSql = mock.query.mock.calls[0]?.[0] as string;
    expect(calledSql).toMatch(/coa_candidates/);
  });

  it("passes lead_type filter as $10 query parameter ('all' default per Spec 91 §3.1)", async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([]));
    await getLeadFeed(makeInput({ disableCoa: false, lead_type: 'coa' }), mock as unknown as Pool);
    const params = mock.query.mock.calls[0]?.[1] as unknown[];
    // $9 is user_id, $10 is lead_type filter.
    expect(params[9]).toBe('coa');
  });

  it('mapRow CoA branch returns CoaLeadFeedItem with lead_type discriminator', async () => {
    const mock = createMockPool();
    mock.query.mockResolvedValueOnce(qr([sampleCoaRow]));
    const result = await getLeadFeed(makeInput({ disableCoa: false }), mock as unknown as Pool);
    const item = result.data[0];
    expect(item?.lead_type).toBe('coa');
    if (item && item.lead_type === 'coa') {
      expect(item.application_number).toBe('A0125-24');
      expect(item.bid_value).toBe(0.72);
      expect(item.target_window).toBe('bid');
      expect(item.predicted_start).toBe('2026-09-15');
    } else {
      throw new Error('expected CoA branch with discriminator');
    }
  });

  it('mapRow drops malformed CoA row (null application_number) without breaking the feed', async () => {
    const mock = createMockPool();
    const malformedCoa = { ...sampleCoaRow, application_number: null };
    const goodPermit = { ...samplePermitRow, lead_id: 'permit-good', relevance_score: 90 };
    mock.query.mockResolvedValueOnce(qr([goodPermit, malformedCoa]));
    const result = await getLeadFeed(makeInput({ disableCoa: false, limit: 2 }), mock as unknown as Pool);
    // Bad row dropped; good permit remains.
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.lead_type).toBe('permit');
  });

  it('handles 3-way score tie (permit + coa + builder same relevance_score)', async () => {
    // ORDER BY lead_type DESC tie-breaks: 'permit' > 'coa' > 'builder' in DESC order.
    // mapRow must produce all 3 branches without throwing.
    const mock = createMockPool();
    const tiedPermit = { ...samplePermitRow, lead_id: 'p-tie', relevance_score: 50 };
    const tiedCoa = { ...sampleCoaRow, lead_id: 'coa:tie', application_number: 'TIE-01', relevance_score: 50 };
    const tiedBuilder = { ...sampleBuilderRow, lead_id: 'b-tie', relevance_score: 50 };
    mock.query.mockResolvedValueOnce(qr([tiedPermit, tiedCoa, tiedBuilder]));
    const result = await getLeadFeed(makeInput({ disableCoa: false, limit: 3 }), mock as unknown as Pool);
    expect(result.data).toHaveLength(3);
    expect(result.data.map((d) => d?.lead_type).sort()).toEqual(['builder', 'coa', 'permit']);
  });
});
