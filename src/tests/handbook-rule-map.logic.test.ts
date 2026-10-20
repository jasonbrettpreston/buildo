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

// Seeded 2026-10-20 from the consolidate-1 inventory: 35 ids with no machine check + 12 partial. Shrink-only:
// lowering this number is how an enforced rule leaves the list; raising it needs a register ruling.
const UNENFORCED_CEILING = 47;

type Finding = { arm: string; id: string; detail: string };
type Rule = { id: string; status: string; handbook_line: string; enforcement: { kind: string; ref: string | null }; source: Record<string, unknown>; by?: string[] };
type RuleMap = { rules: Rule[]; lines: Array<{ id: string; section: string }>; unenforced: Array<{ id: string; class: string; reason: string }>; meta: Record<string, unknown> };
type Io = { registerIds: Set<string>; exists: (rel: string) => boolean; read: (rel: string) => string; checkCorpus: string; defectIds: Set<string> };
type Mod = {
  checkRuleMap: (map: RuleMap, io: Io) => Finding[];
  defaultIo: () => Io;
  unenforcedSummary: (map: RuleMap) => { total: number; inForce: string[]; none: string[]; partial: string[]; notInForce: number };
  IN_FORCE: readonly string[];
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
    const io2 = { ...io, registerIds: new Set([...io.registerIds, 'R-EW']) };
    expect(mod.checkRuleMap(load(), io2).some((f) => f.arm === 'd' && f.id === 'R-EW')).toBe(true);
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
});
