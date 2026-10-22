// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §4 (status sets and layer2-map.json), §7 I2, I3, I5;
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-232 (one declared total map, locked both ways);
//            docs/specs/01-pipeline/124_step_standard_policy.md §5 R-IO, R-IP, R-IQ (operator chat batch J,
//            2026-10-21-chat-batch-j#CHAT-36.OQ4 / OQ5 / OQ6, approved on the simplicity condition)
//
// The Layer 2 status map, scripts/seeds/bylaw/layer2-map.json: one file of closed tables (R-IO). Locked both ways
// against what the evaluator exports and returns: its NOT_EVALUATED_CODES, its result status literals and its evidence
// kinds, and against the Layer 3 vocabulary (vocab.json layer3). The static R-EMIT extraction of every returned reason
// string is emit.logic.test.ts (Spec 134:121); this lock reads the exported codes and the status / kind literals.
//
// RED FIRST: committed as it.fails at c038d605, before the map existed (gate K artifact
// docs/reports/red-evidence/resolve_bylaws/rulings-j-red.json); flipped to it with the map.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON / .mjs surface
const ROOT = path.resolve(__dirname, '../../../../');
const MAP_REL = 'scripts/seeds/bylaw/layer2-map.json';
const EV_REL = 'scripts/analysis/bylaw/evaluate.mjs';
const map = (): Json => {
  expect(fs.existsSync(path.join(ROOT, MAP_REL)), `${MAP_REL} should exist`).toBe(true);
  return JSON.parse(fs.readFileSync(path.join(ROOT, MAP_REL), 'utf8')) as Json;
};
const E = (await import(pathToFileURL(path.join(ROOT, EV_REL)).href)) as Json;
const EV_SRC = fs.readFileSync(path.join(ROOT, EV_REL), 'utf8');
const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8')) as Json;
const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();
/** `status: '<x>'` literals in the evaluator, minus the two exception authoring-state words of makeContext's `authored`. */
const AUTHORING_STATE = new Set(['authored', 'partial']);
const evaluatorStatusLiterals = (): string[] => sorted([...EV_SRC.matchAll(/status: '([a-z_]+)'/g)].map((m) => m[1]!).filter((s) => !AUTHORING_STATE.has(s)));

describe('R-IO: the stored Layer 2 status set and the evaluator status map', () => {
  it('the stored statuses are applies, not_applicable and not_evaluated; undecided joins when M-60 emits it (Spec 134:58)', () => {
    expect(map().status).toEqual(['applies', 'not_applicable', 'not_evaluated']);
    expect(EV_SRC).not.toMatch(/status: 'undecided'/);
  });

  it('every effective() status maps to a stored status, conflict to not_evaluated with reason conflict (Spec 134:56)', () => {
    const m = map();
    expect(m.evaluator_status).toEqual({
      value: { status: 'applies' },
      not_applicable: { status: 'not_applicable', strip_prefix: 'not_applicable:' },
      not_evaluated: { status: 'not_evaluated' },
      conflict: { status: 'not_evaluated', reason: 'conflict' },
    });
  });

  it('both ways: every status literal the evaluator returns is mapped (results or permissions), and every mapped key is one it returns', () => {
    const m = map();
    const mapped = sorted([...Object.keys(m.evaluator_status), ...Object.keys(m.permission_image)]);
    for (const s of evaluatorStatusLiterals()) expect(mapped, `evaluator status ${s}`).toContain(s);
    for (const k of mapped) expect(EV_SRC, `mapped key ${k}`).toContain(`'${k}'`);
  });

  it('permitted() results keep their own words; prohibited images to not_applicable at Layer 2 and not_permitted at the scenario level', () => {
    const m = map();
    expect(m.permission_image).toEqual({
      permitted: { scenario: 'permitted' },
      prohibited: { layer2: 'not_applicable', scenario: 'not_permitted' },
      not_evaluated: { layer2: 'not_evaluated', scenario: 'not_evaluated' },
    });
    for (const v of Object.values(m.permission_image) as Json[]) {
      expect(VOCAB.layer3.scenario_status).toContain(v.scenario);
      if (v.layer2) expect(m.status).toContain(v.layer2);
    }
  });
});

describe('R-IO: reason codes, value kinds and the Layer 3 image are closed and total', () => {
  it('reason_code is exactly NOT_EVALUATED_CODES, conflict and the lot gates, both ways', () => {
    const m = map();
    expect(m.reason_code).toEqual(sorted([...E.NOT_EVALUATED_CODES, 'conflict', ...m.lot_gate]));
  });

  it('value_kind is number, unlimited, unregulated (Spec 134 §3)', () => {
    expect(map().value_kind).toEqual(['number', 'unlimited', 'unregulated']);
  });

  it('every stored status has a Layer 3 field-status image; applies is imaged by value_kind; every image is a Spec 68 §11.1 field status', () => {
    const m = map();
    expect(sorted(Object.keys(m.layer3_image))).toEqual(sorted(m.status));
    expect(sorted(Object.keys(m.layer3_image.applies))).toEqual(sorted(m.value_kind));
    expect(m.layer3_image.applies).toEqual({ number: 'computed', unlimited: 'unlimited', unregulated: 'unregulated' });
    const images = [...Object.values(m.layer3_image.applies), m.layer3_image.not_applicable, m.layer3_image.not_evaluated] as string[];
    for (const i of images) expect(VOCAB.layer3.field_status, i).toContain(i);
  });
});

describe('R-IP: evidence_kind is the evaluator\'s own kinds plus provincial', () => {
  it('the closed set is clause, absence, provincial, disapply, label_absent', () => {
    expect(map().evidence_kind).toEqual(['clause', 'absence', 'provincial', 'disapply', 'label_absent']);
  });

  it('both ways: every evidence kind the evaluator writes is in the set, and every member but provincial (derived by Layer 2) is written', () => {
    const written = sorted([...EV_SRC.matchAll(/evidence: \{ kind: '([a-z_]+)'/g)].map((x) => x[1]!));
    const m = map();
    expect(written).toEqual(sorted(m.evidence_kind.filter((k: string) => k !== 'provincial')));
  });
});

describe('R-IQ: the lot gates in their declared order; the sentinel', () => {
  it('lot_gate is the six Spec 134 gates in the declared order', () => {
    expect(map().lot_gate).toEqual(['no_569_2013_zone', 'ambiguous_zone', 'label_unparsed', 'label_exception_mismatch', 'exception_not_authored', 'lot_metric_missing']);
  });

  it('the two gates the evaluator also emits are its own closed codes', () => {
    for (const g of ['no_569_2013_zone', 'exception_not_authored']) expect(E.NOT_EVALUATED_CODES).toContain(g);
  });

  it('the exception-number sentinel is data (-1, Spec 134 I5)', () => {
    expect(map().exception_number_sentinel).toBe(-1);
  });
});
