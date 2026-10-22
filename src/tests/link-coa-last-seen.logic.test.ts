// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md (R-JM)
//
// R-JM / CHAT-56 + CHAT-59 (LINKCOA-ORDER, option B-plus). The coa root owns coa_applications.last_seen_at
// (R-DZ, R-FF): scripts/link-coa.js (legacy, unconverted) must not stamp it, because a link run would
// otherwise read as "the portal was seen" (portal-rot masking, COA-D18) and the unconverted link_coa would
// stay an upstream of assert_coa_freshness / classify_coa_scope (R-EQ #54). The one internal consumer of that
// stamp was the permit bump, which now takes the newly linked permit numbers from the tier UPDATEs' RETURNING.
//
// Behavioural: the script is executed with a recording pool; the assertions read the SQL it issues.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { createRequire } from 'module';

const nodeRequire = createRequire(__filename);

const FILE = path.resolve(__dirname, '../../scripts/link-coa.js');
const SRC = fs.readFileSync(FILE, 'utf-8');

type Q = { sql: string; params: unknown[] };

async function runLinkCoa(): Promise<Q[]> {
  const queries: Q[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    const s = String(sql);
    if (/UPDATE coa_applications ca\b/.test(s) && /SET linked_permit_num = matched\.permit_num/.test(s) && /RETURNING/.test(s)) {
      // tier UPDATE: one CoA linked to PERMIT-A (the single-statement tiers and the batched tier 3 alike)
      return { rows: [{ linked_permit_num: 'PERMIT-A' }], rowCount: 1 };
    }
    if (/UPDATE coa_applications ca\b/.test(s) && /SET linked_permit_num = matched\.permit_num/.test(s)) {
      return { rows: [], rowCount: 1 }; // pre-fix shape (no RETURNING): rowCount only
    }
    if (/LENGTH\(TRIM\(description\)\) >= 10/.test(s)) return { rows: [{ id: 1, ward: "01", description: "ADDITION TO REAR OF DWELLING" }], rowCount: 1 };
    if (/UPDATE permits/.test(s)) return { rows: [], rowCount: 1 };
    return { rows: [{ total: '5', cnt: '0', count: '0' }], rowCount: 0 };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const noop = () => {};
  const pipeline: Record<string, unknown> = {
    run: async (_n: string, fn: (p: unknown) => Promise<void>) => { await fn(pool); },
    withAdvisoryLock: async (_p: unknown, _id: number, fn: () => Promise<unknown>) => ({ acquired: true, result: await fn() }),
    withTransaction: async (_p: unknown, fn: (c: unknown) => Promise<unknown>) => fn(pool),
    getDbTimestamp: async () => new Date('2026-10-22T12:00:00Z'),
    log: { info: noop, warn: noop, error: noop },
    progress: noop,
    emitSummary: noop,
    emitMeta: noop,
  };
  const pipelineProxy = new Proxy(pipeline, { get: (t, k) => (k in t ? t[k as string] : async () => ({})) });
  const mods: Record<string, unknown> = {
    zod: nodeRequire('zod'),
    './lib/pipeline': pipelineProxy,
    './lib/lifecycle-phase': { SKIP_PHASES_SQL: "('P19','P20')" },
    './lib/safe-math': nodeRequire('../../scripts/lib/safe-math'),
    './lib/config-loader': {
      loadMarketplaceConfigs: async () => ({ logicVars: { coa_match_conf_high: 0.9, coa_match_conf_medium: 0.5, coa_inherit_from_permit_min_confidence: 0.5 } }),
      validateLogicVars: () => ({ valid: true, errors: [] }),
    },
  };
  const req = (id: string) => {
    if (id in mods) return mods[id];
    return nodeRequire(path.resolve(path.dirname(FILE), id));
  };
  const wrapper = vm.runInThisContext(`(function (require, process, module, exports) {${SRC.replace(/^#!.*\n/, '')}\n})`, { filename: FILE });
  const proc = Object.create(process, { argv: { value: ['node', FILE] } });
  await wrapper(req, proc, { exports: {} }, {});
  await new Promise((r) => setTimeout(r, 50));
  return queries;
}

describe('link-coa.js — R-JM: coa root owns coa_applications.last_seen_at; permit bump driven by RETURNING', () => {
  it('no coa_applications statement written by link_coa sets last_seen_at', async () => {
    const qs = await runLinkCoa();
    const coaWrites = qs.filter((q) => /UPDATE coa_applications/.test(q.sql));
    expect(coaWrites.length).toBeGreaterThan(0);
    for (const q of coaWrites) expect(q.sql).not.toMatch(/last_seen_at\s*=/);
  });

  it('the tier UPDATEs return linked_permit_num', async () => {
    const qs = await runLinkCoa();
    const tiers = qs.filter((q) => /UPDATE coa_applications ca\b/.test(q.sql) && /linked_confidence/.test(q.sql) && /matched\.permit_num|matched\.conf/.test(q.sql));
    expect(tiers.length).toBeGreaterThan(0);
    for (const q of tiers) expect(q.sql).toMatch(/RETURNING\s+ca\.linked_permit_num/);
  });

  it('newly linked permits still get permits.last_seen_at bumped, from the RETURNING set', async () => {
    const qs = await runLinkCoa();
    const bump = qs.find((q) => /UPDATE permits\s+SET last_seen_at/.test(q.sql));
    expect(bump).toBeDefined();
    expect(bump!.sql).not.toMatch(/FROM coa_applications/);
    expect(bump!.sql).toMatch(/permit_num = ANY\(\$1::text\[\]\)/);
    expect(bump!.params[0]).toEqual(['PERMIT-A']);
  });

  it('source: the only last_seen_at assignment left is the permits bump', () => {
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const assigns = code.match(/last_seen_at\s*=\s*\$\d/g) || [];
    expect(assigns).toHaveLength(1);
    expect(code).not.toMatch(/last_seen_at\s*>=\s*\$1::timestamptz/);
  });
});
