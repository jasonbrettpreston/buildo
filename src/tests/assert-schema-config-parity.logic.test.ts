// 🔗 SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.2a P4 (Pilot 1 P4 remediation)
// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §4.1 (business-logic value → DB)
//
// LITERAL-PARITY LOCK for assert_schema's three externalized knobs.
//
// Externalizing a constant is only safe if the seed default IS the constant. These
// three crossed from compute literals into logic_variables on 2026-08-25, and the
// step's `on_invalid: "default"` posture leans on that equality twice over: on a DB
// that has not re-run the mig-099 seed the loader falls back to the seed default, and
// an out-of-bounds operator edit degrades to it. If the seed default ever drifts from
// the value the step ran on for its entire history, both of those "identical
// behaviour" claims quietly become false — and no other test in the estate compares
// them, because after the conversion the old literals exist in exactly one place:
// Spec 122 §1.2a P4's own record of what Pilot 1 found.
//
// FOUR SURFACES, pinned against each other:
//   1. Spec 122 §1.2a P4's named literals   (the historical record)
//   2. scripts/seeds/logic_variables.json    (fresh DB + the on_invalid:"default" floor)
//   3. the descriptor's config bounds        (must BRACKET the default, or the step
//                                             refuses itself the first time it runs)
//   4. the compute                           (must hold NO copy of any of them)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SPEC = 'docs/specs/01-pipeline/122_pipeline_step_optimization.md';
const COMPUTE = 'scripts/lib/compute/assert-schema.js';
const DESCRIPTOR = 'scripts/quality/assert-schema.descriptor.json';

/** var name → the literal it replaced, and the token Spec 122 §1.2a P4 records it as. */
const PARITY = [
  { name: 'assert_schema_type_sample_rows', literal: 20, specToken: 'limit=20' },
  { name: 'assert_schema_csv_header_bytes', literal: 2048, specToken: 'bytes=0-2048' },
  { name: 'assert_schema_geojson_probe_bytes', literal: 8192, specToken: 'bytes=0-8192' },
] as const;

interface Seed { default: number; min?: number; max?: number; description?: string }
interface ConfigVar { name: string; min: number | 'none'; max: number | 'none'; on_invalid: string }

const seed = JSON.parse(read('scripts/seeds/logic_variables.json')) as Record<string, Seed>;
const descriptor = JSON.parse(read(DESCRIPTOR)) as {
  config: 'none' | { logic_variables: ConfigVar[]; validation: string; hoisted_above_gate: boolean };
  checks: Array<{ id: string; expect: Record<string, unknown> }>;
};

describe('assert_schema §1.2a P4 — seed default ≡ the pre-externalization literal', () => {
  it('Spec 122 §1.2a P4 still NAMES all three literals (the historical record has not been edited away)', () => {
    // If this fails, the anchor this lock reads from is gone and every assertion
    // below would be comparing the seed against itself.
    const spec = read(SPEC);
    const section = spec.slice(spec.indexOf('### 1.2a'), spec.indexOf('### 1.3'));
    expect(section.length, '§1.2a was not found in Spec 122').toBeGreaterThan(500);
    for (const p of PARITY) {
      expect(section, `§1.2a P4 no longer records the literal \`${p.specToken}\``).toContain(p.specToken);
    }
  });

  for (const p of PARITY) {
    it(`${p.name}: seed default === ${p.literal}`, () => {
      expect(seed[p.name], `${p.name} is not in the seed JSON`).toBeDefined();
      expect(seed[p.name]!.default).toBe(p.literal);
    });

    it(`${p.name}: the declared bounds BRACKET the default (a step that refuses its own default is dead on arrival)`, () => {
      expect(descriptor.config).not.toBe('none');
      const declared = (descriptor.config as { logic_variables: ConfigVar[] }).logic_variables
        .find((v) => v.name === p.name);
      expect(declared, `${p.name} is not declared in the descriptor's config`).toBeDefined();
      const min = declared!.min === 'none' ? -Infinity : declared!.min;
      const max = declared!.max === 'none' ? Infinity : declared!.max;
      expect(p.literal).toBeGreaterThanOrEqual(min);
      expect(p.literal).toBeLessThanOrEqual(max);
      // The seed's own min/max must agree with the descriptor's, or the admin UI's
      // DeltaGuard and the runtime resolver enforce two different ranges.
      expect(seed[p.name]!.min).toBe(min);
      expect(seed[p.name]!.max).toBe(max);
    });

    it(`${p.name}: the seed description names its consumer (the reverse-direction conformance tag)`, () => {
      expect(seed[p.name]!.description ?? '').toMatch(/CONSUMED by[\s\S]*assert_schema/);
    });
  }

  it('the compute holds NO surviving copy of any literal — one value, one home', () => {
    const src = read(COMPUTE)
      // Comments legitimately NAME the retired literals when explaining the seam.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/limit=20\b/);
    expect(src).not.toMatch(/bytes=0-2048/);
    expect(src).not.toMatch(/bytes=0-8192/);
    // ...and each one IS read through the seam.
    for (const p of PARITY) expect(src, `${p.name} is declared but never read`).toContain(`ctx.config.${p.name}`);
    // The one surviving numeric in a URL is CKAN's metadata-only sentinel.
    expect(src, 'limit=0 is structural (fetch NO rows, return the field list), not a knob').toContain('limit=0');
  });

  it('the descriptor references the var rather than carrying a SECOND copy of 20', () => {
    const cost = descriptor.checks.find((c) => c.id === 'permit_cost_type_sample');
    expect(cost, 'permit_cost_type_sample is not declared').toBeDefined();
    expect(
      cost!.expect.sample,
      'expect.sample must POINT at the logic variable — a literal here is a second value to keep in sync',
    ).toEqual({ logic_variable: 'assert_schema_type_sample_rows' });
  });

  it('the posture is the one the deviation argues for: on_invalid "default", strict, hoisted', () => {
    const cfg = descriptor.config as { logic_variables: ConfigVar[]; validation: string; hoisted_above_gate: boolean };
    expect(cfg.logic_variables.map((v) => v.on_invalid)).toEqual(['default', 'default', 'default']);
    expect(cfg.validation).toBe('strict');
    expect(cfg.hoisted_above_gate, 'a SKIP-eligible step must validate config ABOVE the gate').toBe(true);
  });
});
