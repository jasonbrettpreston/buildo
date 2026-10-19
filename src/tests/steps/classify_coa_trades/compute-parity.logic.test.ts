// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-BZ), R-DF
//
// Phase-4 wave 4 lane C, full-form row 7 (Spec 123 §7; Spec 124 R-EH). The pure compute
// `scripts/lib/compute/classify-coa-trades.js` must produce the SAME rows the frozen legacy text writes:
// lead_trades 8-tuples (classified_at is runner-stamped), the lead_products replace set and rows, and the
// watermark ids — with realtor present, realtor absent, the inference gate on, and a slug miss.
import { describe, it, expect } from 'vitest';
import path from 'path';

import { loadLegacy, SEEDED, type CoaRow, type LegacyOpts } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/classify-coa-trades.js')) as {
  materializeRows(rows: CoaRow[], ctx: { config: Record<string, unknown>; lookups: Record<string, unknown[]> }): {
    rows: { e1: Record<string, unknown>[]; e3: Record<string, unknown>[]; e4: { id: number }[] };
    replace_keys: { e2: string[] };
    matched: Record<string, unknown>;
  };
  finalizeMatched(m: Record<string, unknown>, ctx: { config: Record<string, unknown> }): Record<string, unknown>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const classifier = require(path.join(REPO_ROOT, 'scripts/lib/coa-trade-classifier.js')) as { TAG_TRADE_MATRIX: Record<string, [string, number][]>; classifyCoaProducts(r: unknown, d: Set<string>): { slug: string }[]; DEPRECATED_TRADE_SLUGS: Set<string> };

const slugs = new Set<string>(['caulking', 'millwork-cabinetry', 'stone-countertops', 'tiling', 'trim-work']);
for (const l of Object.values(classifier.TAG_TRADE_MATRIX)) for (const [s] of l) slugs.add(s);
const TRADES = [...[...slugs].sort().map((slug, i) => ({ id: 100 + i, slug })), { id: 33, slug: 'realtor' }];
const ROWS: CoaRow[] = [
  { id: 1, lead_id: 'coa:A', scope_tags: ['kitchen', 'bathroom'], coa_type_class: 'residential', project_type: 'addition', structure_type: 'sfd' },
  { id: 2, lead_id: 'coa:B', scope_tags: ['severance'], coa_type_class: 'commercial', project_type: null, structure_type: null },
  { id: 3, lead_id: 'coa:C', scope_tags: ['basement', 'garage'], coa_type_class: 'residential', project_type: 'Addition', structure_type: 'sfd' },
];
const PRODUCTS = [...new Set(ROWS.flatMap((r) => classifier.classifyCoaProducts(r, classifier.DEPRECATED_TRADE_SLUGS).map((p) => p.slug)))].sort().map((slug, i) => ({ id: 500 + i, slug }));
const CONFIG = { ...SEEDED, classify_coa_trades_tier: 3, classify_coa_trades_lead_score_scale: 100, classify_coa_trades_realtor_confidence: 0.7, classify_coa_trades_max_detail_keys: 50 };

async function both(over: Partial<LegacyOpts> & { trades?: typeof TRADES } = {}) {
  const trades = over.trades ?? TRADES;
  const o = loadLegacy({ rows: ROWS, trades, products: PRODUCTS, ...over });
  await o.runMain();
  const realtorTrades = over.realtorAvailable === false ? trades.filter((t) => t.slug !== 'realtor') : trades;
  const out = compute.materializeRows(ROWS, { config: { ...CONFIG, ...(over.logicVars ?? {}) }, lookups: { trades: realtorTrades, product_groups: PRODUCTS } });
  return { o, out };
}
function legacyTrades(o: ReturnType<typeof loadLegacy>): unknown[][] {
  const out: unknown[][] = [];
  for (const q of o.queries.filter((x) => /^\s*INSERT INTO lead_trades/.test(x.sql))) for (let i = 0; i < q.params.length; i += 9) out.push(q.params.slice(i, i + 8));
  return out;
}
const draftTrades = (e1: Record<string, unknown>[]): unknown[][] => e1.map((r) => ['lead_id', 'trade_id', 'tier', 'confidence', 'is_active', 'phase', 'lead_score', 'attachment_basis'].map((c) => r[c]));

describe('classify_coa_trades compute ≡ legacy oracle', () => {
  it('lead_trades, lead_products (replace keys + rows) and the watermark ids match', async () => {
    const { o, out } = await both();
    expect(draftTrades(out.rows.e1)).toEqual(legacyTrades(o));
    expect(out.replace_keys.e2).toEqual(o.queries.find((q) => /^\s*DELETE FROM lead_products/.test(q.sql))?.params[0]);
    const pIns = o.queries.find((q) => /^\s*INSERT INTO lead_products/.test(q.sql))?.params ?? [];
    const legacyP: unknown[][] = [];
    for (let i = 0; i < pIns.length; i += 4) legacyP.push(pIns.slice(i, i + 3));
    expect(out.rows.e3.map((r) => [r.lead_id, r.product_id, r.confidence])).toEqual(legacyP);
    expect(out.rows.e4.map((r) => r.id)).toEqual(o.queries.find((q) => /^\s*UPDATE coa_applications/.test(q.sql))?.params[0]);
  });

  it('realtor absent, inference on, and a slug miss: rows and counters match', async () => {
    const noRealtor = await both({ realtorAvailable: false });
    expect(draftTrades(noRealtor.out.rows.e1)).toEqual(legacyTrades(noRealtor.o));
    const inf = await both({ logicVars: { p16_inference_layer_enabled: 1 } });
    expect(draftTrades(inf.out.rows.e1)).toEqual(legacyTrades(inf.o));
    const miss = await both({ trades: TRADES.filter((t) => t.slug !== 'plumbing') });
    expect(draftTrades(miss.out.rows.e1)).toEqual(legacyTrades(miss.o));
    const meta = miss.o.summaries[0]?.records_meta as Record<string, unknown>;
    const fin = compute.finalizeMatched(miss.out.matched, { config: CONFIG });
    expect(fin.slug_resolution_miss_count).toBe(meta.slug_resolution_miss_count);
    expect(fin.slug_resolution_misses).toEqual(meta.slug_resolution_misses);
    expect(fin.trade_slug_distribution).toEqual(meta.trade_slug_distribution);
    expect(fin.coa_trades_per_lead_histogram).toEqual(meta.coa_trades_per_lead_histogram);
  });
});
