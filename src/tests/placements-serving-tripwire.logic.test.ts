// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 row 6 (dated notes 2026-11-10: serving is the D-7 follow-up row)
//             docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-22, FE-23
//
// MF-40 · plan section 12 fold 8 (observability): the admin page authors offers, but nothing serves them into reports yet. This tripwire keeps
// that visible: the only non-test sources that read or write the offers table are the admin placements read and the offer route. The serving
// row (MF-40 D-7) adds its selector here deliberately, in the same commit that wires it. RED plant: an extra reader is named.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
// OUTPUT panel MEDIUM-2 (2026-11-10): src/lib/placements/over-cap.ts holds the ONE oversubscription query both readers run.
const ALLOWED = ['src/lib/placements/list.ts', 'src/lib/placements/over-cap.ts', 'src/app/api/admin/placements/offers/route.ts'];
const OFFERS_SQL = /\b(?:FROM|JOIN|INTO|UPDATE)\s+offers\b/i;

const walk = (rel: string): string[] => fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).flatMap((e) => {
  const r = path.posix.join(rel, e.name);
  if (e.isDirectory()) return e.name === 'tests' || e.name === 'node_modules' ? [] : walk(r);
  return /\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [r] : [];
});
export const offersReaders = (files: string[], read: (f: string) => string): string[] => files.filter((f) => OFFERS_SQL.test(read(f))).sort();

describe('MF-40 serving tripwire: offers is read only by the admin placements page', () => {
  const files = [...walk('src'), ...walk('scripts').filter((f) => !f.startsWith('scripts/surfaces/_schema'))];
  const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

  it('the readers of the offers table are exactly the admin read and the offer route', () => {
    expect(offersReaders(files, read)).toEqual([...ALLOWED].sort());
  });

  it('RED plant: a serving selector that reads offers is caught', () => {
    const planted = (f: string) => (f === 'src/lib/surfaces/report/core.ts' ? 'SELECT creative_text FROM offers WHERE active' : read(f));
    expect(offersReaders(files, planted)).toContain('src/lib/surfaces/report/core.ts');
  });
});
