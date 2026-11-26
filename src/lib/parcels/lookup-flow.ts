// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3 (API), §2.6 (a miss is a valid 200), §3.2 (the whitelist, the nullable `page`)
// SPEC LINK: docs/specs/00_engineering_standards.md §10.3 (API routes are thin: business logic belongs in src/lib)
//
// STD.ROUTE (task-383, Increment 1·B) · the lookup flow moved out of src/app/api/parcels/lookup/route.ts (lines moved, no behaviour change):
// resolve (direct id bypasses address parsing) -> the map read (only on the resolver's own seed) -> the lot's row and its payload -> the lot form -> the page
// (held for an unsure lot until semi=answered; else the stored read W, else the one-lot compute LOAD.1) -> the response -> the boundary parse.
// WHAT STAYS IN THE ROUTE (RR-0331, operator 2026-11-20 "2. y", MORNING-DECISIONS.md:1432: the report meter stays in the lookup route): auth, the entitlement
// gate, the query parse, the two rate buckets, the meter decision and its openReport call, the log line, the refusal mapping and the error boundary.
// This module imports no meter, entitlement or usage code and writes nothing; a thrown read or compute error propagates to the route's catch (a 500: no page, no meter).
// task-267 LOAD.2 (PLAN-267-v2 step 1; RR-0485 MD:2533; the 2026-11-25 phone walk, findings 22, 23, 30 and M1): the search only FINDS the lot. On the q form
// (findOnly) neither the stored read nor the compute runs and page is null; the report is read or computed once, on the parcelId read the pick opens.
// The fast read (fast=1, step 2) is the parcelId form that never computes: the stored page if there is one, else the What we checked view
// (readFastChecked below, which takes the route's db handle), else nothing. A failed checked read or an unusable checked view is null, never a 500; its
// problem is returned to the route, which logs it (this module still imports no logger).
// Prior text: the q form read the stored page and ran the compute too (lookup-flow.ts:79-90 at 2fd2f6042).
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
import { readWhatWeChecked } from '@/lib/parcels/what-we-checked';
import type { Queryable } from '@/lib/parcels/report-check-pace';
import { buildTree, viewOf } from '@/lib/surfaces/report/core';
import { reportCtx } from '@/lib/surfaces/report/data';
import { CheckedViewSchema, ConsumerParcelLookupResponseSchema, type CheckedView, type ConsumerParcelLookupResponse } from '@/app/api/parcels/lookup/types';

const MOBILE_TARGET = 'mobile';

/**
 * task-267 LOAD.2 (PLAN-267-v2 step 2; X-4 a): the What we checked view of one lot for the fast read. readWhatWeChecked (MF-62) gives the paced lines or null;
 * the core builds them into a loading tree and projects the mobile view with no skip href (no Skip is drawn, RR-0176), and only `checked` is sent. Any
 * failure (a core refusal, a shape the strict schema refuses, a thrown read) is null with its problem named for the route's log: this screen never fails a
 * lookup. A producer null (unknown lot, unusable pace) is null with no problem (readWhatWeChecked logs its own).
 */
export async function readFastChecked(db: Queryable, parcelRef: string): Promise<{ checked: CheckedView | null; problem: string | null }> {
  try {
    const w = await readWhatWeChecked(db, parcelRef);
    if (w === null) return { checked: null, problem: null };
    const view = viewOf(buildTree({ lifecycle: 'loading', what_we_checked: w }, reportCtx), { target: MOBILE_TARGET }, reportCtx) as { checked?: unknown };
    return { checked: CheckedViewSchema.parse(view.checked), problem: null };
  } catch (err) {
    return { checked: null, problem: err instanceof Error ? err.name : 'unknown' };
  }
}

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
  /** task-267: the fast read's checked-view problem (an error name, never content), for the route's log; null when none. */
  checkedProblem: string | null;
}

/** The query schema (ConsumerParcelLookupQuerySchema) guarantees exactly one of q | parcelId, so q is set whenever parcelId is not; this narrows the type without a non-null assertion. */
function requireQ(q: string | undefined): string {
  if (q === undefined) throw new Error('lookup-flow: neither q nor parcelId (the query schema guarantees one)');
  return q;
}

export async function runLookupFlow(input: {
  q?: string | undefined; parcelId?: string | undefined; semi?: string | undefined; candidateCap: number;
  /** task-267: the fast read (fast=1) with the route's db handle for the checked read; absent on every other read. */
  fast?: { db: Queryable } | undefined;
}): Promise<LookupFlowResult> {
  const { q, parcelId, semi, candidateCap, fast } = input;
  // task-267 (PLAN-267-v2 step 1): the q form only finds the lot; the stored read and the compute run on the parcelId form only.
  const findOnly = parcelId === undefined;
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
    whatWeChecked: null,
  };

  let parcelRef: string | null = null;
  let pageSource: 'stored' | 'computed' | 'none' = 'none';
  let computeMs: number | null = null;
  let checkedProblem: string | null = null;
  if (resolved.match) {
    const row = await fetchParcelById(resolved.match.parcelId);
    if (!row) {
      // An unknown parcelId (dangling id / direct path) is a 200 miss, NOT a 404 (§2.6).
      response = { match: null, candidates: [], warnings: [], parcel: null, resolution: 'no_match', map: null, page: null, lotForm: null, whatWeChecked: null };
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
      // task-267: findOnly (the q form) skips the stored read and the compute; the fast read skips the compute only.
      let pageResponse = held || findOnly ? null : await readCustomerPageResponse(parcelRef);
      if (pageResponse !== null) pageSource = 'stored';
      else if (!held && !findOnly && fast === undefined) {
        const c0 = Date.now();
        pageResponse = await computeCustomerPageResponse(parcelRef);
        computeMs = Date.now() - c0; // the time of a compute that ends in a miss is logged too (the slow case is the one to see)
        if (pageResponse !== null) pageSource = 'computed';
      }
      const page = pageResponse === null ? null : mobilePageView(pageResponse);
      // task-267: the fast read sends the checked view only for a lot that is not held and has no stored page (the lines play while the report read computes).
      const fastChecked = fast !== undefined && page === null && !held ? await readFastChecked(fast.db, parcelRef) : null;
      const whatWeChecked = fastChecked?.checked ?? null;
      checkedProblem = fastChecked?.problem ?? null;
      response = {
        match: { ...resolved.match, address: resolved.match.address || String(row.__display_address ?? '') },
        candidates: [],
        warnings,
        parcel: payload,
        resolution: 'unique',
        map: null,
        page,
        lotForm,
        whatWeChecked,
      };
    }
  }

  // Boundary validation of OUR OWN assembled shape — the .strict() parse rejects any Tier-3 leak. It runs BEFORE the meter (the route's), so a response
  // that fails it charges nothing (MF-45 fold 3).
  const body = ConsumerParcelLookupResponseSchema.parse(response);
  return { response, body, parcelRef, pageSource, computeMs, checkedProblem };
}
