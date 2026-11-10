// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-03 (P2 proven, not reviewed; lock: planted bad descriptor: exit 1,
//            clean: exit 0), FE-13 (the gate: node scripts/surfaces/surface-validate.mjs --check), FE-31 (descriptor valid with no UNRESEARCHED);
//            docs/specs/02-web-admin/127_surface_conversion_procedure.md 3.2a (S-gen and S-golden, non-REPORT counterpart).
//
// MF-42 · McFrontend queue · lane G. The FE-03 lock. The REAL gate runs as a child process on a temp tree that holds the gate, its three modules, the
// REPORT inputs (so the five REPORT arms stay green), exit-0 stub generators, and the four converted fixtures built in the test (screen-fixture.ts:
// FORM, LIST, SEARCH, STATIC copied from live descriptors). Per archetype: the clean tree exits 0; one planted bad descriptor exits 1 with its exact
// SV-DESC line and nothing else. No DB, no network.
import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FP_FILES } from '../../../scripts/surfaces/report-checks.mjs';
import { ARCHETYPES, buildFixture, editDescriptor, REPO, SCHEMA, type Arch, type Fixture } from './screen-fixture';

const GATE = 'scripts/surfaces/surface-validate.mjs';
const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

const gateTree = (): Fixture => {
  const fx = buildFixture('mf42-fe03-');
  roots.push(fx.root);
  for (const f of ['surface-validate.mjs', 'report-checks.mjs', 'screen-checks.mjs']) fs.cpSync(path.join(REPO, 'scripts/surfaces', f), path.join(fx.root, 'scripts/surfaces', f));
  for (const f of FP_FILES as string[]) fs.cpSync(path.join(REPO, f), path.join(fx.root, f));
  fs.cpSync(path.join(REPO, 'src/tests/fixtures/surfaces/report'), path.join(fx.root, 'src/tests/fixtures/surfaces/report'), { recursive: true });
  for (const g of [`${SCHEMA}/seed-report-v2.mjs`, 'scripts/analysis/report-schema.mjs', 'scripts/surfaces/emit-mobile-theme.mjs', 'scripts/surfaces/emit-mobile-surfaces.mjs']) { fs.mkdirSync(path.dirname(path.join(fx.root, g)), { recursive: true }); fs.writeFileSync(path.join(fx.root, g), 'process.exit(0);\n'); }
  return fx;
};
const run = (fx: Fixture): { code: number | null; out: string; lines: string[] } => {
  const r = spawnSync(process.execPath, [path.join(fx.root, GATE), '--check'], { cwd: fx.root, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, lines: r.stderr.split('\n').filter(Boolean) };
};

// The planted bad descriptor per archetype (plan.min section 3, FE-03 row) and the exact finding line it must produce.
const PLANTS: Record<Arch, [string, (d: Record<string, any>) => void, string]> = { // eslint-disable-line @typescript-eslint/no-explicit-any -- descriptor JSON
  SEARCH: ['config.debounce_ms deleted', (d) => { delete d.config.debounce_ms; }, "SV-DESC mobile_parcel_search: /config must have required property 'debounce_ms'"],
  FORM: ['an invalid widget', (d) => { d.render.form.fields[1].widget = 'rich_editor'; }, 'SV-DESC admin_placements: /render/form/fields/1/widget must be equal to constant'],
  LIST: ['columns dropped', (d) => { delete d.render.list.columns; }, "SV-DESC admin_surface_registry: /render/list must have required property 'columns'"],
  STATIC: ['an UNRESEARCHED left', (d) => { d.programme.phase = 'UNRESEARCHED'; }, 'SV-DESC web_landing: 1 UNRESEARCHED left'],
};

describe('FE-03: the clean fixture tree exits 0 through every arm', () => {
  it('exit 0, nothing on stderr, and the generic arms examined the four converted fixtures', () => {
    const r = run(gateTree());
    expect(r.lines).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('· S-desc ok (examined 4 in scope: converted 4, pending 0, parked 0, report 0) · S-screen ok (4 surfaces, ');
  });
});

describe.each(ARCHETYPES.map((a) => [a]))('FE-03 %s: clean exits 0, a planted bad descriptor exits 1', (arch) => {
  const [what, plant, line] = PLANTS[arch as Arch];
  it('the clean copy exits 0', () => {
    expect(run(gateTree()).code).toBe(0);
  });
  it(`${what}: exit 1, the SV-DESC line, no other arm fires`, () => {
    const fx = gateTree();
    editDescriptor(fx, arch as Arch, plant);
    const r = run(fx);
    expect(r.code).toBe(1);
    expect(r.lines.some((l) => l.startsWith(line)), r.lines.join('\n')).toBe(true);
    expect(r.lines.every((l) => l.startsWith('SV-DESC '))).toBe(true);
    expect(r.out).toBe('');
  });
});
