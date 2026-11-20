# Pasted context for the BL-LOAD4 lenses (quotes the plan relies on; file:line given)

## Operator rulings
- Operator, verbatim (confirming the reading above): "yes that is correct"
- Operator, verbatim (answers to the three open Search questions: 1 the customer read module 1.3 (MB-44 W) placed after J9 in increment 8 by ONE-5; 2 what the loading screen shows when a lot's load fails; 3 where the web recent-search chips E.6 go): "1. it has to happen now - read the objectives 2. Add it as a task using the othr mini pages as a template 3. This can stay defferred for now"
(RR-0179 MORNING-DECISIONS.md:789; RR-0176 :785 and lines 780-786 'yes that is correct': the animation keeps its own length, always runs to completion, the button shows only when report AND See details are loaded, no 35 s cap)

## Design (small-pages-v8 build.mjs:803 and 814-817)
const wwcBar = { back: 'Lookup', title: WWC_ADDR, cls: 'addr' };
  { label: 'Could not load', bar: wwcBar, tab: 'lookup', note: 'The lookup failed or timed out. Error pattern from the copy glossary.', body: `
${stillImg('city', SCENE_ALT)}
<p class="err" role="alert">We couldn’t load this lot. Check your connection and try again.</p>
<div class="btns">${B('Try again', 'p')}${A('Back to Lookup', 'btn g')}</div>` },

## Built: mobile/app/(app)/parcel-tool/[parcelId].tsx
    20	  const router = useRouter();
    21	  const { parcelId, [SEMI_PARAM]: semi } = useLocalSearchParams<{ parcelId: string; semi?: string }>();
    22	  const semiParam = typeof semi === 'string' ? semi : undefined;
    23	  const { data, isError, isFetching, refetch } = useParcelLookup(parcelId, semiParam);
    24	  // SEMI-B (operator "semi ask a", 2026-11-13): an unsure lot (the doubt band of Spec 78 O-4) is asked the one question BEFORE the report shows. The
    25	  // redirect fires once, on the first settled data (Spec 99 §6.5), never on a background refetch; a `semi` param means it was answered, and an older
    26	  // server that sends no lotForm never asks. Clear semis and clear detached lots stay on the report.
    27	  const askedRef = useRef(false);
    28	  const ask = needsSemiQuestion(data, semiParam);
    29	  useEffect(() => {
    30	    if (isFetching || !ask || askedRef.current || !parcelId) return;
    31	    askedRef.current = true;
    32	    router.replace(semiQuestionRoute(parcelId));
    33	  }, [ask, isFetching, parcelId, router]);
    34	  // SRCH.METER-2 (task-360, UX-2c): the server holds an unsure lot's page (null) until the answer, so while the question is owed the screen shows the loading
    35	  // state, never the miss text, on the settled render before the redirect above fires.
    36	  const { view, lifecycle } = reportScreenState({ data: data && !ask ? { page: data.page ?? null } : undefined, isError });
    37	  const onRetry = useCallback(() => void refetch(), [refetch]);
    38	  const onBack = useCallback(() => (router.canGoBack() ? router.back() : router.replace(PARCEL_TAB_ROUTE.lookup)), [router]);
    39	  return <ReportPageHost view={view} lifecycle={lifecycle} content={REPORT_SLICE.content} onRetry={onRetry} onBack={onBack} />;
    40	}
## Built: ReportBinding.tsx 366-403
   366	/** A lifecycle state (no page view): the approved text, never a blank or the dash; loading adds a spinner. No new copy (D-6).
   367	 * MF-48 Stage B (operator 2026-11-12 "Ball y", B-4 b; DECISIONS L-2): the error state adds Retry, its text the approved "Try again" (the label is the
   368	 * text, so no accessibilityLabel of its own). */
   369	export function lifecycleProps(state: LifecycleState): PropsNode {
   370	  return node('View', { key: 'report-lifecycle', testID: `report-${state}`, className: L.lifecycle }, [
   371	    ...(state === 'loading' ? [node('ActivityIndicator', { key: 'spinner', testID: 'report-spinner', size: 'small', color: H.amber })] : []),
   372	    node('Text', { key: 'message', className: L.lifecycleText, accessibilityRole: 'text' }, [{ content: `states.lifecycle.${state}` }]),
   373	    ...(state === 'error'
   374	      ? [node('Button', { key: 'retry', testID: 'report-retry', className: L.retry, accessibilityRole: 'button', onPress: { action: 'retry' } }, [
   375	          node('Text', { key: 'retry-label', className: L.retryText }, [{ content: 'retry.text' }]),
   376	        ])]
   377	      : []),
   378	  ]);
   379	}
   380	
   381	/** MF-48 Stage B (nav-by-route audit #3, review F-11): the screen's one Back control, above the page and every lifecycle state, inside the top safe
   382	 * area. The screen decides where it goes (router.back() with history, else the Lookup route: the MF-53 rule). */
   383	export function backProps(): PropsNode {
   384	  return node('SafeAreaView', { key: 'report-top', className: L.top, edges: { top: 'additive' } }, [
   385	    node('Button', { key: 'back', testID: 'report-back', className: L.back, accessibilityRole: 'button', onPress: { action: 'back' } }, [
   386	      node('Text', { key: 'back-label', className: L.backText }, [{ content: 'back.text' }]),
   387	    ]),
   388	  ]);
   389	}
   390	
   391	/** The lifecycle content keys the host needs (report-presentation.json states.lifecycle): the screen passes their texts in. */
   392	export const LIFECYCLE_CONTENT_KEYS = ['states.lifecycle.loading', 'states.lifecycle.miss', 'states.lifecycle.error'];
   393	/** MF-48 Stage B: the screen's own content keys (mobile_parcel_detail.content.json): Retry and Back. */
   394	export const SCREEN_CONTENT_KEYS = ['retry.text', 'back.text'];
   395	
   396	/** MF-48 Stage B (D-6; Spec 99 §6.5: loading is a gate state, not data): the lot route's lookup query to the host's input. A served page shows,
   397	 * also from the persisted cache while a refetch fails (offline); a settled lookup with no page (every lot until MB-44, a miss, a dangling id) is
   398	 * the miss text; an error with nothing cached is the error text and Retry; anything else is loading. */
   399	export function reportScreenState(q: { data: { page?: PageView | null } | undefined; isError: boolean }): { view: PageView | null; lifecycle: LifecycleState } {
   400	  if (q.data?.page) return { view: q.data.page, lifecycle: 'loading' }; // the host ignores lifecycle when a view is given
   401	  if (q.data) return { view: null, lifecycle: 'miss' };
   402	  return { view: null, lifecycle: q.isError ? 'error' : 'loading' };
   403	}
## Built: useParcelLookup.ts 50-78
    50	
    51	// Skip retries for deterministic states: 400 (bad params), 403 (no subscription / deleted),
    52	// 429 (burning retries against the rate-limit compounds the throttle), schema-drift.
    53	export function shouldRetryParcelLookup(failureCount: number, err: unknown): boolean {
    54	  return (
    55	    !(err instanceof AccountDeletedError) &&
    56	    !(err instanceof RateLimitError) &&
    57	    !(err instanceof ApiError && (err.status === 400 || err.status === 403)) &&
    58	    !(err instanceof ParcelLookupSchemaError) &&
    59	    failureCount < 3
    60	  );
    61	}
    62	
    63	/**
    64	 * Debounced typeahead search. Fires when the trimmed query is ≥ 3 chars (the server min).
    65	 * The screen owns the ≥400ms debounce (Spec 100 §4); this hook just caches per query string.
    66	 */
    67	export function useParcelSearch(q: string) {
    68	  const trimmed = q.trim();
    69	  const accessToken = useAuthStore((s) => s.accessToken);
    70	  return useQuery({
    71	    queryKey: ['parcel-search', trimmed],
    72	    queryFn: () => fetchParcelLookup({ q: trimmed }),
    73	    enabled: trimmed.length >= 3 && !!accessToken,
    74	    staleTime: 60_000,
    75	    retry: shouldRetryParcelLookup,
    76	  });
    77	}
    78	
## Built: semiQuestion.ts 14-36
    14	
    15	/** SRCH.SEMI-3 (task-361, LX-E1): how long Continue waits for the answered lookup before it ends in the built error state (a timeframe; operator item in the lane report). */
    16	export const SEMI_CONTINUE_WAIT_MS = 60_000;
    17	
    18	class SemiContinueTimeoutError extends Error {
    19	  constructor() {
    20	    super('The answered lookup did not settle in time');
    21	    this.name = 'SemiContinueTimeoutError';
    22	  }
    23	}
    24	
    25	/** Resolves or rejects as `p` does, or rejects with SemiContinueTimeoutError after `ms`; the timer is cleared on either settle and a late settle of `p` is handled. */
    26	export function boundedWait<T>(p: Promise<T>, ms: number): Promise<T> {
    27	  return new Promise<T>((resolve, reject) => {
    28	    const timer = setTimeout(() => reject(new SemiContinueTimeoutError()), ms);
    29	    p.then(
    30	      (v) => { clearTimeout(timer); resolve(v); },
    31	      (e) => { clearTimeout(timer); reject(e); },
    32	    );
    33	  });
    34	}
    35	
    36	export const SEMI_QUESTION_STATES = ['loading', 'ask', 'error', 'redirect'] as const;
## Route src/app/api/parcels/lookup/route.ts 126-165 and 215-222
   126	    let computeMs: number | null = null;
   127	    if (resolved.match) {
   128	      const row = await fetchParcelById(resolved.match.parcelId);
   129	      if (!row) {
   130	        // An unknown parcelId (dangling id / direct path) is a 200 miss, NOT a 404 (§2.6).
   131	        response = { match: null, candidates: [], warnings: [], parcel: null, resolution: 'no_match', map: null, page: null, lotForm: null };
   132	      } else {
   133	        const nbhdId = row.neighbourhood_id == null ? null : Number(row.neighbourhood_id);
   134	        const coaProjects = await fetchCoaProjects(nbhdId); // NULL-neighbourhood → []
   135	        const { payload, warnings } = assembleConsumerPayload(row, coaProjects);
   136	        parcelRef = String(row.parcel_id);
   137	        // MF-48 Stage B (B-3 a): the report page view from the lot's producer response, through MF-57's core; null while no producer has the lot
   138	        // (every customer lot until MB-44). A core error throws to the catch below (500), never a half page.
   139	        // LOAD.1 (task-266, integrated with the board head): W first; on its miss the one-lot compute (the same pure core the pipeline step runs; no write). It answers null while the web
   140	        // live switch is off, for a lot with no Layer 2 stamp, and for no such parcel. A compute error throws to the catch below (500): no page, no meter.
   141	        // SEMI-B: the lot form from the view (one indexed read), so the app can ask the one question BEFORE the report shows when it is unsure.
   142	        const lotForm = await readLotForm(parcelRef);
   143	        // SRCH.METER-2 (task-360, RR-0278): an unsure lot's page is HELD until the semi answer (semi=answered, the task-319 flag): a page that is sent must be a page that
   144	        // is counted, so neither the stored read nor the compute runs for a held lot (the compute can take many seconds) and `page` is null; the meter below labels it
   145	        // semi_pending and the app asks the question. `unsure` is the server's own read of the view, never request text; the flag can only make the caller's own lot count.
   146	        const held = lotForm?.unsure === true && semi !== 'answered';
   147	        let pageResponse = held ? null : await readCustomerPageResponse(parcelRef);
   148	        if (pageResponse !== null) pageSource = 'stored';
   149	        else if (!held) {
   150	          const c0 = Date.now();
   151	          pageResponse = await computeCustomerPageResponse(parcelRef);
   152	          computeMs = Date.now() - c0; // the time of a compute that ends in a miss is logged too (the slow case is the one to see)
   153	          if (pageResponse !== null) pageSource = 'computed';
   154	        }
   155	        const page = pageResponse === null ? null : mobilePageView(pageResponse);
   156	        response = {
   157	          match: { ...resolved.match, address: resolved.match.address || String(row.__display_address ?? '') },
   158	          candidates: [],
   159	          warnings,
   160	          parcel: payload,
   161	          resolution: 'unique',
   162	          map: null,
   163	          page,
   164	          lotForm,
   165	        };
   215	    }
   216	
   217	    if (refusal) return refusal;
   218	    return ok(body);
   219	  } catch (cause) {
   220	    return internalError(cause, { route: 'GET /api/parcels/lookup' });
   221	  }
   222	});
## Triage drafts D-1 and D-4 (docs/reports/lanes/2026-11-19/BL-TRIAGE/REPORT.md:21-36)
D-1 When Continue fails on the semi page, what should the person see?
In plain words: a person answers the question, taps Continue, and the report check fails. Today: for a server error the banner and Try again return them to the question with their answer kept, and they tap Continue again (Try again does not resend); for "too many searches" or "no plan" they see a banner with no button and the answer cards gone, and only Back is left. Option A: leave as built. Option B: every failure keeps the answer cards visible under the banner so Continue can be tapped again, and Try again resends the answered lookup for a server error.
Grounded: semiQuestion.ts:46-50 (any error hides the answers), SemiQuestionBinding.tsx:50-65 (retry only in the unexpected branch), semi-question.tsx retry handler; the approved mock draws the 429 and 403 states with no button (semi-question.html:314-330) but draws no failed-Continue state; lens run LX-C1/LX-U3; seat UX-3.
Recommendation: B. A person who has answered should not be sent back to re-pick the lot because one request failed; cost: one binding rule and goldens for the state; the 429/403 banners keep their wording. UNVERIFIED: not shown on a device.
D-2 Search page order: should the legal line sit below the recent searches as v8 draws?
In plain words: built, the small print "This is an estimate..." sits right under the reports-left line and above the recent-search chips; v8 draws chips first, then the small print at the bottom. The outside-Toronto notice is already ruled to stay (RR-0314) in its own place.
Grounded: SearchBinding.tsx:231-238 (header, pill, reports left, legal, chips, notices) against small-pages-v8 search.html:320-323 (recents then legal); RR-0314 answers only the line-versus-notice question (task-352 Q3).
Recommendation: follow v8 (move the legal line below the chips): v8 is the product standard and the move is one list position in the mobile and web bindings plus 23 goldens by script. UNVERIFIED size.
D-3 Who builds the step that makes a report count once pages are served? (review r1 CRITICAL 1)
In plain words: today no lot is ever charged and the "6 of 10 reports left" line never moves, even after real reports exist, because the count is tied to a cost menu the server never sends. Someone has to connect the served report to the meter before the live switch flips. Answer A: one new build task in Increment 1·B (read the evaluated option from the served page). Answer B: fold it into task-123 stage 2 or task-285 (L.7), whichever lands the page.
Grounded: route.ts:163; consumer-lookup.ts:62-70, :161; pin parcels-lookup-page.logic.test.ts:165-182; no task text carries it (git grep of backlog/tasks, backlog/docs, .cursor for hasEvaluatedOption, evaluated option, costMenu: only .cursor/MCBYLAWS-QUEUE.md); operator ruling "1 b 2 a" MCBYLAWS-QUEUE.md:709.
Recommendation: A: a small task of its own keeps W's stage 2 unchanged and is testable (a stub parcel with a costMenu total counts; without stays not_evaluated). Must land before task-287 (note added there). UNVERIFIED size.
D-4 Who builds the limit wall and the split of the two 403 refusals? (UX-1)
In plain words: a person who has used every report and taps a lot is told their subscription is off and given a Retry that cannot work; the designed "you have reached your limit, resets on 9 Dec" page does not exist. It only matters once counting works (D-3).
Grounded: error-mapping.ts:37; parcelSearchMatch.ts:295-300 (every 403 is the subscription notice); ReportBinding.tsx:373-377 (Retry on error); design small-pages-v8/report-limit.html:286-310; task-343 R17 and R18 lines (tied up by NONE); task-351 gives the date label.
Recommendation: one McFrontend build task for the wall with the server's Toronto-time date label (RR-0310), before launch; ordering: after D-3. UNVERIFIED size.
## Binding mapping mobile (scripts/surfaces/_schema/bindings.json)
{"SEARCH":["SafeAreaView","ScrollView","View","Text","Input","Button","Alert","AlertDescription","Icon","ActivityIndicator"],"REPORT":["ScrollView","View","Text","Button","Input","ActivityIndicator","SafeAreaView","Svg","SvgPolygon","SvgLine"],"LIST":["SafeAreaView","ScrollView","View","Text","Button","Alert","AlertDescription","Icon","ActivityIndicator","MapView","Polygon","Marker"],"REPORT_HOST":["View","SurfaceRenderer","BottomSheet","BottomSheetView","BottomSheetBackdrop"]}
