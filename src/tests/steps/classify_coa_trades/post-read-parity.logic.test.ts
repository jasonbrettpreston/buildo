// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-EH (e) ("An optional `buildPostSql` runs once after
//            the loop"), R-EH (c) (finalizeMatched), 124a R-AD (warn_limit, one row PASS/WARN/FAIL)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (1) (the checks dispatch table)
//
// classify_coa_trades' two vocab-coverage checks (operator Q-W4G-2 y, 2026-10-19): the converted step reads them
// once after the loop through buildPostSql and scores them as declared checks. Parity with the LEGACY path, which
// ran pipeline.computeVocabCoverage over the manifest's telemetry_vocab_cols and let emitSummary render a cov_ row:
//   (1) the triples are the manifest's own;
//   (2) each subquery is text-identical to the legacy core's statement (scripts/lib/vocab-coverage.js);
//   (3) the value and the PASS / WARN / FAIL / INFO status equal the legacy cov_ row for every branch.
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');
/* eslint-disable @typescript-eslint/no-require-imports -- the real CJS modules under test */
const compute = require(path.join(ROOT, 'scripts/lib/compute/classify-coa-trades.js'));
const { resolveAndCountTripleWithClient } = require(path.join(ROOT, 'scripts/lib/vocab-coverage.js'));
const pipeline = require(path.join(ROOT, 'scripts/lib/pipeline.js'));
const { checkRow } = require(path.join(ROOT, 'scripts/lib/step/verdict.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/manifest.json'), 'utf8'));
const descriptor = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/classify-coa-trades.descriptor.json'), 'utf8'));
const seeds = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8'));
const config = { vocab_coverage_pass_pct: seeds.vocab_coverage_pass_pct.default, vocab_coverage_warn_pct: seeds.vocab_coverage_warn_pct.default };
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The legacy core's statement for one triple, captured from the real function over a recording client. */
async function legacySql(triple: Record<string, string | null>): Promise<string> {
  let sql = '';
  const client = { query: async (q: string) => { sql = q; return { rows: [{ present: 0, vocab_size: 0 }] }; } };
  await resolveAndCountTripleWithClient(client, triple, { columnType: async () => 'integer' });
  return sql;
}

/** The legacy cov_ audit row emitSummary renders for one triple's counts. */
function legacyCovRow(label: string, present: number, vocabSize: number) {
  const out: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => { out.push(String(line)); });
  try {
    pipeline.emitSummary({
      records_total: 0, records_new: 0, records_updated: 0,
      telemetry_context: { vocab_coverage: { [label]: { present, vocab_size: vocabSize } }, vocab_coverage_thresholds: { pass: config.vocab_coverage_pass_pct, warn: config.vocab_coverage_warn_pct } },
      records_meta: { audit_table: { phase: 42, name: 'x', verdict: 'PASS', rows: [] } },
    });
  } finally {
    spy.mockRestore();
  }
  const line = out.find((l) => l.startsWith('PIPELINE_SUMMARY:'));
  const rows = JSON.parse(line!.slice('PIPELINE_SUMMARY:'.length)).records_meta.audit_table.rows as Array<{ metric: string; value: unknown; status: string }>;
  return rows.find((r) => r.metric === `cov_${label}`)!;
}

/** The converted row: buildPostSql's row → finalizeMatched → the check function → the runner's checkRow. */
function convertedRow(id: string, label: string, present: number, vocabSize: number) {
  const post = { [`${label}_present`]: present, [`${label}_vocab_size`]: vocabSize };
  const matched = compute.finalizeMatched({ processed: 1, coa_zero_trades: 0, slug_resolution_miss_slugs: [], active_trades_hist: {}, evidence_trades_hist: {} }, { config: { classify_coa_trades_max_detail_keys: 50, p16_inference_layer_enabled: 0 }, post });
  const seen: Record<string, unknown> = {};
  compute.checks[id]({ matched, report: (k: string, o: unknown) => { seen[k] = o; } });
  const check = descriptor.checks.find((c: { id: string }) => c.id === id);
  return { observation: seen[id] as { value: number | null; detail: string }, row: checkRow(check, seen[id], null, config) };
}

describe('classify_coa_trades vocab coverage — converted post read ≡ legacy computeVocabCoverage', () => {
  it('(1) the triples are the manifest telemetry_vocab_cols the legacy step read', () => {
    expect(JSON.parse(JSON.stringify(compute.VOCAB_TRIPLES))).toEqual(manifest.scripts.classify_coa_trades.telemetry_vocab_cols);
  });

  it('(2) each subquery is text-identical to the legacy core statement', async () => {
    const post = squash(compute.buildPostSql().post_sql);
    for (const [label, triple] of Object.entries(compute.VOCAB_TRIPLES as Record<string, Record<string, string | null>>)) {
      const legacy = squash(await legacySql(triple));
      const m = legacy.match(/^SELECT (\(SELECT .*\)) AS present, (\(SELECT .*\)) AS vocab_size$/);
      expect(m, legacy).not.toBeNull();
      expect(post).toContain(`${m![1]} AS ${label}_present`);
      expect(post).toContain(`${m![2]} AS ${label}_vocab_size`);
    }
    expect(compute.buildPostSql().post_binds).toEqual([]);
  });

  for (const [present, size] of [[27, 27], [26, 27], [20, 27], [10, 27], [0, 0], [5, 0]] as const) {
    it(`(3) ${present}/${size}: the value and status equal the legacy cov_ row, for both checks`, () => {
      for (const [id, label] of [['trade_vocab_coverage', 'trade_vocab'], ['product_vocab_coverage', 'product_vocab']] as const) {
        const legacy = legacyCovRow(label, present, size);
        const { observation, row } = convertedRow(id, label, present, size);
        // CCT-D10, declared deviation: data present over an EMPTY vocabulary is unmeasurable, and an unevaluable
        // check reads its declared severity (Spec 122a:639 "unevaluable at the declared severity"), FAIL here,
        // where the legacy cov_ row rendered WARN (a misconfiguration either way; every measurable branch matches).
        const expected = present > 0 && size === 0 ? 'FAIL' : legacy.status;
        expect(row.status, `${id} ${present}/${size} (legacy ${legacy.status})`).toBe(expected);
        if (size) expect(observation.detail).toBe(legacy.value);
      }
    });
  }
});
