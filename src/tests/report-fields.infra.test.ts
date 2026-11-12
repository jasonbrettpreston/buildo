// SPEC LINK: docs/specs/01-pipeline/69_mcbylaw_policy.md M-69 (the generated report-field inventory is the denominator; drift-locked);
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md (generator home — PROVISIONAL);
//            .cursor/mcbylaw/phase3-prework/generator-design.md §3 (drift lock: `--check`, both directions vs the code)
//
// The committed docs/reference/maxbld-report-field-inventory.{md,json} equals an in-memory regeneration, and the
// inventory agrees with the REAL code in both directions: every label/cost line the screens render is an inventory
// row, and every inventory row's render site, chain node and constant points at code that exists.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const RF = await load('scripts/analysis/report-fields.mjs');
const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

let r: Json = {};
beforeAll(async () => { r = await RF.run({ root: ROOT, mode: 'check' }); }, 120_000);

// The ratified kind names (operator Q-P3-6 (a), 2026-10-14): the generator's KINDS equal the closed set written in
// Spec 69a M-69 and Spec 78 §6.3, both directions, read from the spec text so a rename on either side goes red.
describe('report-field kinds = the M-69 closed set', () => {
  const backticked = (s: string) => [...s.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!).sort();
  it('69a M-69: "closed `kind` — … — or a closed retirement reason"', () => {
    const row = read('docs/specs/01-pipeline/69a_mcbylaw_register.md').split('\n').find((l) => l.startsWith('| **M-69** |'))!;
    const m = row.match(/closed `kind` —(.*?)— or a closed retirement reason/);
    expect(m).not.toBeNull();
    const spec = backticked(m![1]!);
    expect(spec.length).toBeGreaterThan(0);
    expect([...RF.KINDS].sort()).toEqual(spec);
  });
  it('Spec 78 §6.3: "`kind` ∈ {…} (M-69)"', () => {
    const m = read('docs/specs/01-pipeline/78_optimal_lot_configuration.md').match(/`kind` ∈ \{([^}]*)\} \(M-69\)/);
    expect(m).not.toBeNull();
    expect([...RF.KINDS].sort()).toEqual(backticked(m![1]!));
  });
  it('every decl kind_default is in the set', () => {
    const decl = JSON.parse(read(RF.DECL_PATH));
    const defaults = (decl.producers as Json[]).map((p) => p.kind_default).filter(Boolean);
    expect(defaults.length).toBeGreaterThan(0);
    for (const k of defaults) expect(RF.KINDS).toContain(k);
  });
});

describe('report-field inventory on the real tree', () => {
  it('the generator module loads', () => {
    expect(RF.importError).toBeUndefined();
  });

  it('the committed render equals a regeneration (--check: no drift)', () => {
    expect(r.drift).toEqual([]);
  });

  it('the render is deterministic and LF-only', async () => {
    const again = await RF.buildInventory({ root: ROOT });
    expect(again.markdown).toBe(r.markdown);
    expect(again.json).toBe(r.json);
    expect(r.markdown.includes('\r')).toBe(false);
    expect(r.json.includes('\r')).toBe(false);
  }, 120_000);

  // Dated 2026-11-12 (MF-48 Stage B with MF-74; operator, verbatim: "Q1 a Q2 i" (2026-11-11) and "S1 a" (2026-11-12); Spec 69a M-69 dated note of
  // this date): S-001 is RETIRED from report-fields.decl.json (the hand-built lot screen is replaced by the declared v21 REPORT page, whose fields are
  // the M-69 denominator through report-v2.decl.json). Two S-001 tests are retired with it. Prior text: "code → inventory: every <Headline label>
  // the detail screen renders is an inventory row" (every Headline label of [parcelId].tsx was an S-001 row) and "every COST_LINE_ORDER id is a
  // cost-menu row while the screen renders <CostCard>; none after EI-D1" (an active no-CostCard pin). Their replacement pins the retirement itself:
  it('MF-48 Stage B: S-001 is retired: the decl names no S-001, the inventory has no S-001 row, and the lot route renders no Headline or CostCard', () => {
    expect(r.decl.surfaces.map((x: Json) => x.ref)).toEqual(['S-072']);
    expect([...r.model.fields, ...r.model.payload_only].filter((f: Json) => f.surface === 'S-001')).toEqual([]);
    expect(r.model.fields.filter((f: Json) => f.line_id)).toEqual([]);
    expect(read('mobile/app/(app)/parcel-tool/[parcelId].tsx')).not.toMatch(/<Headline\b|<CostCard\b/);
  });

  it('code → inventory: every TrackedLot property documented as a parcels column, and the DERIVED one, is a tracked-lots row', () => {
    const src = read('mobile/src/lib/trackedLots.ts');
    const pairs = [...src.matchAll(/\/\*\*\s*parcels\.([a-z_0-9]+)\s*\*\/\s*\n\s*([A-Za-z]+):/g)].map((m) => ({ column: m[1]!, prop: m[2]! }));
    expect(pairs.length).toBeGreaterThan(0);
    // Dated 2026-11-12 (EI-D1, operator 2026-11-12, "D all as recommended - please ensure this is addedd to the McFrontend decisions"; Spec 135 FE-38; Spec 69a M-367 dated note 2026-11-12): the two legacy columns are hidden on the row ("Not yet evaluated"), so they are not
    // rendered rows; they stay visible as RF-4 findings (the C-039 contract still whitelists them). Prior text: found: true for every pair.
    const HIDDEN = new Set(['max_buildable_gfa_sqm', 'max_newbuild_coa_gfa_sqm']);
    for (const { column, prop } of pairs) {
      const found = r.model.fields.some((f: Json) => f.surface === 'S-072' && f.payload === `lots[].${prop}` && f.column === column);
      expect({ column, prop, found }).toEqual({ column, prop, found: !HIDDEN.has(column) });
    }
    const derived = r.model.fields.some((f: Json) => f.surface === 'S-072' && f.payload === 'lots[].newNearbyCoaRuling');
    expect(derived).toBe(true);
  });

  it('inventory → code: every render site line names the payload property it claims', () => {
    const cache = new Map<string, string[]>();
    const linesOf = (file: string) => {
      if (!cache.has(file)) cache.set(file, read(file).split('\n'));
      return cache.get(file)!;
    };
    for (const f of r.model.fields.filter((x: Json) => x.surface === 'S-001' && !x.line_id)) {
      const leaf = String(f.payload).split(/\.|\[\]/).filter(Boolean).pop()!;
      for (const site of f.render_sites) {
        const i = site.lastIndexOf(':');
        const file = site.slice(0, i);
        const line = Number(site.slice(i + 1));
        const lineText = linesOf(file)[line - 1] || '';
        expect({ site, ok: lineText.includes(leaf) }).toEqual({ site, ok: true });
      }
    }
  });

  it('inventory → code: every chain node points at an existing line that names it', () => {
    const linesOf = (file: string) => read(file).split('\n');
    for (const f of [...r.model.fields, ...r.model.payload_only]) {
      for (const node of f.chain || []) {
        const ok = fs.existsSync(path.join(ROOT, node.file))
          && node.line >= 1
          && node.line <= linesOf(node.file).length;
        expect({ at: `${node.file}:${node.line}`, name: node.name, ok }).toEqual({ at: `${node.file}:${node.line}`, name: node.name, ok: true });
        if (node.kind === 'sql' && node.name !== '(filter)' && !node.name.includes('.')) {
          // `node.line` is where the target expression starts; a multi-line CASE names its alias
          // (`AS name`, or `name = …` in an UPDATE) on a later line, so scan the SOURCE lines from
          // `node.line` over a bounded statement size — never the generator's own excerpt.
          const lines = linesOf(node.file);
          const region = lines.slice(node.line - 1, node.line - 1 + 40).join('\n');
          const named = new RegExp(`\\b${node.name}\\b`).test(region);
          expect({ at: `${node.file}:${node.line}`, name: node.name, ok: named }).toEqual({ at: `${node.file}:${node.line}`, name: node.name, ok: true });
        }
      }
    }
  });

  it('inventory → code: every named constant resolves to code-link leaves', () => {
    // Dated 2026-11-12 (MF-48 Stage B, S-001 retired; operator "S1 a"): every chain with a constant was an S-001 field, so the list is empty until a
    // declared surface renders a chain again; each constant that IS listed must still resolve. Prior text: expect(constants.length) > 0.
    expect(r.model.constants).toEqual([]);
    for (const c of r.model.constants) {
      const ok = c.leaves > 0 && fs.existsSync(path.join(ROOT, String(c.ref).split('#')[0]!));
      expect({ ref: c.ref, leaves: c.leaves, ok }).toEqual({ ref: c.ref, leaves: c.leaves, ok: true });
    }
  });

  // Dated 2026-11-12 (EI-D1, operator 2026-11-12, "D all as recommended - please ensure this is addedd to the McFrontend decisions"; Spec 135 FE-38; Spec 69a M-367 dated note 2026-11-12): RF-4 and RF-7 leave the PASS list (prior text: RF-1, RF-3, RF-4, RF-7, RF-9) and are pinned
  // below to fail for exactly the EI-D1 reasons: the tracked-lots legacy pair is whitelisted but not rendered, and the legacy
  // cost-menu twins are no longer rendered or sent. MB-43 / MF-48 Stage B retire them from the declarations.
  // Dated 2026-11-12 (MF-48 Stage B, S-001 retired; operator "S1 a"; Spec 69a M-69 dated note): RF-9 leaves the PASS list. Its `layer2` keys were
  // reached only by the S-001 chains, so each is now a dead declaration; the finding stays visible (report-only) and is owed to MB-43 (retire the
  // old calc), which retires the legacy declarations with the legacy fields. Prior text: RF-1, RF-3 and RF-9 PASS.
  it('structural gates pass (RF-1 chain, RF-3 constants); RF-9 lists only dead layer2 declarations (S-001 retired, owed MB-43)', () => {
    for (const id of ['RF-1', 'RF-3']) {
      expect(r.model.gates.find((g: Json) => g.id === id)).toMatchObject({ id, state: 'PASS' });
    }
    const rf9 = r.model.gates.find((g: Json) => g.id === 'RF-9').failing as string[];
    expect(rf9.length).toBe(Object.keys(r.decl.layer2).length);
    for (const line of rf9) expect(line).toMatch(/: matches no chain input \(dead declaration\)$/);
  });

  it('the known open findings stay visible (report-only gates fail for the reasons the hand edition found)', () => {
    // Dated 2026-11-12 (MF-48 Stage B, S-001 retired): RF-5's one finding (parcel.areas.realized_fsi_p90) was an S-001 payload row, so RF-5 now
    // PASSES; RF-8 (the S-001 descriptor whitelist) has nothing to compare and PASSES. Prior text: RF-5 failing contains parcel.areas.realized_fsi_p90.
    expect([r.model.gates.find((g: Json) => g.id === 'RF-5').state, r.model.gates.find((g: Json) => g.id === 'RF-8').state]).toEqual(['PASS', 'PASS']);
    expect(r.model.gates.find((g: Json) => g.id === 'RF-2').failing).toContain('S-072 lots[].newNearbyCoaRuling');
    // Dated 2026-11-12 (operator "1 b 2 a", item 2 (a)): RF-10 now PASSES, because the last rendered fields that reached a banned
    // code ref (envelope_constrained / envelope_constraint_reason) are no longer rendered. Prior text: RF-10 state FAIL.
    expect(r.model.gates.find((g: Json) => g.id === 'RF-10').state).toBe('PASS');
    // EI-D1 (dated 2026-11-12): exactly these, nothing else.
    expect(r.model.gates.find((g: Json) => g.id === 'RF-4').failing).toEqual(['S-072 lots[].maxBuildGfaSqm', 'S-072 lots[].maxCoaBuildGfaSqm']);
    expect(r.model.gates.find((g: Json) => g.id === 'RF-7').failing).toEqual(['menu:max_build ↔ menu:coa_build', 'menu:solar_max ↔ menu:solar_coa']);
  });
});
