// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DF, R-AM, R-BA (operator y 2026-10-20 consolidation 1-4)
//
// Handbook rule map lock. scripts/steps/_schema/rule-map.json maps every Spec 124 register id (read by
// extractRegisterRulingIds, the reader R-EY (9) and spec-split-check arm (iii) use) and every other
// step-standard id to exactly one line of docs/handbook/step-standard.md. RED when: a register id has no
// mapping (a new register row must add its rule-map entry in the same commit); an in-force rule maps to no
// live handbook line; a mapped id, `by` target or enforcement ref does not resolve; or an in-force rule has no
// enforcement and is not on the `unenforced` list. The `unenforced` list only shrinks: its length is capped
// at the seed below, and an entry whose rule gained enforcement must be removed.

import { describe, expect, it, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv from 'ajv';

const REPO_ROOT = path.resolve(__dirname, '../../');
const MAP_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/rule-map.json');
const SCHEMA_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/rule-map.schema.json');

// Seeded 2026-10-20 from the consolidate-1 inventory: 35 ids with no machine check + 12 partial (47). Re-seeded the
// same day at 67 by the verify-12 N1 enforcement-honesty re-audit (operator y 2026-10-20 consolidation 1-4): a lock must
// now name a test that mentions the rule, and 20 in-force rules whose named test did not assert them moved here as none
// or partial, each with its reason. Shrink-only from here: lowering this number is how an enforced rule leaves the
// list; raising it needs a register ruling.
const UNENFORCED_CEILING = 67;

type Finding = { arm: string; id: string; detail: string };
type Rule = { id: string; status: string; handbook_line: string; enforcement: { kind: string; ref: string | null }; source: Record<string, unknown>; by?: string[]; aliases?: string[]; mention_by_alias_only?: boolean };
type RuleMap = { rules: Rule[]; lines: Array<{ id: string; section: string }>; unenforced: Array<{ id: string; class: string; reason: string }>; meta: Record<string, unknown> };
type Io = { registerIds: Set<string>; exists: (rel: string) => boolean; read: (rel: string) => string; checkCorpus: string; defectIds: Set<string> };
type Mod = {
  checkRuleMap: (map: RuleMap, io: Io) => Finding[];
  defaultIo: () => Io;
  unenforcedSummary: (map: RuleMap) => { total: number; inForce: string[]; none: string[]; partial: string[]; notInForce: number };
  IN_FORCE: readonly string[];
  unenforcedReportLine: (map: RuleMap) => string;
  mentionsRule: (text: string, rule: Rule) => boolean;
  enforcementCounts: (map: RuleMap) => Record<string, number>;
};
type Gen = {
  factFindings: (texts: string[], root?: string, opts?: { symbolHome?: Record<string, string>; flagHome?: Record<string, string> }) => string[];
  handWrittenTexts: (shapes?: string) => string[];
  readDispatch: (root?: string, src?: string | null) => { order: Array<{ predicate: string; shape: string; phases: string[] }>; phases: Record<string, { hooks: string[]; via: string[] }>; runner: { hooks: string[] } };
  readSteps: (root?: string) => Array<{ slug: string; shape: string; phase: string }>;
  RUNNER_REL: string;
};

let mod: Mod;
let io: Io;
beforeAll(async () => {
  mod = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/gates/rule-map.mjs')).href)) as unknown as Mod;
  io = mod.defaultIo();
});

const load = (): RuleMap => JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')) as RuleMap;
const clone = (m: RuleMap): RuleMap => JSON.parse(JSON.stringify(m)) as RuleMap;
const arms = (fs0: Finding[]) => [...new Set(fs0.map((f) => f.arm))].sort();

describe('handbook rule map — every rule maps to exactly one handbook line (operator y 2026-10-20 consolidation 1-4)', () => {
  it('validates against rule-map.schema.json', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')));
    const ok = validate(load());
    expect(ok ? [] : validate.errors).toEqual([]);
  });

  it('GREEN — the committed map has no finding on any arm (a)–(e)', () => {
    expect(mod.checkRuleMap(load(), io)).toEqual([]);
  });

  it('covers every register id the shared reader resolves (and nothing is mapped twice)', () => {
    const ids = new Set(load().rules.map((r) => r.id));
    expect(io.registerIds.size).toBeGreaterThan(100);
    expect([...io.registerIds].filter((id) => !ids.has(id))).toEqual([]);
    expect(ids.size).toBe(load().rules.length);
  });

  it('the unenforced list only shrinks (ceiling) and every in-force entry carries a reason', () => {
    const m = load();
    expect(m.unenforced.length).toBeLessThanOrEqual(UNENFORCED_CEILING);
    for (const u of m.unenforced) expect(u.reason.length, u.id).toBeGreaterThan(8);
    const s = mod.unenforcedSummary(m);
    expect(s.total).toBe(m.unenforced.length);
    expect(s.inForce.length + s.notInForce).toBe(s.total);
  });

  it('records the precedence decision and the Spec 121 M1–M14 retirement as data', () => {
    const m = load();
    expect(String(m.meta.authority)).toMatch(/Spec 124 register/);
    expect(String(m.meta.precedence)).toMatch(/historical design records/);
    const ms = m.rules.filter((r) => /^M\d+$/.test(r.id));
    expect(ms.map((r) => r.id).sort()).toEqual(Array.from({ length: 14 }, (_, i) => `M${i + 1}`).sort());
    for (const r of ms) expect([r.id, r.status, (r as unknown as { retired_as_set?: string }).retired_as_set]).toEqual([r.id, 'historical', 'spec121-M1-M14']);
  });

  // ---- RED direction: each arm catches its tamper -------------------------------------------------------------
  it('RED (a) — a register id with no mapping', () => {
    const m = clone(load());
    m.rules = m.rules.filter((r) => r.id !== 'R-EY');
    expect(arms(mod.checkRuleMap(m, io))).toContain('a');
  });

  it('RED (a) — a new register row (simulated) with no rule-map entry', () => {
    const io2 = { ...io, registerIds: new Set([...io.registerIds, 'R-ZZ']) };
    expect(mod.checkRuleMap(load(), io2).filter((f) => f.arm === 'a').map((f) => f.id)).toEqual(['R-ZZ']);
  });

  it('RED (b) — a rule mapped to a line that does not exist', () => {
    const m = clone(load());
    m.rules[0]!.handbook_line = 'core.999';
    expect(arms(mod.checkRuleMap(m, io))).toContain('b');
  });

  it('RED (c) — an in-force rule mapped only to a history line', () => {
    const m = clone(load());
    const r = m.rules.find((x) => x.id === 'R-EY')!;
    r.handbook_line = 'history.1';
    expect(mod.checkRuleMap(m, io).some((f) => f.arm === 'c' && f.id === 'R-EY')).toBe(true);
  });

  it('RED (d) — a mapped id that does not resolve (register id and anchored id)', () => {
    const m = clone(load());
    m.rules.push({ ...m.rules.find((x) => x.id === 'R-EY')!, id: 'R-QQ' });
    const anchored = m.rules.find((x) => x.id === 'Rule-1')!;
    anchored.source = { file: anchored.source.file, anchor: 'this sentence is not in the spec' };
    const ds = mod.checkRuleMap(m, io).filter((f) => f.arm === 'd').map((f) => f.id);
    expect(ds).toEqual(expect.arrayContaining(['R-QQ', 'Rule-1']));
  });

  it('RED (d) — a pending-integration id that already resolves must leave the pending list', () => {
    // integrate-12: rulings-7 has landed and meta.pending_integration is empty, so the fixture re-marks R-EW
    // pending (as the map carried it before integration) against the real register, where R-EW resolves.
    const m = clone(load());
    (m.meta.pending_integration as { rules: string[] }).rules = ['R-EW'];
    m.rules.find((x) => x.id === 'R-EW')!.source.pending_integration = 'wf2/rulings-7 @ b348e360';
    expect(io.registerIds.has('R-EW')).toBe(true);
    expect(mod.checkRuleMap(m, io).some((f) => f.arm === 'd' && f.id === 'R-EW')).toBe(true);
  });

  it('RED (e) — an in-force rule with no enforcement and not listed unenforced', () => {
    const m = clone(load());
    const r = m.rules.find((x) => x.id === 'R-EY')!;
    r.enforcement = { kind: 'none', ref: null };
    expect(mod.checkRuleMap(m, io).some((f) => f.arm === 'e' && f.id === 'R-EY')).toBe(true);
  });

  it('RED (e) — a stale unenforced entry (its rule is now enforced) and an unresolved lock ref', () => {
    const m = clone(load());
    const listed = m.unenforced.find((u) => u.class === 'none')!;
    const r = m.rules.find((x) => x.id === listed.id)!;
    r.enforcement = { kind: 'lock', ref: 'src/tests/no-such-lock.logic.test.ts' };
    const es = mod.checkRuleMap(m, io).filter((f) => f.arm === 'e');
    expect(es.some((f) => /now has enforcement/.test(f.detail))).toBe(true);
    expect(es.some((f) => /does not resolve/.test(f.detail))).toBe(true);
  });

  // observe-1: step-validate --all prints the standing count (a report line, never a hard stop).
  it('step-validate --all prints the unenforced-rule count from rule-map.json', () => {
    const m = load();
    const line = mod.unenforcedReportLine(m);
    const s = mod.unenforcedSummary(m);
    expect(line).toMatch(new RegExp(`^\\[step-validate\\] rule-map: ${s.inForce.length} in-force rule\\(s\\) with no or partial machine check \\(${s.none.length} none, ${s.partial.length} partial\\)`));
    for (const id of s.inForce) expect(line).toContain(id);
    const sv = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs'), 'utf8');
    expect(sv).toContain("import { loadRuleMap, unenforcedReportLine } from './gates/rule-map.mjs';");
    const allBlock = sv.indexOf('  if (opts.all) {\n    // Operator y 2026-10-20 consolidation 1-4 (observe-1)');
    expect(allBlock).toBeGreaterThan(-1);
    expect(sv.indexOf('console.log(unenforcedReportLine(loadRuleMap(REPO_ROOT)));', allBlock)).toBeGreaterThan(allBlock);
  });
});

// verify-12 N1/N3 (operator y 2026-10-20 consolidation 1-4): a lock names a test that mentions the rule; the handbook's
// hand-written facts are checked against the code.
describe('handbook rule map — enforcement honesty (verify-12 N1)', () => {
  it('RED (e) — a lock whose test file never names the rule', () => {
    const m = clone(load());
    const r = m.rules.find((x) => x.id === 'R-EY')!;
    r.enforcement = { kind: 'lock', ref: 'src/tests/permits.logic.test.ts' };
    expect(mod.checkRuleMap(m, io).some((f) => f.arm === 'e' && f.id === 'R-EY' && /never names/.test(f.detail))).toBe(true);
  });

  it('RED (e) — a DB-only test declared as kind lock; GREEN as kind lock-db', () => {
    const m = clone(load());
    const r = m.rules.find((x) => x.id === 'R-BS')!;
    expect(r.enforcement.kind).toBe('lock-db');
    expect(mod.checkRuleMap(m, io).filter((f) => f.id === 'R-BS')).toEqual([]);
    r.enforcement = { kind: 'lock', ref: r.enforcement.ref };
    expect(mod.checkRuleMap(m, io).some((f) => f.arm === 'e' && f.id === 'R-BS' && /lock-db/.test(f.detail))).toBe(true);
  });

  it('RED (e) — an id-resolution meta test is not a behavioural lock for a step rule', () => {
    const m = clone(load());
    const r = m.rules.find((x) => x.id === 'R-EY')!;
    r.enforcement = { kind: 'lock', ref: 'src/tests/handbook-rule-map.logic.test.ts' };
    expect(mod.checkRuleMap(m, io).some((f) => f.arm === 'e' && f.id === 'R-EY' && /meta test/.test(f.detail))).toBe(true);
  });

  it('RED (e) — a partial entry whose rule has no enforcement', () => {
    const m = clone(load());
    const listed = m.unenforced.find((u) => u.class === 'partial' && m.rules.find((x) => x.id === u.id)!.enforcement.kind === 'lock')!;
    m.rules.find((x) => x.id === listed.id)!.enforcement = { kind: 'none', ref: null };
    expect(mod.checkRuleMap(m, io).some((f) => f.arm === 'e' && f.id === listed.id && /partial/.test(f.detail))).toBe(true);
  });

  it('aliases: a colliding id (V3) counts only by its alias; R-K is not R-K.1; an alias must be unique (arm b)', () => {
    const v3 = load().rules.find((x) => x.id === 'V3')!;
    expect(v3.aliases).toEqual(['SPEC122A-V3']);
    expect(mod.mentionsRule('the V3 standard', v3)).toBe(false);
    expect(mod.mentionsRule('// rule-map: SPEC122A-V3', v3)).toBe(true);
    const rk = load().rules.find((x) => x.id === 'R-K')!;
    expect(mod.mentionsRule('R-K.1 only', rk)).toBe(false);
    const m = clone(load());
    m.rules.find((x) => x.id === 'G7')!.aliases = ['SPEC122A-V3'];
    expect(mod.checkRuleMap(m, io).some((f) => f.arm === 'b' && /alias SPEC122A-V3 is not unique/.test(f.detail))).toBe(true);
  });

  it('every lock in the committed map names its rule (or alias) in a test that npm test runs', () => {
    const m = load();
    const bad = m.rules
      .filter((r) => r.enforcement.kind === 'lock' && !(r.source as { pending_integration?: string }).pending_integration)
      .filter((r) => /\.db\.test\.ts$/.test(r.enforcement.ref!) || !mod.mentionsRule(fs.readFileSync(path.join(REPO_ROOT, r.enforcement.ref!), 'utf8'), r));
    expect(bad.map((r) => r.id)).toEqual([]);
    const c = mod.enforcementCounts(m);
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(m.rules.length);
  });
});

describe('step handbook — hand-written facts are locked to the code (verify-12 N3)', () => {
  let gen: Gen;
  beforeAll(async () => {
    gen = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/generate-step-handbook.mjs')).href)) as unknown as Gen;
  });

  it('GREEN — every symbol, path, flag and invariant number in §1, §5 and the glossary holds', () => {
    expect(gen.factFindings(gen.handWrittenTexts())).toEqual([]);
  });

  it('RED — an unknown symbol, a missing path, a flag its script lacks and an unknown invariant are each named', () => {
    const f = gen.factFindings(['`noSuchRunnerFunction` in `scripts/lib/step/no-such.js`; run with `--replay-everything`; fast invariant #99']);
    expect(f).toEqual(expect.arrayContaining([
      'symbol noSuchRunnerFunction has no SYMBOL_HOME entry',
      'path scripts/lib/step/no-such.js does not exist',
      'flag --replay-everything has no FLAG_HOME entry',
      'fast invariant #99 is not in step-validate or its gates',
    ]));
  });

  it('GREEN — the dispatch §1 describes is the runner one: shapes, phases and the no-phase path', () => {
    const d = gen.readDispatch();
    expect(d.order.map((o) => o.shape)).toEqual(['link', 'link_keyed', 'link_column', 'ingest', 'cascade', 'materialize', 'backfill', 'recorder', 'enrich']);
    expect(d.order.find((o) => o.shape === 'ingest')!.phases).toEqual(['runIngestPhase', 'ingestPrimaries']);
    expect(d.phases.runLinkPhase!.hooks).toContain('buildMatchSql');
    const by = new Map(gen.readSteps().map((s) => [s.slug, s]));
    expect(by.get('link_wsib')!.phase).toBe('runCascadePhase');
    expect(by.get('link_parcels')!.phase).toBe('runLinkKeyedPhase');
    expect(by.get('link_neighbourhoods')!.phase).toBe('runLinkColumnPhase');
    expect(by.get('assert_engine_health')!.phase).toBe('no phase');
    expect(by.get('load_ravines')!.shape).toBe('none (inferred ingest)');
  });

  it('RED — a runner whose run order drifts from §1 fails by name', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, gen.RUNNER_REL), 'utf8');
    const noLock = src.replace('pipeline.withAdvisoryLock(pool, descriptor.identity.lock', 'pipeline.withSomeOtherLock(pool, descriptor.identity.lock');
    expect(() => gen.readDispatch(REPO_ROOT, noLock)).toThrow(/advisory lock on identity.lock/);
    const noReportGuard = src.replace('if (!declared.has(checkId))', 'if (false)');
    expect(() => gen.readDispatch(REPO_ROOT, noReportGuard)).toThrow(/ctx.report/);
  });
});

// verify-12b E28/E32 (operator y 2026-10-20 consolidation 1-4): table 1a follows compute-taking helpers; the fact lock
// matches whole tokens outside comments and whole flags.
describe('step handbook — table 1a hooks through helpers, and a stricter fact lock (verify-12b E28, E32)', () => {
  let gen: Gen;
  beforeAll(async () => {
    gen = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/generate-step-handbook.mjs')).href)) as unknown as Gen;
  });

  it('GREEN — hooks reached through a runner helper are listed (materializeRowsArm, runBackfillFullRecompute), and the runner row reads DISTRIBUTION_SCOPE', () => {
    const d = gen.readDispatch();
    expect(d.phases.runMaterializePhase!.hooks).toEqual(expect.arrayContaining(['materializeRows', 'buildSourceSql', 'finalizeMatched', 'buildPostSql']));
    expect(d.phases.runMaterializePhase!.via).toContain('materializeRowsArm');
    expect(d.phases.runBackfillPhase!.hooks).toEqual(expect.arrayContaining(['buildPreSql', 'buildPostSql']));
    expect(d.phases.runLinkPhase!.hooks).toContain('primaryMatchBinds');
    expect(d.runner.hooks).toContain('DISTRIBUTION_SCOPE');
  });

  it('RED — a symbol that occurs only in a comment of its home file, and a flag that is only a prefix of a real flag', () => {
    const f = gen.factFindings(['`nullAddressCount` and `--replay-al`'], REPO_ROOT, {
      symbolHome: { nullAddressCount: 'scripts/lib/step/index.js' },
      flagHome: { '--replay-al': 'scripts/analysis/capture-step-golden.js' },
    });
    expect(f).toEqual(expect.arrayContaining([
      'symbol nullAddressCount does not occur outside comments in scripts/lib/step/index.js',
      'flag --replay-al does not occur in scripts/analysis/capture-step-golden.js',
    ]));
  });
});
