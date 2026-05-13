#!/usr/bin/env node
/**
 * One-shot seed generator: reads `docs/reports/spec_84_universal_stream_v10.csv`,
 * emits `scripts/seeds/universal_stream_trade_signals.json` AND a SQL INSERT
 * block ready to paste into migration 131.
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B (152 per-trade ×
 *            per-row signal columns decomposed to ~1,500 normalized rows),
 *            docs/specs/01-pipeline/84_lifecycle_phase_engine.md §2.5.h.2.
 *
 * Iterates the 38 trades × 4 signals (bid/work/fallback/last_minute) × 110
 * seqs. Emits one row per cell containing the ✓ marker. Empty cells produce
 * no row (the absence IS the signal).
 *
 * Per Spec 42 §6.6.B contract:
 *   - Preflight assertion: CSV is 110 × 174.
 *   - Idempotent INSERT via ON CONFLICT (seq, trade_slug, signal_type) DO NOTHING.
 *   - Regression-lock invariants for Spec 84 §8.5 v10 BUG fixes (seq 50
 *     excavation column-alignment fix, realtor signal presence).
 *
 * NOT a production script under scripts/ — Spec 47 §R1-R12 do not apply.
 *
 * Usage: node _tmp_phase_b_seed_signals.mjs
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.resolve(__dirname, 'docs/reports/spec_84_universal_stream_v10.csv');
const JSON_OUT = path.resolve(__dirname, 'scripts/seeds/universal_stream_trade_signals.json');
const SQL_OUT  = path.resolve(__dirname, '_tmp_phase_b_seed_signals.generated.sql');

// ─── Minimal CSV parser (RFC 4180 subset) ───────────────────────────
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

function isTickMark(v) {
  // CSV uses `✓` (U+2713 CHECK MARK) for "this trade × signal × seq fires."
  // Conservative: trim whitespace and require an exact ✓ character. Anything
  // else (empty string, other glyphs) counts as absent.
  if (!v) return false;
  return v.trim() === '✓';
}

function sqlLiteral(v) {
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

const SIGNAL_PREFIXES = [
  { csv: 'Bid: ',               sql: 'bid' },
  { csv: 'Work: ',              sql: 'work' },
  { csv: 'Fallback: ',          sql: 'fallback' },
  { csv: 'Bid: Last Minute: ',  sql: 'last_minute' },
];

function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(raw);
  const header = rows[0];

  // ── Preflight ─────────────────────────────────────────────────────
  if (header.length !== 174) {
    throw new Error(`Preflight FAIL: expected 174 CSV columns, got ${header.length}`);
  }
  const dataRows = rows.slice(1).filter((r) => r.length > 1 && r[0] !== '');
  if (dataRows.length !== 110) {
    throw new Error(`Preflight FAIL: expected 110 data rows, got ${dataRows.length}`);
  }

  // ── Identify (signal_type, trade_slug) → column index map ─────────
  // Header columns 16..167 are 152 signal columns: 38 trades × 4 signals.
  // Order within each trade: Bid, Work, Fallback, Bid: Last Minute (per v10 CSV).
  // Inferred mapping from the CSV header strings, NOT from positional math —
  // safer if a future CSV revision re-orders.
  const signalColumns = []; // { signalType, tradeSlug, colIdx }
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    for (const sp of SIGNAL_PREFIXES) {
      if (h.startsWith(sp.csv)) {
        const slug = h.slice(sp.csv.length).trim();
        signalColumns.push({ signalType: sp.sql, tradeSlug: slug, colIdx: i });
        break;
      }
    }
  }

  // Expect 38 trades × 4 signal types = 152 signal columns.
  if (signalColumns.length !== 152) {
    throw new Error(`Preflight FAIL: expected 152 signal columns, got ${signalColumns.length}`);
  }

  // ── Sanity: order-matching (Bid: Last Minute must NOT collide with Bid:) ─
  // Because 'Bid: Last Minute: ' starts with 'Bid: ', the first matching
  // prefix above would wrongly classify Last-Minute cols as 'bid'. Defensive
  // re-scan: signal type wins when the LONGEST prefix matches.
  for (let i = 0; i < signalColumns.length; i++) {
    const sc = signalColumns[i];
    const h = header[sc.colIdx];
    let best = sc;
    for (const sp of SIGNAL_PREFIXES) {
      if (h.startsWith(sp.csv) && sp.csv.length > (best.matchedPrefixLen ?? 0)) {
        const slug = h.slice(sp.csv.length).trim();
        best = { signalType: sp.sql, tradeSlug: slug, colIdx: sc.colIdx, matchedPrefixLen: sp.csv.length };
      }
    }
    signalColumns[i] = { signalType: best.signalType, tradeSlug: best.tradeSlug, colIdx: best.colIdx };
  }

  // ── Walk: 110 rows × 152 signal cols → emit row per ✓ ────────────
  const seqCol = header.indexOf('seq');
  const signals = [];
  for (const r of dataRows) {
    const seq = Number(r[seqCol]);
    for (const sc of signalColumns) {
      if (isTickMark(r[sc.colIdx])) {
        signals.push({ seq, trade_slug: sc.tradeSlug, signal_type: sc.signalType });
      }
    }
  }

  // ── Regression-lock invariants (Spec 84 §8.5 v10) ────────────────
  // seq 50 (#31 Active Inspection) — Work:excavation removed, Bid: Last Minute:excavation added.
  const seq50Excav = signals.filter((s) => s.seq === 50 && s.trade_slug === 'excavation');
  if (!seq50Excav.some((s) => s.signal_type === 'last_minute')) {
    throw new Error('Spec 84 §8.5 BUG fix regression: seq 50 excavation last_minute missing');
  }
  if (seq50Excav.some((s) => s.signal_type === 'work')) {
    throw new Error('Spec 84 §8.5 BUG fix regression: seq 50 excavation work present (should be removed in v10)');
  }
  // Realtor signal exists somewhere
  if (!signals.some((s) => s.trade_slug === 'realtor')) {
    throw new Error('Spec 84 §8.5 invariant: realtor signal missing entirely');
  }

  // ── Write JSON ────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(signals, null, 2));
  console.log(`✓ Wrote ${signals.length} signal rows → ${path.relative(__dirname, JSON_OUT)}`);

  // ── Emit SQL INSERT block ────────────────────────────────────────
  // Multiple INSERTs of ~500 rows each for readability (Postgres limit is
  // ~1664 parameters per statement, but each row here has 3 literal values;
  // 500 rows = 1500 params, well within limits and easier to diff/review).
  const CHUNK = 500;
  const blocks = [];
  for (let i = 0; i < signals.length; i += CHUNK) {
    const chunk = signals.slice(i, i + CHUNK);
    const values = chunk.map((s) =>
      `  (${s.seq}, ${sqlLiteral(s.trade_slug)}, ${sqlLiteral(s.signal_type)})`,
    );
    blocks.push(
      `INSERT INTO universal_stream_trade_signals (seq, trade_slug, signal_type) VALUES\n${values.join(',\n')}\nON CONFLICT (seq, trade_slug, signal_type) DO NOTHING;`,
    );
  }

  fs.writeFileSync(SQL_OUT, blocks.join('\n\n') + '\n');
  console.log(`✓ Wrote ${signals.length} INSERT rows (${blocks.length} chunks) → ${path.relative(__dirname, SQL_OUT)}`);

  // ── Distribution summary (stderr) ────────────────────────────────
  const byType = signals.reduce((acc, s) => { acc[s.signal_type] = (acc[s.signal_type] || 0) + 1; return acc; }, {});
  const trades = new Set(signals.map((s) => s.trade_slug));
  console.error(
    `Preflight summary: ${signals.length} signal rows total — `
    + `bid:${byType.bid || 0}, work:${byType.work || 0}, fallback:${byType.fallback || 0}, last_minute:${byType.last_minute || 0} — `
    + `${trades.size} unique trades`,
  );
}

main();
