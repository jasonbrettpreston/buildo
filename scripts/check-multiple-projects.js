const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'buildo', user:'postgres', password:'postgres' });

async function run() {
  console.log('=== MULTIPLE PROJECTS — keyword breakdown (19,221 permits) ===\n');
  const kw = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE description ~* 'addition') as addition,
      COUNT(*) FILTER (WHERE description ~* 'rear') as rear,
      COUNT(*) FILTER (WHERE description ~* 'interior alter') as interior_alter,
      COUNT(*) FILTER (WHERE description ~* 'storey|story') as storey_mention,
      COUNT(*) FILTER (WHERE description ~* 'one storey|1 storey|1-storey|single storey') as one_storey,
      COUNT(*) FILTER (WHERE description ~* 'two storey|2 storey|2-storey|second storey') as two_storey,
      COUNT(*) FILTER (WHERE description ~* 'three storey|3 storey|3-storey|third storey') as three_storey,
      COUNT(*) FILTER (WHERE description ~* 'basement') as basement,
      COUNT(*) FILTER (WHERE description ~* 'underpin') as underpinning,
      COUNT(*) FILTER (WHERE description ~* 'deck') as deck,
      COUNT(*) FILTER (WHERE description ~* 'porch') as porch,
      COUNT(*) FILTER (WHERE description ~* 'garage') as garage,
      COUNT(*) FILTER (WHERE description ~* 'walkout|walk-out|walk out') as walkout,
      COUNT(*) FILTER (WHERE description ~* 'dormer') as dormer,
      COUNT(*) FILTER (WHERE description ~* 'kitchen') as kitchen,
      COUNT(*) FILTER (WHERE description ~* 'bath|washroom') as bathroom,
      COUNT(*) FILTER (WHERE description ~* 'second suite|secondary suite|2nd suite|second unit|secondary unit') as second_suite,
      COUNT(*) FILTER (WHERE description ~* 'load.?bearing|bearing wall') as load_bearing_wall,
      COUNT(*) FILTER (WHERE description ~* 'open concept') as open_concept,
      COUNT(*) FILTER (WHERE description ~* 'renovation|renovate|remodel') as renovation,
      COUNT(*) FILTER (WHERE description ~* 'demolish|demolition') as demolition,
      COUNT(*) FILTER (WHERE description ~* 'roof') as roof,
      COUNT(*) FILTER (WHERE description ~* 'balcon') as balcony,
      COUNT(*) FILTER (WHERE description ~* 'pool') as pool,
      COUNT(*) FILTER (WHERE description ~* 'fence|fencing') as fence,
      COUNT(*) FILTER (WHERE description ~* 'laneway') as laneway,
      COUNT(*) FILTER (WHERE description ~* 'carport') as carport,
      COUNT(*) FILTER (WHERE description ~* 'canopy') as canopy,
      COUNT(*) FILTER (WHERE description ~* 'foundation') as foundation,
      COUNT(*) FILTER (WHERE description ~* 'hvac|furnace|air condition|heat pump') as hvac,
      COUNT(*) FILTER (WHERE description ~* 'plumbing') as plumbing,
      COUNT(*) FILTER (WHERE description ~* 'electrical') as electrical,
      COUNT(*) FILTER (WHERE description ~* 'solar') as solar,
      COUNT(*) FILTER (WHERE description ~* 'fire damage|fire restoration') as fire_damage,
      COUNT(*) FILTER (WHERE description ~* '\\mside\\M') as side,
      COUNT(*) FILTER (WHERE description ~* 'front') as front
    FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Multiple Projects'
      AND description IS NOT NULL
  `);
  const r = kw.rows[0];

  // Sort by count descending
  const items = [
    ['Addition', r.addition],
    ['Rear', r.rear],
    ['Interior alterations', r.interior_alter],
    ['Any storey mention', r.storey_mention],
    ['  1 storey', r.one_storey],
    ['  2 storey', r.two_storey],
    ['  3 storey', r.three_storey],
    ['Basement', r.basement],
    ['Deck', r.deck],
    ['Underpinning', r.underpinning],
    ['Porch', r.porch],
    ['Garage', r.garage],
    ['Front', r.front],
    ['Side', r.side],
    ['Roof', r.roof],
    ['Walkout', r.walkout],
    ['Dormer', r.dormer],
    ['Kitchen', r.kitchen],
    ['Bathroom', r.bathroom],
    ['Second suite', r.second_suite],
    ['Load bearing wall', r.load_bearing_wall],
    ['Renovation', r.renovation],
    ['Demolition', r.demolition],
    ['Balcony', r.balcony],
    ['Foundation', r.foundation],
    ['Open concept', r.open_concept],
    ['Carport', r.carport],
    ['Canopy', r.canopy],
    ['Pool', r.pool],
    ['Fence', r.fence],
    ['Laneway', r.laneway],
    ['HVAC', r.hvac],
    ['Plumbing', r.plumbing],
    ['Electrical', r.electrical],
    ['Solar', r.solar],
    ['Fire damage', r.fire_damage],
  ];

  // Sort by count desc (skip indented sub-items)
  const sorted = items.sort((a, b) => parseInt(b[1]) - parseInt(a[1]));

  console.log('Total:', r.total);
  console.log('');
  for (const [label, count] of sorted) {
    const pct = (parseInt(count) / parseInt(r.total) * 100).toFixed(1);
    const bar = '#'.repeat(Math.round(parseInt(count) / parseInt(r.total) * 50));
    console.log(`  ${label.padEnd(25)} ${String(count).padStart(6)}  (${pct.padStart(5)}%)  ${bar}`);
  }

  // Sample 15 descriptions
  console.log('\n=== MULTIPLE PROJECTS — sample 15 descriptions ===');
  const samples = await pool.query(`
    SELECT description FROM permits
    WHERE permit_type = 'Small Residential Projects'
      AND work = 'Multiple Projects'
      AND description IS NOT NULL AND description != ''
    ORDER BY issued_date DESC NULLS LAST LIMIT 15
  `);
  samples.rows.forEach(r => console.log('  ' + (r.description || '').substring(0, 180)));

  await pool.end();
}
run();
