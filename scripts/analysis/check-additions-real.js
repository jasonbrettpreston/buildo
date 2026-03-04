const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'buildo', user:'postgres', password:'postgres' });

async function run() {
  // Sample Addition(s) descriptions (using LIKE to handle trailing space)
  console.log('=== ADDITION(S) — sample 25 descriptions ===');
  const additions = await pool.query(`
    SELECT description FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND TRIM(work) = 'Addition(s)'
      AND description IS NOT NULL AND description != ''
    ORDER BY issued_date DESC NULLS LAST LIMIT 25
  `);
  additions.rows.forEach(r => console.log('  ' + (r.description || '').substring(0, 160)));

  // Keyword breakdown
  console.log('\n=== ADDITION(S) — keyword breakdown ===');
  const kw = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE description ~* 'rear') as rear,
      COUNT(*) FILTER (WHERE description ~* '\\mside\\M') as side,
      COUNT(*) FILTER (WHERE description ~* 'front') as front,
      COUNT(*) FILTER (WHERE description ~* 'storey|story') as storey_mention,
      COUNT(*) FILTER (WHERE description ~* 'one storey|1 storey|1-storey|single storey') as one_storey,
      COUNT(*) FILTER (WHERE description ~* 'two storey|2 storey|2-storey|second storey') as two_storey,
      COUNT(*) FILTER (WHERE description ~* 'three storey|3 storey|3-storey|third storey') as three_storey,
      COUNT(*) FILTER (WHERE description ~* 'basement|underpin') as basement,
      COUNT(*) FILTER (WHERE description ~* 'deck') as deck,
      COUNT(*) FILTER (WHERE description ~* 'porch') as porch,
      COUNT(*) FILTER (WHERE description ~* 'dormer') as dormer,
      COUNT(*) FILTER (WHERE description ~* 'garage') as garage,
      COUNT(*) FILTER (WHERE description ~* 'interior alter') as interior_alter,
      COUNT(*) FILTER (WHERE description ~* 'kitchen') as kitchen,
      COUNT(*) FILTER (WHERE description ~* 'bath|washroom') as bathroom
    FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND TRIM(work) = 'Addition(s)'
      AND description IS NOT NULL
  `);
  const a = kw.rows[0];
  console.log('  Total:', a.total);
  console.log('  Rear:', a.rear);
  console.log('  Side:', a.side);
  console.log('  Front:', a.front);
  console.log('  Any storey mention:', a.storey_mention);
  console.log('    1 storey:', a.one_storey);
  console.log('    2 storey:', a.two_storey);
  console.log('    3 storey:', a.three_storey);
  console.log('  Basement/underpin:', a.basement);
  console.log('  Deck:', a.deck);
  console.log('  Porch:', a.porch);
  console.log('  Dormer:', a.dormer);
  console.log('  Garage:', a.garage);
  console.log('  Interior alterations:', a.interior_alter);
  console.log('  Kitchen:', a.kitchen);
  console.log('  Bathroom:', a.bathroom);

  await pool.end();
}
run();
