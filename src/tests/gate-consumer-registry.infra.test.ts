// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-T, Rule 10, §5 R-BA (gate D);
//            122_pipeline_step_optimization.md §6.1-§6.2
//
// WF2 gate D — `scripts/analysis/gates/consumer-registry.mjs`, fast invariant #31.
//
// A GENERATED registry (`scripts/steps/_schema/consumer-registry.json`, built
// from `funnel.ts`'s FUNNEL_SOURCES + every converted descriptor's
// `emits[].consumers`/`counters[].source`/`staleness.trigger[]`) records every
// (consumer, producer, key) contract a converted step's `records_meta`/
// `audit_table` participates in. Each row is checked PRESENT + TYPED against
// the producer's own golden POST captures; a producer not yet converted is
// `unconverted_producer`, listed but never checked. The completeness scan
// walks the closed corpus for every `records_meta.<key>` reference and REDs
// any hit not covered by RUNNER_META_KEYS, CHAIN_META_KEYS, or a registry row
// whose consumer is that file. Each RED is allowed only by a `{gate:'D'}`
// ledger row; an ORPHAN row is RED (R-X).
//
// RED-FIRST (WF2 row D): before the orchestrator lands the gate-D ledger rows,
// T4 is RED on the live tree — the measured `--list` (2026-09-26) is:
// `link_wsib->link_wsib.wsib_registry_count` (the GC-5 trigger-baseline class,
// the same root cause gate C's own `link_wsib` trigger-baseline-missing row
// names) and `scan.scripts/analysis/step-validate.mjs.tables_checked` (the
// exact undeclared-consumer case the brief called out: this file reads
// `assert_engine_health`'s own counter with no registry row). That is the
// expected red, not a defect.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as reg from '../../scripts/analysis/gates/consumer-registry.mjs';
import * as ledger from '../../scripts/analysis/gates/ledger.mjs';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('gate D — generated consumer registry, present+typed, completeness scan, ledger', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own selfTest() fires and covers both closed-set
  // directions PLUS the ledger orphan direction (Spec 121 §12b.6).
  // -------------------------------------------------------------------------
  it('T1: selfTest() passes', () => {
    expect(() => reg.selfTest()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // T2 — each RED/GREEN fixture the selfTest relies on, re-asserted directly so
  // a checker never proven to fire outside its own selfTest is not a check.
  // -------------------------------------------------------------------------
  it('T2a: rowPresentTyped — metric absent from every capture is RED', () => {
    const row = { consumer: 'x', producer: 'link_wsib', kind: 'audit_metric', key: 'link_rate_warn', value: 'percent' };
    const out = reg.rowPresentTyped(row, { metaKeys: new Set<string>(), metrics: new Map<string, unknown[]>() });
    expect(out.ok).toBe(false);
  });

  it('T2b: rowPresentTyped — object value with NO value_path is RED (B2 shape)', () => {
    const row = { consumer: 'x', producer: 'link_wsib', kind: 'audit_metric', key: 'link_rate_warn', value: 'percent' };
    const idx = { metaKeys: new Set<string>(), metrics: new Map<string, unknown[]>([['link_rate_warn', [{ link_rate_pct: 94.4 }]]]) };
    expect(reg.rowPresentTyped(row, idx).ok).toBe(false);
  });

  it('T2c: rowPresentTyped — object value WITH value_path is GREEN', () => {
    const row = { consumer: 'x', producer: 'link_wsib', kind: 'audit_metric', key: 'link_rate_warn', value: 'percent', value_path: 'link_rate_pct' };
    const idx = { metaKeys: new Set<string>(), metrics: new Map<string, unknown[]>([['link_rate_warn', [{ link_rate_pct: 94.4 }]]]) };
    expect(reg.rowPresentTyped(row, idx).ok).toBe(true);
  });

  it('T2d: rowPresentTyped — a raw percent string is GREEN', () => {
    const row = { consumer: 'x', producer: 'link_wsib', kind: 'audit_metric', key: 'link_rate_warn', value: 'percent' };
    const idx = { metaKeys: new Set<string>(), metrics: new Map<string, unknown[]>([['link_rate_warn', ['99.7%']]]) };
    expect(reg.rowPresentTyped(row, idx).ok).toBe(true);
  });

  it('T2e: registryViolations — an unconverted producer is never checked', () => {
    const registry = { rows: [{ consumer: 'x', producer: 'classify_scope', kind: 'audit_metric', key: 'tags_coverage_rate', value: 'percent' }] };
    const out = reg.registryViolations(registry, new Map(), new Set(['link_wsib']));
    expect(out).toEqual([]);
  });

  it('T2f: scanText — an unknown key is RED, excluded/declared keys are GREEN, comments are never scanned', () => {
    expect(reg.scanText('f.ts', "x.records_meta?.mystery;\n", new Set())).toHaveLength(1);
    expect(reg.scanText('f.ts', "x.records_meta.checks_failed;\n", new Set())).toEqual([]);
    expect(reg.scanText('f.ts', "x.records_meta.step_completeness;\n", new Set())).toEqual([]);
    expect(reg.scanText('f.ts', "x.records_meta.tables_checked;\n", new Set(['tables_checked']))).toEqual([]);
    expect(reg.scanText('f.ts', "// records_meta.mystery is read below\n", new Set())).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // T3 — the committed registry is FRESH against its four generation sources
  // (funnel.ts + every converted descriptor's emits/counters/trigger) — a
  // drifted registry is RED before either closed-set half even runs.
  // -------------------------------------------------------------------------
  it('T3: consumer-registry.json is fresh against its four generation sources', () => {
    const fresh = reg.checkRegistryFresh(REPO_ROOT);
    expect(fresh.fresh).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T4 — LIVE: every gate-D violation (producer-side present+typed, and the
  // consumer-side completeness scan) has a gate-D ledger row, zero orphans.
  // -------------------------------------------------------------------------
  it('T4: live — every consumer-registry violation has a gate-D ledger row, and zero orphans', () => {
    const registry = reg.readRegistry(REPO_ROOT);
    const { rows } = ledger.loadLedger(REPO_ROOT);
    const out = reg.checkConsumerContracts(registry, rows, REPO_ROOT);

    expect(out.orphans).toEqual([]);
    expect(out.unallowed).toEqual([]);
    expect(out.pass).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T5 — the fleet-wide registry is DERIVED from converted.json + the
  // descriptors + funnel.ts (R-AN), never a retyped/hand-maintained list: its
  // row count exactly matches what `buildRegistry` computes fresh right now.
  // -------------------------------------------------------------------------
  it('T5: readRegistry().rows.length === buildRegistry().rows.length (never hand-edited)', () => {
    const onDisk = reg.readRegistry(REPO_ROOT);
    const fresh = reg.buildRegistry(REPO_ROOT);
    expect(onDisk.rows.length).toBe(fresh.rows.length);
    expect(onDisk.rows.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // T6 — funnel parsing: the lock (parsed count == "{ id:" occurrence count)
  // holds against the REAL file, and every parsed entry with a declared
  // auditMetric becomes exactly one funnel-sourced row.
  // -------------------------------------------------------------------------
  it('T6: parseFunnelSources — lock holds, and every auditMetric entry becomes one row', () => {
    const entries = reg.parseFunnelSources(REPO_ROOT);
    const withMetric = entries.filter((e) => e.auditMetric);
    const rows = reg.buildFunnelRows(entries);
    expect(rows.length).toBe(withMetric.length);
    for (const row of rows) {
      expect(row.consumer).toBe(reg.FUNNEL_CONSUMER);
      expect(row.kind).toBe('audit_metric');
      expect(row.value).toBe('percent');
    }
  });

  // -------------------------------------------------------------------------
  // T7 — CHAIN_META_KEYS: every citation names a real file this repo has, and
  // the file at that citation's line genuinely contains the key name (a
  // rotted citation is a lie about "verified by grep").
  // -------------------------------------------------------------------------
  it('T7: every CHAIN_META_KEYS citation resolves to a real file that mentions the key', () => {
    for (const [key, citation] of Object.entries(reg.CHAIN_META_KEYS)) {
      const fileMatch = citation.match(/^([^\s:]+):(\d+)/);
      expect(fileMatch, `citation for "${key}" must start "<file>:<line>" (got ${JSON.stringify(citation)})`).toBeTruthy();
      const relFile = (fileMatch as RegExpMatchArray)[1];
      const abs = path.join(REPO_ROOT, relFile as string);
      expect(fs.existsSync(abs), `CHAIN_META_KEYS["${key}"] cites "${relFile}", which does not exist`).toBe(true);
      const text = fs.readFileSync(abs, 'utf8');
      expect(text.includes(key), `"${relFile}" (cited for "${key}") does not contain the literal string "${key}"`).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // T8 — link_massing's own funnel row (present in a real POST golden) is GREEN
  // on live data, proving the equals-direction fires on the live fleet.
  // -------------------------------------------------------------------------
  it('T8: link_massing funnel row (link_rate, value_path link_rate_pct) is present+typed on real data', () => {
    const dir = path.join(REPO_ROOT, 'docs/reports/golden/link_massing/post');
    const index = reg.loadGoldenAuditIndex(dir);
    const row = { consumer: reg.FUNNEL_CONSUMER, producer: 'link_massing', kind: 'audit_metric', key: 'link_rate', value: 'percent', value_path: 'link_rate_pct' };
    const status = reg.rowPresentTyped(row, index);
    expect(status.ok).toBe(true);
  });
});
