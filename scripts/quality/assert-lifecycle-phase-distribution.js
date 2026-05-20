#!/usr/bin/env node
/**
 * Assert Lifecycle Phase Distribution — Tier 3 CQA check.
 *
 * Phase E.4 v4 extension (this commit) — adds per-seq distribution band
 * assertion alongside the existing 19 phase-keyed bands. The per-seq bands
 * are derived from `universal_stream_catalog.rows_count` via mig 148; index
 * builds for the lifecycle_seq columns ship in mig 149.
 *
 * Per-seq posture is WARN-only on first deploy (Phase D/E.2 ramp-up state
 * is expected to violate). E.5 (separate WF) tightens to FAIL after 7
 * consecutive PASS runs on staging.
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.4
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
 * SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.1-§3.2
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./../lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('./../lib/config-loader');
const {
  DEAD_STATUS_ARRAY,
  NORMALIZED_DEAD_DECISIONS_ARRAY,
} = require('./../lib/lifecycle-phase');

// Advisory lock ID — unique to this assert script (§47 §A.5, ID 109).
const ADVISORY_LOCK_ID = 109;

// ──────────────────────────────────────────────────────────────────
// Phase distribution bands — externalized to logic_variables (WF2 2026-05-07).
//
// Audit-table display labels → snake-case logic_variables key suffixes.
// Migration 119 seeded `lifecycle_band_<suffix>_min/_max` rows.
// ──────────────────────────────────────────────────────────────────
const PHASE_TO_LOGIC_VAR_SUFFIX = {
  // permits — pre-issuance
  P3: 'p3', P4: 'p4', P5: 'p5', P6: 'p6',
  // permits — issued time-bucketed
  P7a: 'p7a', P7b: 'p7b', P7c: 'p7c', P7d: 'p7d',
  // permits — active + revised
  P8: 'p8', P18: 'p18', P19: 'p19', P20: 'p20',
  // permits — active sub-stage aggregate (P9-P17 sum)
  'P9-P17': 'p9_p17_agg',
  // orphans
  O1: 'o1', O2: 'o2', O3: 'o3',
  // CoA (no namespace collision with permits)
  P1: 'coa_p1', P2: 'coa_p2',
};

// Build Zod schema for phase-keyed bands dynamically.
const _bandShape = {};
for (const suffix of Object.values(PHASE_TO_LOGIC_VAR_SUFFIX)) {
  _bandShape[`lifecycle_band_${suffix}_min`] = z.coerce.number().finite().nonnegative().int();
  _bandShape[`lifecycle_band_${suffix}_max`] = z.coerce.number().finite().nonnegative().int();
}

// Phase E.4 v4 — Stage 1 module-level static schema. Per-seq band keys pass
// through `.passthrough()` and are validated dynamically at runtime (Stage 2)
// against the catalog query (which determines the actual valid seq list).
const LOGIC_VARS_SCHEMA = z.object({
  lifecycle_unclassified_max: z.coerce.number().finite().nonnegative().int(),
  lifecycle_seq_unclassified_max: z.coerce.number().finite().nonnegative().int(),
  lifecycle_cross_stalled_threshold: z.coerce.number().finite().nonnegative().int(),
  lifecycle_cross_active_inspection_threshold: z.coerce.number().finite().nonnegative().int(),
  lifecycle_cross_issued_threshold: z.coerce.number().finite().nonnegative().int(),
  // Phase E.5 v4 — 3 per-kind posture flags (operator-driven WARN→FAIL gate).
  // Each gates routing for its violation kind; 0=WARN (E.4 default), 1=FAIL (E.5 promotion).
  // See Spec 84 §3.4 pre-promotion checklist.
  lifecycle_seq_band_promote_to_fail_band_violation:        z.coerce.number().int().min(0).max(1),
  lifecycle_seq_band_promote_to_fail_no_band_configured:    z.coerce.number().int().min(0).max(1),
  lifecycle_seq_band_promote_to_fail_expected_data_missing: z.coerce.number().int().min(0).max(1),
  ..._bandShape,
}).passthrough().superRefine((data, ctx) => {
  // Existing min>max guard for phase bands (preserved).
  for (const suffix of Object.values(PHASE_TO_LOGIC_VAR_SUFFIX)) {
    const min = data[`lifecycle_band_${suffix}_min`];
    const max = data[`lifecycle_band_${suffix}_max`];
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `lifecycle_band_${suffix}: min (${min}) > max (${max}) — band would never match`,
      });
    }
  }
});

// Phase E.4 v4 — band key pattern for orphan detection.
const BAND_KEY_PATTERN = /^lifecycle_seq_band_(\d+)_(min|max)$/;
// Cap on structured violations array in records_meta to prevent payload bloat.
const SEQ_VIOLATIONS_CAP = 50;

// Phases that roll into the P9-P17 aggregate bucket
const ACTIVE_SUBPHASES = new Set([
  'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17',
]);

// Startup validation — `<> ALL(ARRAY[]::text[])` is vacuously true in Postgres.
if (DEAD_STATUS_ARRAY.length === 0) {
  throw new Error('DEAD_STATUS_ARRAY is empty — refusing to run with a vacuously-true unclassified gate');
}
if (NORMALIZED_DEAD_DECISIONS_ARRAY.length === 0) {
  throw new Error('NORMALIZED_DEAD_DECISIONS_ARRAY is empty — refusing to run');
}

pipeline.run('assert-lifecycle-phase-distribution', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // §4: config reads MUST execute inside the lock callback.
    const { logicVars } = await loadMarketplaceConfigs(pool, 'assert-lifecycle-phase-distribution');
    const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'assert-lifecycle-phase-distribution');
    if (!validation.valid) throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
    const unclassifiedMax = logicVars.lifecycle_unclassified_max;
    const seqUnclassifiedMax = logicVars.lifecycle_seq_unclassified_max;
    const stalledThreshold = logicVars.lifecycle_cross_stalled_threshold;
    const activeInspectionThreshold = logicVars.lifecycle_cross_active_inspection_threshold;
    const issuedThreshold = logicVars.lifecycle_cross_issued_threshold;

    // ─── Phase E.5 v4 — per-kind posture-flag extraction ──────────────
    // Operator-driven gate: each per-kind flag independently promotes its
    // violation kind from WARN routing (E.4 default) to FAIL routing.
    const promoteToFail_band_violation        = logicVars.lifecycle_seq_band_promote_to_fail_band_violation === 1;
    const promoteToFail_no_band_configured    = logicVars.lifecycle_seq_band_promote_to_fail_no_band_configured === 1;
    const promoteToFail_expected_data_missing = logicVars.lifecycle_seq_band_promote_to_fail_expected_data_missing === 1;
    const anyPromotePostureActive =
      promoteToFail_band_violation ||
      promoteToFail_no_band_configured ||
      promoteToFail_expected_data_missing;

    // Per-violation posture lookup map. Used by renderPrefix() and at violation
    // push sites to write the `posture` field for Phase F forward-compat.
    const POSTURE_FLAG_BY_KIND = {
      band_violation:        promoteToFail_band_violation,
      no_band_configured:    promoteToFail_no_band_configured,
      expected_data_missing: promoteToFail_expected_data_missing,
    };

    // Per-violation prefix renderer (v4 fold v2-Obs-J-prefix + v3-G-MED-prefix-kind).
    // Each violation in the preview gets its OWN kind-specific prefix — NOT a
    // run-level prefix. Mixed-posture state (e.g., flag_band_violation=1,
    // flag_no_band_configured=0) renders correctly: band_violation violations
    // get [E.5 FAIL POSTURE]; no_band_configured violations get [E.4 WARN-ONLY
    // POSTURE]. Unknown kind falls back to WARN-only (defensive default).
    function renderPrefix(kind) {
      return POSTURE_FLAG_BY_KIND[kind]
        ? `[E.5 FAIL POSTURE — '${kind}' kind halts the pipeline]`
        : '[E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up]';
    }

    // Resolve the per-phase distribution bands from logic_variables.
    const EXPECTED_BANDS = {};
    for (const [label, suffix] of Object.entries(PHASE_TO_LOGIC_VAR_SUFFIX)) {
      EXPECTED_BANDS[label] = {
        min: logicVars[`lifecycle_band_${suffix}_min`],
        max: logicVars[`lifecycle_band_${suffix}_max`],
      };
    }

    // ─── Phase E.4 — startup guard: universal_stream_catalog table exists ───
    const { rows: [{ exists: catalogExists }] } = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables
                       WHERE table_schema = 'public' AND table_name = 'universal_stream_catalog') AS exists`,
    );
    if (!catalogExists) {
      pipeline.log.warn('[assert-lifecycle-phase-distribution]',
        'universal_stream_catalog table missing — Phase B migrations 128/129 not applied. ' +
        'Per-seq assertion DISABLED for this run; phase-keyed assertion continues.');
    }

    // v4 fold v3-DS-CRIT: conditional catalog query — Part 6 startup guard
    // logs WARN if catalogExists=false but does NOT throw. Unconditional
    // SELECT would crash with `relation does not exist`. Guard it.
    let catalogRows = [];
    if (catalogExists) {
      const res = await pool.query(
        `SELECT seq, rows_count FROM universal_stream_catalog ORDER BY seq`,
      );
      catalogRows = res.rows;
    }
    const catalogSeqs = catalogRows.map((r) => r.seq);
    // v4 fold v3-G-LOW: catalog-derived INFO-only set (source of truth);
    // independent of logic_variables (which can be operator-tampered).
    const catalogNullCountSeqs = new Set(
      catalogRows.filter((r) => r.rows_count == null || r.rows_count === 0).map((r) => r.seq),
    );

    // v4 fold v3-Indep-MED-A: empty-catalog guard — catalogExists=true but
    // catalogRows.length=0 (mig 128 applied, mig 129 seed not applied).
    // Without this, seq_bands_total: 0 === 0 → PASS would silently hide the
    // misapplied-migration state.
    const catalogEmptyButPresent = catalogExists && catalogRows.length === 0;
    if (catalogEmptyButPresent) {
      pipeline.log.warn('[assert-lifecycle-phase-distribution]',
        'universal_stream_catalog table exists but is empty (mig 129 seed not applied) — ' +
        'per-seq assertion DISABLED for this run.');
    }

    // ─── Load per-seq bands from logicVars ───────────────────────────
    const seqBands = {};
    let seqBandKeysLoaded = 0;
    for (const seq of catalogSeqs) {
      const minKey = `lifecycle_seq_band_${seq}_min`;
      const maxKey = `lifecycle_seq_band_${seq}_max`;
      if (logicVars[minKey] != null) {
        seqBands[seq] = {
          min: Number(logicVars[minKey]),
          max: logicVars[maxKey] != null ? Number(logicVars[maxKey]) : null,  // null = no upper bound
        };
        seqBandKeysLoaded++;
      }
    }
    if (catalogSeqs.length > 0 && seqBandKeysLoaded < catalogSeqs.length) {
      pipeline.log.warn('[assert-lifecycle-phase-distribution]',
        `Only ${seqBandKeysLoaded}/${catalogSeqs.length} per-seq band keys loaded — ` +
        `mig 148 may not have applied. Per-seq assertion will be partial.`);
    }

    // ─── v4 fold v3-G-CRIT: orphan-key detection ─────────────────────
    // Catches typos (e.g. `_mx` instead of `_max`) that .passthrough() would
    // otherwise silently accept. Throws at startup with explicit recovery hint.
    const catalogSeqSet = new Set(catalogSeqs);
    const orphanKeys = [];
    for (const key of Object.keys(logicVars)) {
      const m = key.match(BAND_KEY_PATTERN);
      if (m) {
        const seqNum = Number(m[1]);
        if (!catalogSeqSet.has(seqNum)) {
          orphanKeys.push(key);
        }
      }
    }
    if (catalogExists && catalogRows.length > 0 && orphanKeys.length > 0) {
      // v4 fold v3-Indep-MED-C: explicit DELETE recovery path. Re-seeding via
      // mig 148 does NOT fix orphans (ON CONFLICT DO NOTHING preserves them).
      throw new Error(
        `[assert-lifecycle-phase-distribution] Orphan band keys in logic_variables ` +
        `(no matching seq in universal_stream_catalog): ${orphanKeys.slice(0, 10).join(', ')}` +
        (orphanKeys.length > 10 ? ` ... (+${orphanKeys.length - 10} more)` : '') +
        `. Likely cause: typo in operator-edited key (e.g. _mx instead of _max), ` +
        `or stale band for a seq removed by a future catalog migration. ` +
        `RECOVERY: delete the orphan key directly — either (a) via Spec 86 ` +
        `Control Panel (/admin/control-panel → marketplace constants → delete), ` +
        `or (b) DELETE FROM logic_variables WHERE variable_key IN (` +
        orphanKeys.slice(0, 3).map((k) => `'${k}'`).join(', ') +
        (orphanKeys.length > 3 ? ', ...' : '') +
        `). Re-seeding via mig 148 does NOT fix orphan keys — ON CONFLICT DO NOTHING ` +
        `preserves them. After deletion, re-run this script to confirm recovery.`,
      );
    }

    // ─── v4 fold v3-G-HIGH: Stage 2 dynamic per-seq band validation ──
    // Static Zod schema can't enumerate runtime catalog keys; validate shape
    // + nonnegativity + min<=max here. Parity with .nonnegative() on phase bands.
    for (const seq of catalogSeqs) {
      const min = logicVars[`lifecycle_seq_band_${seq}_min`];
      const max = logicVars[`lifecycle_seq_band_${seq}_max`];
      if (min != null && (!Number.isFinite(Number(min)) || Number(min) < 0)) {
        throw new Error(`lifecycle_seq_band_${seq}_min: invalid value '${min}' — expected non-negative integer`);
      }
      if (max != null && (!Number.isFinite(Number(max)) || Number(max) < 0)) {
        throw new Error(`lifecycle_seq_band_${seq}_max: invalid value '${max}' — expected non-negative integer or NULL`);
      }
      if (min != null && max != null && Number(min) > Number(max)) {
        throw new Error(`lifecycle_seq_band_${seq}: min (${min}) > max (${max}) — band would never match`);
      }
    }

    // Distribution from permits.lifecycle_phase
    const { rows: permitRows } = await pool.query(
      `SELECT lifecycle_phase, COUNT(*)::int AS n
         FROM permits
        GROUP BY lifecycle_phase`,
    );
    const permitCounts = Object.fromEntries(
      permitRows.map((r) => [r.lifecycle_phase === null ? 'null' : r.lifecycle_phase, r.n]),
    );

    // CoA distribution
    const { rows: coaRows } = await pool.query(
      `SELECT lifecycle_phase, COUNT(*)::int AS n
         FROM coa_applications
        GROUP BY lifecycle_phase`,
    );
    const coaCounts = Object.fromEntries(
      coaRows.map((r) => [r.lifecycle_phase === null ? 'null' : r.lifecycle_phase, r.n]),
    );

    // WF3 Bug #6: merge by SUMMING shared keys, not overwriting.
    const allCounts = { ...permitCounts };
    for (const [phase, count] of Object.entries(coaCounts)) {
      allCounts[phase] = (allCounts[phase] || 0) + count;
    }

    // Compute active sub-stage aggregate
    let p9p17Total = 0;
    for (const phase of ACTIVE_SUBPHASES) {
      p9p17Total += allCounts[phase] || 0;
    }
    allCounts['P9-P17'] = p9p17Total;

    // ─── Phase E.4 — per-seq distribution UNION ALL ──────────────────
    // Reads via the partial indices added by mig 149 (idx_*_lifecycle_seq).
    const { rows: seqRows } = await pool.query(`
      SELECT lifecycle_seq, COUNT(*)::int AS n
        FROM (
          SELECT lifecycle_seq FROM permits          WHERE lifecycle_seq IS NOT NULL
          UNION ALL
          SELECT lifecycle_seq FROM coa_applications WHERE lifecycle_seq IS NOT NULL
        ) u
       GROUP BY lifecycle_seq
       ORDER BY lifecycle_seq
    `);
    const seqDistribution = {};
    for (const r of seqRows) {
      seqDistribution[r.lifecycle_seq] = r.n;
    }

    // ─── Aggregate counter classification per seq ────────────────────
    let seqBandsPassing          = 0;
    let seqBandsWarn             = 0;
    let seqBandsFailing          = 0;  // v4 fold v3-conv-CRIT-body: per-kind reachable in E.5 v4.
    let seqBandsNullCatalogCount = 0;  // v2 fold v1-I-HIGH-1: INFO-only bands count.
    const seqViolations          = [];  // structured: {seq, actual, band_min, band_max, kind, posture}
    // v4 fold v3-conv-CRIT-body: failures/warnings arrays hoisted here (was line 462) so
    // per-kind branch routing can push to them inside the per-seq loop.
    const auditRows = [];
    const failures = [];
    const warnings = [];

    for (const seq of catalogSeqs) {
      const band = seqBands[seq];
      if (!band) continue;  // partial-migration case
      const actual = seqDistribution[seq] || 0;
      // v4 fold v3-G-LOW: use catalog-derived INFO-only set, not band.max === null.
      const isNullCatalog = catalogNullCountSeqs.has(seq);
      // v4 fold v3-G-CRIT-formula: null-aware comparison (operator-tampered
      // null max still defers to catalog-null check above).
      const inBand = !isNullCatalog && actual >= band.min && (band.max === null || actual <= band.max);

      // Pass-2 fold (2026-05-19 Spec 79 §6 CoA chain re-run): per-seq audit row.
      // Replaces the legacy hardcoded phase_PN_count rows with 110 data-driven
      // per-seq rows derived from the universal_stream_catalog snapshot. User
      // direction: "this audit table should emit for each of the 110 seq bands
      // not the old phases". Aggregate counters (seq_bands_*) preserved below.
      const status = isNullCatalog ? 'INFO'
                   : inBand          ? 'PASS'
                   : promoteToFail_band_violation ? 'FAIL'
                   :                                 'WARN';
      auditRows.push({
        metric: `lifecycle_seq_${String(seq).padStart(2, '0')}_count`,
        value: actual,
        threshold: isNullCatalog ? 'no upper bound (catalog rows_count=0)'
                 : band.max === null ? `>= ${band.min} (no upper bound)`
                 :                     `${band.min}..${band.max}`,
        status,
      });

      if (isNullCatalog) {
        seqBandsNullCatalogCount++;
        seqBandsPassing++;
        continue;
      }
      if (inBand) {
        seqBandsPassing++;
      } else {
        // v4 fold v3-conv-CRIT-body: per-kind branch routing — read THIS kind's flag.
        seqViolations.push({
          seq,
          actual,
          band_min: band.min,
          band_max: band.max,
          kind: 'band_violation',
          posture: POSTURE_FLAG_BY_KIND['band_violation'] ? 'fail' : 'warn',
        });
        if (promoteToFail_band_violation) {
          seqBandsFailing++;
          failures.push(`${renderPrefix('band_violation')} seq ${seq}: ${actual} outside expected band [${band.min}, ${band.max ?? '∞'}]`);
        } else {
          seqBandsWarn++;
        }
      }
    }

    // ─── v2 fold v1-DS-HIGH-2 + v3 fold v2-G-HIGH-3: bidirectional symmetric-diff ─
    const distributionSeqs = new Set(Object.keys(seqDistribution).map(Number));
    const bandSeqs = new Set(Object.keys(seqBands).map(Number));
    // Direction 1: seqs in data but not in bands → no_band_configured WARN/FAIL.
    // v4 fold v3-conv-CRIT-body: per-kind branch routing — read THIS kind's flag.
    for (const seq of distributionSeqs) {
      if (!bandSeqs.has(seq)) {
        const actual = seqDistribution[seq];
        seqViolations.push({
          seq,
          actual,
          band_min: null,
          band_max: null,
          kind: 'no_band_configured',
          posture: POSTURE_FLAG_BY_KIND['no_band_configured'] ? 'fail' : 'warn',
        });
        if (promoteToFail_no_band_configured) {
          seqBandsFailing++;
          failures.push(`${renderPrefix('no_band_configured')} seq ${seq}: ${actual} rows but NO BAND configured`);
        } else {
          seqBandsWarn++;
        }
      }
    }
    // Direction 2: seqs in bands but not in data with band.min > 0 →
    // expected_data_missing WARN (data deletion / classifier-skip detection).
    //
    // Diff-review v4 fold (Independent I3): use catalog-derived
    // `catalogNullCountSeqs` set (source of truth) instead of `band.max === null`.
    // Operator-tampered max values must not change the INFO-only classification —
    // it's a property of the catalog, not the band config. Consistent with the
    // main-loop convention (lines above) that uses `catalogNullCountSeqs.has(seq)`.
    // v4 fold v3-conv-CRIT-body: per-kind branch routing for Direction 2.
    for (const seq of bandSeqs) {
      if (!distributionSeqs.has(seq)) {
        const band = seqBands[seq];
        if (band && !catalogNullCountSeqs.has(seq) && band.min > 0) {
          seqViolations.push({
            seq,
            actual: 0,
            band_min: band.min,
            band_max: band.max,
            kind: 'expected_data_missing',
            posture: POSTURE_FLAG_BY_KIND['expected_data_missing'] ? 'fail' : 'warn',
          });
          if (promoteToFail_expected_data_missing) {
            seqBandsFailing++;
            failures.push(`${renderPrefix('expected_data_missing')} seq ${seq}: 0 rows observed (band expects min=${band.min}) — verify classifier coverage, source freshness, or catalog vs production data drift`);
          } else {
            seqBandsWarn++;
          }
        }
      }
    }

    // v3 fold v1-DS-MED-4: cap structured violations at 50 to prevent
    // records_meta payload bloat. Truncated overflow surfaced as scalar.
    const seqViolationsTruncatedCount = Math.max(0, seqViolations.length - SEQ_VIOLATIONS_CAP);
    const seqViolationsCapped = seqViolations.slice(0, SEQ_VIOLATIONS_CAP);

    // ─── Per-seq unclassified count (NULL lifecycle_seq) ─────────────
    const { rows: [{ n: seqUnclassifiedPermits }] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM permits
        WHERE lifecycle_seq IS NULL
          AND status <> ALL($1::text[])
          AND status IS NOT NULL
          AND TRIM(status) <> ''`,
      [DEAD_STATUS_ARRAY],
    );
    // v2 fold v1-I-HIGH-3: linked_permit_num IS NULL filter REMOVED
    // (E.1 fold v1-1 removed Rule 0; classifier now writes lifecycle_seq to
    // ALL CoA rows regardless of link state).
    const { rows: [{ n: seqUnclassifiedCoa }] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM coa_applications
        WHERE lifecycle_seq IS NULL
          AND lower(trim(regexp_replace(COALESCE(decision,''), '\\s+', ' ', 'g')))
              <> ALL($1::text[])
          AND decision IS NOT NULL
          AND TRIM(decision) <> ''`,
      [NORMALIZED_DEAD_DECISIONS_ARRAY],
    );
    const seqUnclassifiedCount = seqUnclassifiedPermits + seqUnclassifiedCoa;

    // ─── Phase-keyed unclassified (existing) ─────────────────────────
    const { rows: unclPermitRows } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM permits
        WHERE lifecycle_phase IS NULL
          AND status <> ALL($1::text[])
          AND status IS NOT NULL
          AND TRIM(status) <> ''`,
      [DEAD_STATUS_ARRAY],
    );
    // Diff-review v4 fold (Gemini MED + DeepSeek MED convergent): the phase-keyed
    // `unclassified_count` query DELIBERATELY KEEPS `linked_permit_num IS NULL`
    // for legacy-shape baseline continuity. The newer per-seq `seq_unclassified_count`
    // query above REMOVES this filter because E.1 fold v1-1 removed Rule 0 and the
    // classifier now writes lifecycle_seq to ALL CoA rows. The phase-keyed counter's
    // 7-day historical baseline (Spec 48 §3.4) would shift if we removed the filter
    // here too — the seq-keyed counter is the post-E.1 correct shape; the phase-keyed
    // counter preserves baseline for the Strangler Fig transition window.
    const { rows: unclCoaRows } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM coa_applications
        WHERE lifecycle_phase IS NULL
          AND linked_permit_num IS NULL
          AND lower(trim(regexp_replace(COALESCE(decision,''), '\\s+', ' ', 'g')))
              <> ALL($1::text[])
          AND decision IS NOT NULL
          AND TRIM(decision) <> ''`,
      [NORMALIZED_DEAD_DECISIONS_ARRAY],
    );
    const unclassifiedCount = unclPermitRows[0].n + unclCoaRows[0].n;

    // ─── Phase-keyed audit rows: RETIRED (Pass-2 fold 2026-05-19) ───────
    // The legacy phase_PN_count audit rows were replaced by 110 per-seq rows
    // emitted in the catalog iteration loop above. The phase-level aggregates
    // are still surfaced via records_meta.phase_distribution (line ~710) for
    // any downstream consumer that prefers the coarser slicing. EXPECTED_BANDS,
    // allCounts, and the lifecycle_band_<suffix>_min/_max logic_variables are
    // preserved for back-compat; their Zod validation still runs at startup.

    auditRows.push({
      metric: 'unclassified_count',
      value: unclassifiedCount,
      threshold: `<= ${unclassifiedMax}`,
      status: unclassifiedCount <= unclassifiedMax ? 'PASS' : 'FAIL',
    });
    if (unclassifiedCount > unclassifiedMax) {
      failures.push(`unclassified_count ${unclassifiedCount} exceeds hard limit ${unclassifiedMax}`);
    }

    // ─── Cross-status checks (preserved) ─────────────────────────────
    const { rows: crossCheck1 } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM permits
        WHERE LOWER(enriched_status) = 'stalled' AND lifecycle_stalled IS NOT TRUE`,
    );
    const crossStalled = crossCheck1[0].n;
    const stalledStatus = crossStalled === 0 ? 'PASS' : crossStalled < stalledThreshold ? 'WARN' : 'FAIL';
    auditRows.push({
      metric: 'cross_check_stalled',
      value: crossStalled,
      threshold: `< ${stalledThreshold} (WARN), >= ${stalledThreshold} (FAIL)`,
      status: stalledStatus,
    });
    if (crossStalled >= stalledThreshold) {
      failures.push(`${crossStalled} permits have enriched_status=Stalled but lifecycle_stalled=false (exceeds ${stalledThreshold} threshold)`);
    } else if (crossStalled > 0) {
      warnings.push(`${crossStalled} permits have enriched_status=Stalled but lifecycle_stalled=false (Strangler Fig drift — legacy column is less accurate)`);
    }

    const { rows: crossCheck2 } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM permits
        WHERE LOWER(enriched_status) = 'active inspection'
          AND (lifecycle_phase NOT IN (
            'P9','P10','P11','P12','P13','P14','P15','P16','P17','P18',
            'O1','O2','O3'
          ) OR lifecycle_phase IS NULL)`,
    );
    const crossActive = crossCheck2[0].n;
    auditRows.push({
      metric: 'cross_check_active_inspection',
      value: crossActive,
      threshold: `< ${activeInspectionThreshold} (WARN), >= ${activeInspectionThreshold} (FAIL)`,
      status: crossActive === 0 ? 'PASS' : crossActive < activeInspectionThreshold ? 'WARN' : 'FAIL',
    });
    if (crossActive >= activeInspectionThreshold) {
      failures.push(`${crossActive} permits with enriched_status=Active Inspection are not in P9-P18/O1-O3 (exceeds ${activeInspectionThreshold} threshold)`);
    } else if (crossActive > 0) {
      warnings.push(`${crossActive} permits with enriched_status=Active Inspection are not in P9-P18/O1-O3 (Strangler Fig drift — legacy column is less accurate)`);
    }

    const { rows: crossCheck3 } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM permits
        WHERE LOWER(enriched_status) = 'permit issued'
          AND (lifecycle_phase NOT IN ('P7a','P7b','P7c','P7d','P8','P18',
               'O1','O2','O3')
               OR lifecycle_phase IS NULL)`,
    );
    const crossIssued = crossCheck3[0].n;
    auditRows.push({
      metric: 'cross_check_permit_issued',
      value: crossIssued,
      threshold: `< ${issuedThreshold} (WARN), >= ${issuedThreshold} (FAIL)`,
      status: crossIssued === 0 ? 'PASS' : crossIssued < issuedThreshold ? 'WARN' : 'FAIL',
    });
    if (crossIssued >= issuedThreshold) {
      failures.push(`${crossIssued} permits with enriched_status=Permit Issued are not in P7a/b/c/d/P8/P18/O1-O3 (exceeds ${issuedThreshold} threshold)`);
    }

    // ─── Phase E.4 — 6 new audit_table rows ──────────────────────────
    // v4 fold v3-Indep-MED-A + v3-DS-MED-threshold: empty-catalog override +
    // bifurcated threshold message.
    const seqBandsTotalStatus =
      catalogEmptyButPresent ? 'WARN' :
      Object.keys(seqBands).length === catalogSeqs.length ? 'PASS' : 'WARN';
    const seqBandsTotalThreshold = catalogEmptyButPresent
      ? '0 rows in universal_stream_catalog — verify mig 129 seed applied (expected ~110)'
      : `== ${catalogSeqs.length} expected (dynamic from universal_stream_catalog; WARN on partial mig 148 apply)`;
    auditRows.push({
      metric: 'seq_bands_total',
      value: Object.keys(seqBands).length,
      threshold: seqBandsTotalThreshold,
      status: seqBandsTotalStatus,
    });
    // v3 fold v2-Obs-HIGH-2 + v4 fold: posture-prefixed warning when WARN.
    if (seqBandsTotalStatus === 'WARN') {
      if (catalogEmptyButPresent) {
        warnings.push(
          '[E.4 STARTUP STATE] universal_stream_catalog table exists but is empty ' +
          '(mig 129 seed not applied) — per-seq assertion DISABLED for this run. ' +
          'Apply mig 129 to enable per-seq gating.',
        );
      } else {
        warnings.push(
          '[E.4 WARN-ONLY POSTURE — partial mig 148 apply expected during ramp-up] ' +
          `seq_bands_total ${Object.keys(seqBands).length}/${catalogSeqs.length} band keys loaded — ` +
          'verify mig 148 applied cleanly. Per-seq assertion will be partial until next migration apply.',
        );
      }
    }
    auditRows.push({
      metric: 'seq_bands_passing',
      value: seqBandsPassing,
      threshold: null,
      status: 'INFO',
    });
    // v2 fold v1-I-HIGH-1: decomposition signal — distinguishes "real PASS"
    // from "INFO-only PASS" (NULL rows_count catalog branch).
    auditRows.push({
      metric: 'seq_bands_null_catalog_count',
      value: seqBandsNullCatalogCount,
      threshold: null,
      status: 'INFO',
    });
    auditRows.push({
      metric: 'seq_bands_warn',
      value: seqBandsWarn,
      threshold: '== 0 PASS, > 0 WARN (E.4 first-deploy posture; E.5 tightens to FAIL)',
      status: seqBandsWarn === 0 ? 'PASS' : 'WARN',
    });
    auditRows.push({
      metric: 'seq_bands_failing',
      value: seqBandsFailing,
      threshold: '== 0 PASS, > 0 FAIL (E.5 posture-gated — fires when any of the 3 lifecycle_seq_band_promote_to_fail_* flags is 1 and a matching violation occurs)',
      status: seqBandsFailing === 0 ? 'PASS' : 'FAIL',
    });
    // ─── Phase E.5 v4 — 3 per-kind posture audit rows ────────────────
    // Each row's status flips INFO→WARN per its own flag (so extractIssues()
    // surfaces armed-posture rows in every post-promotion run's DeepSeek
    // narrative for operator visibility).
    auditRows.push({
      metric: 'lifecycle_seq_band_promote_to_fail_band_violation',
      value: promoteToFail_band_violation ? 1 : 0,
      threshold: '0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates `band_violation` kind. See Spec 84 §3.4.',
      status: promoteToFail_band_violation ? 'WARN' : 'INFO',
    });
    auditRows.push({
      metric: 'lifecycle_seq_band_promote_to_fail_no_band_configured',
      value: promoteToFail_no_band_configured ? 1 : 0,
      threshold: '0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates `no_band_configured` kind (operator config gap). See Spec 84 §3.4.',
      status: promoteToFail_no_band_configured ? 'WARN' : 'INFO',
    });
    auditRows.push({
      metric: 'lifecycle_seq_band_promote_to_fail_expected_data_missing',
      value: promoteToFail_expected_data_missing ? 1 : 0,
      threshold: '0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates `expected_data_missing` kind (data deletion / classifier-skip signal). See Spec 84 §3.4.',
      status: promoteToFail_expected_data_missing ? 'WARN' : 'INFO',
    });
    auditRows.push({
      metric: 'seq_unclassified_count',
      value: seqUnclassifiedCount,
      threshold: `<= ${seqUnclassifiedMax} (WARN above)`,
      status: seqUnclassifiedCount <= seqUnclassifiedMax ? 'PASS' : 'WARN',
    });

    // v3 fold v1-O-CRIT + v4 fold v3-Indep-HIGH-F + v4 fold v3-conv-CRIT-body:
    // surface top-10 violations via warnings[] (visible to followup file).
    // Emit guard expanded to fire under FAIL posture too (seqBandsFailing > 0
    // when anyPromotePostureActive — per-kind promotion paths increment it).
    if (seqBandsWarn > 0 || (anyPromotePostureActive && seqBandsFailing > 0)) {
      const previewCount = Math.min(10, seqViolationsCapped.length);
      const renderViolation = (v) => {
        if (v.kind === 'no_band_configured') {
          return `seq ${v.seq}: ${v.actual} rows but NO BAND configured`;
        }
        if (v.kind === 'expected_data_missing') {
          // v4 fold v3-Indep+Obs-MED: neutral rendering (4-hypothesis prompt).
          return `seq ${v.seq}: 0 rows observed (band expects min=${v.band_min}) — verify classifier coverage, source freshness, or catalog vs production data drift`;
        }
        return `seq ${v.seq}: ${v.actual} outside [${v.band_min}, ${v.band_max ?? '∞'}]`;
      };
      // v4 fold v2-Obs-J-prefix: per-violation prefix selection (NOT per-run).
      // Mixed-posture state: each violation gets its OWN kind-specific prefix.
      const preview = seqViolationsCapped.slice(0, previewCount).map((v) =>
        `${renderPrefix(v.kind)} ${renderViolation(v)}`
      ).join('; ');
      const remainderInRecordsMeta = seqViolationsCapped.length - previewCount;
      const truncatedSuffix = seqViolationsTruncatedCount > 0
        ? ` (${seqViolationsTruncatedCount} additional violations TRUNCATED — see records_meta.seq_violations_truncated_count)`
        : '';
      const totalViolations = seqBandsWarn + seqBandsFailing;
      warnings.push(
        `${totalViolations} per-seq bands outside expected range (${seqBandsFailing} FAIL, ${seqBandsWarn} WARN) — first ${previewCount}: ${preview}` +
        (remainderInRecordsMeta > 0 ? ` ... (+${remainderInRecordsMeta} more in records_meta.seq_violations)` : '') +
        truncatedSuffix,
      );
    }
    if (seqUnclassifiedCount > seqUnclassifiedMax) {
      warnings.push(
        `[E.4 WARN-ONLY POSTURE] seq_unclassified_count ${seqUnclassifiedCount} exceeds ${seqUnclassifiedMax} — ` +
        'Phase D/E.2 first-run state likely; verify classifier coverage. ' +
        '(In steady state seq_unclassified_count >= unclassified_count; the two converge as E.5 ramps up.)',
      );
    }

    const verdict = failures.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';

    if (failures.length > 0) {
      pipeline.log.error('[assert-lifecycle-phase-distribution]', 'FAILURES', { failures });
    }
    if (warnings.length > 0) {
      pipeline.log.warn('[assert-lifecycle-phase-distribution]', 'WARNINGS', { warnings });
    }

    pipeline.emitSummary({
      // Exclude the synthetic 'P9-P17' aggregate key to avoid double-counting.
      records_total: Object.entries(allCounts)
        .filter(([k]) => k !== 'P9-P17')
        .reduce((sum, [, n]) => sum + n, 0),
      records_new: 0,
      records_updated: 0,
      records_meta: {
        phase_distribution: allCounts,
        unclassified_count: unclassifiedCount,
        // Phase E.4 — per Spec 48 §3.2: distributions in records_meta, NOT
        // in audit_table.rows. Observer's extractIssues() reads only audit rows.
        seq_distribution: seqDistribution,
        seq_violations: seqViolationsCapped,
        seq_violations_truncated_count: seqViolationsTruncatedCount,
        audit_table: {
          phase: 22,
          name: 'Assert Lifecycle Phase Distribution',
          verdict,
          rows: auditRows,
        },
      },
    });

    pipeline.emitMeta(
      {
        permits: ['lifecycle_phase', 'lifecycle_seq', 'lifecycle_stalled', 'enriched_status', 'status'],
        coa_applications: ['lifecycle_phase', 'lifecycle_seq', 'linked_permit_num', 'decision'],
        universal_stream_catalog: ['seq', 'rows_count'],
      },
      {},
    );

    if (failures.length > 0) {
      throw new Error(`Distribution sanity check FAILED (${failures.length} failures):\n${failures.join('\n')}`);
    }
  }, { skipEmit: false }); // end withAdvisoryLock

  if (!lockResult.acquired) {
    pipeline.log.info(
      '[assert-lifecycle-phase-distribution]',
      `Advisory lock ${ADVISORY_LOCK_ID} held by classifier — skipping assertion to avoid false-positive.`,
    );
    pipeline.emitSummary({
      records_total: 0,
      records_new: 0,
      records_updated: 0,
      records_meta: {
        skipped: true,
        reason: 'classifier_running',
        advisory_lock_id: ADVISORY_LOCK_ID,
      },
    });
    pipeline.emitMeta({}, {});
    return;
  }
});
