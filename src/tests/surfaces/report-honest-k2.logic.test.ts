// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md section 6.6 rules 1, 5, 8 (hidden states counted; null is "—"; honest answers),
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-481 (confidence beside each reading), M-496 (unit size formula, unchanged);
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (the server formats), FE-34 (the v21 page contract).
//
// K2 honesty bundle, data-only page parts (operator 2026-11-13, verbatim "all recommendations accepted. proceed with the plan"; holistic recommendation
// ~/Buildo-scratch/review-20261113/HOLISTIC-RECOMMENDATION.md, Q1 keep O-17: no "By-law derived" downgrade, our settings explained in See details;
// Q2 "(by-law allows)" only on a figure with no setting or estimate behind it). Pure file reads: no DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- page table JSON
const ROOT = process.cwd();
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const PAGE = readJson('scripts/surfaces/_schema/report-page.json');
const PRESENTATION = readJson('scripts/surfaces/_schema/report-presentation.json');
const SEED_TEXT = readJson('scripts/surfaces/_schema/report-v2-seed/page-text.json');
const LV = readJson('scripts/seeds/logic_variables.json');
const options = (): Json[] => (PAGE.sections as Json[]).filter((s) => s.kind === 'option');
const text = (key: string): string => String(PRESENTATION.page[key] ?? '');

describe('K2 Q2: "(by-law allows)" only where no setting or estimate sits behind the figure', () => {
  it('no option tile carries a size.sub part, and the words are in no page text', () => {
    for (const o of options()) expect((o.parts as Json[]).filter((p) => p.role === 'size.sub'), o.id).toEqual([]);
    expect(JSON.stringify(PRESENTATION.page)).not.toMatch(/by-law allows/i);
    expect(JSON.stringify(SEED_TEXT.texts)).not.toMatch(/by-law allows/i);
  });
});

describe('K2 Q1: our settings are explained in See details; the O-17 label is not downgraded', () => {
  it('each option See-details panel opens with a bound text that says some figures rest on our settings, not the by-law', () => {
    for (const o of options()) {
      const why = (o.parts as Json[]).find((p) => p.role === 'size.panel.why') as Json;
      expect(why.content, `${o.id} size.panel.why is content, not pending`).toBe('panel.settings_note');
    }
    const t = text('panel.settings_note');
    expect(t.length).toBeGreaterThan(40);
    expect(t).toMatch(/our (own )?settings/i);
    expect(t).toMatch(/not (the )?by-law/i);
  });
  it('O-17: the trust label "high" is still "By-law derived" (no downgrade, Q1)', () => {
    expect(PRESENTATION.trust_label.high).toBe('By-law derived');
  });
});

describe('K2 unit-size tile: See details says the figure includes the basement and the circulation share (M-496 formula unchanged)', () => {
  it('the houseplex panel has a row naming the basement and the circulation percent, and the percent is the stored setting', () => {
    const o3 = options().find((o) => o.scenario === 'detached_houseplex') as Json;
    const parts = o3.parts as Json[];
    const i = parts.findIndex((p) => p.role === 'size.row.label' && p.content === 'row.unit_size_basis');
    expect(i, 'the label part').toBeGreaterThan(-1);
    const v = parts[i + 1] as Json;
    expect([v.role, v.content]).toEqual(['size.row.value', 'row.unit_size_basis_value']);
    const t = text('row.unit_size_basis_value');
    expect(t).toMatch(/basement/i);
    const pct = Math.round(Number(LV.houseplex_circulation_share.default) * 100);
    expect(t).toContain(`${pct} % circulation`);
  });
});
