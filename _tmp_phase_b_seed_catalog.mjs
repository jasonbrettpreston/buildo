#!/usr/bin/env node
/**
 * One-shot seed generator: reads `docs/reports/spec_84_universal_stream_v10.csv`,
 * emits `scripts/seeds/universal_stream_catalog.json` (110 rows) AND a SQL
 * INSERT block ready to paste into migration 129.
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B (seed migration
 *            contract — split create from INSERT, NULL handling, preflight
 *            validation), §6.7 (Universal Stream prerequisites).
 *
 * Per Spec 42 §6.6.B contract:
 *   - Asserts rows.length === 110 AND headers.length === 174 BEFORE emitting
 *     any output. Throws on either failure (loud, not silent).
 *   - Empty CSV cells → SQL NULL (not empty string). Applies to nullable
 *     columns: phase, bid_value, loop_marker, all six color/icon columns,
 *     rows_count.
 *
 * NOT a production script under scripts/ — Spec 47 §R1-R12 do not apply.
 * Single-purpose Node utility that runs once during Phase B execution.
 *
 * Usage: node _tmp_phase_b_seed_catalog.mjs
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.resolve(__dirname, 'docs/reports/spec_84_universal_stream_v10.csv');
const JSON_OUT = path.resolve(__dirname, 'scripts/seeds/universal_stream_catalog.json');
const SQL_OUT  = path.resolve(__dirname, '_tmp_phase_b_seed_catalog.generated.sql');

// ─── Minimal CSV parser (RFC 4180 subset; handles quoted commas + embedded quotes) ───
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ─── Empty cell → SQL NULL helper (per Spec 42 §6.6.B contract) ───
function nullable(cell) {
  if (cell === '' || cell === undefined || cell === null) return null;
  return cell;
}

function nullableNumber(cell) {
  const v = nullable(cell);
  if (v === null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return n;
}

function sqlLiteral(v) {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  // String: single-quote escape per Postgres.
  return `'${String(v).replace(/'/g, "''")}'`;
}

function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(raw);
  const header = rows[0];

  // ── Preflight validation (Spec 42 §6.6.B + Phase B R0.6) ────────────
  if (header.length !== 174) {
    throw new Error(`Preflight FAIL: expected 174 CSV columns, got ${header.length}`);
  }
  const dataRows = rows.slice(1).filter((r) => r.length > 1 && r[0] !== '');
  if (dataRows.length !== 110) {
    throw new Error(`Preflight FAIL: expected 110 data rows, got ${dataRows.length}`);
  }

  // ── Column index lookup ────────────────────────────────────────────
  const idx = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Header missing column: ${name}`);
    return i;
  };
  const c = {
    seq:             idx('seq'),
    source_row_num:  idx('#'),
    group:           idx('Group'),
    group_label:     idx('Group Label'),
    block:           idx('Block'),
    block_label:     idx('Block Label'),
    stage:           idx('Stage'),
    stage_label:     idx('Stage Label'),
    source:          idx('Source'),
    status:          idx('Status'),
    phase:           idx('Phase'),
    bid_value:       idx('Bid Value'),
    loop_marker:     idx('Loop →'), // 'Loop →' (arrow char)
    group_color:     idx('Group Color'),
    group_icon:      idx('Group Icon'),
    block_color:     idx('Block Color'),
    block_icon:      idx('Block Icon'),
    stage_color:     idx('Stage Color'),
    stage_icon:      idx('Stage Icon'),
    rows_count:      idx('Rows'),
  };

  // ── Transform: CSV → catalog rows ──────────────────────────────────
  const catalog = dataRows.map((r) => ({
    seq:             Number(r[c.seq]),
    source_row_num:  Number(r[c.source_row_num]),
    lifecycle_group: r[c.group],
    group_label:     r[c.group_label],
    lifecycle_block: r[c.block],
    block_label:     r[c.block_label],
    lifecycle_stage: r[c.stage],
    stage_label:     r[c.stage_label],
    source:          r[c.source],
    status:          r[c.status],
    phase:           nullable(r[c.phase]),
    bid_value:       nullableNumber(r[c.bid_value]),
    loop_marker:     nullable(r[c.loop_marker]),
    group_color:     nullable(r[c.group_color]),
    group_icon:      nullable(r[c.group_icon]),
    block_color:     nullable(r[c.block_color]),
    block_icon:      nullable(r[c.block_icon]),
    stage_color:     nullable(r[c.stage_color]),
    stage_icon:      nullable(r[c.stage_icon]),
    rows_count:      nullableNumber(r[c.rows_count]),
  }));

  // ── Spec 84 §8.5 v10 BUG-fix invariants (assert before write) ──────
  const seq14 = catalog.find((x) => x.seq === 14);
  if (!seq14 || seq14.bid_value !== 0.8) {
    throw new Error(`Spec 84 §8.5 BUG fix regression: seq 14 bid_value should be 0.8, got ${seq14?.bid_value}`);
  }
  const b9c = catalog.find((x) => x.lifecycle_block === 'B9.C');
  if (!b9c) {
    throw new Error(`Spec 84 §8.5 BUG fix regression: B9.C block missing from v10 catalog`);
  }
  // seq contiguity
  for (let i = 0; i < catalog.length; i++) {
    if (catalog[i].seq !== i + 1) {
      throw new Error(`Seq contiguity violation: catalog[${i}].seq = ${catalog[i].seq}, expected ${i + 1}`);
    }
  }

  // ── Write JSON output ──────────────────────────────────────────────
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(catalog, null, 2));
  console.log(`✓ Wrote ${catalog.length} catalog rows → ${path.relative(__dirname, JSON_OUT)}`);

  // ── Emit SQL INSERT block ──────────────────────────────────────────
  const cols = [
    'seq', 'source_row_num', 'lifecycle_group', 'group_label',
    'lifecycle_block', 'block_label', 'lifecycle_stage', 'stage_label',
    'source', 'status', 'phase', 'bid_value', 'loop_marker',
    'group_color', 'group_icon', 'block_color', 'block_icon',
    'stage_color', 'stage_icon', 'rows_count',
  ];

  const valueRows = catalog.map((r) => {
    const lits = cols.map((col) => sqlLiteral(r[col]));
    return `  (${lits.join(', ')})`;
  });

  const sql = `INSERT INTO universal_stream_catalog (${cols.join(', ')}) VALUES\n${valueRows.join(',\n')}\nON CONFLICT (seq) DO NOTHING;\n`;
  fs.writeFileSync(SQL_OUT, sql);
  console.log(`✓ Wrote ${valueRows.length} INSERT rows → ${path.relative(__dirname, SQL_OUT)}`);

  // ── Preflight summary (stderr for visibility) ──────────────────────
  const nullCells = catalog.reduce((acc, r) => {
    for (const col of cols) if (r[col] === null) acc++;
    return acc;
  }, 0);
  console.error(`Preflight summary: 110 rows, ${cols.length} columns, ${nullCells} NULL cells, seq 1-110 contiguous, B9.C present, seq 14 bid_value=0.8`);
}

main();
