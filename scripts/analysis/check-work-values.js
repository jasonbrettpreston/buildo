const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'buildo', user:'postgres', password:'postgres' });

async function run() {
  console.log('=== DECK (sample 15) ===');
  const decks = await pool.query(
    "SELECT description FROM permits WHERE permit_type='Small Residential Projects' AND work='Deck' AND description IS NOT NULL ORDER BY issued_date DESC NULLS LAST LIMIT 15"
  );
  decks.rows.forEach(r => console.log('  ' + (r.description || '').substring(0,140)));

  console.log('\n=== PORCH (sample 15) ===');
  const porches = await pool.query(
    "SELECT description FROM permits WHERE permit_type='Small Residential Projects' AND work='Porch' AND description IS NOT NULL ORDER BY issued_date DESC NULLS LAST LIMIT 15"
  );
  porches.rows.forEach(r => console.log('  ' + (r.description || '').substring(0,140)));

  console.log('\n=== GARAGE (sample 15) ===');
  const garages = await pool.query(
    "SELECT description FROM permits WHERE permit_type='Small Residential Projects' AND work='Garage' AND description IS NOT NULL ORDER BY issued_date DESC NULLS LAST LIMIT 15"
  );
  garages.rows.forEach(r => console.log('  ' + (r.description || '').substring(0,140)));

  console.log('\n=== OTHER(SR) (sample 25) ===');
  const others = await pool.query(
    "SELECT description FROM permits WHERE permit_type='Small Residential Projects' AND work='Other(SR)' AND description IS NOT NULL ORDER BY issued_date DESC NULLS LAST LIMIT 25"
  );
  others.rows.forEach(r => console.log('  ' + (r.description || '').substring(0,140)));

  // How many Deck/Porch/Garage mention repair/replace/existing?
  console.log('\n=== DECK/PORCH/GARAGE: new vs repair/replace breakdown ===');
  const breakdown = await pool.query(`
    SELECT work,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE description ~* 'repair|replace|replac|reconstruct|rebuild') as repair_replace,
      COUNT(*) FILTER (WHERE description ~* 'new|construct|propos|build') as new_construct,
      COUNT(*) FILTER (WHERE description ~* 'existing') as mentions_existing
    FROM permits
    WHERE permit_type='Small Residential Projects' AND work IN ('Deck','Porch','Garage')
    GROUP BY work ORDER BY work
  `);
  breakdown.rows.forEach(r => {
    console.log(`  ${r.work}: ${r.total} total | ${r.new_construct} mention new/construct | ${r.repair_replace} mention repair/replace | ${r.mentions_existing} mention existing`);
  });

  // Garage Repair vs Garage
  console.log('\n=== Is there a separate "Garage Repair" work value? ===');
  const garageRepair = await pool.query(
    "SELECT work, COUNT(*) as cnt FROM permits WHERE permit_type='Small Residential Projects' AND work LIKE '%Garage%' GROUP BY work ORDER BY cnt DESC"
  );
  garageRepair.rows.forEach(r => console.log(`  ${r.work}: ${r.cnt}`));

  await pool.end();
}
run();
