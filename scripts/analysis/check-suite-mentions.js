const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'buildo', user:'postgres', password:'postgres' });

async function run() {
  const r = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE description ~* 'laneway') as laneway,
      COUNT(*) FILTER (WHERE description ~* 'garden suite') as garden_suite,
      COUNT(*) FILTER (WHERE description ~* 'rear yard suite') as rear_yard_suite,
      COUNT(*) FILTER (WHERE description ~* 'laneway|garden suite|rear yard suite') as any_suite
    FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Multiple Projects'
      AND description IS NOT NULL
  `);
  console.log('Multiple Projects totals:');
  console.log('  Total:', r.rows[0].total);
  console.log('  Mention laneway:', r.rows[0].laneway);
  console.log('  Mention garden suite:', r.rows[0].garden_suite);
  console.log('  Mention rear yard suite:', r.rows[0].rear_yard_suite);
  console.log('  Any suite mention:', r.rows[0].any_suite);

  console.log('\n=== SAMPLE DESCRIPTIONS mentioning laneway/garden/rear yard suite ===');
  const samples = await pool.query(`
    SELECT description FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Multiple Projects'
      AND description ~* 'laneway|garden suite|rear yard suite'
    ORDER BY issued_date DESC NULLS LAST LIMIT 15
  `);
  samples.rows.forEach(r => console.log('  ' + (r.description || '').substring(0, 160)));

  console.log('\n=== STRUCTURE_TYPE for Multiple Projects + suite mention ===');
  const st = await pool.query(`
    SELECT structure_type, COUNT(*) as cnt FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Multiple Projects'
      AND description ~* 'laneway|garden suite|rear yard suite'
    GROUP BY structure_type ORDER BY cnt DESC
  `);
  st.rows.forEach(r => console.log('  ' + (r.structure_type || 'NULL') + ': ' + r.cnt));

  await pool.end();
}
run();
