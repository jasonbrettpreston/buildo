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
  // T2g — the FIVE read FORMS the completeness scan must see (each: an
  // undeclared key is RED, a RUNNER key is GREEN, comments stay unscanned).
  // -------------------------------------------------------------------------
  it('T2g: scanText — the five read FORMS (paren, cast, alias, two-level alias, SQL spaced / #>>) each RED an undeclared key and GREEN a runner key', () => {
    // paren form.
    const paren = reg.scanText('f.ts', "const a = (r.records_meta || {}).mystery_a;\n", new Set());
    expect(paren).toHaveLength(1);
    expect(paren[0].item).toBe('scan.f.ts.mystery_a');
    expect(reg.scanText('f.ts', "const a = (r.records_meta ?? {}).checks_failed;\n", new Set())).toEqual([]);

    // cast form.
    const cast = reg.scanText('f.ts', "const t = (s?.records_meta as Record<string, unknown>)?.mystery_b;\n", new Set());
    expect(cast).toHaveLength(1);
    expect(cast[0].item).toBe('scan.f.ts.mystery_b');
    expect(reg.scanText('f.ts', "const t = (s?.records_meta as Record<string, unknown>)?.checks_failed;\n", new Set())).toEqual([]);

    // alias form (the alias's USE carries the line number, not the declaration).
    const alias = reg.scanText('f.ts', "const meta = info.records_meta as Record<string, unknown>;\nconst f = meta.mystery_c;\nconst g = meta?.checks_failed;\n", new Set());
    expect(alias).toHaveLength(1);
    expect(alias[0].item).toBe('scan.f.ts.mystery_c');
    expect(alias[0].detail).toContain('f.ts:2');

    // two-level alias: the FIRST level only, never the second.
    const twoLevel = reg.scanText('f.ts', "const meta = rows[0].records_meta || {};\nconst l = meta.mystery_d.base;\n", new Set());
    expect(twoLevel).toHaveLength(1);
    expect(twoLevel[0].item).toBe('scan.f.ts.mystery_d');

    // alias boundary: a redeclaration ends the alias...
    expect(reg.scanText('f.ts', "const meta = r.records_meta;\nconst meta = other;\nmeta.mystery_e;\n", new Set())).toEqual([]);
    // ...and an initializer that does NOT end at records_meta is not an alias
    // (step_completeness is a CHAIN key, so the declaration line itself is GREEN too).
    expect(reg.scanText('f.ts', "const sc = r.records_meta?.step_completeness;\nsc.deferred_at;\n", new Set())).toEqual([]);

    // property-access guard: `x.meta.mystery_f` is not a use of the alias `meta`.
    expect(reg.scanText('f.ts', "const meta = r.records_meta;\nx.meta.mystery_f;\n", new Set())).toEqual([]);

    // SQL forms: spaced arrow, `#>>` object key, and no double count with SCAN_RE.
    const sqlArrow = reg.scanText('f.ts', "SELECT records_meta -> 'mystery_g' FROM t\n", new Set());
    expect(sqlArrow).toHaveLength(1);
    expect(sqlArrow[0].item).toBe('scan.f.ts.mystery_g');
    const sqlHash = reg.scanText('f.ts', "SELECT records_meta #>> '{mystery_h,x}' FROM t\n", new Set());
    expect(sqlHash).toHaveLength(1);
    expect(sqlHash[0].item).toBe('scan.f.ts.mystery_h');
    expect(reg.scanText('f.ts', "SELECT records_meta->>'mystery_i'\n", new Set())).toHaveLength(1);

    // comment lines stay unscanned.
    expect(reg.scanText('f.ts', "// (r.records_meta || {}).mystery_j\n", new Set())).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // T7b — the cast form makes pipeline_meta and telemetry visible; both are
  // CHAIN keys citing their run-chain writer.
  // -------------------------------------------------------------------------
  it('T7b: the cast form makes pipeline_meta and telemetry visible; both are CHAIN keys citing their run-chain writer', () => {
    expect(reg.CHAIN_META_KEYS.pipeline_meta).toMatch(/^scripts\/run-chain\.js:946 /);
    expect(reg.CHAIN_META_KEYS.telemetry).toMatch(/^scripts\/run-chain\.js:956 /);
    expect(reg.scanText('f.ts', "(s?.records_meta as Record<string, unknown>)?.telemetry;\n", new Set())).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // T3 — the committed registry is FRESH against its four generation sources
  // (funnel.ts + every converted descriptor's emits/counters/trigger) — a
  // drifted registry is RED before either closed-set half even runs.
  // -------------------------------------------------------------------------
  it('T3: consumer-registry.json is fresh against its five generation sources', () => {
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

// ---------------------------------------------------------------------------
// T9 — ONE RESOLVER (WF2 "conversion simplification" item 3, Spec 122 §10 row):
// a gate that reads a runtime structure imports the runtime's function and never
// mirrors it. Gate D's dotted `counters.<slot>.source` rows resolve through the
// runner's own `resolveCounterSource` (scripts/lib/step/index.js) — the local
// `resolveDottedMeta` mirror (75c1a731) is gone, and no path walk is re-implemented.
// ---------------------------------------------------------------------------
describe('gate D — one resolver (the runtime resolveCounterSource, never a mirror)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolveCounterSource } = require('../../scripts/lib/step/index.js');
  const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/gates/consumer-registry.mjs'), 'utf8');

  it('T9a: the gate exports no mirrored resolver and re-implements no dotted-path walk', () => {
    expect((reg as Record<string, unknown>).resolveDottedMeta).toBeUndefined();
    expect(src).not.toMatch(/\.split\(\s*['"]\.['"]\s*\)/);
    expect(src).toMatch(/resolveCounterSource/);
  });

  it('T9b: a dotted row is present+typed exactly when the runtime resolves it', () => {
    const key = 'centreline_load.features_updated';
    const row = { consumer: 'load_centreline', producer: 'load_centreline', kind: 'records_meta', key, value: 'any', source: 'counters' };
    const cases: object[] = [
      { centreline_load: { features_updated: 0 } },
      { centreline_load: { features_updated: 7 } },
      { centreline_load: {} },
      { centreline_load: { features_updated: '0' } },
      { centreline_load: { features_updated: Number.NaN } },
      { centreline_load: null },
      {},
    ];
    for (const m of cases) {
      const runtime = resolveCounterSource({ source: `records_meta.${key}` }, { records_meta: m }) !== null;
      const gate = reg.rowPresentTyped(row, { metaKeys: new Set(Object.keys(m)), metrics: new Map(), metas: [m] }).ok;
      expect(gate).toBe(runtime);
    }
  });

  it('T9c: a SUM source — one row per records_meta term, present exactly when the runtime resolves the sum', () => {
    const rows = reg.buildCountersRows([
      {
        identity: { name: 's' },
        counters: {
          records_total: { source: 'written.inserted + records_meta.a.x' },
          records_new: { source: 'records_meta.a.x + records_meta.b.y' },
          records_updated: { source: 'written.updated' },
        },
      },
    ]);
    expect(rows.map((r: { key: string }) => r.key).sort()).toEqual(['a.x', 'a.x', 'b.y']);
    for (const row of rows) {
      expect(row).toMatchObject({ consumer: 's', producer: 's', kind: 'records_meta', source: 'counters' });
    }

    const sumSource = { source: 'records_meta.a.x + records_meta.b.y' };
    const metas: object[] = [
      { a: { x: 1 }, b: { y: 2 } },
      { a: { x: 1 }, b: {} },
      { a: { x: 1 }, b: { y: Number.NaN } },
      { a: { x: '1' }, b: { y: 2 } },
      {},
    ];
    for (const m of metas) {
      const runtime = resolveCounterSource(sumSource, { records_meta: m }) !== null;
      const keyRows = rows
        .filter((r: { key: string }) => r.key === 'a.x' || r.key === 'b.y')
        .map((r: { key: string }) => r);
      expect(new Set(keyRows.map((r) => r.key))).toEqual(new Set(['a.x', 'b.y']));
      const gate = keyRows.every((row) =>
        reg.rowPresentTyped(row, { metaKeys: new Set(Object.keys(m)), metrics: new Map(), metas: [m] }).ok,
      );
      expect(gate).toBe(runtime);
    }

    // The runtime's own sum semantics: both operands present + finite => the sum;
    // a missing/NaN operand => null, never silently treated as 0.
    expect(resolveCounterSource(sumSource, { records_meta: metas[0] })).toBe(3);
    expect(resolveCounterSource(sumSource, { records_meta: metas[1] })).toBeNull();
    expect(resolveCounterSource(sumSource, { records_meta: metas[2] })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// gate D — consumer source #5: src/ SQL readers (kind `table`) + unproduced
// posture (P1-C6, Fold 14). The static-parsed src/ SQL ledger
// (`scripts/steps/_schema/src-sql-ledger.json`) supplies one `src_sql` row per
// (src file read, effective-ledger column writer); a src read whose table has a
// step writer but whose COLUMN has none is an `unproduced` read, printed and
// counted on every run. ONE named commit (the FLEET-2 landing commit) flipped it
// hard (UNPRODUCED_POSTURE).
// ---------------------------------------------------------------------------
describe('gate D — consumer source #5: src/ SQL readers (kind table) + unproduced posture (P1-C6, Fold 14)', () => {
  const eff = {
    inchain: {
      p: { writes: { t: ['a', 'b'] } },
      q: { writes: { t: ['a'] } },
      r: { writes: { u: ['z'] } },
    },
    src: { 'src/x.ts': { reads: { t: ['a', 'c'], v: ['k'] } } },
  };

  it('T11a: buildSrcTableRows — one row per (src read column, effective-ledger column writer); unproducedReads names only a step-written table with no column writer', () => {
    expect(reg.buildSrcTableRows(eff)).toEqual([
      { consumer: 'src/x.ts', producer: 'p', kind: 'table', key: 't.a', value: 'any', source: 'src_sql' },
      { consumer: 'src/x.ts', producer: 'q', kind: 'table', key: 't.a', value: 'any', source: 'src_sql' },
    ]);
    expect(reg.unproducedReads(eff)).toEqual(['unproduced:src/x.ts:t.c']);
  });

  it('T11b: rowPresentTyped — a `table` row is GREEN even with no golden index (its closed check is registry freshness)', () => {
    expect(
      reg.rowPresentTyped({ consumer: 'src/x.ts', producer: 'p', kind: 'table', key: 't.a', value: 'any', source: 'src_sql' }, null),
    ).toEqual({ ok: true });
  });

  it('T11c: UNPRODUCED_POSTURE — HARD since the FLEET-2 landing commit (the ONE named flip, fold 14 P1-C6), frozen', () => {
    expect(reg.UNPRODUCED_POSTURE.mode).toBe('hard');
    expect(reg.UNPRODUCED_POSTURE.flips_hard_at).toMatch(/FLEET-2 landing commit/);
    expect(Object.isFrozen(reg.UNPRODUCED_POSTURE)).toBe(true);
  });

  it('T11d: the posture is the ONLY switch — hard REDs every unproduced read, report-only prints + counts them', () => {
    const registry = { rows: [] };
    const hard = reg.allConsumerViolations(registry, REPO_ROOT, {
      effective: eff,
      posture: { mode: 'hard', flips_hard_at: 'x' },
      inserterTables: ['t'],
    });
    expect(hard.map((v: { item: string }) => v.item)).toContain('unproduced.src/x.ts.t.c');
    const report = reg.allConsumerViolations(registry, REPO_ROOT, {
      effective: eff,
      posture: { mode: 'report-only', flips_hard_at: 'x' },
    });
    expect(report.map((v: { item: string }) => v.item)).not.toContain('unproduced.src/x.ts.t.c');

    const contracts = reg.checkConsumerContracts(registry, [], REPO_ROOT, { effective: eff, inserterTables: ['t'] });
    expect(contracts.detail).toContain('1 unproduced src read(s) (hard until the FLEET-2 landing commit');
    expect(contracts.detail).toContain('unproduced:src/x.ts:t.c');
    expect(contracts.unproduced).toEqual(['unproduced:src/x.ts:t.c']);
    // `unallowed[]` entries are bare violations (`{step, item}`) — `matchLedger`
    // only wraps them in `{violation, row}` on the ALLOWED side.
    expect(contracts.unallowed.map((v: { item: string }) => v.item)).toContain('unproduced.src/x.ts.t.c'); // hard: the default posture now REDs it
  });

  it('T11e: live — the fresh registry carries src_sql rows from the committed src-sql-ledger × the effective ledger', () => {
    const fresh = reg.buildRegistry(REPO_ROOT);
    const src = fresh.rows.filter((r: { source: string }) => r.source === 'src_sql');
    expect(src.length).toBeGreaterThan(0);
    for (const row of src) {
      expect(row.kind).toBe('table');
      expect(String(row.consumer).startsWith('src/')).toBe(true);
    }
    expect(fresh.generated_from).toContain('scripts/steps/_schema/src-sql-ledger.json × effectiveLedger() column writers');
  });
});

// MQ-A5 (plan fold 19 row 5; ASSEMBLY compliance row A5): an unproduced read is report-only ONLY when
// no converted descriptor declares an INSERTING write target on its table — a predicate over declared
// write classes, never a column list. Printed under its own prefix (UNPRODUCED-UNWITNESSED), counted
// every run, ceiling-locked; it goes hard by itself when the table's inserter converts.
describe('gate D — MQ-A5 unproduced-read predicate (converted inserter on the table)', () => {
  const eff = {
    inchain: { p: { writes: { t: ['a'] } }, q: { writes: { w: ['a'] } } },
    src: { 'src/x.ts': { reads: { t: ['c'], w: ['d'] } } },
  };
  const registry = { rows: [] };
  const hardPosture = { mode: 'hard', flips_hard_at: 'x' };

  it('A5-1: the inserting / non-inserting class sets partition the frozen write-class enum', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/steps/_schema/step.schema.json'), 'utf8'));
    const enumVals: string[] = schema.definitions.writeDiscipline.properties.class.enum;
    const ins: string[] = [...reg.ROW_INSERTING_CLASSES];
    const non: string[] = [...reg.NON_INSERTING_CLASSES];
    expect([...ins, ...non].sort()).toEqual([...enumVals].sort());
    expect(ins.filter((c) => non.includes(c))).toEqual([]);
    expect(Object.isFrozen(reg.ROW_INSERTING_CLASSES)).toBe(true);
    expect(ins).toContain('guarded_upsert');
    expect(non).toContain('set_based_join_update');
  });

  it('A5-2: convertedInserterTables keeps only tables with an inserting write class', () => {
    const descs = [
      { outputs: { writes: [{ table: 't', write_discipline: { class: 'guarded_upsert' } }, { table: 'w', write_discipline: { class: 'set_based_join_update' } }] } },
      { outputs: 'none' },
      { outputs: { writes: [{ table: 'z', write_discipline: { class: 'staging_full_replace' } }] } },
    ];
    expect(reg.convertedInserterTables(descs)).toEqual(['t', 'z']);
  });

  it('A5-3: splitUnproduced — a table with a converted inserter is hard; otherwise UNPRODUCED-UNWITNESSED', () => {
    expect(reg.splitUnproduced(['unproduced:src/x.ts:t.c', 'unproduced:src/x.ts:w.d'], ['t'])).toEqual({
      hard: ['unproduced:src/x.ts:t.c'],
      unwitnessed: ['UNPRODUCED-UNWITNESSED:src/x.ts:w.d'],
    });
  });

  it('A5-4: hard posture REDs only the read whose table has a converted inserter; the other is printed + counted, not a violation', () => {
    const v = reg.allConsumerViolations(registry, REPO_ROOT, { effective: eff, posture: hardPosture, inserterTables: ['t'] });
    const items = v.map((x: { item: string }) => x.item);
    expect(items).toContain('unproduced.src/x.ts.t.c');
    expect(items).not.toContain('unproduced.src/x.ts.w.d');
    const c = reg.checkConsumerContracts(registry, [], REPO_ROOT, { effective: eff, inserterTables: ['t'] });
    expect(c.unproducedHard).toEqual(['unproduced:src/x.ts:t.c']);
    expect(c.unproducedUnwitnessed).toEqual(['UNPRODUCED-UNWITNESSED:src/x.ts:w.d']);
    expect(c.detail).toContain('UNPRODUCED-UNWITNESSED: 1');
    expect(c.detail).toContain('UNPRODUCED-UNWITNESSED:src/x.ts:w.d');
  });

  it('A5-5 auto-close: when the table gains a converted inserter the read goes hard by itself', () => {
    const v = reg.allConsumerViolations(registry, REPO_ROOT, { effective: eff, posture: hardPosture, inserterTables: ['t', 'w'] });
    expect(v.map((x: { item: string }) => x.item)).toContain('unproduced.src/x.ts.w.d');
  });

  // Ceiling lock: the committed count the live UNPRODUCED-UNWITNESSED count may only equal or go
  // below. Raising it needs a new Spec 124 §5 row + Operator-Ruling (never a silent bump).
  const UNPRODUCED_UNWITNESSED_CEILING = 41;
  it('A5-6 live: UNPRODUCED-UNWITNESSED count <= the committed ceiling; printed every run; every entry is on a table with no converted inserter', () => {
    const c = reg.checkConsumerContracts(reg.readRegistry(REPO_ROOT), [], REPO_ROOT);
    console.info(`[gate D MQ-A5] unproduced HARD: ${c.unproducedHard.length}; UNPRODUCED-UNWITNESSED: ${c.unproducedUnwitnessed.length}`);
    for (const u of c.unproducedUnwitnessed) console.info(`  ${u}`);
    expect(c.unproducedUnwitnessed.length).toBeLessThanOrEqual(UNPRODUCED_UNWITNESSED_CEILING);
    expect(c.unproducedHard.length + c.unproducedUnwitnessed.length).toBe(c.unproduced.length);
  });
});

// ---------------------------------------------------------------------------
// T10 — LDG-10 class-2 residual (WF1 LDG-10 Step 2/3, operator O3 2026-10-03): the completeness
// scan covers ALL of scripts/ (+ .cjs), a slug consumer row covers that step's §4.1 files
// (stepFiles: step file, descriptor, notes, compute), and a key no CONVERTED producer emits is
// LISTED `unconverted_producer:<file>:<key>` only when FOUND (outside a read line) in an unconverted
// producer's source — else RED; it goes RED the moment that producer converts and emits it.
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6 (LDG-10, strict zero)
// ---------------------------------------------------------------------------
describe('gate D — LDG-10 corpus widening + slug→files + unconverted-producer posture (T10)', () => {
  const RM = 'records' + '_meta';

  it('T10a: the corpus walks every scripts/ source file incl. .cjs, and excludes the schema fixtures', () => {
    const rel = reg.collectCorpusFiles(REPO_ROOT).map((a: string) => path.relative(REPO_ROOT, a).split(path.sep).join('/'));
    expect(rel).toContain('scripts/lib/compute/enrich-heritage.js');
    expect(rel).toContain('scripts/lib/sql-witness/resolve.cjs');
    expect(rel).toContain('scripts/run-chain.js');
    expect(rel).toContain('src/components/FreshnessTimeline.tsx');
    expect(rel.some((f: string) => f.startsWith('scripts/steps/_schema/fixtures/'))).toBe(false);
    expect(new Set(rel).size).toBe(rel.length);
  });

  it('T10b: stepFileOwners — a slug consumer row covers its compute file (enrich_heritage → scripts/lib/compute/enrich-heritage.js)', () => {
    const owners = reg.stepFileOwners(REPO_ROOT);
    expect([...(owners.get('scripts/lib/compute/enrich-heritage.js') ?? [])]).toContain('enrich_heritage');
    expect([...(owners.get('scripts/enrich-centreline.js') ?? [])]).toContain('enrich_centreline');
    const live = reg.scanConsumers(reg.readRegistry(REPO_ROOT), REPO_ROOT);
    expect(live.filter((v: { item: string }) => v.item.startsWith('scan.scripts/lib/compute/enrich-heritage.js.'))).toEqual([]);
    expect(live.filter((v: { item: string }) => v.item.startsWith('scan.scripts/lib/compute/enrich-ravines.js.'))).toEqual([]);
  });

  it('T10c: RED — a scripts/ reader of a CONVERTED producer\'s emitted key with no consumer row is undeclared-consumer', () => {
    const hits = reg.scanText('scripts/fixture-reader.js', `const v = row.${RM}.heritage_load;\n`, new Set());
    const out = reg.classifyUndeclared(hits, { convertedEmitKeys: new Set(['heritage_load']), producerSources: [] });
    expect(out.red.map((v: { item: string }) => v.item)).toEqual(['scan.scripts/fixture-reader.js.heritage_load']);
    expect(out.listed).toEqual([]);
  });

  it('T10d: GREEN — an unconverted producer\'s key FOUND (outside a read) in its source is LISTED, not red', () => {
    const hits = reg.scanText('scripts/lib/compute/enrich-parcels.js', `const l = res.rows[0].${RM}.zoning_layers_loaded;\n`, new Set());
    const out = reg.classifyUndeclared(hits, {
      convertedEmitKeys: new Set(),
      producerSources: [{ file: 'scripts/load-zoning.js', text: `meta.zoning_layers_loaded = { base: true };\n` }],
    });
    expect(out.red).toEqual([]);
    expect(out.listed.map((v: { item: string }) => v.item)).toEqual(['unconverted_producer:scripts/lib/compute/enrich-parcels.js:zoning_layers_loaded']);
  });

  it('T10e: RED — a key found in an unconverted source ONLY on a read line (or nowhere) is red, never listed', () => {
    const hits = reg.scanText('scripts/r.js', `x.${RM}.ghost_key;\n`, new Set());
    const readOnly = reg.classifyUndeclared(hits, { convertedEmitKeys: new Set(), producerSources: [{ file: 'scripts/p.js', text: `y.${RM}.ghost_key;\n` }] });
    expect(readOnly.red).toHaveLength(1);
    expect(readOnly.listed).toEqual([]);
    const nowhere = reg.classifyUndeclared(hits, { convertedEmitKeys: new Set(), producerSources: [] });
    expect(nowhere.red).toHaveLength(1);
  });

  it('T10f: the listed key goes RED the moment its producer converts and emits it (closing condition, not an allowlist)', () => {
    const hits = reg.scanText('scripts/lib/compute/enrich-parcels.js', `const l = res.rows[0].${RM}.zoning_layers_loaded;\n`, new Set());
    const src = [{ file: 'scripts/load-zoning.js', text: `meta.zoning_layers_loaded = { base: true };\n` }];
    expect(reg.classifyUndeclared(hits, { convertedEmitKeys: new Set(), producerSources: src }).listed).toHaveLength(1);
    const converted = reg.classifyUndeclared(hits, { convertedEmitKeys: new Set(['zoning_layers_loaded']), producerSources: [] });
    expect(converted.red).toHaveLength(1);
    expect(converted.listed).toEqual([]);
  });

  it('T10g: the gate\'s own self-test strings are no longer scanned as reads, and a function PARAMETER ends a records_meta alias', () => {
    const own = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/gates/consumer-registry.mjs'), 'utf8');
    expect(reg.scanText('scripts/analysis/gates/consumer-registry.mjs', own, new Set())).toEqual([]);
    const text = `const meta = r.${RM};\nmeta.real_key;\nfunction f(a, meta) {\n  meta.log.error(meta.tag);\n}\n`;
    expect(reg.scanText('x.js', text, new Set()).map((v: { item: string }) => v.item)).toEqual(['scan.x.js.real_key']);
  });

  it('T10h: skipped/reason are CHAIN keys citing their pipeline.js writer (capture-step-golden.js reads them)', () => {
    expect(Object.keys(reg.CHAIN_META_KEYS)).toEqual(expect.arrayContaining(['skipped', 'reason']));
    expect(reg.scanText('scripts/analysis/capture-step-golden.js', `if (doc.summary?.${RM}?.skipped === true) {}\n`, new Set())).toEqual([]);
  });

  it('T10i: unconvertedProducerReads — the listed rows are printed and counted in the gate detail line', () => {
    const registry = reg.readRegistry(REPO_ROOT);
    const listed = reg.unconvertedProducerReads(registry, REPO_ROOT);
    expect(Array.isArray(listed)).toBe(true);
    for (const item of listed) expect(item).toMatch(/^unconverted_producer:[^:]+:[a-z_]+$/);
    const { rows } = ledger.loadLedger(REPO_ROOT);
    const out = reg.checkConsumerContracts(registry, rows, REPO_ROOT);
    expect(out.detail).toMatch(/unconverted-producer read\(s\) listed/);
  });
});
