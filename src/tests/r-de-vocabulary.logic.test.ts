// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-DE (cross-step vocabulary, McDonald's Airtight V3)
//
// R-DE (operator y 2026-10-17): the majority form, locked in the existing gates — (i) execution.batch and
// (ii) identity.spec / (v) logic-variable names / (vi) guards.empty_source in closed-bounds (gate A); (ii) pin
// spec_version in consumer-registry (gate D); (iii) terminal ids in terminals-records-meta (#49); (iv) emits shape
// in emits-equiv (gate C); (vii) notes keys in notes-cap (#45). Fixture-level here; the live fleet halves are the
// gates' own live tests, RED until the descriptor/notes renames land with N6.
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

type Violation = { step: string; item: string; detail: string };
const load = async <T,>(rel: string): Promise<T> =>
  (await import(pathToFileURL(path.join(process.cwd(), rel)).href)) as unknown as T;

let CB: { vocabularyViolations: (d: unknown, ctx: unknown) => Violation[] };
let TR: { terminalVocabularyViolations: (d: unknown) => Violation[] };
let EM: { emitShapeViolations: (d: unknown) => Violation[] };
let NC: { notesShapeViolations: (n: unknown) => string[]; countProseEntries: (n: unknown) => number };
let CR: { pinSpecVersionViolations: (ds: unknown[]) => Violation[] };
let OS: { identitySpecIsOwner: (spec: unknown, owners: string[]) => boolean };

describe('R-DE cross-step vocabulary locks (McDonald\'s Airtight V3)', () => {
  beforeAll(async () => {
    CB = await load('scripts/analysis/gates/closed-bounds.mjs');
    TR = await load('scripts/analysis/gates/terminals-records-meta.mjs');
    EM = await load('scripts/analysis/gates/emits-equiv.mjs');
    NC = await load('scripts/analysis/gates/notes-cap.mjs');
    CR = await load('scripts/analysis/gates/consumer-registry.mjs');
    OS = await load('scripts/analysis/gates/owner-spec-diff.mjs');
  }, 60000);

  const desc = (over: Record<string, unknown> = {}) => ({
    identity: { name: 'fx', archetype: 'LINK', spec: '43' },
    execution: { batch: 1000, shape: 'link' },
    config: { logic_variables: [{ name: 'fx_floor' }] },
    guards: { empty_source: 'r' },
    inputs: { reads: { tables: [{ table: 'r' }] } },
    outputs: { writes: [{ table: 'w' }] },
    ...over,
  });
  const ctx = { seeds: { fx_batch: { default: 500 } }, censusRows: [{ file: 'scripts/fx.js', owner_specs: ['docs/specs/01-pipeline/43_chain_sources.md'] }], file: 'scripts/fx.js' };
  const items = (over: Record<string, unknown>) => CB.vocabularyViolations(desc(over), ctx).map((v) => v.item);

  it('a conforming descriptor has no findings', () => {
    expect(CB.vocabularyViolations(desc(), ctx)).toEqual([]);
  });

  it('(i) execution.batch is the executed size', () => {
    expect(items({ execution: { batch: 'none', shape: 'link' } })).toContain('vocab.execution.batch');
    expect(items({ identity: { name: 'fx', archetype: 'MATERIALIZER', spec: '43' }, execution: { batch: 'none' } })).toContain('vocab.execution.batch_size_from_config');
    expect(items({ execution: { batch: 'none', batch_size_from_config: 'fx_batch' } })).toContain('vocab.execution.batch');
    expect(items({ execution: { batch: 500, batch_size_from_config: 'fx_batch' } })).toEqual([]);
    expect(items({ identity: { name: 'fx', archetype: 'INGESTOR', spec: '43' }, execution: { batch: 'none' }, guards: { empty_source: 'w' } })).toContain('vocab.execution.batch');
  });

  it('(ii) identity.spec is a census owner spec; a spec_version pin equals its producer', () => {
    expect(OS.identitySpecIsOwner('58', ['docs/specs/01-pipeline/58_source_zoning_bylaw.md'])).toBe(true);
    expect(OS.identitySpecIsOwner('5', ['docs/specs/01-pipeline/58_source_zoning_bylaw.md'])).toBe(false);
    expect(items({ identity: { name: 'fx', archetype: 'LINK', spec: '60' } })).toContain('vocab.identity.spec');
    const pinFleet = (equals: string) => [
      { identity: { name: 'r' }, staleness: { pins: [{ step: 'p', stamp: ['records_meta', 'p_load', 'spec_version'].join('.'), equals }] } },
      { identity: { name: 'p', spec_version: '1.2' } },
    ];
    expect(CR.pinSpecVersionViolations(pinFleet('1.2'))).toEqual([]);
    expect(CR.pinSpecVersionViolations(pinFleet('1.1'))).toHaveLength(1);
  });

  it('(iii) terminal ids follow their kind', () => {
    const t = (id: string, kind: string) => TR.terminalVocabularyViolations({ identity: { name: 'fx' }, terminals: [{ id, kind }] }).length;
    expect(t('failed_rows_floor', 'fail_check')).toBe(0);
    expect(t('failed_precondition', 'fail_error')).toBe(1);
    expect(t('skip_gated_no_activity', 'skip_gated')).toBe(1);
    expect(t('skipped_no_activity', 'skip_gated')).toBe(0);
    expect(t('coverage_gate_failed', 'fail_check')).toBe(0);
  });

  it('(iv) emits: one <x>_load object per INGESTOR, none elsewhere beyond config/audit_table', () => {
    const e = (archetype: string, emits: unknown[]) => EM.emitShapeViolations({ identity: { name: 'fx', archetype }, emits }).length;
    expect(e('INGESTOR', [{ key: 'x_load', type: 'object' }])).toBe(0);
    expect(e('INGESTOR', [{ key: 'rows', type: 'int' }])).toBe(1);
    expect(e('LINK', [{ key: 'audit_table', type: 'object' }, { key: 'rows', type: 'int' }])).toBe(0);
    expect(e('LINK', [{ key: 'detail', type: 'object' }])).toBe(1);
  });

  // rule-map: W4A-R1 (partial) — <slug>_<name> end-state naming; migration with values carried not asserted (verify-12 N1, operator y 2026-10-20 consolidation 1-4)
  it('(v) logic variables are <slug>_<name> or sources_*', () => {
    expect(items({ config: { logic_variables: [{ name: 'sources_parcels_floor' }] } })).toEqual([]);
    expect(items({ config: { logic_variables: [{ name: 'floor_pct' }] } })).toContain('vocab.config.logic_variables.floor_pct');
  });

  it('(v) shared arm (W4A-R3 + Q-C3, operator y 2026-10-18): a name read by two or more steps keeps its name only on the closed SHARED_LOGIC_VARIABLES list, and only for a listed consumer', () => {
    const shared = (CB as unknown as { SHARED_LOGIC_VARIABLES: Record<string, { consumers: string[]; owner: string }> }).SHARED_LOGIC_VARIABLES;
    expect(shared, 'the closed shared list is exported').toBeDefined();
    for (const [name, entry] of Object.entries(shared)) {
      expect(entry.consumers.length, `${name}: a shared name has at least two measured consumers`).toBeGreaterThanOrEqual(2);
      expect(typeof entry.owner, `${name}: every shared name cites its owner`).toBe('string');
    }
    const named = (step: string, name: string) => CB.vocabularyViolations(desc({ identity: { name: step, archetype: 'LINK', spec: '43' }, config: { logic_variables: [{ name }] } }), ctx).map((v) => v.item);
    expect(named('assert_coa_freshness', 'pipeline_timezone')).not.toContain('vocab.config.logic_variables.pipeline_timezone');
    expect(named('classify_coa_trades', 'vocab_coverage_pass_pct')).not.toContain('vocab.config.logic_variables.vocab_coverage_pass_pct');
    expect(named('fx', 'vocab_coverage_pass_pct'), 'a step not listed as a consumer is RED').toContain('vocab.config.logic_variables.vocab_coverage_pass_pct');
  });

  it('(vi) guards.empty_source names an own write table (INGESTOR) or a read table (others)', () => {
    expect(items({ guards: { empty_source: 'w' } })).toContain('vocab.guards.empty_source');
    expect(items({ guards: { empty_source: ['r', 'none'] } })).toEqual([]);
  });

  it('(vii) notes: entries use what, constants count toward the cap, unknown top-level keys are RED', () => {
    expect(NC.notesShapeViolations({ decisions: [{ note: 'x' }] })).toHaveLength(1);
    expect(NC.notesShapeViolations({ decisions: [{ what: 'x' }], fences: [], constants: [] })).toEqual([]);
    expect(NC.notesShapeViolations({ overflow: [] })).toHaveLength(1);
    expect(NC.countProseEntries({ decisions: [{ what: 'a' }], constants: [{ what: 'b' }], fences: [{ what: 'c' }] })).toBe(2);
  });
});
