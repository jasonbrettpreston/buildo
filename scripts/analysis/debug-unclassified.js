#!/usr/bin/env node
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/buildo',
});

(async () => {
  const r = await pool.query(
    `SELECT p.permit_num, p.description, p.work, p.permit_type, p.scope_tags
     FROM permits p
     LEFT JOIN (SELECT DISTINCT permit_num FROM permit_trades WHERE is_active = true) pt
       ON pt.permit_num = p.permit_num
     WHERE 'residential' = ANY(p.scope_tags)
       AND p.status IN ('Permit Issued','Revision Issued','Under Review','Inspection')
       AND pt.permit_num IS NULL
       AND p.scope_tags IS NOT NULL
       AND array_length(p.scope_tags, 1) > 1
     ORDER BY random()
     LIMIT 50`
  );

  for (const row of r.rows) {
    const tags = (row.scope_tags || []).filter(t => t !== 'residential').join(', ');
    console.log('---');
    console.log('Permit:  ' + row.permit_num);
    console.log('Type:    ' + row.permit_type);
    console.log('Work:    ' + row.work);
    console.log('Desc:    ' + (row.description || '').substring(0, 200));
    console.log('Tags:    ' + tags);
  }

  // Also count total
  const count = await pool.query(
    `SELECT COUNT(*) as count
     FROM permits p
     LEFT JOIN (SELECT DISTINCT permit_num FROM permit_trades WHERE is_active = true) pt
       ON pt.permit_num = p.permit_num
     WHERE 'residential' = ANY(p.scope_tags)
       AND p.status IN ('Permit Issued','Revision Issued','Under Review','Inspection')
       AND pt.permit_num IS NULL`
  );
  console.log('\n=== Total unclassified residential permits: ' + count.rows[0].count + ' ===');

  await pool.end();
})();
