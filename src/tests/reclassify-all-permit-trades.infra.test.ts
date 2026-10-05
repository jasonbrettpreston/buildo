// SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.C (writers persist attachment_basis, 9-col INSERT)
//
// WF3 2026-10-04 (sync-permit-trades sibling): scripts/reclassify-all.js inserted
// permit_trades(… trade_slug, trade_name …) — columns migration 006 never
// created — so every batch with a classified trade raised 42703. It also wrote
// no attachment_basis. This file resolves the script's INSERT (its one
// interpolated VALUES list substituted by a single 9-placeholder row) with the
// ONE witness resolver against the committed information_schema snapshot.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Resolver = {
  init: () => Promise<void>;
  resolveStatement: (
    sql: string,
    catalog: Record<string, string[]>,
  ) => { writes: Record<string, string[]>; error: string | null };
};

let R: Resolver;
let catalog: Record<string, string[]>;
let script: string;
let insertSql: string;

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  R = require(path.join(process.cwd(), 'scripts/lib/sql-witness/resolve.cjs')) as Resolver;
  await R.init();
  catalog = (JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'docs/reports/witness/_catalog.json'), 'utf8'),
  ) as { tables: Record<string, string[]> }).tables;
  script = fs.readFileSync(path.resolve(__dirname, '../../scripts/reclassify-all.js'), 'utf-8');
  const template = script.match(/`(INSERT\s+INTO\s+permit_trades[\s\S]*?)`/)?.[1] ?? '';
  insertSql = template.replace(/\$\{tradePlaceholders\.join\([^)]*\)\}/, '($1,$2,$3,$4,$5,$6,$7,$8,$9)');
});

describe('scripts/reclassify-all.js — permit_trades INSERT matches the real schema (Spec 80 §5.C)', () => {
  it('the INSERT writes only catalogued permit_trades columns, including attachment_basis', () => {
    expect(insertSql, 'INSERT INTO permit_trades template not found').toBeTruthy();
    expect(insertSql).not.toContain('${');
    const r = R.resolveStatement(insertSql, catalog);
    expect(r.error).toBeNull();
    const written = r.writes.permit_trades ?? [];
    expect(written.filter((c) => !(catalog.permit_trades ?? []).includes(c))).toEqual([]);
    expect(written).toContain('attachment_basis');
  });

  it('builds 9 placeholders per row and pushes the basis derived like classify-permits.js', () => {
    expect(script).toMatch(/const\s+tradeCols\s*=\s*9\s*;/);
    expect(script).toMatch(
      /const\s+basis\s*=\s*m\.attachment_basis\s*\|\|\s*\(m\.is_active\s*\?\s*'evidence'\s*:\s*'inference'\)/,
    );
    expect(script).toMatch(
      /tradeValues\.push\(m\.permit_num,\s*m\.revision_num,\s*m\.trade_id,\s*m\.tier,\s*m\.confidence,\s*m\.is_active,\s*m\.phase,\s*m\.lead_score,\s*basis\)/,
    );
  });

  it('emitMeta declares attachment_basis among the permit_trades writes', () => {
    const writesBlock = script.match(/permit_trades:\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect(writesBlock).toMatch(/['"]attachment_basis['"]/);
  });

  it('control: the resolver reports a column permit_trades does not have', () => {
    const r = R.resolveStatement('INSERT INTO permit_trades (permit_num, trade_slug) VALUES ($1, $2)', catalog);
    expect((r.writes.permit_trades ?? []).filter((c) => !(catalog.permit_trades ?? []).includes(c))).toEqual([
      'trade_slug',
    ]);
  });
});
