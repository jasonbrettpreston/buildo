// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-39 (EI-D2, EI-D8: the report binds the final engine fields);
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.3 dated note 2026-11-12 (R-2, the lock named there);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-367 (old values are not shown), M-67 (Layer 3 sizes only).
//
// MB-94 part (c) · recut to the R-2 literal (task-121, 6c.5a) · RED FIRST (the exported reason word is absent on the tip). The standing no-legacy
// condition of the merge plan 4.6 (MB-37 fold), scoped to the report page and its producer:
//   1. every parcels-sourced column the page binds is a lot FACT on an allow-list (lot size, three flags); never a legacy engine column;
//   2. no page-bound field names a legacy size, cost or CoA source (the legacy `parcel_cost_menu`, `max_buildable_*`, `opt_*`, `max_build_*`, `coa_fsi`, `cost_*`);
//   3. the R-2 reason `not_in_engine_population` has its ruled sentence ("Not yet evaluated"), and the producer exports the same reason word.
// Not here: binding cost per option from the `scenario:*` lines, which needs new page parts (a separate ruling).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NOT_IN_ENGINE_POPULATION, pageBindings } from '@/lib/report-projection/project';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- fixture JSON
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'));
/** The lot facts the page may read from `parcels` (the ruled report-page bindings today). Adding a column here is a reviewed change. */
const FACT_COLUMNS = ['lot_size_sqm', 'is_heritage_designated', 'is_in_ravine_protection_area', 'is_corner_lot'];
const LEGACY = /^(max_buildable_|opt_|max_build_|coa_fsi|parcel_cost_menu|cost_|envelope_|imagery_)/;

describe('MB-94 (c) the report binds no legacy engine value (FE-39, M-367)', () => {
  const bindings = pageBindings();
  it('every parcels-sourced page binding is an allowed lot fact', () => {
    const cols = [...new Set(bindings.flatMap((b) => (b.source.kind === 'parcels' ? [b.source.column] : [])))].sort();
    expect(cols.filter((c) => !FACT_COLUMNS.includes(c))).toEqual([]);
  });
  it('no page binding names a legacy size, cost or CoA column', () => {
    const named = bindings.flatMap((b) => (b.source.kind === 'parcels' ? [b.source.column] : b.source.kind === 'catalogue' ? [b.source.field_id] : []));
    expect(named.filter((c) => LEGACY.test(c))).toEqual([]);
  });
  it('the page binds at least one catalogue field and the allow-list is not vacuous', () => {
    expect(bindings.some((b) => b.source.kind === 'catalogue')).toBe(true);
    expect(bindings.some((b) => b.source.kind === 'parcels')).toBe(true);
  });
  it('R-2: not_in_engine_population has the ruled sentence under the key built from the producer constant', () => {
    expect(NOT_IN_ENGINE_POPULATION).toBe('not_in_engine_population');
    expect(readJson('scripts/surfaces/_schema/report-presentation.json').status_text[`not_evaluated:${NOT_IN_ENGINE_POPULATION}`]).toBe('Not yet evaluated');
  });
});
