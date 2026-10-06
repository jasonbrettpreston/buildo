// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (#44 witness — registry-truth plan fold 9 C7-1 checks[] SQL reads home, C7-2 per-mode write_inventory; REPORT-ONLY until FLEET-2)
//
// WF2 gate — `scripts/analysis/gates/schema-homes.mjs`.
//
// The two fold-9 schema homes land in `scripts/steps/_schema/step.schema.json`
// in the SAME change as this file: (C7-1) each `checks[]` item may carry
// `reads: [{ table, columns? }]` — the SQL reads that check's measurement
// executes, declared OUTSIDE `inputs.reads` so it never becomes an upstream
// derivation edge; (C7-2) `outputs.write_inventory` may carry
// `by_mode: { full?: {statements, why?}, incremental?: {statements, why?} }`
// beside the mode-agnostic `statements`.
//
// POSTURE: REPORT-ONLY until the FLEET-2 landing commit populates the homes —
// the gate is `pass: true` BY CONSTRUCTION (T1–T6 lock that), reporting
// adoption and naming each traced check read that sits outside
// `inputs.reads ∪ checks[].reads` as an `R:check-reads:<slug>:<table>.<column>`
// row. Nothing blocks; there is no exception list.
//
// T7 is the SCHEMA-ACCEPTANCE suite and is EXPECTED RED until the orchestrator
// adds the two homes: 3(a)/3(b) fail today because both new keys are rejected
// by an `additionalProperties: false` definition, and 3(c) is asserted in the
// RED direction already (it must throw today AND after the homes land).
// 3(d) is the green control and must stay green throughout.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as schemaHomes from '../../scripts/analysis/gates/schema-homes.mjs';

const REPO_ROOT = process.cwd();

// ONE compiler, the same one pipeline.step() validates with (step-conformance.infra.test.ts:50).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};

const LINK_WSIB_DESCRIPTOR_REL = 'scripts/link-wsib.descriptor.json';

/** A descriptor as this suite manipulates it — the schema is the authority, not this alias. */
type Mutable = Record<string, unknown>;

/** A deep copy (JSON round-trip) — `validateDescriptor` must never mutate the on-disk fixture. */
type WsibDescriptor = Mutable & { checks: Mutable[]; outputs: { write_inventory: Mutable } };
const freshLinkWsib = (): WsibDescriptor => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, LINK_WSIB_DESCRIPTOR_REL), 'utf8'));

const fixture = (over: Mutable): Mutable => ({ identity: { name: 'fixture_step' }, ...over });

describe('schema-homes — fold 9 C7-1 checks[].reads and C7-2 write_inventory.by_mode (REPORT-ONLY)', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs, and it throws on failure.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw', () => {
    expect(() => schemaHomes.selfTest()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // T2 — RED direction: an uncovered traced check read IS reported, as exactly
  // ONE `R:check-reads:` row, and still nothing blocks.
  // -------------------------------------------------------------------------
  it('T2a: RED direction — an uncovered traced read yields exactly one R:check-reads row', () => {
    const out = schemaHomes.checkReadsCoverage(fixture({ checks: [{ id: 'c1' }] }), [
      { table: 'wsib_registry', column: 'linked_entity_id' },
    ]);
    expect(out.reportOnly).toBe(true);
    expect(out.pass).toBe(true);
    expect(out.uncovered).toEqual(['wsib_registry.linked_entity_id']);
    expect(out.rows).toEqual(['R:check-reads:fixture_step:wsib_registry.linked_entity_id']);
    expect(out.detail).toContain('1 traced check read(s) outside inputs.reads ∪ checks[].reads');
  });

  it('T2b: RED direction — the row slug is the descriptor identity, and rows sort/dedupe', () => {
    const out = schemaHomes.checkReadsCoverage(fixture({ checks: [{ id: 'c1' }] }), [
      { table: 'wsib_registry', column: 'matched_at' },
      { table: 'entities', column: 'is_wsib_registered' },
      { table: 'wsib_registry', column: 'matched_at' },
    ]);
    expect(out.rows).toEqual([
      'R:check-reads:fixture_step:entities.is_wsib_registered',
      'R:check-reads:fixture_step:wsib_registry.matched_at',
    ]);
    expect(out.uncovered).toEqual(['entities.is_wsib_registered', 'wsib_registry.matched_at']);
  });

  it('T2c: declaredCheckReads — table.* for a column-less entry, [] for checks:"none"/absent', () => {
    expect(schemaHomes.declaredCheckReads({ checks: [{ reads: [{ table: 'wsib_registry' }] }] })).toEqual(['wsib_registry.*']);
    expect(
      schemaHomes.declaredCheckReads({ checks: [{ reads: [{ table: 'entities', columns: ['id', 'permit_count'] }] }] }),
    ).toEqual(['entities.id', 'entities.permit_count']);
    expect(schemaHomes.declaredCheckReads({ checks: 'none' })).toEqual([]);
    expect(schemaHomes.declaredCheckReads({})).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // T3 — the three GREEN controls: a covered read reports NOTHING.
  // -------------------------------------------------------------------------
  it('T3a: GREEN — covered by inputs.reads.tables WITH the column listed', () => {
    const out = schemaHomes.checkReadsCoverage(
      fixture({ inputs: { reads: { tables: [{ table: 'wsib_registry', columns: ['linked_entity_id'] }] } } }),
      [{ table: 'wsib_registry', column: 'linked_entity_id' }],
    );
    expect(out.uncovered).toEqual([]);
    expect(out.rows).toEqual([]);
    expect(out.pass).toBe(true);
  });

  it('T3b: GREEN — covered by a WHOLE-TABLE inputs.reads.tables entry (no columns)', () => {
    const out = schemaHomes.checkReadsCoverage(
      fixture({ inputs: { reads: { tables: [{ table: 'wsib_registry' }] } } }),
      [{ table: 'wsib_registry', column: 'match_confidence' }],
    );
    expect(out.uncovered).toEqual([]);
    expect(out.rows).toEqual([]);
  });

  it('T3c: GREEN — covered by checks[].reads (the C7-1 home itself)', () => {
    const out = schemaHomes.checkReadsCoverage(
      fixture({ checks: [{ id: 'c1', reads: [{ table: 'wsib_registry', columns: ['linked_entity_id'] }] }] }),
      [{ table: 'wsib_registry', column: 'linked_entity_id' }],
    );
    expect(out.uncovered).toEqual([]);
    expect(out.rows).toEqual([]);
  });

  it('T3d: a column NOT listed in inputs.reads.tables is still RED (coverage is per-column)', () => {
    const out = schemaHomes.checkReadsCoverage(
      fixture({ inputs: { reads: { tables: [{ table: 'wsib_registry', columns: ['id'] }] } } }),
      [{ table: 'wsib_registry', column: 'linked_entity_id' }],
    );
    expect(out.uncovered).toEqual(['wsib_registry.linked_entity_id']);
  });

  // -------------------------------------------------------------------------
  // T4 — C7-2: by_mode wins, then the mode-agnostic statements, then null.
  // -------------------------------------------------------------------------
  it('T4: writeInventoryForMode — by_mode, then statements, then null', () => {
    const both = {
      outputs: { write_inventory: { statements: 10, by_mode: { full: { statements: 13 }, incremental: { statements: 10 } } } },
    };
    expect(schemaHomes.writeInventoryForMode(both, 'full')).toBe(13);
    expect(schemaHomes.writeInventoryForMode(both, 'incremental')).toBe(10);
    expect(schemaHomes.writeInventoryForMode({ outputs: { write_inventory: { statements: 7 } } }, 'full')).toBe(7);
    expect(schemaHomes.writeInventoryForMode({ outputs: { write_inventory: { by_mode: { full: { statements: 3 } } } } }, 'incremental')).toBeNull();
    expect(schemaHomes.writeInventoryForMode({}, 'full')).toBeNull();
    expect(schemaHomes.WRITE_INVENTORY_MODES).toEqual(['full', 'incremental']);
  });

  // -------------------------------------------------------------------------
  // T5 — homesReport is pure, counts declarers, and is report-only.
  // -------------------------------------------------------------------------
  it('T5: homesReport — declarer lists, report-only pass', () => {
    const out = schemaHomes.homesReport([
      {
        identity: { name: 'a' },
        checks: [{ reads: [{ table: 'wsib_registry' }] }],
        outputs: { write_inventory: { statements: 1, by_mode: { full: { statements: 2 } } } },
      },
      { identity: { name: 'b' }, checks: [{ id: 'c' }], outputs: { write_inventory: { statements: 3 } } },
    ]);
    expect(out.reportOnly).toBe(true);
    expect(out.pass).toBe(true);
    expect(out.checkReadsDeclarers).toEqual(['a']);
    expect(out.byModeDeclarers).toEqual(['a']);
    expect(out.detail).toContain('checks[].reads declared by 1/2 step(s); write_inventory.by_mode declared by 1/2');
  });

  // -------------------------------------------------------------------------
  // T6 — the LIVE fleet. Report-only, so this is green today whatever the
  // homes' adoption is; the walk itself must not be vacuous.
  // -------------------------------------------------------------------------
  it('T6: live — homesReport over the converted fleet is report-only pass, on > 20 descriptors', () => {
    const descriptors = schemaHomes.loadConvertedFleetDescriptors(REPO_ROOT);
    expect(descriptors.length).toBeGreaterThan(20);
    const out = schemaHomes.homesReport(descriptors);
    expect(out.reportOnly).toBe(true);
    expect(out.pass, out.detail).toBe(true);
    expect(out.detail).toContain('REPORT-ONLY until FLEET-2');
  });

  // -------------------------------------------------------------------------
  // T7 — SCHEMA ACCEPTANCE. ⚠️ 3(a)/3(b) are EXPECTED RED until the
  // orchestrator adds the two homes to step.schema.json; 3(c) is RED-DIRECTION
  // (must throw today AND after); 3(d) is the green control.
  // -------------------------------------------------------------------------
  it('T7a: checks[0].reads is ACCEPTED (C7-1 home)', () => {
    const d = freshLinkWsib();
    const first = d.checks[0];
    expect(first, 'link_wsib declares at least one check').toBeDefined();
    if (first) first.reads = [{ table: 'wsib_registry', columns: ['linked_entity_id'] }];
    expect(() => validateDescriptor(d)).not.toThrow();
  });

  it('T7b: outputs.write_inventory.by_mode is ACCEPTED (C7-2 home)', () => {
    const d = freshLinkWsib();
    d.outputs.write_inventory.by_mode = { full: { statements: 6 }, incremental: { statements: 2 } };
    expect(() => validateDescriptor(d)).not.toThrow();
  });

  it('T7c: write_inventory.by_mode keys are CLOSED — tri_state THROWS', () => {
    const d = freshLinkWsib();
    d.outputs.write_inventory.by_mode = { tri_state: { statements: 1 } };
    expect(() => validateDescriptor(d)).toThrow();
  });

  it('T7d: GREEN control — the unmodified link-wsib descriptor validates', () => {
    expect(() => validateDescriptor(freshLinkWsib())).not.toThrow();
  });
});
