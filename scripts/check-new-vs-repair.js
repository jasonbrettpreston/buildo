const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'buildo', user:'postgres', password:'postgres' });

async function run() {
  // For each of deck/porch/garage, show repair-type descriptions vs new-type
  for (const item of ['deck', 'porch', 'garage']) {
    console.log(`\n=== ${item.toUpperCase()} — "repair/replace" descriptions (15 samples) ===`);
    const repairs = await pool.query(`
      SELECT description FROM permits
      WHERE permit_type = 'Small Residential Projects'
        AND description ~* '${item}'
        AND description ~* 'repair|replace|reconstruct|refinish|restore|existing.*${item}|${item}.*existing'
        AND description IS NOT NULL
      ORDER BY issued_date DESC NULLS LAST LIMIT 15
    `);
    repairs.rows.forEach(r => console.log('  ' + (r.description || '').substring(0, 160)));

    console.log(`\n=== ${item.toUpperCase()} — "new/construct" descriptions (15 samples) ===`);
    const newOnes = await pool.query(`
      SELECT description FROM permits
      WHERE permit_type = 'Small Residential Projects'
        AND description ~* '${item}'
        AND description ~* 'new.*${item}|${item}.*new|construct.*${item}|propos.*${item}|build.*${item}'
        AND NOT description ~* 'repair|replace|reconstruct|refinish|restore'
      ORDER BY issued_date DESC NULLS LAST LIMIT 15
    `);
    newOnes.rows.forEach(r => console.log('  ' + (r.description || '').substring(0, 160)));
  }

  // Check keyword signals for new vs repair
  console.log('\n\n=== KEYWORD ANALYSIS: How to distinguish new vs repair ===');
  for (const item of ['deck', 'porch', 'garage']) {
    const kw = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE description ~* 'new\\s+${item}|new\\s+\\w+\\s+${item}') as has_new,
        COUNT(*) FILTER (WHERE description ~* 'construct.*${item}|${item}.*construct') as has_construct,
        COUNT(*) FILTER (WHERE description ~* 'propos.*${item}|${item}.*propos') as has_propose,
        COUNT(*) FILTER (WHERE description ~* 'repair.*${item}|${item}.*repair') as has_repair,
        COUNT(*) FILTER (WHERE description ~* 'replace.*${item}|${item}.*replace') as has_replace,
        COUNT(*) FILTER (WHERE description ~* 'reconstruct.*${item}|${item}.*reconstruct') as has_reconstruct,
        COUNT(*) FILTER (WHERE description ~* 'demolish.*${item}|${item}.*demolish') as has_demolish_near,
        COUNT(*) FILTER (WHERE description ~* 'existing.*${item}|${item}.*existing') as has_existing
      FROM permits
      WHERE permit_type = 'Small Residential Projects'
        AND description ~* '${item}'
    `);
    const r = kw.rows[0];
    console.log(`\n  ${item.toUpperCase()} (${r.total} total):`);
    console.log(`    "new [item]": ${r.has_new}`);
    console.log(`    "construct": ${r.has_construct}`);
    console.log(`    "propos": ${r.has_propose}`);
    console.log(`    "repair": ${r.has_repair}`);
    console.log(`    "replace": ${r.has_replace}`);
    console.log(`    "reconstruct": ${r.has_reconstruct}`);
    console.log(`    "demolish" nearby: ${r.has_demolish_near}`);
    console.log(`    "existing" nearby: ${r.has_existing}`);
  }

  await pool.end();
}
run();
