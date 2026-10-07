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

  it('code → inventory: every <Headline label="…"> the detail screen renders is an inventory row', () => {
    const screen = read(r.decl.surfaces[0].screen);
    const labels = [...screen.matchAll(/<Headline\s+label="([^"]+)"/g)].map((m) => m[1]!);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      const found = r.model.fields.some((f: Json) => f.surface === 'S-001' && f.label === label);
      expect({ label, found }).toEqual({ label, found: true });
    }
  });

  it('code → inventory: every COST_LINE_ORDER id is a cost-menu row', () => {
    const src = read('mobile/src/lib/parcelCostFormat.ts');
    const block = src.slice(src.indexOf('COST_LINE_ORDER = ['), src.indexOf(']', src.indexOf('COST_LINE_ORDER = [')));
    const ids = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(0);
    const rows = r.model.fields.filter((f: Json) => f.line_id).map((f: Json) => f.line_id);
    expect(rows.slice().sort()).toEqual(ids.slice().sort());
  });

  it('code → inventory: every TrackedLot property documented as a parcels column, and the DERIVED one, is a tracked-lots row', () => {
    const src = read('mobile/src/lib/trackedLots.ts');
    const pairs = [...src.matchAll(/\/\*\*\s*parcels\.([a-z_0-9]+)\s*\*\/\s*\n\s*([A-Za-z]+):/g)].map((m) => ({ column: m[1]!, prop: m[2]! }));
    expect(pairs.length).toBeGreaterThan(0);
    for (const { column, prop } of pairs) {
      const found = r.model.fields.some((f: Json) => f.surface === 'S-072' && f.payload === `lots[].${prop}` && f.column === column);
      expect({ column, prop, found }).toEqual({ column, prop, found: true });
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
    expect(r.model.constants.length).toBeGreaterThan(0);
    for (const c of r.model.constants) {
      const ok = c.leaves > 0 && fs.existsSync(path.join(ROOT, String(c.ref).split('#')[0]!));
      expect({ ref: c.ref, leaves: c.leaves, ok }).toEqual({ ref: c.ref, leaves: c.leaves, ok: true });
    }
  });

  it('structural gates pass (RF-1 chain, RF-3 constants, RF-4 whitelist, RF-7 twins, RF-9 declared inputs)', () => {
    for (const id of ['RF-1', 'RF-3', 'RF-4', 'RF-7', 'RF-9']) {
      expect(r.model.gates.find((g: Json) => g.id === id)).toMatchObject({ id, state: 'PASS' });
    }
  });

  it('the known open findings stay visible (report-only gates fail for the reasons the hand edition found)', () => {
    expect(r.model.gates.find((g: Json) => g.id === 'RF-5').failing).toContain('parcel.areas.realized_fsi_p90');
    expect(r.model.gates.find((g: Json) => g.id === 'RF-2').failing).toContain('S-072 lots[].newNearbyCoaRuling');
    expect(r.model.gates.find((g: Json) => g.id === 'RF-10').state).toBe('FAIL');
  });
});
