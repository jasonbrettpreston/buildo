const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'buildo', user:'postgres', password:'postgres' });

async function run() {
  // Check exact work values containing 'addition'
  console.log('=== Work values containing "addition" (case insensitive) ===');
  const workVals = await pool.query(`
    SELECT work, COUNT(*) as cnt,
      COUNT(*) FILTER (WHERE description IS NOT NULL AND description != '') as has_desc
    FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work ~* 'addition'
    GROUP BY work ORDER BY cnt DESC
  `);
  workVals.rows.forEach(r => console.log('  "' + r.work + '": ' + r.cnt + ' total, ' + r.has_desc + ' with description'));

  // Sample Addition(s) permits - show all fields
  console.log('\n=== Addition(s) sample permits (first 10) ===');
  const samples = await pool.query(`
    SELECT permit_num, work, description, structure_type
    FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Addition(s)'
    ORDER BY issued_date DESC NULLS LAST LIMIT 10
  `);
  samples.rows.forEach(r => {
    console.log('  ' + r.permit_num + ' | work: "' + r.work + '" | struct: ' + r.structure_type);
    console.log('    desc: ' + (r.description ? '"' + r.description.substring(0, 140) + '"' : 'NULL'));
  });

  // How many Addition(s) have null/empty descriptions?
  console.log('\n=== Addition(s) description stats ===');
  const stats = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE description IS NULL) as null_desc,
      COUNT(*) FILTER (WHERE description = '') as empty_desc,
      COUNT(*) FILTER (WHERE description IS NOT NULL AND description != '') as has_desc
    FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Addition(s)'
  `);
  const s = stats.rows[0];
  console.log('  Total:', s.total, '| NULL:', s.null_desc, '| Empty:', s.empty_desc, '| Has desc:', s.has_desc);

  await pool.end();
}
run();
