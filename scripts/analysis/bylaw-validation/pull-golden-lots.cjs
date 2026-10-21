#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.15 (golden lots, the seed of Spec 133
//            lock 6); docs/specs/01-pipeline/69a_mcbylaw_register.md M-240..M-245 (the CoA notice lots, lane
//            wf1/bylaw-fix-3); docs/reports/2026-10-20-bylaw-e2e-verification.md (the snapshot's first pull)
//
// GOLDEN-LOT SNAPSHOT PULLER (format `bylaw-golden-lots/lots@1`). The snapshot
// src/tests/fixtures/bylaw-golden-lots/lots.json was first pulled by lane e2e-verify-1 with scratch scripts; this is the
// committed puller (bylaw-fix-2 PIN-1). READ-ONLY: one BEGIN READ ONLY transaction against the local dev DB, rolled back;
// it never writes the DB. Run it under the lane DB lock.
//
// Modes (exactly one; no default mode, no default write; an unknown flag exits 2):
//   --verify                         re-pulls every lot already in the snapshot and prints each field that differs from
//                                    the committed snapshot; writes nothing (exit 1 when any lot differs)
//   --add <id:cat[:coa],…> --out <lots.json>   pulls the named parcels and APPENDS them to the snapshot, after the
//                                    existing lots (so no existing case's lot choice moves), with their categories and,
//                                    for a Committee of Adjustment notice lot, the notice file number (`coa`); refuses
//                                    an id already in the snapshot
//
// Usage: DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r dotenv/config scripts/analysis/bylaw-validation/pull-golden-lots.cjs --verify
//        DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r dotenv/config scripts/analysis/bylaw-validation/pull-golden-lots.cjs \
//          --add 5343399:coa_notice:A0625/26TEY --out src/tests/fixtures/bylaw-golden-lots/lots.json
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SNAPSHOT_REL = 'src/tests/fixtures/bylaw-golden-lots/lots.json';
const SCHEMA = 'bylaw-golden-lots/lots@1';
// 569-2013 Chapter 900 section per residential zone (900.2 R … 900.6 RM): the exception id the evaluator loads
const EXC_CH = Object.freeze({ R: 2, RD: 3, RS: 4, RT: 5, RM: 6 });

const SELECT = `
  select p.parcel_id, p.address_number, p.linear_name_full, p.zoning_class, p.zoning_zn_string, p.exception_number,
    p.zoning_overlays, p.on_policy_road, p.is_corner_lot, p.is_through_lot, p.abuts_laneway, p.frontage_m::float,
    p.depth_m::float, p.lot_size_sqm::float, p.in_sixplex_area, p.is_heritage_designated, p.is_in_ravine_protection_area,
    ST_NPoints(p.geom) as npts, p.is_irregular, p.max_buildable_gfa_sqm::float, p.max_build_height_m::float,
    p.max_build_stories, p.max_build_fsi::float, p.max_buildable_footprint_sqm::float, p.opt_aor_gfa_sqm::float,
    p.opt_suite_type, p.max_garden_suite_gfa_sqm::float, p.max_laneway_suite_gfa_sqm::float, p.envelope_constrained,
    p.envelope_constraint_reason
  from parcels p
  where p.parcel_id = any($1)
  order by p.parcel_id`;

/** The zone label's letters (f, d, a, u, …) as numbers. PURE. */
function parseLabel(zn) {
  const m = /^\s*([A-Z]+)\s*(?:\(([^)]*)\))?/.exec(zn || '');
  const label = {};
  if (m && m[2]) for (const part of m[2].split(';')) { const p = /^\s*([a-wyz][a-z]?)\s*([\d.]+)\s*$/.exec(part); if (p) label[p[1]] = Number(p[2]); }
  return label;
}

/** One parcels row → one lots@1 lot (the transform lane e2e-verify-1 used). PURE. */
function rowToLot(x, cats, coa) {
  const ov = x.zoning_overlays || {};
  const overlays = {};
  if (ov.height_overlay && ov.height_overlay.applied) {
    if (ov.height_overlay.height_max_m != null) overlays.HT = Number(ov.height_overlay.height_max_m);
    if (ov.height_overlay.stories != null) overlays.ST = Number(ov.height_overlay.stories);
  }
  if (ov.lot_coverage_overlay && ov.lot_coverage_overlay.applied && ov.lot_coverage_overlay.coverage_max_pct != null) overlays.LC = Number(ov.lot_coverage_overlay.coverage_max_pct);
  const exc = x.exception_number != null && x.exception_number > 0 ? x.exception_number : null;
  const address = [x.address_number, x.linear_name_full].filter(Boolean).join(' ');
  return {
    id: x.parcel_id, cats: [...cats], ...(coa ? { coa } : {}), address,
    lot: {
      zone: x.zoning_class, zone_label: x.zoning_zn_string, label: parseLabel(x.zoning_zn_string), overlays,
      vars: { lot_frontage_m: x.frontage_m, lot_depth_m: x.depth_m, lot_area_m2: x.lot_size_sqm },
      flags: { corner_lot: !!x.is_corner_lot, through_lot: !!x.is_through_lot, major_street: !!x.on_policy_road, abuts_lane: !!x.abuts_laneway, lawfully_existing: false,
        heritage_property: !!x.is_heritage_designated, ...(x.npts === 4 ? { no_rear_lot_line: true } : {}) },
      exception: exc != null ? `900.${EXC_CH[x.zoning_class]}.10(${exc})` : null, parcel_id: x.parcel_id, address,
    },
    stored: { in_sixplex_area: x.in_sixplex_area, is_heritage_designated: x.is_heritage_designated, is_in_ravine_protection_area: x.is_in_ravine_protection_area, geom_npoints: x.npts, is_irregular: x.is_irregular,
      max_buildable_gfa_sqm: x.max_buildable_gfa_sqm, max_build_height_m: x.max_build_height_m, max_build_stories: x.max_build_stories, max_build_fsi: x.max_build_fsi,
      max_buildable_footprint_sqm: x.max_buildable_footprint_sqm, opt_aor_gfa_sqm: x.opt_aor_gfa_sqm, opt_suite_type: x.opt_suite_type,
      max_garden_suite_gfa_sqm: x.max_garden_suite_gfa_sqm, max_laneway_suite_gfa_sqm: x.max_laneway_suite_gfa_sqm, envelope_constrained: x.envelope_constrained, envelope_constraint_reason: x.envelope_constraint_reason },
  };
}

/** Parse argv: exactly one mode; every flag known. PURE. → {mode, values} | {error} */
function parseArgs(argv) {
  const modes = argv.filter((a) => a === '--verify' || a === '--add');
  if (modes.length !== 1) return { error: 'exactly one mode is required (--verify | --add <id:cat[:coa],…> --out <lots.json>)' };
  const mode = modes[0];
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verify') continue;
    if (mode === '--verify' || !['--add', '--out'].includes(a)) return { error: `unknown flag for ${mode}: ${a}` };
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) return { error: `${a} needs a value` };
    values[a] = v;
    i += 1;
  }
  if (mode === '--add' && !values['--out']) return { error: '--add needs --out <lots.json>' };
  if (mode === '--add') {
    const specs = values['--add'].split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const [id, cat, ...rest] = s.split(':');
      return { id, cats: cat ? cat.split('+') : [], coa: rest.length ? rest.join(':') : null };
    });
    if (!specs.length || specs.some((s) => !/^\d+$/.test(s.id) || !s.cats.length)) return { error: '--add takes <parcel id>:<cat>[+<cat>][:<CoA file number>], comma-separated' };
    values.specs = specs;
  }
  return { mode, values };
}

/** The fields of one lot that differ from another (lot and stored only). PURE. */
function diffLot(a, b) {
  const out = [];
  const walk = (x, y, p) => {
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
      for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()) walk(x[k], y[k], p ? `${p}.${k}` : k);
    } else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${p}: ${JSON.stringify(x)} → ${JSON.stringify(y)}`);
  };
  walk({ lot: a.lot, stored: a.stored }, { lot: b.lot, stored: b.stored }, '');
  return out;
}

async function pull(ids) {
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query('BEGIN READ ONLY');
    const r = await c.query(SELECT, [ids]);
    await c.query('ROLLBACK');
    return r.rows;
  } finally {
    await c.end();
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) { console.error(`[pull-golden-lots] ${parsed.error}`); process.exitCode = 2; return; }
  const root = path.resolve(__dirname, '..', '..', '..');
  const snapPath = parsed.mode === '--add' ? path.resolve(parsed.values['--out']) : path.join(root, SNAPSHOT_REL);
  const doc = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  if (doc.schema !== SCHEMA) throw new Error(`${snapPath} is not ${SCHEMA}`);
  if (parsed.mode === '--verify') {
    const rows = await pull(doc.lots.map((l) => l.id));
    const by = new Map(rows.map((x) => [x.parcel_id, x]));
    let n = 0;
    for (const l of doc.lots) {
      const x = by.get(l.id);
      if (!x) { console.log(`${l.id}: not found in parcels`); n++; continue; }
      const d = diffLot(l, rowToLot(x, l.cats, l.coa));
      if (d.length) { n++; console.log(`${l.id} (${l.address}): ${d.join('; ')}`); }
    }
    console.log(`[pull-golden-lots] --verify: ${doc.lots.length} lot(s) re-pulled, ${n} differ from the snapshot`);
    process.exitCode = n ? 1 : 0;
    return;
  }
  const have = new Set(doc.lots.map((l) => l.id));
  const specs = parsed.values.specs;
  const dup = specs.filter((s) => have.has(s.id)).map((s) => s.id);
  if (dup.length) throw new Error(`already in the snapshot: ${dup.join(', ')}`);
  const rows = await pull(specs.map((s) => s.id));
  const by = new Map(rows.map((x) => [x.parcel_id, x]));
  const missing = specs.filter((s) => !by.has(s.id)).map((s) => s.id);
  if (missing.length) throw new Error(`not found in parcels: ${missing.join(', ')}`);
  for (const s of specs) doc.lots.push(rowToLot(by.get(s.id), s.cats, s.coa));
  doc.n = doc.lots.length;
  doc.added = [...(doc.added || []), { by: 'scripts/analysis/bylaw-validation/pull-golden-lots.cjs --add (one READ ONLY transaction, rolled back)', ids: specs.map((s) => s.id) }];
  fs.writeFileSync(snapPath, `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`[pull-golden-lots] --add: appended ${specs.length} lot(s) → ${snapPath} (n = ${doc.n})`);
}

module.exports = { parseArgs, parseLabel, rowToLot, diffLot, SNAPSHOT_REL, SCHEMA };
if (require.main === module) main().catch((e) => { console.error(`[pull-golden-lots] ${e.message}`); process.exitCode = 1; });
