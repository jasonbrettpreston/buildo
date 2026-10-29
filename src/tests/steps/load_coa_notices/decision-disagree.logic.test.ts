// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §Plausibility P2 (decision_disagree)
//
// Lock for the corrected P2 check (operator CHAT-144.P2-DISAGREE, 2026-10-25-batch-c). The old SQL
// compared each item's decision to the application's CKAN decision, so `(v.decision = 'refused') IS
// DISTINCT FROM NULL` counted every hearing notice (no decision on either side) and every partial
// refusal (one item refused, the application approved): 18 + 2 of the 29 rows measured 2026-10-25.
// The corrected check compares decided applications only, at the application level:
//   · an application with any 'pending' item (a hearing notice) is skipped;
//   · an application whose CKAN decision is NULL is skipped;
//   · the notice is refused when every DECIDED item is refused ('pending' and 'unknown' items are not decided;
//     an application with no decided item is skipped); Spec 129 :49's per-item column rule is unchanged;
//   · CKAN refused = decision ILIKE '%refus%'.
// The live value (expected 9 on 2026-10-25: 29 − 18 hearing notices − 2 partial refusals; CHAT-144's "10" was an
// arithmetic slip, corrected in the Spec 129 :173 note) is the DB lane's retake; the behaviour on synthetic rows is
// proven in src/tests/db/coa-notice-decision-disagree.db.test.ts (npm run test:db).
//
// RED BASELINE: against the pre-CHAT-144 descriptor (the item-level SQL) T-P2-a..c FAIL; against the first
// CHAT-144 SQL (every item, 'unknown' counted as decided) T-P2-e FAILS (B10-FIX panel: Guardian F5, Compliance F3).
import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const descriptor = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/load-coa-notices.descriptor.json'), 'utf8'));

type CheckDecl = { id: string; sql?: string; bound?: string; severity?: string; blocking?: boolean; when?: string; source?: string };
function findCheck(node: unknown): CheckDecl | undefined {
  if (Array.isArray(node)) {
    for (const x of node) {
      const hit = findCheck(x);
      if (hit) return hit;
    }
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (o.id === 'decision_disagree' && typeof o.sql === 'string') return o as CheckDecl;
    for (const v of Object.values(o)) {
      const hit = findCheck(v);
      if (hit) return hit;
    }
  }
  return undefined;
}
const check = findCheck(descriptor)!;
const sql = check.sql!.replace(/\s+/g, ' ');

describe('load_coa_notices P2 decision_disagree (CHAT-144)', () => {
  it('T-P2-a skips hearing notices: an application with a pending item is not compared', () => {
    expect(sql).toMatch(/NOT bool_or\(v\.decision = 'pending'\)/);
  });

  it('T-P2-b skips applications whose CKAN decision is NULL', () => {
    expect(sql).toMatch(/a\.decision IS NOT NULL/);
    expect(sql).not.toMatch(/IS DISTINCT FROM/);
  });

  it('T-P2-c compares at the application level: refused = every decided item refused', () => {
    expect(sql).toMatch(/GROUP BY v\.application_number/);
    expect(sql).toMatch(/bool_and\(v\.decision = 'refused'\)/);
    expect(sql).toMatch(/a\.decision ILIKE '%refus%'/);
  });

  it('T-P2-e counts only decided items: unknown items are not decided, and a group with none is skipped', () => {
    expect(sql).toMatch(/bool_and\(v\.decision = 'refused'\) FILTER \(WHERE v\.decision NOT IN \('pending', ?'unknown'\)\)/);
    expect(sql).toMatch(/count\(\*\) FILTER \(WHERE v\.decision NOT IN \('pending', ?'unknown'\)\) > 0/);
  });

  it('T-P2-f retightens only when every counted application is in the explained list', () => {
    expect((check as { retighten_when?: string }).retighten_when).toMatch(/explained list covers every counted application/);
  });

  it('T-P2-d stays a non-blocking WARN plausibility check over live rows', () => {
    expect(check).toMatchObject({ bound: 'viol == 0', severity: 'WARN', blocking: false, when: 'post', source: 'plausibility' });
    expect(sql).toMatch(/v\.retired_at IS NULL/);
  });
});
