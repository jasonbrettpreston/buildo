// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 4-6 (dated notes 2026-11-10), §11a.10
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-22 (targeting only on declared database keys)
//            docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §13 (Zod at the boundary)
//
// MF-40 · the admin placements contract, read from scripts/surfaces/_schema/placements-contract.json (ONE home for the three request schemas
// and the limit key names). The validators are built from the request schemas with z.fromJSONSchema (the media precedent). The rules a flat
// schema cannot say are applied here, each reading its own one home: which targeting keys a placement accepts (report-presentation.json
// ad_placements[].targeting), the scenario_card pair (ad-contract.json scenario_fields), the flight order and the horizon (a logic variable).

import { z } from 'zod';
import type { Queryable } from '@/lib/entitlements';
import contractJson from '../../../scripts/surfaces/_schema/placements-contract.json';
import adContractJson from '../../../scripts/surfaces/_schema/ad-contract.json';
import presentationJson from '../../../scripts/surfaces/_schema/report-presentation.json';
import seedJson from '../../../scripts/seeds/logic_variables.json';

type JsonSchemaNode = Record<string, unknown> & { properties?: Record<string, Record<string, unknown>> };

export interface PlacementsContract {
  limits: { default_flight_days: string; max_horizon_days: string };
  offer_request: JsonSchemaNode;
  toggle_request: JsonSchemaNode;
  advertiser_request: JsonSchemaNode;
}
export const CONTRACT = contractJson as unknown as PlacementsContract;
const AD = adContractJson as { slots: string[]; scenario_fields: Record<string, string>; targeting_keys: Record<string, string> };
const PLACEMENTS = (presentationJson as { ad_placements: { placements: Array<{ key: string; max_slots: number; targeting: string[] }> } }).ad_placements.placements;

/** The two targeting fields the offer form carries (zone_class waits for the serving row, trim 1). */
export const TARGETING_FIELDS = ['building_type', 'design_option'] as const;
export type TargetingField = (typeof TARGETING_FIELDS)[number];

/** MF-42's keyword subset (the same set as src/lib/media/contract.ts). */
const ALLOWED_SCHEMA_KEYWORDS: ReadonlySet<string> = new Set([
  'type', 'properties', 'required', 'enum', 'const', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern', 'additionalProperties', '$comment',
]);
export function schemaKeywordViolations(node: JsonSchemaNode, at = '#'): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (!ALLOWED_SCHEMA_KEYWORDS.has(key)) out.push(`${at}: ${key}`);
    if (key === 'additionalProperties' && value !== false) out.push(`${at}: additionalProperties must be false`);
  }
  for (const [name, child] of Object.entries(node.properties ?? {})) out.push(...schemaKeywordViolations(child as JsonSchemaNode, `${at}/properties/${name}`));
  return out;
}

const sorted = (xs: unknown[]): string => JSON.stringify([...xs].map(String).sort());
/** The join of the literal enums to their one homes, both ways (the join lock reads this). */
export function contractJoinProblems(c: PlacementsContract): string[] {
  const out: string[] = [];
  const props = c.offer_request.properties ?? {};
  const slots = (props.placement_key?.enum ?? []) as string[];
  if (sorted(slots) !== sorted(AD.slots)) out.push(`placement_key enum ${sorted(slots)} differs from ad-contract slots ${sorted(AD.slots)}`);
  if (sorted(slots) !== sorted(PLACEMENTS.map((p) => p.key))) out.push(`placement_key enum differs from report-presentation ad_placements keys`);
  const types = (props.building_type?.enum ?? []) as string[];
  const options = (props.design_option?.enum ?? []) as string[];
  const pairs = types.flatMap((t) => options.map((o) => `${t}/${o}`));
  if (sorted(pairs) !== sorted(Object.keys(AD.scenario_fields))) out.push(`building_type x design_option ${sorted(pairs)} differs from the scenario_fields keys`);
  const known = new Set(['offer_id', 'updated_at', 'placement_key', 'advertiser_id', 'creative_text', 'flight_start', 'flight_end', ...TARGETING_FIELDS]);
  for (const name of Object.keys(props)) {
    if (name in AD.targeting_keys && !(TARGETING_FIELDS as readonly string[]).includes(name)) out.push(`targeting field ${name} is deferred to the serving row`);
    else if (!known.has(name)) out.push(`offer_request field ${name} is not a declared offer column or targeting key (FE-22: no income or user-entered key)`);
  }
  for (const t of TARGETING_FIELDS) if (!(t in AD.targeting_keys)) out.push(`${t} is not an ad-contract targeting key`);
  return out;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export interface OfferBody {
  offer_id: string;
  updated_at?: string;
  placement_key: string;
  advertiser_id: string;
  building_type?: string;
  design_option?: string;
  creative_text: string;
  flight_start?: string;
  flight_end?: string;
}
export interface ToggleBody { offer_id: string; updated_at: string; active: boolean }
export interface AdvertiserBody { advertiser_id: string; name: string }

const fromSchema = <T>(s: JsonSchemaNode): z.ZodType<T> => z.fromJSONSchema(s as Parameters<typeof z.fromJSONSchema>[0]) as unknown as z.ZodType<T>;
export const offerValidator = fromSchema<OfferBody>(CONTRACT.offer_request);
export const toggleValidator = fromSchema<ToggleBody>(CONTRACT.toggle_request);
export const advertiserValidator = fromSchema<AdvertiserBody>(CONTRACT.advertiser_request);

export type OfferRuleCode = 'TARGETING_NOT_ALLOWED' | 'SCENARIO_REQUIRED' | 'SCENARIO_UNKNOWN' | 'INVALID_DATE' | 'FLIGHT_ORDER' | 'FLIGHT_BEYOND_HORIZON';
export interface OfferRuleProblem { code: OfferRuleCode; message: string }

/** YYYY-MM-DD as that day's 00:00 UTC, or null when the text is not a real calendar day. */
export function dayOf(s: string): Date | null {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

/** The rules the flat schema cannot say. An empty list is a pass; each problem carries the 400 code the route returns. */
export function offerRuleProblems(b: OfferBody, o: { maxHorizonDays: number; now: Date }): OfferRuleProblem[] {
  const out: OfferRuleProblem[] = [];
  const placement = PLACEMENTS.find((p) => p.key === b.placement_key);
  const allowed = new Set(placement?.targeting ?? []);
  for (const t of TARGETING_FIELDS) {
    if (b[t] !== undefined && !allowed.has(t)) out.push({ code: 'TARGETING_NOT_ALLOWED', message: `${b.placement_key} does not accept ${t} targeting` });
  }
  if (b.placement_key === 'scenario_card') {
    if (b.building_type === undefined || b.design_option === undefined) out.push({ code: 'SCENARIO_REQUIRED', message: 'A scenario_card offer needs a building type and a design option' });
    else if (!(`${b.building_type}/${b.design_option}` in AD.scenario_fields)) out.push({ code: 'SCENARIO_UNKNOWN', message: `${b.building_type}/${b.design_option} is not a report scenario` });
  }
  const start = b.flight_start === undefined ? undefined : dayOf(b.flight_start);
  const end = b.flight_end === undefined ? undefined : dayOf(b.flight_end);
  if (start === null || end === null) {
    out.push({ code: 'INVALID_DATE', message: 'A flight date is not a calendar day' });
    return out;
  }
  if (start && end && end < start) out.push({ code: 'FLIGHT_ORDER', message: 'The flight ends before it starts' });
  if (end && end.getTime() > o.now.getTime() + o.maxHorizonDays * 86_400_000) out.push({ code: 'FLIGHT_BEYOND_HORIZON', message: `The flight ends more than ${o.maxHorizonDays} days from now` });
  return out;
}

// ---------------------------------------------------------------------------
// Limits (logic_variables, keys named by the contract)
// ---------------------------------------------------------------------------

/** The two Admin Placements keys, spelled out so the R-EO variable-effect scan sees them read here; they must equal the contract's limits. */
export const LIMIT_KEYS = {
  default_flight_days: 'admin_placement_default_flight_days',
  max_horizon_days: 'admin_placement_max_horizon_days',
} as const;
if (JSON.stringify(LIMIT_KEYS) !== JSON.stringify(CONTRACT.limits)) {
  throw new Error('placements-contract.json limits differ from LIMIT_KEYS in src/lib/placements/contract.ts');
}
export interface PlacementLimits { default_flight_days: number; max_horizon_days: number }

export class PlacementLimitsError extends Error {
  constructor(readonly bad: string[]) {
    super(`logic_variables missing, non-numeric or outside the seed bounds: ${bad.join(', ')}`);
    this.name = 'PlacementLimitsError';
  }
}

const SEED_BOUNDS = Object.fromEntries(Object.values(LIMIT_KEYS).map((k) => {
  const s = (seedJson as unknown as Record<string, { min?: number; max?: number; default?: number }>)[k];
  if (!s || typeof s.min !== 'number' || typeof s.max !== 'number' || typeof s.default !== 'number') throw new Error(`logic_variables seed has no bounds for ${k}`);
  return [k, { min: s.min, max: s.max, default: s.default }];
})) as Record<string, { min: number; max: number; default: number }>;

/**
 * Reads the two limits (migration 302). max_horizon_days is write-affecting (descriptor on_invalid fail): a missing or out-of-bounds value
 * throws. default_flight_days only pre-fills a field the admin confirms (on_invalid default): a bad value falls back to the seed default.
 */
export async function readPlacementLimits(db: Queryable): Promise<PlacementLimits> {
  const res = await db.query<{ variable_key: string; variable_value: string | number | null }>(
    'SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1::text[])',
    [Object.values(LIMIT_KEYS)],
  );
  const byKey = new Map(res.rows.map((r) => [r.variable_key, Number(r.variable_value)]));
  const ok = (k: string): boolean => {
    const v = byKey.get(k);
    const b = SEED_BOUNDS[k] as { min: number; max: number };
    return v !== undefined && Number.isInteger(v) && v >= b.min && v <= b.max;
  };
  if (!ok(LIMIT_KEYS.max_horizon_days)) throw new PlacementLimitsError([LIMIT_KEYS.max_horizon_days]);
  return {
    max_horizon_days: byKey.get(LIMIT_KEYS.max_horizon_days) as number,
    default_flight_days: ok(LIMIT_KEYS.default_flight_days)
      ? (byKey.get(LIMIT_KEYS.default_flight_days) as number)
      : (SEED_BOUNDS[LIMIT_KEYS.default_flight_days] as { default: number }).default,
  };
}
