// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-BZ, compute purity G0–G8);
//            docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5
//            plan: .cursor/wf1_compute_purity_active_task.md "Phase 1 tests" (T1)
//
// WF1 Phase 1 — `scripts/analysis/gates/compute-closure.mjs` (G0) +
// `scripts/analysis/gates/compute-purity.mjs` (G1–G8).
//
// G0 says WHAT a compute module can REACH. Rule 2's "compute is JUST compute"
// and §5.5's layer table ("Compute | MEASURES ONLY … never compares, never
// decides, never writes a row") both rest on that reachability being a property
// of the STATIC `require()` graph: a compute file that can reach the runner, the
// ledger or the pipeline SDK is a "just compute" file one call away from opening
// a run and deciding a verdict. The gate reads the graph through the TypeScript
// compiler API, so a `// require('../pipeline')` in a COMMENT adds no edge (the
// AST shape is the evidence) and a `require(<non-literal>)` is a `dynamic` site
// G0 makes RED — "compute reached nothing else" cannot be asserted about an edge
// the gate cannot see.
//
// G1–G8 say what the SQL a compute module carries may TOUCH, each a CLOSED code
// over one scan set (`computeEntries() ∪ computeClosure().modules`). They are the
// gate-E family's purity half: ledger SQL, undeclared relations, catalog reads,
// transaction/DDL/session verbs, direct DML, `ctx.config` comparisons, reachable
// halts — proven here against the bad fixture PLUS its require closure, and the
// clean twin.
//
// Both directions are locked (Spec 121 §12b.6 — a checker never proven to fire is
// not a check): the bad fixture FIRES every code with its `// expect: G<n>` tag,
// and the clean twin is SILENT. The module's own `selfTest()` is re-invoked, and a
// NEGATIVE CONTROL proves the lock is red when the scan is misconfigured (the bad
// fixture scanned with `entries: []` loses its G2 site — G2 only judges entries).
//
// The compute-purity module is ASYNC (`await scanPurity(...)`, `await selfTest()`);
// libpg-query init and the ~2,700-line fleet scan are slow, so each test gets a
// 120 s budget.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO_ROOT = process.cwd();

// The purity module is ESM `.mjs` with top-level async deps (libpg-query). Import it
// dynamically, exactly as the gate's own consumers must.
const closureMod = await import('../../scripts/analysis/gates/compute-closure.mjs');
const purityMod = await import('../../scripts/analysis/gates/compute-purity.mjs');

const TIMEOUT = 120_000;

const tmpDir = (prefix: string): string => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

describe('G0 — compute closure (Rule 2 / §5.5: compute reaches nothing else)', () => {
  // ---------------------------------------------------------------------------
  // T1 — the LIVE compute closure. Entries are excluded; the closure is what the
  // compute modules `require()`. `dynamic.length === 0` is the load-bearing claim:
  // an unresolvable require argument is an edge the gate cannot see, so G0 makes it
  // RED rather than pretend the closure is complete.
  // ---------------------------------------------------------------------------
  it('T1: computeClosure is PASS, ≥15 non-.json modules, zero dynamic sites', () => {
    const closure = closureMod.computeClosure({ repoRoot: REPO_ROOT });
    expect(closure.dynamic).toEqual([]);
    expect(closure.dynamic.length).toBe(0);
    expect(closure.parseErrors).toEqual([]);
    const nonJson = closure.modules.filter((m: string) => !m.endsWith('.json'));
    expect(nonJson.length).toBeGreaterThanOrEqual(15);
    expect(closureMod.verdict(closure)).toBe('PASS');
  }, TIMEOUT);

  // ---------------------------------------------------------------------------
  // T2 — a `require()` in a COMMENT adds no edge; only a real call does. The AST is
  // the evidence, not a byte-pattern over the file. A `require(<identifier>)` is
  // NOT statically resolvable and MUST surface as a `dynamic` site.
  // ---------------------------------------------------------------------------
  it('T2: comment-only require is ignored; a real require is followed; an identifier require is dynamic', () => {
    const dir = tmpDir('compute-closure-');
    fs.writeFileSync(
      path.join(dir, 'a.js'),
      [
        "// require('./b')",
        "require('./c');",
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(path.join(dir, 'b.js'), 'module.exports = {};\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'c.js'), 'module.exports = {};\n', 'utf8');

    const closure = closureMod.requireClosure(['a.js'], { repoRoot: dir });
    expect(closure.modules).toContain('c.js');
    expect(closure.modules).not.toContain('b.js');
    expect(closure.dynamic).toEqual([]);

    // The dynamic arm: `require(name)` — an identifier is NOT a plain string literal,
    // so it is an edge this gate cannot see and G0 records it.
    const dyn = tmpDir('compute-closure-dyn-');
    fs.writeFileSync(
      path.join(dyn, 'dyn.js'),
      ["const name = './x';", 'require(name);', ''].join('\n'),
      'utf8',
    );
    const dynClosure = closureMod.requireClosure(['dyn.js'], { repoRoot: dyn });
    expect(dynClosure.dynamic.length).toBeGreaterThan(0);
    expect(dynClosure.dynamic.some((d: { file: string }) => d.file === 'dyn.js')).toBe(true);
  }, TIMEOUT);

  // ---------------------------------------------------------------------------
  // T3 — an empty closure is RED, never a vacuous PASS: an entry that resolves to
  // nothing (or a compute dir with no modules) must FAIL, not slip through.
  // ---------------------------------------------------------------------------
  it('T3: an empty closure verdict is FAIL:G0:empty', () => {
    const v = closureMod.verdict({ modules: [], dynamic: [], parseErrors: [] });
    expect(v.startsWith('FAIL:G0:empty')).toBe(true);
  }, TIMEOUT);
});

describe('G1–G8 — compute purity (Rule 2 / §5.5: compute MEASURES only)', () => {
  // ---------------------------------------------------------------------------
  // T4 — the module's own self-test runs (and throws on failure). The module's
  // selfTest() is the fixture-driven proof; this suite must not merely trust its
  // pass, so T5 re-asserts every direction directly below.
  // ---------------------------------------------------------------------------
  it('T4: selfTest() resolves (does not throw)', async () => {
    await expect(purityMod.selfTest()).resolves.toBeDefined();
  }, TIMEOUT);

  // ---------------------------------------------------------------------------
  // T5 — both directions, asserted DIRECTLY against the fixtures:
  //   (a) RED  — every `// expect: G<n>` tag in the bad fixture (and its closure
  //              helper) has a site with that code on that line;
  //   (b) GREEN — the clean twin is silent (zero sites).
  // ---------------------------------------------------------------------------
  it('T5a: the bad fixture + its closure fire exactly the tagged codes/lines', async () => {
    const sites = await purityMod.scanPurity({
      repoRoot: REPO_ROOT,
      files: [purityMod.BAD_FIXTURE, purityMod.BAD_HELPER],
      entries: [purityMod.BAD_FIXTURE],
    });

    for (const file of [purityMod.BAD_FIXTURE, purityMod.BAD_HELPER]) {
      const text = fs.readFileSync(path.resolve(REPO_ROOT, file), 'utf8');
      const lines = text.split(/\r?\n/);
      let tagged = 0;
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/expect:\s*(G\d+)/g)) {
          tagged += 1;
          const code = m[1];
          const found = sites.some(
            (s: { code: string; file: string; line: number }) =>
              s.code === code && s.file === file && s.line === i + 1,
          );
          expect(found, `${file}:${i + 1} expects ${code} but no ${code} site was found`).toBe(true);
        }
      });
      // A fixture with no tags proves nothing — the scan set must carry them.
      expect(tagged).toBeGreaterThan(0);
    }

    // Every code in the closed set is proven to fire somewhere on the bad side.
    for (const code of Object.keys(purityMod.CODES)) {
      expect(
        sites.some((s: { code: string }) => s.code === code),
        `code ${code} (${(purityMod.CODES as Record<string, { rule: string }>)[code]!.rule}) did not fire on the known-bad fixture`,
      ).toBe(true);
    }
  }, TIMEOUT);

  it('T5b: the clean twin is SILENT (zero sites)', async () => {
    const sites = await purityMod.scanPurity({
      repoRoot: REPO_ROOT,
      files: [purityMod.CLEAN_FIXTURE],
      entries: [purityMod.CLEAN_FIXTURE],
    });
    expect(sites).toEqual([]);
  }, TIMEOUT);

  // ---------------------------------------------------------------------------
  // T6 — NEGATIVE CONTROL (the lock is proven RED when misconfigured). G2 judges a
  // compute ENTRY against its declared set. Scan the bad fixture as a bare file —
  // no entry, so no declared set, so G2 cannot fire — and the G2 site MUST vanish.
  // This is the direction that would silently rot if `entries` stopped mattering.
  // ---------------------------------------------------------------------------
  it('T6: scanning the bad fixture with entries:[] loses the G2 site (G2 judges entries only)', async () => {
    const withEntry = await purityMod.scanPurity({
      repoRoot: REPO_ROOT,
      files: [purityMod.BAD_FIXTURE, purityMod.BAD_HELPER],
      entries: [purityMod.BAD_FIXTURE],
    });
    expect(withEntry.some((s: { code: string }) => s.code === 'G2')).toBe(true);

    const withoutEntry = await purityMod.scanPurity({
      repoRoot: REPO_ROOT,
      files: [purityMod.BAD_FIXTURE, purityMod.BAD_HELPER],
      entries: [],
    });
    expect(withoutEntry.some((s: { code: string }) => s.code === 'G2')).toBe(false);
  }, TIMEOUT);

  // ---------------------------------------------------------------------------
  // T7 — the LIVE fleet scan: keys are unique PER FILE and well-formed, and G2 is
  // 0 (every compute relation is declared). A ledger row keys on `step + item`
  // (a rule id plus the source line TEXT), so the same key in two different files
  // is legal — an identical `throw` in heritage and ravines is two rows. What is
  // illegal is two rows for ONE site (Spec 124 R-BZ C2 one-row-one-site), so the
  // property is `file + '\t' + key` uniqueness, not a global key set.
  // ---------------------------------------------------------------------------
  it('T7: live scan per-file keys are unique, well-formed, and G2 count is 0', async () => {
    const sites = await purityMod.scanPurity({ repoRoot: REPO_ROOT });
    expect(sites.length).toBeGreaterThan(0);

    const keys = sites.map((s: { key: string }) => s.key);
    const fileKeys = sites.map((s: { file: string; key: string }) => `${s.file}\t${s.key}`);
    expect(new Set(fileKeys).size).toBe(fileKeys.length);

    const KEY_RE = /^compute-[a-z-]+@[^#]+#\d+$/;
    for (const key of keys) expect(key).toMatch(KEY_RE);

    const summary = purityMod.codesSummary(sites);
    expect((summary as Record<string, number>).G2).toBe(0);
  }, TIMEOUT);

  // ---------------------------------------------------------------------------
  // T8 — ordinals: two sites in ONE file sharing `rule@fp` get `#1`, `#2` … in
  // source order. The real tree carries such a group (enrich-centreline.js has the
  // same `pipeline_runs` read twice → two G1 sites on one fingerprint), so the
  // property is asserted over REAL output, not a synthetic fixture.
  // ---------------------------------------------------------------------------
  it('T8: a real file has a rule@fp group of size ≥2 whose ordinals are 1..n in line order', async () => {
    const sites = await purityMod.scanPurity({ repoRoot: REPO_ROOT });

    const groups = new Map<string, Array<{ line: number; key: string }>>();
    for (const s of sites as Array<{ file: string; rule: string; fp: string; line: number; key: string }>) {
      const g = `${s.file}\t${s.rule}\t${s.fp}`;
      if (!groups.has(g)) groups.set(g, []);
      (groups.get(g) as Array<{ line: number; key: string }>).push({ line: s.line, key: s.key });
    }

    const multi = [...groups.entries()].filter(([, list]) => list.length >= 2);
    expect(multi.length).toBeGreaterThan(0);

    for (const [, list] of multi) {
      // Ordinals are 1..n in line order within the file (finalizeSites sorts by line
      // before assigning the ordinal).
      const byLine = list.slice().sort((a, b) => a.line - b.line);
      byLine.forEach((site, i) => {
        expect(site.key.endsWith(`#${i + 1}`)).toBe(true);
      });
    }
  }, TIMEOUT);
});
