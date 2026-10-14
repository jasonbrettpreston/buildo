// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-BZ G8; S4 empty-source HALTs → declared guard)
//
// S4: an empty source must HALT the run BEFORE the step body, and the halt must be armed by the
// DECLARED `guards.empty_source` — not by an ad hoc throw inside a contract_read hook. These
// tests drive the REAL runner (`measureInputGuards`) against the REAL step descriptors, so a
// descriptor that stops declaring a table, or a runner that stops counting one, fails here.
//
// Stub-pool style (query answered by statement shape, counting `COUNT(*)::bigint AS n FROM <t>`)
// mirrors p3c1-32.logic.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = { metric: string; value: unknown; threshold: unknown; status: string; source?: string; errored?: boolean };
type GuardResult = { rows: Row[]; halt: boolean };
type Runner = { measureInputGuards: (pool: unknown, descriptor: unknown) => Promise<GuardResult> };

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module under test
const runner: Runner = require(join(process.cwd(), 'scripts/lib/step/index.js'));

function loadDescriptor(rel: string): { identity?: { name?: string }; guards?: { empty_source?: unknown } } {
  return JSON.parse(readFileSync(join(process.cwd(), rel), 'utf8'));
}

/** Answers every `COUNT(*)::bigint AS n FROM <table>` with `counts[table] ?? 1` (1 = non-empty). */
function countPool(counts: Record<string, number> = {}) {
  const sql: string[] = [];
  return {
    sql,
    query: async (text: string) => {
      sql.push(text);
      const m = /COUNT\(\*\)::bigint AS n FROM (\w+)/.exec(text);
      if (m) return { rows: [{ n: String(counts[m[1]!] ?? 1) }] };
      return { rows: [] };
    },
  };
}

/** The declared empty-source tables for a descriptor, normalized to an array. */
function declaredTables(descriptor: { guards?: { empty_source?: unknown } }): string[] {
  const es = descriptor.guards?.empty_source;
  if (Array.isArray(es)) return es.map(String);
  if (typeof es === 'string') return [es];
  throw new Error('descriptor declares no guards.empty_source');
}

const CASES: Array<{ rel: string; tables: string[] }> = [
  { rel: 'scripts/enrich-heritage.descriptor.json', tables: ['heritage_properties', 'heritage_districts'] },
  { rel: 'scripts/enrich-ravines.descriptor.json', tables: ['ravines'] },
  { rel: 'scripts/compute-parcel-cost-estimates.descriptor.json', tables: ['archetype_cost_rates', 'parcel_cost_lines'] },
];

describe('S4 — declared guards.empty_source halts the run for the REAL step descriptors (R-BZ G8)', () => {
  for (const { rel, tables } of CASES) {
    const name = rel.split('/').pop()!;

    it(`${name} — every declared empty-source table is named in the descriptor`, () => {
      const descriptor = loadDescriptor(rel);
      expect(declaredTables(descriptor)).toEqual(tables);
    });

    for (const table of tables) {
      it(`${name} — ${table} empty (all others populated) → halt === true, FAIL row names ${table}`, async () => {
        const descriptor = loadDescriptor(rel);
        const pool = countPool({ [table]: 0 });
        const res = await runner.measureInputGuards(pool, descriptor);
        expect(res.halt).toBe(true);
        const failRow = res.rows.find((r) => r.status === 'FAIL');
        expect(failRow, `no FAIL row for an empty ${table}`).toBeDefined();
        expect(failRow!.value).toBe(`empty: ${table}`);
        expect(failRow!.errored).toBe(true);
        expect(String(failRow!.value)).toContain(table);
      });
    }

    it(`${name} — all declared sources populated → halt === false`, async () => {
      const descriptor = loadDescriptor(rel);
      const pool = countPool(); // every count defaults to 1
      const res = await runner.measureInputGuards(pool, descriptor);
      expect(res.halt).toBe(false);
      expect(res.rows.every((r) => r.status !== 'FAIL')).toBe(true);
    });
  }
});
