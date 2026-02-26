const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'buildo', user:'postgres', password:'postgres' });

async function run() {
  // Sample descriptions mentioning second/secondary suite in Multiple Projects
  console.log('=== "SECOND SUITE" in Multiple Projects — sample 25 descriptions ===');
  const samples = await pool.query(`
    SELECT description FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Multiple Projects'
      AND description ~* 'second suite|secondary suite|2nd suite|second unit|secondary unit'
      AND description IS NOT NULL
    ORDER BY issued_date DESC NULLS LAST LIMIT 25
  `);
  samples.rows.forEach(r => console.log('  ' + (r.description || '').substring(0, 180)));

  // Where in the house is the second suite?
  console.log('\n=== WHERE is the second suite? ===');
  const where = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE description ~* 'basement.{0,30}(second|secondary|2nd).{0,10}(suite|unit)' OR description ~* '(second|secondary|2nd).{0,10}(suite|unit).{0,30}basement') as basement_suite,
      COUNT(*) FILTER (WHERE description ~* 'basement') as mentions_basement,
      COUNT(*) FILTER (WHERE description ~* 'laneway') as mentions_laneway,
      COUNT(*) FILTER (WHERE description ~* 'garden suite') as mentions_garden,
      COUNT(*) FILTER (WHERE description ~* 'rear yard suite') as mentions_rear_yard
    FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Multiple Projects'
      AND description ~* 'second suite|secondary suite|2nd suite|second unit|secondary unit'
      AND description IS NOT NULL
  `);
  const w = where.rows[0];
  console.log('  Total with second suite mention:', w.total);
  console.log('  Also mention basement:', w.mentions_basement);
  console.log('  Basement + suite co-located:', w.basement_suite);
  console.log('  Also mention laneway:', w.mentions_laneway);
  console.log('  Also mention garden suite:', w.mentions_garden);
  console.log('  Also mention rear yard suite:', w.mentions_rear_yard);

  // Also check the dedicated "Second Suite (New)" work value
  console.log('\n=== "Second Suite (New)" work value — sample 15 descriptions ===');
  const dedicated = await pool.query(`
    SELECT description FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND TRIM(work) = 'Second Suite (New)'
      AND description IS NOT NULL AND description != ''
    ORDER BY issued_date DESC NULLS LAST LIMIT 15
  `);
  dedicated.rows.forEach(r => console.log('  ' + (r.description || '').substring(0, 180)));

  console.log('\n=== "Second Suite (New)" — where is it? ===');
  const dedicated2 = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE description ~* 'basement') as basement,
      COUNT(*) FILTER (WHERE description ~* 'laneway') as laneway,
      COUNT(*) FILTER (WHERE description ~* 'garden') as garden,
      COUNT(*) FILTER (WHERE description ~* 'ground floor|main floor|first floor') as ground_floor,
      COUNT(*) FILTER (WHERE description ~* 'attic|third floor|3rd floor') as upper_floor
    FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND TRIM(work) = 'Second Suite (New)'
      AND description IS NOT NULL
  `);
  const d = dedicated2.rows[0];
  console.log('  Total:', d.total);
  console.log('  Basement:', d.basement);
  console.log('  Laneway:', d.laneway);
  console.log('  Garden:', d.garden);
  console.log('  Ground/main/first floor:', d.ground_floor);
  console.log('  Attic/third/3rd floor:', d.upper_floor);

  await pool.end();
}
run();
