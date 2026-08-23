'use strict';
require('dotenv/config');
// Spec 122 §P0 — the single database-target resolver (fail-loud, floor-asserted).
const { createResolvedPool } = require('../lib/resolve-db');
const pool = createResolvedPool({ label: '_tmp_reset_coa_links' });
(async () => {
  // Reset parcel_linked_at on CoAs that have NO lead_parcels link so link_coa_to_parcels reprocesses
  // them (now that street_name_normalized is backfilled, they can match via the Spec 54 bridge).
  const r = await pool.query(`
    UPDATE coa_applications ca
       SET parcel_linked_at = NULL
     WHERE ca.lead_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM lead_parcels lp WHERE lp.lead_id = ca.lead_id AND lp.lead_id LIKE 'coa:%')`);
  console.log(`reset parcel_linked_at on ${r.rowCount} unlinked CoAs`);
  await pool.end();
})().catch(e=>{console.error(e);process.exitCode=1});
