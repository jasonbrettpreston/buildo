// Market metrics SQL queries — extracted from route.ts for testability
// SPEC LINK: docs/specs/34_market_metrics.md

import { query } from '@/lib/db/client';
import {
  type WealthTier,
  TIER_LABELS,
  TIER_ORDER,
  mapPermitType,
} from '@/lib/market-metrics/helpers';

// --- reference month ---
// Use the last fully completed calendar month to avoid partial-month vs
// full-month YoY skew. If data is more than a month stale (MAX issued_date
// is older than last month), use whatever month the data lands in.

export async function getReferenceMonth(): Promise<string> {
  const rows = await query<{ month: string }>(
    `SELECT CASE
       WHEN date_trunc('month', MAX(issued_date)) = date_trunc('month', CURRENT_DATE)
       THEN (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date::text
       ELSE date_trunc('month', MAX(issued_date))::date::text
     END AS month
     FROM permits`
  );
  return rows[0]?.month ?? new Date().toISOString().slice(0, 10);
}

// --- queries ---

export async function fetchKpi(refMonth: string) {
  const [mtdRows, yoyRows, topBuilderRows] = await Promise.all([
    query<{ permit_count: string; total_value: string }>(
      `SELECT COUNT(*)::text AS permit_count,
              COALESCE(SUM(est_const_cost), 0)::text AS total_value
       FROM permits
       WHERE issued_date >= $1::date
         AND issued_date < ($1::date + INTERVAL '1 month')`,
      [refMonth]
    ),
    query<{ permit_count: string; total_value: string }>(
      `SELECT COUNT(*)::text AS permit_count,
              COALESCE(SUM(est_const_cost), 0)::text AS total_value
       FROM permits
       WHERE issued_date >= ($1::date - INTERVAL '12 months')
         AND issued_date < ($1::date - INTERVAL '11 months')`,
      [refMonth]
    ),
    query<{ name: string; count: string }>(
      `SELECT builder_name AS name, COUNT(*)::text AS count
       FROM permits
       WHERE issued_date >= $1::date
         AND issued_date < ($1::date + INTERVAL '1 month')
         AND builder_name IS NOT NULL AND builder_name <> ''
       GROUP BY builder_name ORDER BY COUNT(*) DESC LIMIT 1`,
      [refMonth]
    ),
  ]);

  const mtd = mtdRows[0];
  const yoy = yoyRows[0];

  return {
    ref_month: refMonth,
    permits_mtd: parseInt(mtd?.permit_count ?? '0', 10),
    permits_yoy: parseInt(yoy?.permit_count ?? '0', 10),
    value_mtd: parseFloat(mtd?.total_value ?? '0'),
    value_yoy: parseFloat(yoy?.total_value ?? '0'),
    top_builder: topBuilderRows[0]
      ? { name: topBuilderRows[0].name, count: parseInt(topBuilderRows[0].count, 10) }
      : null,
  };
}

export async function fetchActivity() {
  const rows = await query<{
    month: string;
    permit_type: string | null;
    permit_count: string;
    total_value: string;
  }>(
    `SELECT month::text, permit_type, permit_count::text, total_value::text
     FROM mv_monthly_permit_stats
     WHERE month >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
     ORDER BY month`
  );

  const emptyBucket = () => ({
    small_residential: 0,
    new_houses: 0,
    additions_alterations: 0,
    new_building: 0,
    plumbing: 0,
    hvac: 0,
    drain: 0,
    demolition: 0,
    other: 0,
    total_value: 0,
  });

  type Bucket = ReturnType<typeof emptyBucket> & { month: string };
  const buckets = new Map<string, Bucket>();

  for (const r of rows) {
    const m = r.month;
    if (!buckets.has(m)) {
      buckets.set(m, { month: m, ...emptyBucket() });
    }
    const b = buckets.get(m)!;
    const cat = mapPermitType(r.permit_type);
    const nums = b as unknown as Record<string, number>;
    nums[cat] = (nums[cat] || 0) + parseInt(r.permit_count, 10);
    b.total_value += parseInt(r.total_value, 10);
  }

  return Array.from(buckets.values());
}

export async function fetchTrades(refMonth: string) {
  const rows = await query<{
    name: string;
    slug: string;
    color: string;
    lead_count: string;
    lead_count_yoy: string;
  }>(
    `WITH direct_current AS (
       SELECT
         CASE permit_type
           WHEN 'Plumbing(PS)' THEN 'plumbing'
           WHEN 'Mechanical(MS)' THEN 'hvac'
           WHEN 'Demolition Folder (DM)' THEN 'demolition'
           WHEN 'Fire/Security Upgrade' THEN 'fire-protection'
           WHEN 'Drain and Site Service' THEN 'excavation'
         END AS trade_slug
       FROM permits
       WHERE permit_type IN ('Plumbing(PS)','Mechanical(MS)','Demolition Folder (DM)','Fire/Security Upgrade','Drain and Site Service')
         AND issued_date >= $1::date
         AND issued_date < ($1::date + INTERVAL '1 month')
     ),
     classified_current AS (
       SELECT t.slug AS trade_slug
       FROM permit_trades pt
       JOIN trades t ON t.id = pt.trade_id
       JOIN permits p ON p.permit_num = pt.permit_num AND p.revision_num = pt.revision_num
       WHERE p.issued_date >= $1::date
         AND p.issued_date < ($1::date + INTERVAL '1 month')
         AND p.permit_type NOT IN ('Plumbing(PS)','Mechanical(MS)','Demolition Folder (DM)','Fire/Security Upgrade','Drain and Site Service')
     ),
     current_month AS (
       SELECT trade_slug, COUNT(*)::int AS cnt
       FROM (SELECT trade_slug FROM direct_current UNION ALL SELECT trade_slug FROM classified_current) x
       GROUP BY trade_slug
     ),
     direct_yoy AS (
       SELECT
         CASE permit_type
           WHEN 'Plumbing(PS)' THEN 'plumbing'
           WHEN 'Mechanical(MS)' THEN 'hvac'
           WHEN 'Demolition Folder (DM)' THEN 'demolition'
           WHEN 'Fire/Security Upgrade' THEN 'fire-protection'
           WHEN 'Drain and Site Service' THEN 'excavation'
         END AS trade_slug
       FROM permits
       WHERE permit_type IN ('Plumbing(PS)','Mechanical(MS)','Demolition Folder (DM)','Fire/Security Upgrade','Drain and Site Service')
         AND issued_date >= ($1::date - INTERVAL '12 months')
         AND issued_date < ($1::date - INTERVAL '11 months')
     ),
     classified_yoy AS (
       SELECT t.slug AS trade_slug
       FROM permit_trades pt
       JOIN trades t ON t.id = pt.trade_id
       JOIN permits p ON p.permit_num = pt.permit_num AND p.revision_num = pt.revision_num
       WHERE p.issued_date >= ($1::date - INTERVAL '12 months')
         AND p.issued_date < ($1::date - INTERVAL '11 months')
         AND p.permit_type NOT IN ('Plumbing(PS)','Mechanical(MS)','Demolition Folder (DM)','Fire/Security Upgrade','Drain and Site Service')
     ),
     year_ago AS (
       SELECT trade_slug, COUNT(*)::int AS cnt
       FROM (SELECT trade_slug FROM direct_yoy UNION ALL SELECT trade_slug FROM classified_yoy) x
       GROUP BY trade_slug
     )
     SELECT t.name, t.slug, t.color,
       COALESCE(cm.cnt, 0)::text AS lead_count,
       COALESCE(ya.cnt, 0)::text AS lead_count_yoy
     FROM trades t
     LEFT JOIN current_month cm ON cm.trade_slug = t.slug
     LEFT JOIN year_ago ya ON ya.trade_slug = t.slug
     ORDER BY t.sort_order`,
    [refMonth]
  );

  return rows.map((r) => ({
    name: r.name,
    slug: r.slug,
    color: r.color,
    lead_count: parseInt(r.lead_count, 10),
    lead_count_yoy: parseInt(r.lead_count_yoy, 10),
  }));
}

export async function fetchResidentialVsCommercial() {
  const rows = await query<{
    month: string;
    residential: string;
    commercial: string;
    other: string;
  }>(
    `SELECT date_trunc('month', issued_date)::date::text AS month,
       COUNT(*) FILTER (WHERE 'residential' = ANY(scope_tags))::text AS residential,
       COUNT(*) FILTER (WHERE 'commercial' = ANY(scope_tags))::text AS commercial,
       COUNT(*) FILTER (WHERE NOT ('residential' = ANY(scope_tags) OR 'commercial' = ANY(scope_tags)))::text AS other
     FROM permits
     WHERE issued_date IS NOT NULL
       AND issued_date >= date_trunc('month', CURRENT_DATE - INTERVAL '23 months')
     GROUP BY 1 ORDER BY 1`
  );

  const all = rows.map((r) => ({
    month: r.month,
    residential: parseInt(r.residential, 10),
    commercial: parseInt(r.commercial, 10),
    other: parseInt(r.other, 10),
  }));

  const byMonth = new Map(all.map((r) => [r.month, r]));

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 11);
  cutoff.setDate(1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return all
    .filter((r) => r.month >= cutoffStr)
    .map((r) => {
      const d = new Date(r.month + 'T00:00:00');
      d.setFullYear(d.getFullYear() - 1);
      const yoyKey = d.toISOString().slice(0, 10);
      const yoy = byMonth.get(yoyKey);
      return {
        month: r.month,
        residential: r.residential,
        commercial: r.commercial,
        other: r.other,
        residential_yoy: yoy?.residential ?? 0,
        commercial_yoy: yoy?.commercial ?? 0,
      };
    });
}

export async function fetchScopeTagsSegmented(refMonth: string) {
  const [resRows, comRows] = await Promise.all([
    query<{ tag: string; permit_count: string; permit_count_yoy: string }>(
      `WITH current_tags AS (
         SELECT tag, COUNT(*)::int AS cnt
         FROM (SELECT unnest(scope_tags) AS tag FROM permits
           WHERE issued_date >= $1::date
           AND issued_date < ($1::date + INTERVAL '1 month')
           AND 'residential' = ANY(scope_tags)) t
         WHERE tag NOT IN ('residential', 'commercial')
         GROUP BY tag
       ),
       yoy_tags AS (
         SELECT tag, COUNT(*)::int AS cnt
         FROM (SELECT unnest(scope_tags) AS tag FROM permits
           WHERE issued_date >= ($1::date - INTERVAL '12 months')
           AND issued_date < ($1::date - INTERVAL '11 months')
           AND 'residential' = ANY(scope_tags)) t
         WHERE tag NOT IN ('residential', 'commercial')
         GROUP BY tag
       )
       SELECT COALESCE(c.tag, y.tag) AS tag,
         COALESCE(c.cnt, 0)::text AS permit_count,
         COALESCE(y.cnt, 0)::text AS permit_count_yoy
       FROM current_tags c
       FULL OUTER JOIN yoy_tags y ON y.tag = c.tag
       ORDER BY COALESCE(c.cnt, 0) DESC
       LIMIT 15`,
      [refMonth]
    ),
    query<{ tag: string; permit_count: string; permit_count_yoy: string }>(
      `WITH current_tags AS (
         SELECT tag, COUNT(*)::int AS cnt
         FROM (SELECT unnest(scope_tags) AS tag FROM permits
           WHERE issued_date >= $1::date
           AND issued_date < ($1::date + INTERVAL '1 month')
           AND 'commercial' = ANY(scope_tags)) t
         WHERE tag NOT IN ('residential', 'commercial')
         GROUP BY tag
       ),
       yoy_tags AS (
         SELECT tag, COUNT(*)::int AS cnt
         FROM (SELECT unnest(scope_tags) AS tag FROM permits
           WHERE issued_date >= ($1::date - INTERVAL '12 months')
           AND issued_date < ($1::date - INTERVAL '11 months')
           AND 'commercial' = ANY(scope_tags)) t
         WHERE tag NOT IN ('residential', 'commercial')
         GROUP BY tag
       )
       SELECT COALESCE(c.tag, y.tag) AS tag,
         COALESCE(c.cnt, 0)::text AS permit_count,
         COALESCE(y.cnt, 0)::text AS permit_count_yoy
       FROM current_tags c
       FULL OUTER JOIN yoy_tags y ON y.tag = c.tag
       ORDER BY COALESCE(c.cnt, 0) DESC
       LIMIT 15`,
      [refMonth]
    ),
  ]);

  const parse = (r: { tag: string; permit_count: string; permit_count_yoy: string }) => ({
    tag: r.tag,
    permit_count: parseInt(r.permit_count, 10),
    permit_count_yoy: parseInt(r.permit_count_yoy, 10),
  });

  return {
    residential: resRows.map(parse),
    commercial: comRows.map(parse),
  };
}

export async function fetchNeighbourhoods() {
  const rows = await query<{
    name: string;
    wealth_tier: string;
    permit_count: string;
    total_value: string;
    avg_income: string | null;
    tier_permit_count: string;
    tier_total_value: string;
    tier_permit_count_yoy: string;
    tier_total_value_yoy: string;
  }>(
    `WITH current_period AS (
       SELECT n.name, n.avg_household_income,
         CASE WHEN n.avg_household_income IS NULL THEN 'unknown'
              WHEN n.avg_household_income >= 100000 THEN 'high'
              WHEN n.avg_household_income >= 60000 THEN 'middle'
              ELSE 'low' END AS wealth_tier,
         COUNT(*)::int AS permit_count,
         COALESCE(SUM(p.est_const_cost), 0)::bigint AS total_value
       FROM permits p
       JOIN neighbourhoods n ON n.neighbourhood_id = p.neighbourhood_id
       WHERE p.issued_date >= CURRENT_DATE - INTERVAL '30 days'
         AND 'residential' = ANY(p.scope_tags)
       GROUP BY n.name, n.avg_household_income
     ),
     yoy_period AS (
       SELECT
         CASE WHEN n.avg_household_income IS NULL THEN 'unknown'
              WHEN n.avg_household_income >= 100000 THEN 'high'
              WHEN n.avg_household_income >= 60000 THEN 'middle'
              ELSE 'low' END AS wealth_tier,
         COUNT(*)::int AS permit_count,
         COALESCE(SUM(p.est_const_cost), 0)::bigint AS total_value
       FROM permits p
       JOIN neighbourhoods n ON n.neighbourhood_id = p.neighbourhood_id
       WHERE p.issued_date >= CURRENT_DATE - INTERVAL '395 days'
         AND p.issued_date < CURRENT_DATE - INTERVAL '365 days'
         AND 'residential' = ANY(p.scope_tags)
       GROUP BY 1
     ),
     tier_summary AS (
       SELECT wealth_tier, SUM(permit_count)::int AS permit_count,
              SUM(total_value)::bigint AS total_value
       FROM current_period GROUP BY wealth_tier
     )
     SELECT cp.name, cp.wealth_tier, cp.permit_count::text, cp.total_value::text,
            cp.avg_household_income::text AS avg_income,
            COALESCE(ts.permit_count, 0)::text AS tier_permit_count,
            COALESCE(ts.total_value, 0)::text AS tier_total_value,
            COALESCE(yp.permit_count, 0)::text AS tier_permit_count_yoy,
            COALESCE(yp.total_value, 0)::text AS tier_total_value_yoy
     FROM current_period cp
     JOIN tier_summary ts ON ts.wealth_tier = cp.wealth_tier
     LEFT JOIN yoy_period yp ON yp.wealth_tier = cp.wealth_tier
     ORDER BY cp.wealth_tier, cp.permit_count DESC`
  );

  const tierMap = new Map<string, {
    tier: WealthTier;
    label: string;
    permit_count: number;
    total_value: number;
    permit_count_yoy: number;
    total_value_yoy: number;
    top_neighbourhoods: { name: string; permit_count: number; total_value: number; avg_income: number }[];
  }>();

  for (const r of rows) {
    if (r.wealth_tier === 'unknown') continue;
    const tier = r.wealth_tier as WealthTier;
    if (!tierMap.has(tier)) {
      tierMap.set(tier, {
        tier,
        label: TIER_LABELS[tier],
        permit_count: parseInt(r.tier_permit_count, 10),
        total_value: parseFloat(r.tier_total_value),
        permit_count_yoy: parseInt(r.tier_permit_count_yoy, 10),
        total_value_yoy: parseFloat(r.tier_total_value_yoy),
        top_neighbourhoods: [],
      });
    }
    const group = tierMap.get(tier)!;
    if (group.top_neighbourhoods.length < 5) {
      group.top_neighbourhoods.push({
        name: r.name,
        permit_count: parseInt(r.permit_count, 10),
        total_value: parseFloat(r.total_value),
        avg_income: r.avg_income ? parseFloat(r.avg_income) : 0,
      });
    }
  }

  return TIER_ORDER.map((t) => tierMap.get(t) ?? {
    tier: t,
    label: TIER_LABELS[t],
    permit_count: 0,
    total_value: 0,
    permit_count_yoy: 0,
    total_value_yoy: 0,
    top_neighbourhoods: [],
  });
}
