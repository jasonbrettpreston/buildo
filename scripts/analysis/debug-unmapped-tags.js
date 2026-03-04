#!/usr/bin/env node
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/buildo',
});

(async () => {
  // All distinct scope tags on residential permits (excluding use-type tags)
  const result = await pool.query(
    `SELECT tag, COUNT(*) as count
     FROM (
       SELECT unnest(scope_tags) as tag FROM permits
       WHERE 'residential' = ANY(scope_tags)
         AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection')
     ) sub
     WHERE tag NOT IN ('residential', 'commercial', 'mixed-use')
     GROUP BY tag
     ORDER BY count DESC`
  );

  // Matrix keys (what has trade mappings)
  const matrixKeys = new Set([
    'kitchen','bathroom','basement','pool','deck','porch','garage','fence',
    'garden_suite','laneway','build-sfd','semi','townhouse','houseplex','apartment',
    'tenant-fitout','retail','office','restaurant','warehouse',
    'hvac','plumbing','electrical','fire_alarm','sprinkler',
    'underpinning','foundation','addition','roof','cladding','windows',
    'solar','ev_charger','elevator','interior','fireplace',
    'high-rise','mid-rise','demolition','security',
  ]);

  // Normalize function matching scope.ts
  function normalizeTag(tag) {
    let base = tag.replace(/^(new|alter|sys|scale|exp):/, '');
    base = base.replace(/^houseplex-\d+-unit$/, 'houseplex');
    return base;
  }

  console.log('=== ALL SCOPE TAGS ON RESIDENTIAL PERMITS ===\n');
  console.log('TAG                              COUNT    MAPPED?');
  console.log('─'.repeat(60));

  let unmappedTotal = 0;
  const unmapped = [];

  for (const row of result.rows) {
    const normalized = normalizeTag(row.tag);
    const hasTrade = matrixKeys.has(normalized);
    const marker = hasTrade ? '  YES' : '  *** NO ***';
    console.log(`${row.tag.padEnd(33)} ${row.count.toString().padStart(6)}  ${marker}`);
    if (!hasTrade) {
      unmappedTotal += parseInt(row.count);
      unmapped.push({ tag: row.tag, normalized, count: parseInt(row.count) });
    }
  }

  console.log('\n=== UNMAPPED TAGS (no trade associations) ===\n');
  for (const u of unmapped) {
    console.log(`  ${u.tag.padEnd(35)} ${u.count.toString().padStart(6)} permits   (normalizes to: "${u.normalized}")`);
  }
  console.log(`\n  Total permits with unmapped tags: ${unmappedTotal}`);

  // Also check: how many residential permits have NO scope_tags at all?
  const noTags = await pool.query(
    `SELECT COUNT(*) as count FROM permits
     WHERE 'residential' = ANY(scope_tags)
       AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection')
       AND (scope_tags IS NULL OR array_length(scope_tags, 1) <= 1)`
  );
  console.log(`\n  Residential permits with ONLY the 'residential' tag (no feature tags): ${noTags.rows[0].count}`);

  // How many residential permits have trades?
  const withTrades = await pool.query(
    `SELECT COUNT(DISTINCT p.permit_num) as count
     FROM permits p
     JOIN permit_trades pt ON pt.permit_num = p.permit_num AND pt.is_active = true
     WHERE 'residential' = ANY(p.scope_tags)
       AND p.status IN ('Permit Issued','Revision Issued','Under Review','Inspection')`
  );
  const totalRes = await pool.query(
    `SELECT COUNT(*) as count FROM permits
     WHERE 'residential' = ANY(scope_tags)
       AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection')`
  );
  console.log(`  Residential with trades: ${withTrades.rows[0].count} / ${totalRes.rows[0].count}`);

  await pool.end();
})();
