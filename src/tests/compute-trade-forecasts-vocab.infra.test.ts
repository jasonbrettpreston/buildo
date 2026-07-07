// SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §1 (Forecastability contract), §3
// SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5
//
// WF2 Spec 80 P4 — trade-vocab reconciliation. Source-shape + migration-content assertions
// (the engine's exclusion logic is inline in the stream loop; these pin its structure so a
// refactor cannot silently route an excluded slug into unmapped_trades or drop the audit rows).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.resolve(repoRoot, rel), 'utf-8');

describe('compute-trade-forecasts.js — Spec 80 P4 exclusion (script shape)', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/compute-trade-forecasts.js');
  });

  it('LOGIC_VARS_SCHEMA accepts forecast_excluded_trade_slugs as a string array', () => {
    expect(content).toMatch(/forecast_excluded_trade_slugs:\s*z\.array\(z\.string\(\)\)/);
  });

  it('builds the exclusion Set from logicVars.forecast_excluded_trade_slugs with an Array.isArray guard', () => {
    expect(content).toMatch(/const excludedTradeSlugs = new Set\(/);
    expect(content).toMatch(/Array\.isArray\(\s*logicVars\.forecast_excluded_trade_slugs\s*\)/);
  });

  it('skips excluded slugs BEFORE branch dispatch and counts them (never silent)', () => {
    // The exclusion guard must appear before the `if (isCoaRow)` dispatch so excluded rows
    // never increment totalRowsPermit/totalRowsCoa (records_total) nor reach the unmapped check.
    const excludeIdx = content.indexOf('if (excludedTradeSlugs.has(row.trade_slug))');
    const coaDispatchIdx = content.indexOf('if (isCoaRow) {');
    expect(excludeIdx).toBeGreaterThan(-1);
    expect(coaDispatchIdx).toBeGreaterThan(-1);
    expect(excludeIdx).toBeLessThan(coaDispatchIdx);
    // The guard body increments excludedRows + records the slug, then continues.
    expect(content).toMatch(/excludedRows\+\+;/);
    expect(content).toMatch(/excludedSlugsSeen\.add\(row\.trade_slug\)/);
  });

  it('excluded rows do NOT increment unmapped_trades (distinct counters)', () => {
    // unmappedTrades is only incremented in the permit branch when a mapped-but-missing target
    // is hit; excluded rows short-circuit before that. Assert the two counters are distinct.
    expect(content).toMatch(/let excludedRows = 0;/);
    expect(content).toMatch(/let unmappedTrades = 0;/);
  });

  it('emits both excluded_rows and excluded_trade_slugs audit rows (INFO)', () => {
    expect(content).toMatch(/metric:\s*'excluded_rows'/);
    expect(content).toMatch(/metric:\s*'excluded_trade_slugs'/);
  });

  it('surfaces excluded_rows + excluded_trade_slugs in records_meta', () => {
    expect(content).toMatch(/excluded_rows:\s*excludedRows/);
    expect(content).toMatch(/excluded_trade_slugs:\s*\[\.\.\.excludedSlugsSeen\]/);
  });
});

describe('migration 210 — trade-vocab reconciliation (content)', () => {
  let sql: string;
  beforeAll(() => {
    sql = read('migrations/210_trade_config_vocab_reconciliation.sql');
  });

  it('maps site-preparation to the excavation-family window (P3 → P9)', () => {
    expect(sql).toMatch(/'site-preparation',\s*'P3',\s*'P9',\s*7/);
  });

  it('maps overhead-doors to the trim-work-family window (P11 → P15)', () => {
    expect(sql).toMatch(/'overhead-doors',\s*'P11',\s*'P15',\s*14/);
  });

  it('inserts the trade_configurations rows idempotently (ON CONFLICT DO NOTHING)', () => {
    expect(sql).toMatch(/INSERT INTO trade_configurations/);
    expect(sql).toMatch(/ON CONFLICT \(trade_slug\) DO NOTHING/);
  });

  it('seeds forecast_excluded_trade_slugs with site-maintenance via the JSONB convention', () => {
    expect(sql).toMatch(/'forecast_excluded_trade_slugs',\s*0,\s*'\["site-maintenance"\]'::jsonb/);
    expect(sql).toMatch(/ON CONFLICT \(variable_key\) DO NOTHING/);
  });

  it('keeps the DOWN section fully commented (lessons.md: migrate.js runs every uncommented line)', () => {
    const downIdx = sql.indexOf('-- DOWN');
    expect(downIdx).toBeGreaterThan(-1);
    const downBlock = sql.slice(downIdx);
    // No uncommented DELETE in the DOWN block.
    expect(downBlock).not.toMatch(/^\s*DELETE/m);
  });
});
