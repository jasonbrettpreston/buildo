// Full-field parcel dump for EYEBALLING + cross-validating the sanity audit. Picks a diverse sample
// (a few parcels flagged by different audit checks + several that trip NOTHING), dumps EVERY enriched
// field per parcel, and annotates each with the exact audit checks it trips. Read the raw values next
// to the flags: an implausible value with NO flag = an audit MISS to add a check for.
// Target DB: DATABASE_URL when set, else the Docker dev DB — via the shared makeCliPool (C6).
// Usage: node scripts/analysis/parcel-field-dump.js [id,id,...]
'use strict';
const { CHECKS, RES, makeCliPool } = require('./parcel-sanity-audit.js');

// The enriched field families to show (real column names verified against the live schema).
const FIELDS = {
  zoning: ['zoning_class', 'zoning_is_ambiguous', 'bylaw_max_fsi', 'bylaw_max_coverage_pct', 'bylaw_max_height_m', 'bylaw_max_stories', 'bylaw_max_units', 'bylaw_standard_setback_m'],
  lot: ['lot_size_sqm', 'lot_size_confidence', 'is_heritage_designated', 'is_in_ravine_protection_area', 'is_corner_lot', 'abuts_laneway'],
  maxbuild: ['max_buildable_footprint_sqm', 'max_buildable_gfa_sqm', 'max_buildable_gfa_basis', 'max_build_stories', 'max_build_stories_basis', 'max_build_height_m', 'max_build_width_m', 'max_build_length_m', 'max_build_confidence', 'max_build_fsi'],
  existing: ['cur_floor_gfa_sqm', 'cur_pot_2story_gfa_sqm', 'existing_stories', 'existing_height_m', 'existing_width_m', 'existing_length_m', 'existing_greenspace_sqm', 'existing_other_structures_sqm', 'existing_structure_confidence', 'existing_data_quality_flag'],
  optconfig: ['opt_aor_gfa_sqm', 'opt_aor_storeys', 'opt_coa_gfa_sqm', 'opt_coa_storeys', 'opt_suite_type', 'opt_binding_constraint', 'opt_config_confidence', 'coa_fsi', 'realized_fsi_p90', 'comp_fsi_p50'],
  accessory: ['max_garden_suite_gfa_sqm', 'max_laneway_suite_gfa_sqm', 'max_rear_suite_gfa_sqm', 'max_garage_gfa_sqm', 'rear_suite_permission', 'garage_permission'],
  cost: ['neighbourhood_cost_premium', 'cost_fb_total', 'cost_coa_total', 'cost_gut_total', 'cost_addition_total', 'cost_garden_suite_total', 'cost_garage_total', 'cost_kitchen_per_sqm', 'cost_basement_per_sqm'],
};
const ALLCOLS = Object.values(FIELDS).flat();

(async () => {
  // C6: shares makeCliPool with the sanity audit — DATABASE_URL-aware +
  // logs the graded target (see parcel-sanity-audit.js for the rationale).
  const pool = makeCliPool('parcel-field-dump');

  // Build the sample: from args, else auto-pick 1 flagged parcel per (up to 8) tripped BOUND/INVARIANT
  // checks + 4 CLEAN parcels (trip zero checks) so we can eyeball both failure and success.
  let ids = (process.argv[2] || '').split(',').map((s) => parseInt(s, 10)).filter(Boolean);
  if (!ids.length) {
    const flagged = [];
    for (const c of CHECKS.filter((x) => x.fam !== 'DIST').slice(0, 20)) {
      const r = (await pool.query(
        `SELECT id FROM parcels WHERE ${RES} AND (${c.applies}) AND (${c.bad}) ORDER BY id LIMIT 1`)).rows[0];
      if (r && flagged.length < 8 && !flagged.includes(r.id)) flagged.push(r.id);
    }
    // Deterministic pseudo-random spread (Round-3 RC finding, 2026-07-22):
    // the old random() ordering made the CLEAN sample differ every run — a
    // CLEAN parcel exposing an audit miss in one run might never be sampled
    // again. md5(id) keeps the selection spread across the id space (not just
    // the lowest ids) while byte-identical across repeated runs on the same data.
    const clean = (await pool.query(
      `SELECT id FROM parcels WHERE ${RES} AND opt_aor_gfa_sqm IS NOT NULL AND cost_fb_total IS NOT NULL
         AND NOT (${CHECKS.filter((c) => c.fam !== 'DIST').map((c) => `((${c.applies}) AND (${c.bad}))`).join(' OR ')})
       ORDER BY md5(id::text) LIMIT 4`)).rows.map((x) => x.id);
    ids = [...flagged, ...clean];
  }

  const rows = (await pool.query(
    `SELECT id, ${ALLCOLS.join(', ')} FROM parcels WHERE id = ANY($1::int[]) ORDER BY array_position($1::int[], id)`,
    [ids])).rows;

  // Per-parcel: which checks does it trip? (re-evaluate each predicate on the single row via SQL.)
  for (const r of rows) {
    const flags = [];
    for (const c of CHECKS.filter((x) => x.fam !== 'DIST')) {
      const hit = (await pool.query(
        `SELECT ((${c.applies}) AND (${c.bad})) AS bad FROM parcels WHERE id = $1`, [r.id])).rows[0].bad;
      if (hit) flags.push(c.id);
    }
    console.log('\n' + '='.repeat(110));
    const num = (v) => (v == null ? 'null' : typeof v === 'number' ? (Math.round(v * 100) / 100) : v);
    console.log(`PARCEL ${r.id}  ${r.zoning_class}  lot=${num(r.lot_size_sqm)}  ${flags.length ? '⚠ FLAGS: ' + flags.join(', ') : '✓ CLEAN (trips no check)'}`);
    console.log('-'.repeat(110));
    for (const [fam, cols] of Object.entries(FIELDS)) {
      const parts = cols.map((c) => `${c}=${num(r[c])}`);
      console.log(`  ${fam.padEnd(10)} ${parts.join('  ')}`);
    }
  }
  await pool.end();
  console.log(`\n(${rows.length} parcels: ${rows.filter((r) => true).length} shown. Eyeball each — any implausible value on a ✓ CLEAN parcel is an audit MISS.)`);
})().catch((e) => { console.error(e); process.exit(1); });
