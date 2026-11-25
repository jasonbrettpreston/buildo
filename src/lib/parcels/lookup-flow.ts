// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3 (API), §2.6 (a miss is a valid 200), §3.2 (the whitelist, the nullable `page`)
// SPEC LINK: docs/specs/00_engineering_standards.md §10.3 (API routes are thin: business logic belongs in src/lib)
//
// STD.ROUTE (task-383, Increment 1·B) · the lookup flow moved out of src/app/api/parcels/lookup/route.ts (lines moved, no behaviour change):
// resolve (direct id bypasses address parsing) -> the map read (only on the resolver's own seed) -> the lot's row and its payload -> the lot form -> the page
// (held for an unsure lot until semi=answered; else the stored read W, else the one-lot compute LOAD.1) -> the response -> the boundary parse.
// WHAT STAYS IN THE ROUTE (RR-0331, operator 2026-11-20 "2. y", MORNING-DECISIONS.md:1432: the report meter stays in the lookup route): auth, the entitlement
// gate, the query parse, the two rate buckets, the meter decision and its openReport call, the log line, the refusal mapping and the error boundary.
// This module imports no meter, entitlement or usage code and writes nothing; a thrown read or compute error propagates to the route's catch (a 500: no page, no meter).
// The raw q is never logged here or returned beyond the resolver's own fields (Spec 100 §2.8).
// task-454 SEARCHFIX.6 (MORNING-DECISIONS.md:1494; Spec 128 Rule 3): the route reads the search settings once (readSearchSettings, re-exported here so
// the route keeps importing no resolver module) and passes the candidate cap in; this module reads no setting.
import { resolveAddress, fetchParcelById, fetchCoaProjects } from '@/lib/admin/parcel-lookup';
export { readSearchSettings } from '@/lib/admin/parcel-lookup';
import { assembleConsumerPayload, assembleLotMap } from '@/lib/parcels/consumer-lookup';
import { resolveLotMap } from '@/lib/parcels/lot-map';
import { readLotForm } from '@/lib/parcels/lot-form';
import { mobilePageView, readCustomerPageResponse } from '@/lib/parcels/report-page';
import { computeCustomerPageResponse } from '@/lib/parcels/report-compute';
import { ConsumerParcelLookupResponseSchema, type ConsumerParcelLookupResponse } from '@/app/api/parcels/lookup/types';

export interface LookupFlowResult {
  /** The assembled response before the boundary parse (the route logs from it, as before). */
  response: ConsumerParcelLookupResponse;
  /** The same shape after the .strict() boundary parse: what the route sends. A parse failure throws, before the meter. */
  body: ConsumerParcelLookupResponse;
  /** The matched parcels.parcel_id of the fetched row: the meter's subject_key (R-04 parcel_ref), never request text. Null on a miss. */
  parcelRef: string | null;
  /** LOAD.1: where the page came from (logged, never its content). */
  pageSource: 'stored' | 'computed' | 'none';
  /** LOAD.1: the compute entry's time when it ran (a compute that ends in a miss is timed too), null when W served the page or the lot was held. */
  computeMs: number | null;
}

/** The query schema (ConsumerParcelLookupQuerySchema) guarantees exactly one of q | parcelId, so q is set whenever parcelId is not; this narrows the type without a non-null assertion. */
function requireQ(q: string | undefined): string {
  if (q === undefined) throw new Error('lookup-flow: neither q nor parcelId (the query schema guarantees one)');
  return q;
}

export async function runLookupFlow(input: { q?: string | undefined; parcelId?: string | undefined; semi?: string | undefined; candidateCap: number }): Promise<LookupFlowResult> {
  const { q, parcelId, semi, candidateCap } = input;
  // Resolution: direct id (candidate click) bypasses address parsing.
  const resolved = parcelId
    ? { match: { parcelId, matchType: 'direct' as const, address: '' }, candidates: [], truncated: false, resolution: 'unique' as const, lotMap: null }
    : await resolveAddress(requireQ(q), { classifyUnlinked: true, matchMistyped: true, candidateCap });

  // The map read runs only on the resolver's own seed (never on the parcelId path).
  const map = resolved.lotMap ? assembleLotMap(await resolveLotMap(resolved.lotMap)) : null;

  let response: ConsumerParcelLookupResponse = {
    match: resolved.match,
    candidates: resolved.candidates,
    warnings: resolved.truncated ? ['more matches exist — refine the address (e.g. add a unit number)'] : [],
    parcel: null,
    resolution: resolved.resolution,
    map,
    page: null,
    lotForm: null,
  };

  let parcelRef: string | null = null;
  let pageSource: 'stored' | 'computed' | 'none' = 'none';
  let computeMs: number | null = null;
  if (resolved.match) {
    const row = await fetchParcelById(resolved.match.parcelId);
    if (!row) {
      // An unknown parcelId (dangling id / direct path) is a 200 miss, NOT a 404 (§2.6).
      response = { match: null, candidates: [], warnings: [], parcel: null, resolution: 'no_match', map: null, page: null, lotForm: null };
    } else {
      const nbhdId = row.neighbourhood_id == null ? null : Number(row.neighbourhood_id);
      const coaProjects = await fetchCoaProjects(nbhdId); // NULL-neighbourhood → []
      const { payload, warnings } = assembleConsumerPayload(row, coaProjects);
      parcelRef = String(row.parcel_id);
      // MF-48 Stage B (B-3 a): the report page view from the lot's producer response, through MF-57's core; null while no producer has the lot.
      // LOAD.1 (task-266): W first; on its miss the one-lot compute (the same pure core the pipeline step runs; no write). It answers null while the web
      // live switch is off, for a lot with no Layer 2 stamp, and for no such parcel. A compute error throws to the route's catch (500): no page, no meter.
      // SEMI-B: the lot form from the view (one indexed read), so the app can ask the one question BEFORE the report shows when it is unsure.
      const lotForm = await readLotForm(parcelRef);
      // SRCH.METER-2 (task-360, RR-0278): an unsure lot's page is HELD until the semi answer (semi=answered, the task-319 flag): neither the stored read nor
      // the compute runs for a held lot (the compute can take many seconds) and `page` is null. `unsure` is the server's own read of the view, never request text.
      const held = lotForm?.unsure === true && semi !== 'answered';
      let pageResponse = held ? null : await readCustomerPageResponse(parcelRef);
      if (pageResponse !== null) pageSource = 'stored';
      else if (!held) {
        const c0 = Date.now();
        pageResponse = await computeCustomerPageResponse(parcelRef);
        computeMs = Date.now() - c0; // the time of a compute that ends in a miss is logged too (the slow case is the one to see)
        if (pageResponse !== null) pageSource = 'computed';
      }
      const page = pageResponse === null ? null : mobilePageView(pageResponse);
      response = {
        match: { ...resolved.match, address: resolved.match.address || String(row.__display_address ?? '') },
        candidates: [],
        warnings,
        parcel: payload,
        resolution: 'unique',
        map: null,
        page,
        lotForm,
      };
    }
  }

  // Boundary validation of OUR OWN assembled shape — the .strict() parse rejects any Tier-3 leak. It runs BEFORE the meter (the route's), so a response
  // that fails it charges nothing (MF-45 fold 3).
  const body = ConsumerParcelLookupResponseSchema.parse(response);
  return { response, body, parcelRef, pageSource, computeMs };
}
