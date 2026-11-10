// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.10 (ad slots beside or after a card, never inside), 11a.7 (goldens)
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-23 (ad slots: own source, the Sponsored disclosure, never in a card)
//            docs/specs/02-web-admin/128_surface_standard_policy.md R-17, R-34
//
// MF-40 · the saved-offer preview (plan section 12 fold 1; trim 3: the saved draft on its own page, through the real renderer, not as you
// type). Pure: it takes the landed synthetic golden `ad_slot_present` response, empties every ad field, writes the saved offer's text into the
// ONE field its placement owns (the scenario_fields name for scenario_card; the slot's own field otherwise), optionally swaps in the
// `not_permitted` golden's status, then runs the landed buildTree and viewOf. The renderer, not this module, adds the Sponsored label and
// decides beside-card or after-card and whether a scenario ad survives a not-permitted card. No new component and no maths.
import { buildTree, viewOf, type ReportView } from '@/lib/surfaces/report/core';
import { reportCtx } from '@/lib/surfaces/report/data';
import adPresent from '../../tests/fixtures/surfaces/report/ad_slot_present.web.json';
import notPermitted from '../../tests/fixtures/surfaces/report/not_permitted.web.json';

type Json = Record<string, unknown>;
type AdContract = { slots: string[]; scenario_fields: Record<string, string> };
const AD = reportCtx.adContract as unknown as AdContract;

export type PreviewBase = 'permitted' | 'not_permitted';
export const PREVIEW_BASES: PreviewBase[] = ['permitted', 'not_permitted'];
export interface PreviewOffer { placement_key: string; building_type: string | null; design_option: string | null; creative_text: string }

/** The response field that carries this offer's slot, and the scenario its card belongs to (null for a non-scenario slot). */
export function slotFieldOf(o: PreviewOffer): { field: string; scenario: string | null } {
  if (o.placement_key === 'scenario_card') {
    const scenario = `${o.building_type ?? ''}/${o.design_option ?? ''}`;
    const field = AD.scenario_fields[scenario];
    if (!field) throw new Error(`preview: ${scenario} is not a report scenario`);
    return { field, scenario };
  }
  if (!AD.slots.includes(o.placement_key)) throw new Error(`preview: ${o.placement_key} is not an ad slot`);
  return { field: o.placement_key, scenario: null };
}

/** Every ad field of the base response (the slot fields and the scenario fields). */
const AD_FIELDS = new Set([...AD.slots.filter((s) => s !== 'scenario_card'), ...Object.values(AD.scenario_fields)]);

/** The response the preview renders: the synthetic base with only this offer's ad. */
export function previewResponse(o: PreviewOffer, base: PreviewBase): Json {
  const src = (adPresent as unknown as { response_fixture: Json }).response_fixture;
  const { field } = slotFieldOf(o);
  if (!(field in src)) throw new Error(`preview: the base response has no field ${field}`);
  const out: Json = {};
  for (const [k, v] of Object.entries(src)) out[k] = AD_FIELDS.has(k) ? null : v;
  out[field] = o.creative_text;
  if (base === 'not_permitted') out.status = (notPermitted as unknown as { response_fixture: Json }).response_fixture.status;
  return out;
}

/** The rendered view of one saved offer on one base (web target). Throws ReportRenderError on a renderer refusal. */
export function previewView(o: PreviewOffer, base: PreviewBase): ReportView {
  const { scenario } = slotFieldOf(o);
  const tree = buildTree(previewResponse(o, base), reportCtx);
  return viewOf(tree, { scenario, target: 'web' }, reportCtx) as ReportView;
}
