// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §12 (sequencing), §10, §11
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (converted from day one)
//
// Spec 129 §12 step 5 — the pre-registered precision gate. C-13/C-14 only assert the two sample files are
// COMMITTED, so a failing sample would flip them green; this suite enforces "precision ≥ 0.95 (Layer 2) /
// ≥ 0.90 (all) / link ≥ 0.95" against the samples themselves. Precision is ALWAYS recomputed from
// `items[].verdict` (correct / n) — the sample's own `precision*` fields are treated as claims to be
// CROSS-CHECKED, never as the measurement (Spec 129 §10, §3: no notice text may travel in the samples).
// Every bound is read from scripts/seeds/logic_variables.json — never inlined here, never operator-editable
// to clear a FAIL.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const abs = (rel: string) => path.join(REPO_ROOT, rel);

const COMPUTE_REL = 'scripts/lib/compute/load-coa-notices.js';
const LOGIC_VARIABLES_REL = 'scripts/seeds/logic_variables.json';

/** A named missing artifact, never an import error. */
function artifact(rel: string, why = ''): string {
  expect(fs.existsSync(abs(rel)), `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''}`).toBe(true);
  return abs(rel);
}

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(artifact(rel), 'utf8')) as T;
}

interface SeatItem {
  variance_key?: string;
  application_number?: string;
  stratum?: string;
  target?: string;
  seat_verdicts: string[];
  verdict: string;
}

interface Sample {
  extractor_version: string;
  text_included: boolean;
  n: number;
  items: SeatItem[];
  precision_all?: number;
  precision_layer2?: number;
  precision?: number;
}

interface LogicVariable {
  default: number;
}

/** The commit gate: read `EXTRACTOR_VERSION` the way C-13 does, so the samples are version-keyed. */
function extractorVersion(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS compute
  return (require(abs(COMPUTE_REL)) as { EXTRACTOR_VERSION: string }).EXTRACTOR_VERSION;
}

function logicVariableDefault(name: string): number {
  const vars = readJson<Record<string, LogicVariable>>(LOGIC_VARIABLES_REL);
  const entry = vars[name];
  expect(entry, `MISSING LOGIC VARIABLE ${name}`).toBeDefined();
  expect(typeof entry!.default, `${name}.default must be a number`).toBe('number');
  return entry!.default;
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;

/** Spec 129 §10: a pair is `incorrect` if either blind seat says anything but `correct`. */
function derivedVerdict(item: SeatItem): string {
  return item.seat_verdicts.every((v) => v === 'correct') ? 'correct' : 'incorrect';
}

function recomputedPrecision(items: SeatItem[]): number {
  return round4(items.filter((i) => i.verdict === 'correct').length / items.length);
}

const TEXT_KEYS = ['text', 'reason', 'notice_header', 'item_text', 'span'];

describe('load_coa_notices — Spec 129 §12 step 5 precision gate (pre-registered bounds)', () => {
  const v = extractorVersion();
  const PAIR_REL = `scripts/seeds/coa-notices/precision-sample-${v}.json`;
  const LINK_REL = `scripts/seeds/coa-notices/link-precision-${v}.json`;

  it('both samples carry no notice text (Spec 129 §3)', () => {
    for (const rel of [PAIR_REL, LINK_REL]) {
      const s = readJson<Sample>(rel);
      expect(s.text_included, `${rel}: text_included must be false`).toBe(false);
      for (const item of s.items) {
        for (const key of TEXT_KEYS) {
          expect(Object.prototype.hasOwnProperty.call(item, key), `${rel}: item carries ${key}`).toBe(false);
        }
      }
    }
  });

  it('the pair sample is complete and self-consistent', () => {
    const p = readJson<Sample>(PAIR_REL);
    expect(p.items.length).toBe(60);
    expect(p.n).toBe(60);
    expect(p.items.length).toBe(p.n);

    for (const item of p.items) {
      expect(item.verdict, `${PAIR_REL}: ${item.variance_key} verdict disagrees with its seats`).toBe(derivedVerdict(item));
    }

    expect(recomputedPrecision(p.items)).toBe(p.precision_all);
    expect(recomputedPrecision(p.items.filter((i) => i.stratum === 'layer2'))).toBe(p.precision_layer2);
  });

  // Spec 129 §10 — Layer 2 is DERIVED: target-map.json ∩ Spec 68 §6 aspect ∈ {envelope, lot, landscaping}.
  // Never a hand-listed topic list (the spike's LAYER2 was dropped, §5 (h)); a drift in either seed file fails here.
  it('Layer 2 strata are derived from target-map ∩ Spec 68 aspect (envelope | lot | landscaping), never hand-listed', () => {
    const LAYER2_ASPECTS = new Set(['envelope', 'lot', 'landscaping']);
    const targetMap = readJson<{ entries: Array<{ target: string }> }>('scripts/lib/coa-notices/target-map.json');
    const vocab = readJson<{ dsl_target: Record<string, { aspect?: string }> }>('scripts/seeds/bylaw/vocab.json');

    const layer2 = new Set<string>();
    for (const entry of targetMap.entries) {
      const aspect = vocab.dsl_target[entry.target]?.aspect;
      if (aspect !== undefined && LAYER2_ASPECTS.has(aspect)) layer2.add(entry.target);
    }

    expect(layer2.size, 'Layer 2 target count (Spec 129 §10, 2026-10-10 ruling)').toBe(19);

    const p = readJson<Sample>(PAIR_REL);
    let nLayer2 = 0;
    for (const item of p.items) {
      const expected = item.target !== undefined && layer2.has(item.target) ? 'layer2' : 'other';
      expect(item.stratum, `${PAIR_REL}: ${item.variance_key} (target ${item.target}) stratum`).toBe(expected);
      if (item.stratum === 'layer2') nLayer2 += 1;
    }
    expect((p as Sample & { n_layer2?: number }).n_layer2).toBe(nLayer2);
  });

  it('pair precision meets the pre-registered bounds', () => {
    const p = readJson<Sample>(PAIR_REL);
    const layer2Min = logicVariableDefault('coa_notices_precision_layer2_min');
    const allMin = logicVariableDefault('coa_notices_precision_all_min');
    expect(recomputedPrecision(p.items.filter((i) => i.stratum === 'layer2'))).toBeGreaterThanOrEqual(layer2Min);
    expect(recomputedPrecision(p.items)).toBeGreaterThanOrEqual(allMin);
  });

  it('the link sample is complete and self-consistent', () => {
    const l = readJson<Sample>(LINK_REL);
    expect(l.items.length).toBe(50);
    expect(l.n).toBe(50);
    expect(l.items.length).toBe(l.n);

    for (const item of l.items) {
      expect(item.verdict, `${LINK_REL}: ${item.application_number} verdict disagrees with its seats`).toBe(derivedVerdict(item));
    }

    expect(recomputedPrecision(l.items)).toBe(l.precision);
  });

  it.fails('link precision meets the pre-registered bound — FAILS at 0.94 on 2026-10-10 (2 wrong parcels + 1 ambiguous); flips when the link-path WF3 lands', () => {
    const l = readJson<Sample>(LINK_REL);
    const linkMin = logicVariableDefault('coa_notices_link_precision_min');
    expect(recomputedPrecision(l.items)).toBeGreaterThanOrEqual(linkMin);
  });
});
