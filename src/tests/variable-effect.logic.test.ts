// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-EO (admin shows whether a setting is in effect), R-DL
//
// R-EO (operator Q6 y, 2026-10-19). A declared logic variable that the live step does not read carries a badge:
//   (a) "Takes effect at cutover" — a pending step in its copy window (descriptor landed, stage descriptor_only /
//       compute_ported, the legacy shell still live) declares the variable; the live legacy script reads <legacy>.
//   (b) "Not read — scheduled for retirement" — no live code reads it and no descriptor declares it.
// Both are DERIVED (descriptors + converted.json stages + the live code + the copy migrations), never hand-listed
// (the R-DL form). These are the pure derivation and the fast-invariant #53 check, over fixtures.
import { describe, it, expect } from 'vitest';
import {
  BADGE_CUTOVER,
  BADGE_UNREAD,
  COPY_WINDOW_STAGES,
  copyPairsFromMigrations,
  deriveVariableEffect,
  checkVariableEffect,
} from '../../scripts/analysis/gates/variable-effect.mjs';

const desc = (slug: string, names: string[]) => ({
  identity: { name: slug },
  config: { logic_variables: names.map((name) => ({ name })) },
});

const base = () => ({
  seedKeys: ['old_warn_days', 'step_a_warn_max_days', 'step_a_new_literal_pct', 'dead_key', 'band_seq_1_min', 'live_desc_key', 'shared_key'],
  pending: [{ slug: 'step_a', file: 'scripts/step-a.js', stage: 'compute_ported', descriptor: desc('step_a', ['step_a_warn_max_days', 'step_a_new_literal_pct', 'shared_key']) }],
  liveDescriptors: [desc('step_live', ['live_desc_key'])],
  codeTexts: [
    ['scripts/step-a.js', "const v = logicVars.old_warn_days; const s = logicVars.shared_key;"],
    ['scripts/quality/bands.js', 'for (const seq of SEQS) read(`band_seq_${seq}_min`);'],
  ] as Array<[string, string]>,
  copyPairs: { step_a_warn_max_days: 'old_warn_days' } as Record<string, string>,
});

describe('R-EO derivation (pure)', () => {
  it('the copy window is exactly the stages whose legacy shell is still live (R-EF / W4A-R6)', () => {
    expect([...COPY_WINDOW_STAGES].sort()).toEqual(['compute_ported', 'descriptor_only']);
  });

  it('(a) a copy-window variable the live code does not read takes effect at cutover, naming the legacy variable', () => {
    const { entries } = deriveVariableEffect(base());
    expect(entries.step_a_warn_max_days).toMatchObject({ badge: BADGE_CUTOVER, step: 'step_a', legacy_name: 'old_warn_days' });
    expect(entries.step_a_warn_max_days?.reason).toContain('old_warn_days');
  });

  it('(a) a new variable with no legacy counterpart says the live script uses a built-in value', () => {
    const { entries } = deriveVariableEffect(base());
    expect(entries.step_a_new_literal_pct).toMatchObject({ badge: BADGE_CUTOVER, step: 'step_a', legacy_name: null });
    expect(entries.step_a_new_literal_pct?.reason).toMatch(/built-in value/);
  });

  it('(b) a variable no live code reads and no descriptor declares is "not read — scheduled for retirement"', () => {
    const { entries } = deriveVariableEffect(base());
    expect(entries.dead_key).toMatchObject({ badge: BADGE_UNREAD });
  });

  it('no badge when the setting is in effect: read by live code, by a template, or by a live descriptor', () => {
    const { entries } = deriveVariableEffect(base());
    expect(entries.old_warn_days).toBeUndefined();
    expect(entries.shared_key).toBeUndefined(); // the live legacy script reads it too
    expect(entries.band_seq_1_min).toBeUndefined();
    expect(entries.live_desc_key).toBeUndefined();
  });

  it('code reachable only from a copy-window compute is not live (its reads do not count)', () => {
    const input = base();
    input.codeTexts.push(['scripts/lib/compute/step-a.js', 'const x = config.step_a_new_literal_pct;']);
    const { entries } = deriveVariableEffect({ ...input, windowOnlyFiles: new Set(['scripts/lib/compute/step-a.js']) });
    expect(entries.step_a_new_literal_pct).toMatchObject({ badge: BADGE_CUTOVER });
  });

  it('a step past its copy window (runner_wired, or converted) badges nothing', () => {
    const input = base();
    input.pending[0]!.stage = 'runner_wired';
    const { entries } = deriveVariableEffect(input);
    expect(entries.step_a_warn_max_days).toBeUndefined();
  });

  it('copy pairs come from the copy migrations, both committed forms', () => {
    const pairs = copyPairsFromMigrations([
      ['migrations/270_x.sql', "INSERT INTO logic_variables (variable_key, variable_value, description)\nSELECT 'new_a',\n       COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'old_a'), 45),\n       'd'\nON CONFLICT (variable_key) DO NOTHING;"],
      ['migrations/273_y.sql', "SELECT n.new_key, COALESCE(lv.variable_value, n.seed_default), n.description\n  FROM (VALUES\n    ('new_b', 'old_b', 0.9,\n     'd')\n  ) AS n(new_key, old_key, seed_default, description)"],
      ['migrations/999_rollback.sql', "-- SELECT 'new_c', COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'old_c'), 1)"],
    ]);
    expect(pairs).toEqual({ new_a: 'old_a', new_b: 'old_b' });
  });
});

describe('R-EO fast invariant #53 (VARIABLE-EFFECT)', () => {
  const derived = deriveVariableEffect(base());

  it('PASS when the committed admin badges equal the derivation', () => {
    expect(checkVariableEffect(derived, { entries: derived.entries }).pass).toBe(true);
  });

  it('FAIL on an unread variable with no badge', () => {
    const committed = { entries: { ...derived.entries } };
    delete committed.entries.dead_key;
    const r = checkVariableEffect(derived, committed);
    expect(r.pass).toBe(false);
    expect(r.detail).toContain('dead_key');
  });

  it('FAIL on a stale badge (the setting is in effect now)', () => {
    const r = checkVariableEffect(derived, { entries: { ...derived.entries, old_warn_days: { badge: BADGE_UNREAD, reason: 'x' } } });
    expect(r.pass).toBe(false);
    expect(r.detail).toContain('old_warn_days');
  });

  it('FAIL when a badge kind or its legacy name drifts', () => {
    const entries = { ...derived.entries, step_a_warn_max_days: { ...derived.entries.step_a_warn_max_days, legacy_name: 'wrong' } };
    expect(checkVariableEffect(derived, { entries }).pass).toBe(false);
  });
});
