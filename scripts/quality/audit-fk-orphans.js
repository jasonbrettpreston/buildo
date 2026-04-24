#!/usr/bin/env node
/**
 * FK Orphan Audit — read-only scan of every parent-child relationship.
 *
 * Counts child rows with no matching parent for each known relationship
 * in the schema. Output is a sorted console.table with tier classification,
 * orphan count, and orphan percentage to guide FK-hardening decisions.
 *
 * Tier 1 = FK already enforced at DB level (should be 0 orphans)
 * Tier 2 = No FK yet — must clean before adding constraint
 * Tier 3 = Soft reference — structural limitation prevents FK
 *
 * 100% read-only — no writes, no schema changes.
 *
 * Usage: node scripts/quality/audit-fk-orphans.js
 *
 * SPEC LINK: docs/specs/00-architecture/01_database_schema.md
 */
'use strict';

const pipeline = require('../lib/pipeline');

// ---------------------------------------------------------------------------
// Relationship registry
//
// nullable: true  => only examine rows where ALL childCols are NOT NULL.
//                    Total and orphaned counts both scoped to that subset.
// note: string   => shown in output for Tier 3 to explain the limitation.
// ---------------------------------------------------------------------------
const RELATIONSHIPS = [
  // ─── Tier 1: FK enforced at DB level (expect 0 orphans) ─────────────────
  {
    tier: 1,
    child: 'permit_trades',
    parent: 'permits',
    childCols: ['permit_num', 'revision_num'],
    parentCols: ['permit_num', 'revision_num'],
  },
  {
    tier: 1,
    child: 'permit_trades',
    parent: 'trades',
    childCols: ['trade_id'],
    parentCols: ['id'],
  },
  {
    tier: 1,
    child: 'permit_parcels',
    parent: 'permits',
    childCols: ['permit_num', 'revision_num'],
    parentCols: ['permit_num', 'revision_num'],
  },
  {
    tier: 1,
    child: 'permit_parcels',
    parent: 'parcels',
    childCols: ['parcel_id'],
    parentCols: ['id'],
  },
  {
    tier: 1,
    child: 'parcel_buildings',
    parent: 'parcels',
    childCols: ['parcel_id'],
    parentCols: ['id'],
  },
  {
    tier: 1,
    child: 'parcel_buildings',
    parent: 'building_footprints',
    childCols: ['building_id'],
    parentCols: ['id'],
  },
  {
    tier: 1,
    child: 'trade_mapping_rules',
    parent: 'trades',
    childCols: ['trade_id'],
    parentCols: ['id'],
  },
  {
    tier: 1,
    child: 'cost_estimates',
    parent: 'permits',
    childCols: ['permit_num', 'revision_num'],
    parentCols: ['permit_num', 'revision_num'],
  },
  {
    tier: 1,
    child: 'permit_phase_transitions',
    parent: 'permits',
    childCols: ['permit_num', 'revision_num'],
    parentCols: ['permit_num', 'revision_num'],
  },
  {
    tier: 1,
    child: 'trade_forecasts',
    parent: 'permits',
    childCols: ['permit_num', 'revision_num'],
    parentCols: ['permit_num', 'revision_num'],
  },
  {
    tier: 1,
    child: 'entity_contacts',
    parent: 'entities',
    childCols: ['entity_id'],
    parentCols: ['id'],
  },
  {
    tier: 1,
    child: 'entity_projects',
    parent: 'entities',
    childCols: ['entity_id'],
    parentCols: ['id'],
  },
  {
    tier: 1,
    child: 'entity_projects',
    parent: 'permits',
    childCols: ['permit_num', 'revision_num'],
    parentCols: ['permit_num', 'revision_num'],
    nullable: true,
  },
  {
    tier: 1,
    child: 'wsib_registry',
    parent: 'entities',
    childCols: ['linked_entity_id'],
    parentCols: ['id'],
    nullable: true,
  },
  {
    tier: 1,
    child: 'lead_views',
    parent: 'permits',
    childCols: ['permit_num', 'revision_num'],
    parentCols: ['permit_num', 'revision_num'],
    nullable: true,
  },
  {
    tier: 1,
    child: 'lead_views',
    parent: 'entities',
    childCols: ['entity_id'],
    parentCols: ['id'],
    nullable: true,
  },
  {
    tier: 1,
    child: 'permit_products',
    parent: 'product_groups',
    childCols: ['product_id'],
    parentCols: ['id'],
  },

  // ─── Tier 1 (promoted by migration 109_fk_hardening.sql, 2026-04-24) ────────
  {
    tier: 1,
    child: 'permit_history',
    parent: 'permits',
    childCols: ['permit_num', 'revision_num'],
    parentCols: ['permit_num', 'revision_num'],
  },
  {
    tier: 1,
    child: 'permit_history',
    parent: 'sync_runs',
    childCols: ['sync_run_id'],
    parentCols: ['id'],
    nullable: true,
  },
  {
    tier: 1,
    child: 'tracked_projects',
    parent: 'permits',
    childCols: ['permit_num', 'revision_num'],
    parentCols: ['permit_num', 'revision_num'],
  },
  {
    tier: 1,
    child: 'permits',
    parent: 'neighbourhoods',
    childCols: ['neighbourhood_id'],
    parentCols: ['id'],
    nullable: true,
  },
  {
    tier: 1,
    child: 'permit_products',
    parent: 'permits',
    childCols: ['permit_num', 'revision_num'],
    parentCols: ['permit_num', 'revision_num'],
  },

  // ─── Tier 3: Soft reference — structural limitation prevents FK ──────────
  {
    tier: 3,
    child: 'permit_inspections',
    parent: 'permits',
    childCols: ['permit_num'],
    parentCols: ['permit_num'],
    note: 'Single-col ref to composite PK — any revision match accepted',
  },
  {
    tier: 3,
    child: 'coa_applications',
    parent: 'permits',
    childCols: ['linked_permit_num'],
    parentCols: ['permit_num'],
    nullable: true,
    note: 'Single-col ref to composite PK — intentionally omitted (see migration 039)',
  },
  {
    tier: 3,
    child: 'notifications',
    parent: 'permits',
    childCols: ['permit_num'],
    parentCols: ['permit_num'],
    nullable: true,
    note: 'Single-col ref to composite PK — FK structurally impossible',
  },
];

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

/**
 * Build a COUNT query that returns { total, orphaned }.
 * When nullable=true, total and orphaned are both scoped to non-null FK rows.
 */
function buildOrphanQuery(rel) {
  const joinCondition = rel.childCols
    .map((col, i) => `p.${rel.parentCols[i]} = c.${col}`)
    .join(' AND ');

  const notExistsClause =
    `NOT EXISTS (SELECT 1 FROM ${rel.parent} p WHERE ${joinCondition})`;

  if (rel.nullable) {
    const notNullFilter = rel.childCols
      .map(col => `c.${col} IS NOT NULL`)
      .join(' AND ');

    return `
      SELECT
        COUNT(*) FILTER (WHERE ${notNullFilter})                             AS total,
        COUNT(*) FILTER (WHERE ${notNullFilter} AND ${notExistsClause})     AS orphaned
      FROM ${rel.child} c
    `;
  }

  return `
    SELECT
      COUNT(*)                                    AS total,
      COUNT(*) FILTER (WHERE ${notExistsClause})  AS orphaned
    FROM ${rel.child} c
  `;
}

// ---------------------------------------------------------------------------
// Tier labels
// ---------------------------------------------------------------------------
const TIER_LABEL = {
  1: '1 (FK enforced)',
  2: '2 (no FK yet)',
  3: '3 (soft ref)',
};

const FK_STATUS = {
  1: 'enforced',
  2: 'none',
  3: 'blocked',
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

module.exports = { RELATIONSHIPS };

if (require.main === module) {
pipeline.run('audit-fk-orphans', async (pool) => {
  // eslint-disable-next-line no-console
  console.log('\n=== FK Orphan Audit — Read-Only ===\n');

  const results = [];
  let errors = 0;

  for (const rel of RELATIONSHIPS) {
    const sql = buildOrphanQuery(rel);
    const fkLabel = rel.childCols.join(', ');

    let total = 0;
    let orphaned = 0;

    try {
      const res = await pool.query(sql);
      total    = parseInt(res.rows[0].total,    10);
      orphaned = parseInt(res.rows[0].orphaned, 10);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`  ERROR checking ${rel.child} → ${rel.parent}: ${err.message}`);
      errors++;
      results.push({
        Tier:        TIER_LABEL[rel.tier],
        'Child Table': rel.child,
        'Parent Table': rel.parent,
        'FK Cols':   fkLabel,
        'FK Status': FK_STATUS[rel.tier],
        Total:       'ERROR',
        Orphaned:    'ERROR',
        'Orphan %':  'ERROR',
        Note:        rel.note || '',
      });
      continue;
    }

    const pct = total > 0
      ? ((orphaned / total) * 100).toFixed(2) + '%'
      : '—';

    results.push({
      Tier:          TIER_LABEL[rel.tier],
      'Child Table': rel.child,
      'Parent Table': rel.parent,
      'FK Cols':     fkLabel,
      'FK Status':   FK_STATUS[rel.tier],
      Total:         total,
      Orphaned:      orphaned,
      'Orphan %':    pct,
      Note:          rel.note || '',
    });
  }

  // Sort: tier ASC, then orphaned DESC so worst offenders surface first within tier.
  results.sort((a, b) => {
    const tierA = parseInt(a.Tier, 10);
    const tierB = parseInt(b.Tier, 10);
    if (tierA !== tierB) return tierA - tierB;
    const orphA = typeof a.Orphaned === 'number' ? a.Orphaned : -1;
    const orphB = typeof b.Orphaned === 'number' ? b.Orphaned : -1;
    return orphB - orphA;
  });

  // eslint-disable-next-line no-console
  console.table(results);

  // ── Summary ──────────────────────────────────────────────────────────────
  const numeric = results.filter(r => typeof r.Orphaned === 'number');
  const dirty   = numeric.filter(r => r.Orphaned > 0);
  const tier2Dirty = dirty.filter(r => r.Tier.startsWith('2'));
  const tier1Dirty = dirty.filter(r => r.Tier.startsWith('1'));

  // eslint-disable-next-line no-console
  console.log('\n── Summary ──────────────────────────────────────────────────');
  // eslint-disable-next-line no-console
  console.log(`  Relationships checked : ${RELATIONSHIPS.length}`);
  // eslint-disable-next-line no-console
  console.log(`  Clean (0 orphans)     : ${numeric.length - dirty.length}`);
  // eslint-disable-next-line no-console
  console.log(`  Dirty (has orphans)   : ${dirty.length}`);
  // eslint-disable-next-line no-console
  console.log(`  Query errors          : ${errors}`);

  if (tier1Dirty.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\n  ⚠️  CONSTRAINT VIOLATION — Tier 1 FK enforced but orphans found:');
    for (const r of tier1Dirty) {
      // eslint-disable-next-line no-console
      console.log(`    ${r['Child Table']} → ${r['Parent Table']}: ${r.Orphaned} orphaned rows`);
    }
  }

  if (tier2Dirty.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\n  🔴 MUST CLEAN before adding FK (Tier 2 with orphans):');
    for (const r of tier2Dirty) {
      // eslint-disable-next-line no-console
      console.log(`    ${r['Child Table']} → ${r['Parent Table']}: ${r.Orphaned} orphaned rows`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('\n  ✅  All Tier 2 relationships are clean — safe to add FK constraints.');
  }

  const verdict = tier1Dirty.length > 0 ? 'CONSTRAINT VIOLATION' : tier2Dirty.length > 0 ? 'ORPHANS FOUND' : 'CLEAN';
  // eslint-disable-next-line no-console
  console.log(`\n  Verdict: ${verdict}`);
  // eslint-disable-next-line no-console
  console.log('─────────────────────────────────────────────────────────────\n');

  pipeline.emitSummary({
    records_total:   RELATIONSHIPS.length,
    records_new:     0,
    records_updated: 0,
    records_meta: {
      relationships_checked: RELATIONSHIPS.length,
      clean:   numeric.length - dirty.length,
      dirty:   dirty.length,
      errors,
      verdict,
    },
  });
});
} // require.main
