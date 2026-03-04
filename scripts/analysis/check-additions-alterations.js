const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'buildo', user:'postgres', password:'postgres' });

async function run() {
  // Addition(s) - sample descriptions
  console.log('=== ADDITION(S) — sample 25 descriptions ===');
  const additions = await pool.query(`
    SELECT description FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Addition(s)'
      AND description IS NOT NULL AND description != ''
    ORDER BY issued_date DESC NULLS LAST LIMIT 25
  `);
  additions.rows.forEach(r => console.log('  ' + (r.description || '').substring(0, 160)));

  // Addition(s) - common keywords
  console.log('\n=== ADDITION(S) — keyword breakdown ===');
  const addKeywords = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE description ~* 'rear') as rear,
      COUNT(*) FILTER (WHERE description ~* 'side') as side,
      COUNT(*) FILTER (WHERE description ~* 'front') as front,
      COUNT(*) FILTER (WHERE description ~* 'storey|story') as storey_mention,
      COUNT(*) FILTER (WHERE description ~* 'two storey|2 storey|2-storey|second storey') as two_storey,
      COUNT(*) FILTER (WHERE description ~* 'three storey|3 storey|3-storey|third storey') as three_storey,
      COUNT(*) FILTER (WHERE description ~* 'one storey|1 storey|1-storey|single storey') as one_storey,
      COUNT(*) FILTER (WHERE description ~* 'basement|underpin') as basement,
      COUNT(*) FILTER (WHERE description ~* 'deck') as deck,
      COUNT(*) FILTER (WHERE description ~* 'porch') as porch,
      COUNT(*) FILTER (WHERE description ~* 'dormer') as dormer,
      COUNT(*) FILTER (WHERE description ~* 'garage') as garage,
      COUNT(*) FILTER (WHERE description ~* 'interior alter') as interior_alter
    FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Addition(s)'
      AND description IS NOT NULL
  `);
  const a = addKeywords.rows[0];
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

  // Interior Alterations - sample descriptions
  console.log('\n=== INTERIOR ALTERATIONS — sample 25 descriptions ===');
  const alterations = await pool.query(`
    SELECT description FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Interior Alterations'
      AND description IS NOT NULL AND description != ''
    ORDER BY issued_date DESC NULLS LAST LIMIT 25
  `);
  alterations.rows.forEach(r => console.log('  ' + (r.description || '').substring(0, 160)));

  // Interior Alterations - common keywords
  console.log('\n=== INTERIOR ALTERATIONS — keyword breakdown ===');
  const altKeywords = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE description ~* 'load.?bearing|bearing wall') as load_bearing_wall,
      COUNT(*) FILTER (WHERE description ~* 'open concept') as open_concept,
      COUNT(*) FILTER (WHERE description ~* 'basement') as basement,
      COUNT(*) FILTER (WHERE description ~* 'kitchen') as kitchen,
      COUNT(*) FILTER (WHERE description ~* 'bath|washroom') as bathroom,
      COUNT(*) FILTER (WHERE description ~* 'underpin') as underpinning,
      COUNT(*) FILTER (WHERE description ~* 'second suite|secondary suite|2nd suite|second unit|secondary unit') as second_suite,
      COUNT(*) FILTER (WHERE description ~* 'renovation|renovate|remodel') as renovation,
      COUNT(*) FILTER (WHERE description ~* 'beam|lvl|steel') as structural_beam,
      COUNT(*) FILTER (WHERE description ~* 'wall remov|remove.*wall') as wall_removal,
      COUNT(*) FILTER (WHERE description ~* 'plumbing') as plumbing,
      COUNT(*) FILTER (WHERE description ~* 'electrical') as electrical,
      COUNT(*) FILTER (WHERE description ~* 'fireplace|chimney') as fireplace
    FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Interior Alterations'
      AND description IS NOT NULL
  `);
  const b = altKeywords.rows[0];
  console.log('  Total:', b.total);
  console.log('  Load bearing wall:', b.load_bearing_wall);
  console.log('  Open concept:', b.open_concept);
  console.log('  Basement:', b.basement);
  console.log('  Kitchen:', b.kitchen);
  console.log('  Bathroom:', b.bathroom);
  console.log('  Underpinning:', b.underpinning);
  console.log('  Second suite:', b.second_suite);
  console.log('  Renovation:', b.renovation);
  console.log('  Structural beam:', b.structural_beam);
  console.log('  Wall removal:', b.wall_removal);
  console.log('  Plumbing:', b.plumbing);
  console.log('  Electrical:', b.electrical);
  console.log('  Fireplace/chimney:', b.fireplace);

  await pool.end();
}
run();
