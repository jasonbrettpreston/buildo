#!/usr/bin/env node
/**
 * Run all queries for scope classification accuracy report.
 * Usage: node scripts/scope-report-queries.js
 */
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

// BLD permit types that get scope tags directly (not companions)
const BLD_TYPES = [
  'Small Residential Projects',
  'Building Additions/Alterations',
  'New Houses',
  'New Building',
  'Residential Building Permit',
  'Non-Residential Building Permit',
  'Designated Structures',
  'Temporary Structures',
  'Partial Permit',
  'Multiple Use Permit',
  'Conditional Permit',
  'Fire/Security Upgrade',
];

const COMPANION_TYPES = [
  'Plumbing(PS)',
  'Mechanical(MS)',
  'Drain and Site Service',
  'Demolition Folder (DM)',
];

async function run() {
  // Q1: Universe counts by extractor path
  console.log('=== Q1: Universe Counts by Extractor Path ===');
  const q1 = await pool.query(`
    SELECT
      CASE
        WHEN permit_type = 'Small Residential Projects' THEN 'SRP (residential extractor)'
        WHEN permit_type = 'New Houses' THEN 'New House (new house extractor)'
        WHEN permit_type IN ('Building Additions/Alterations', 'New Building', 'Residential Building Permit',
          'Non-Residential Building Permit', 'Designated Structures', 'Temporary Structures',
          'Partial Permit', 'Multiple Use Permit', 'Conditional Permit', 'Fire/Security Upgrade') THEN 'General BLD (general extractor)'
        WHEN permit_type IN ('Plumbing(PS)', 'Mechanical(MS)', 'Drain and Site Service', 'Demolition Folder (DM)') THEN 'Companion (propagated)'
        ELSE 'Other'
      END as extractor_path,
      COUNT(*) as total,
      COUNT(CASE WHEN scope_tags IS NOT NULL AND scope_tags != '{}' THEN 1 END) as with_tags,
      COUNT(CASE WHEN scope_tags IS NULL OR scope_tags = '{}' THEN 1 END) as zero_tags,
      ROUND(100.0 * COUNT(CASE WHEN scope_tags IS NOT NULL AND scope_tags != '{}' THEN 1 END) / NULLIF(COUNT(*), 0), 1) as tag_pct
    FROM permits
    GROUP BY 1
    ORDER BY total DESC
  `);
  console.table(q1.rows);

  // Q2a: Precision — storey-addition on Interior Alteration work
  console.log('\n=== Q2a: Storey-addition on Interior Alteration (false positive check) ===');
  const q2a = await pool.query(`
    SELECT COUNT(*) as storey_addition_on_interior
    FROM permits
    WHERE scope_tags::text LIKE '%storey-addition%'
      AND work ILIKE '%interior alteration%'
  `);
  console.log(JSON.stringify(q2a.rows));

  // Q2b: Addition-of false positives
  console.log('\n=== Q2b: Addition-of False Positives ===');
  const q2b = await pool.query(`
    SELECT COUNT(*) as addition_of_false_positives
    FROM permits
    WHERE scope_tags::text LIKE '%storey-addition%'
      AND description ~* 'addition of'
      AND description !~* '(add|construct|build|erect).*(storey|floor|level)'
  `);
  console.log(JSON.stringify(q2b.rows));

  // Total storey-addition count for context
  const q2c = await pool.query(`
    SELECT COUNT(*) as total_storey_addition
    FROM permits WHERE scope_tags::text LIKE '%storey-addition%'
  `);
  console.log('Total storey-addition tagged:', q2c.rows[0].total_storey_addition);

  // Q3: Zero-tag rates by extractor, excluding Party Wall
  console.log('\n=== Q3: Zero-tag Rates (excl Party Wall) ===');
  const q3 = await pool.query(`
    SELECT
      CASE
        WHEN permit_type = 'Small Residential Projects' THEN 'SRP'
        WHEN permit_type = 'New Houses' THEN 'New House'
        WHEN permit_type IN ('Building Additions/Alterations', 'New Building') THEN 'General BLD'
        WHEN permit_type IN ('Plumbing(PS)', 'Mechanical(MS)', 'Drain and Site Service') THEN 'Companion'
        ELSE permit_type
      END as extractor_path,
      COUNT(*) as total,
      COUNT(CASE WHEN scope_tags IS NULL OR scope_tags = '{}' THEN 1 END) as zero_tags,
      ROUND(100.0 * COUNT(CASE WHEN scope_tags IS NULL OR scope_tags = '{}' THEN 1 END) / NULLIF(COUNT(*), 0), 1) as zero_pct
    FROM permits
    WHERE work != 'Party Wall Admin Permits' OR work IS NULL
    GROUP BY 1
    ORDER BY total DESC
  `);
  console.table(q3.rows);

  // Party wall count for context
  const q3b = await pool.query(`SELECT COUNT(*) as party_wall FROM permits WHERE work = 'Party Wall Admin Permits'`);
  console.log('Party Wall permits (excluded):', q3b.rows[0].party_wall);

  // Q4: Concept gap analysis — description concepts without matching tags
  console.log('\n=== Q4: Concept Gap Analysis (BLD permits) ===');
  const q4 = await pool.query(`
    SELECT
      concept,
      COUNT(*) as mention_count,
      ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM permits), 2) as pct_of_all
    FROM (
      SELECT 'stairs' as concept FROM permits WHERE description ~* '(stair|staircase|stairway)'
      UNION ALL
      SELECT 'windows' FROM permits WHERE description ~* '(window|fenestration)'
      UNION ALL
      SELECT 'driveway' FROM permits WHERE description ~* '(driveway)'
      UNION ALL
      SELECT 'retaining-wall' FROM permits WHERE description ~* '(retaining\\s+wall)'
      UNION ALL
      SELECT 'hvac-mention' FROM permits WHERE description ~* '(hvac|furnace|air\\s*condition|heat\\s*pump|ductwork)'
      UNION ALL
      SELECT 'plumbing-mention' FROM permits WHERE description ~* '(plumb|drain|sewer|water\\s*line|backflow)'
      UNION ALL
      SELECT 'electrical-mention' FROM permits WHERE description ~* '(electr|wiring|panel\\s*upgrade|circuit)'
    ) concepts
    GROUP BY concept
    ORDER BY mention_count DESC
  `);
  console.table(q4.rows);

  // Q5a: Scope source distribution
  console.log('\n=== Q5a: Scope Source Distribution ===');
  const q5a = await pool.query(`
    SELECT scope_source, COUNT(*) as cnt,
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as pct
    FROM permits
    WHERE scope_source IS NOT NULL
    GROUP BY scope_source
    ORDER BY cnt DESC
  `);
  console.table(q5a.rows);

  // Q5b: Companion permits with BLD sibling that has tags but companion has none
  console.log('\n=== Q5b: Propagation Coverage ===');
  const q5b = await pool.query(`
    SELECT
      COUNT(*) as total_companions,
      COUNT(CASE WHEN scope_tags IS NOT NULL AND scope_tags != '{}' THEN 1 END) as with_tags,
      COUNT(CASE WHEN scope_tags IS NULL OR scope_tags = '{}' THEN 1 END) as without_tags,
      COUNT(CASE WHEN scope_source = 'propagated' THEN 1 END) as propagated
    FROM permits
    WHERE permit_type IN ('Plumbing(PS)', 'Mechanical(MS)', 'Drain and Site Service', 'Demolition Folder (DM)')
  `);
  console.table(q5b.rows);

  // Q6: Dedup co-occurrence (should be 0 for correctly deduped pairs)
  console.log('\n=== Q6: Dedup Co-occurrence ===');
  const q6 = await pool.query(`
    SELECT
      tag_pair,
      COUNT(*) as co_occurrence
    FROM (
      SELECT 'deck+porch' as tag_pair FROM permits
      WHERE scope_tags::text LIKE '%deck%' AND scope_tags::text LIKE '%porch%'
      UNION ALL
      SELECT 'garage+carport' FROM permits
      WHERE scope_tags::text LIKE '%garage%' AND scope_tags::text LIKE '%carport%'
      UNION ALL
      SELECT 'underpinning+walkout' FROM permits
      WHERE scope_tags::text LIKE '%underpinning%' AND scope_tags::text LIKE '%walkout%'
      UNION ALL
      SELECT 'new:deck+alter:deck' FROM permits
      WHERE scope_tags::text LIKE '%new:deck%' AND scope_tags::text LIKE '%alter:deck%'
      UNION ALL
      SELECT 'new:garage+alter:garage' FROM permits
      WHERE scope_tags::text LIKE '%new:garage%' AND scope_tags::text LIKE '%alter:garage%'
      UNION ALL
      SELECT 'basement+underpinning (dedup)' FROM permits
      WHERE scope_tags::text LIKE '%new:basement%' AND scope_tags::text LIKE '%new:underpinning%'
      UNION ALL
      SELECT 'basement+second-suite (dedup)' FROM permits
      WHERE scope_tags::text LIKE '%new:basement%' AND scope_tags::text LIKE '%new:second-suite%'
      UNION ALL
      SELECT 'second-suite+interior-alt (dedup)' FROM permits
      WHERE scope_tags::text LIKE '%new:second-suite%' AND scope_tags::text LIKE '%alter:interior-alterations%'
    ) pairs
    GROUP BY tag_pair
    ORDER BY co_occurrence DESC
  `);
  console.table(q6.rows);

  // Q7: Top 40 tags
  console.log('\n=== Q7: Top 40 Tags ===');
  const q7 = await pool.query(`
    SELECT tag, COUNT(*) as cnt,
      ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM permits WHERE scope_tags IS NOT NULL AND scope_tags != '{}'), 2) as pct_of_tagged
    FROM permits, LATERAL unnest(scope_tags) as tag
    WHERE scope_tags IS NOT NULL AND scope_tags != '{}'
    GROUP BY tag
    ORDER BY cnt DESC
    LIMIT 40
  `);
  console.table(q7.rows);

  // Q8: Project type distribution
  console.log('\n=== Q8: Project Type Distribution ===');
  const q8 = await pool.query(`
    SELECT
      COALESCE(project_type, 'NULL') as project_type,
      COUNT(*) as cnt,
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as pct
    FROM permits
    GROUP BY project_type
    ORDER BY cnt DESC
    LIMIT 15
  `);
  console.table(q8.rows);

  // Q9: SRP Systems Gap (residential permits mentioning HVAC/plumbing/electrical)
  console.log('\n=== Q9: SRP Systems Gap ===');
  const q9 = await pool.query(`
    SELECT
      concept,
      total_mentions::int,
      has_matching_tag::int,
      (total_mentions - has_matching_tag)::int as gap,
      ROUND(100.0 * (total_mentions - has_matching_tag) / NULLIF(total_mentions, 0), 1) as gap_pct
    FROM (
      SELECT 'hvac' as concept,
        COUNT(*) FILTER (WHERE description ~* '(hvac|furnace|air\\s*condition|heat\\s*pump|ductwork)') as total_mentions,
        COUNT(*) FILTER (WHERE description ~* '(hvac|furnace|air\\s*condition|heat\\s*pump|ductwork)' AND scope_tags::text ~* 'hvac') as has_matching_tag
      FROM permits WHERE permit_type = 'Small Residential Projects'
      UNION ALL
      SELECT 'plumbing',
        COUNT(*) FILTER (WHERE description ~* '(plumb|drain|sewer|water\\s*line|backflow)'),
        COUNT(*) FILTER (WHERE description ~* '(plumb|drain|sewer|water\\s*line|backflow)' AND scope_tags::text ~* 'plumb')
      FROM permits WHERE permit_type = 'Small Residential Projects'
      UNION ALL
      SELECT 'electrical',
        COUNT(*) FILTER (WHERE description ~* '(electr|wiring|panel\\s*upgrade|circuit)'),
        COUNT(*) FILTER (WHERE description ~* '(electr|wiring|panel\\s*upgrade|circuit)' AND scope_tags::text ~* 'electr')
      FROM permits WHERE permit_type = 'Small Residential Projects'
    ) sys
  `);
  console.table(q9.rows);

  // Q10: Total counts
  console.log('\n=== Q10: Total Counts ===');
  const q10a = await pool.query("SELECT COUNT(*) as total_permits FROM permits");
  const q10b = await pool.query("SELECT COUNT(*) as srp FROM permits WHERE permit_type = 'Small Residential Projects'");
  const q10c = await pool.query("SELECT COUNT(*) as new_house FROM permits WHERE permit_type = 'New Houses'");
  const q10d = await pool.query("SELECT COUNT(*) as with_tags FROM permits WHERE scope_tags IS NOT NULL AND scope_tags != '{}'");
  console.log('Total permits:', q10a.rows[0].total_permits);
  console.log('SRP:', q10b.rows[0].srp);
  console.log('New Houses:', q10c.rows[0].new_house);
  console.log('With tags:', q10d.rows[0].with_tags);

  // Q11: New vs Alter prefix distribution
  console.log('\n=== Q11: New vs Alter prefix distribution ===');
  const q11 = await pool.query(`
    SELECT tag, COUNT(*) as cnt
    FROM permits, LATERAL unnest(scope_tags) as tag
    WHERE scope_tags IS NOT NULL AND scope_tags != '{}'
      AND tag ~ '^(new:|alter:)(deck|porch|garage)'
    GROUP BY tag
    ORDER BY cnt DESC
  `);
  console.table(q11.rows);

  // Q12: Avg tags per permit by extractor
  console.log('\n=== Q12: Avg tags per tagged permit ===');
  const q12 = await pool.query(`
    SELECT
      CASE
        WHEN permit_type = 'Small Residential Projects' THEN 'SRP'
        WHEN permit_type = 'New Houses' THEN 'New House'
        ELSE 'Other'
      END as path,
      COUNT(*) as tagged_permits,
      SUM(array_length(scope_tags, 1)) as total_tags,
      ROUND(AVG(array_length(scope_tags, 1)), 2) as avg_tags
    FROM permits
    WHERE scope_tags IS NOT NULL AND scope_tags != '{}'
    GROUP BY 1
    ORDER BY tagged_permits DESC
  `);
  console.table(q12.rows);

  pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
