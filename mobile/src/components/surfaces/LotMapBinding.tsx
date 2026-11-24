// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST archetype, `render.projection: map`), §11b.2 (one binding per
//            archetype per platform; refs only) and its dated note 2026-11-10 (the binding standard), §11b.7 A3 (dated note 2026-11-11),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (no maths here), FE-18, FE-31, FE-32,
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-11, MF-53).
//
// MF-53 · the mobile LIST binding with the map projection (props half), S-071 `mobile_parcel_disambiguation_map`, the "choose your lot" page.
// Pure: no React, no JSX. `lotMapProps(situation)` maps one render situation (mobile/src/lib/lotMap.ts) to a props tree; that tree IS the
// golden (src/tests/fixtures/surfaces/mobile_parcel_disambiguation_map/<state>.mobile.json). Every displayed value is a ref:
//   {"content": k}    a key of mobile_parcel_disambiguation_map.content.json (through the generated slice);
//   {"contract": p}   a path in the lookup response's map block (`contract_parcels_lookup.map.lots.<i>.area`) or a 429 detail;
//   {"derived": n}    a value reshaped on the client by lotMap.ts (the closed list LOT_MAP_DERIVED_NAMES; P35-D14 a form).
// The map parts are react-native-maps' own (MapView, Polygon, Marker) configured by props: no hand-built component. The map is hidden from
// screen readers (the cards below are the accessible list of the same lots) and never animates (reduce motion: initialRegion only).
// Classes, hexes and numbers come from the layout table (mobile/src/constants/lotMap.ts). FE-05: no numeric literal but 0 and 1, no arithmetic.
import slice from '@/generated/surfaces/mobile_parcel_disambiguation_map.json';
import {
  LOT_MAP_BOTTOM_PADDING,
  LOT_MAP_HEX as H,
  LOT_MAP_LAYOUT as L,
  LOT_MAP_SIZES as Z,
  LOT_MAP_STYLE,
} from '@/constants/lotMap';
import { SEARCH_MAX_WIDTH } from '@/constants/parcelSearch';
import type { LotMapSituation } from '@/lib/lotMap';
import type { Child, PropsNode, Ref } from '@/components/surfaces/SearchBinding';

/** The generated slice: the content strings (scripts/surfaces/emit-mobile-surfaces.mjs). */
export const LOT_MAP_SLICE: { surface: string; config: Record<string, number>; content: Record<string, string> } = slice;

/** The closed list of derived names (patterns), declared in the S-071 deviation entry. */
export const LOT_MAP_DERIVED_NAMES = [
  /^query$/, /^lot_count$/, /^region$/, /^pin$/, /^map_style$/, /^letter\.(0|[1-9][0-9]*)$/, /^lots\.(0|[1-9][0-9]*)\.marker$/,
  /^lots\.(0|[1-9][0-9]*)\.polygons\.(0|[1-9][0-9]*)\.(coordinates|holes)$/,
];

const CONTRACT = 'contract_parcels_lookup';
const content = (key: string): Ref => ({ content: key });
const contract = (p: string): Ref => ({ contract: `${CONTRACT}.${p}` });
const derived = (name: string): Ref => ({ derived: name });
const node = (component: string, props: Record<string, unknown>, children: Child[] = []): PropsNode => ({ component, props, children });
/** A lot fact that may be null: the contract value, else the content null value (never "0", never blank). SEARCHFIX.3 (task-451, RR-0444 2c): the null value
 *  reads "Not available"; the server sends a null area for an implausible lot size (src/lib/parcels/consumer-lookup.ts, LOT_SIZE_PLAUSIBLE_M2). */
const fact = (value: string | null, path: string): Ref => (value === null ? content('lot.null') : contract(path));

const pill = (): PropsNode =>
  node('View', { key: 'pill', className: L.pill }, [
    node('Icon', { key: 'search-icon', icon: 'Search', size: Z.icon, color: H.icon }),
    node('Text', { key: 'query', testID: 'parcel-lotmap-query', className: L.pillText, numberOfLines: 1 }, [derived('query')]),
    node('Button', {
      key: 'clear',
      testID: 'parcel-lotmap-clear',
      variant: 'ghost',
      size: 'icon',
      className: L.clear,
      accessibilityRole: 'button',
      accessibilityLabel: content('map.clear.label'),
      onPress: { action: 'back' },
    }, [node('Icon', { key: 'clear-icon', icon: 'X', size: Z.icon, color: H.icon })]),
  ]);

const notice = (key: string, icon: string, iconClassName: string, children: Child[], className: string = L.notice): PropsNode =>
  node('Alert', { key, testID: `parcel-lotmap-${key}`, icon, iconClassName, className }, children as PropsNode[]);

const errorNotices = (s: LotMapSituation): PropsNode[] => [
  ...(s.errors.rateLimited
    ? [notice('ratelimit', 'AlertTriangle', L.noticeIcon, [node('AlertDescription', { key: 'ratelimit-text', className: L.noticeText }, [
      { text: content('state.ratelimit'), vars: { seconds: contract('errors.429.retryAfterSeconds') } },
    ])], L.noticeError)]
    : []),
  ...(s.errors.entitlement
    ? [notice('entitlement', 'Lock', L.noticeIconNeutral, [node('AlertDescription', { key: 'entitlement-text', className: L.noticeTextNeutral }, [content('state.entitlement')])])]
    : []),
  ...(s.errors.unexpected
    ? [notice('error', 'AlertTriangle', L.noticeIcon, [
      node('AlertDescription', { key: 'error-text', className: L.noticeText }, [content(s.errors.schemaDrift ? 'state.schema_drift' : 'state.error')]),
      ...(s.errors.schemaDrift ? [] : [node('Button', {
        key: 'retry',
        testID: 'parcel-lotmap-retry',
        variant: 'default',
        className: L.retry,
        accessibilityRole: 'button',
        accessibilityLabel: content('retry.label'),
        onPress: { action: 'retry' },
      }, [node('Text', { key: 'retry-text', className: L.retryText }, [content('retry.text')])])]),
    ], L.noticeError)]
    : []),
];

/** The Help & Support topic of every link on this page (doc-2 B.7, "to /help?topic=wrong-lot"; the Help page has it since task-450). */
const HELP_TOPIC = 'wrong-lot';

// SEARCHFIX.3 V2 (task-451; doc-2 B.6 "Try a nearby address or report it." and B.7 "report it inside the no-lot message", choose-lot-states.html:277): the
// line is the body, an inline "report it" link (a nested Text: the vendored AlertDescription is the RN Text, so the press is the native nested-Text press), then the stop.
const unlinkedNotice = (): PropsNode =>
  notice('unlinked', 'MapPin', L.noticeIconNeutral, [
    node('Text', { key: 'unlinked-heading', className: L.noticeHeading, role: 'header' }, [content('unlinked.heading')]),
    node('AlertDescription', { key: 'unlinked-text', className: L.noticeTextNeutral }, [
      { text: content('unlinked.body'), vars: { address: contract('map.address') } },
      node('Text', {
        key: 'unlinked-report',
        testID: 'parcel-lotmap-report',
        className: L.helpLinkText,
        accessibilityRole: 'link',
        onPress: { action: 'open_help', topic: HELP_TOPIC, q: derived('query') },
      }, [content('unlinked.report')]),
      node('Text', { key: 'unlinked-stop' }, [content('unlinked.stop')]),
    ]),
  ]);

/** SRCH.C12 / B.7: the v8 link to Help & Support, prefilled with the typed query (the existing action open_help). SEARCHFIX.3 (task-451): every link takes
 *  the topic wrong-lot (doc-2 B.7); the old topics lot_match and address_match stay on the Help page. */
const helpLink = (): PropsNode =>
  node('Button', {
    key: 'help',
    testID: 'parcel-lotmap-help',
    variant: 'link',
    className: L.helpLink,
    accessibilityRole: 'link',
    onPress: { action: 'open_help', topic: HELP_TOPIC, q: derived('query') },
  }, [node('Text', { key: 'help-text', className: L.helpLinkText }, [content('help.address.link')])]);

/** C.11 (task-362; choose-lot.html:278): "Pick a lot on the map or in the list." under the disabled Choose a lot button. */
const pickHint = (): PropsNode =>
  node('Text', { key: 'pick-hint', testID: 'parcel-lotmap-pick-hint', className: L.pickHint }, [content('select.hint')]);

/** C.12: "Not sure which lot? Get help with an address" (choose-lot.html:279). */
const helpRow = (): PropsNode =>
  node('View', { key: 'help-row', testID: 'parcel-lotmap-help-row', className: L.helpRow }, [
    node('Text', { key: 'help-prompt', className: L.helpPrompt }, [content('help.lot.prompt')]),
    helpLink(),
  ]);

const polygon = (key: string, coords: string, holes: string, stroke: string, fill: string, width: number, parcelPath: string): PropsNode =>
  node('Polygon', {
    key,
    coordinates: derived(coords),
    holes: derived(holes),
    strokeColor: stroke,
    fillColor: fill,
    strokeWidth: width,
    tappable: true,
    onPress: { action: 'select', parcelId: contract(parcelPath) },
  });

const mapView = (s: LotMapSituation): PropsNode[] => {
  if (s.region === null) return [];
  const lotShapes = s.lots.flatMap((l, i) => l.polygons.map((_, j) => {
    const on = l.parcelId === s.selectedParcelId;
    // C.5 (RR-0284): a lot whose massing join returned a footprint takes its own fill tier (presence only; the footprint geometry is a follow-up).
    const plain = s.map?.lots[i]?.hasFootprint === true ? H.lotFillBuilt : H.lotFill;
    return polygon(`lot-${l.parcelId}-${j}`, `lots.${i}.polygons.${j}.coordinates`, `lots.${i}.polygons.${j}.holes`,
      H.lotStroke, on ? H.lotFillChecked : plain, Z.lotStroke, `map.lots.${i}.parcelId`);
  }));
  const markers = s.lots.flatMap((l, i) => (l.marker === null ? [] : [node('Marker', {
    key: `marker-${l.parcelId}`,
    coordinate: derived(`lots.${i}.marker`),
    tracksViewChanges: false,
    onPress: { action: 'select', parcelId: contract(`map.lots.${i}.parcelId`) },
  }, [node('View', { key: 'marker-chip', className: l.parcelId === s.selectedParcelId ? L.markerChecked : L.marker }, [
    node('Text', { key: 'marker-letter', className: l.parcelId === s.selectedParcelId ? L.markerTextChecked : L.markerText }, [derived(`letter.${i}`)]),
  ])])]));
  const pin = s.pin === null ? [] : [node('Marker', { key: 'pin', coordinate: derived('pin'), pinColor: H.pin, tracksViewChanges: false })];
  return [node('View', {
    key: 'map-frame',
    testID: 'parcel-lotmap-map',
    className: L.mapFrame,
    importantForAccessibility: 'no-hide-descendants',
    accessibilityElementsHidden: true,
  }, [node('MapView', {
    key: 'map',
    style: { height: Z.mapHeight },
    initialRegion: derived('region'),
    userInterfaceStyle: 'light',
    customMapStyle: derived('map_style'),
    rotateEnabled: false,
    pitchEnabled: false,
    toolbarEnabled: false,
  }, [...lotShapes, ...markers, ...pin])])];
};

const cards = (s: LotMapSituation): PropsNode[] =>
  s.lots.map((l, i) => {
    const lot = s.map!.lots[i]!;
    const checked = l.parcelId === s.selectedParcelId;
    const area = fact(lot.area, `map.lots.${i}.area`);
    // C.7 (RR-0284; RR-0289, MORNING-DECISIONS.md:1117, massing is reliable for presence only): a footprint says "has the house", none says
    // "no building" (choose-lot.html:306); "faces {street}" when the street is populated, else "at the back" (SEARCHFIX.3 V1, task-451; MD:776, doc-2 C.7).
    // A response without the footprint field (an older server or a cached one) says neither: the plain lot letter.
    const known = lot.hasFootprint !== undefined;
    const house = lot.hasFootprint === true;
    const street = typeof lot.frontageStreet === 'string' && lot.frontageStreet.trim() !== '';
    const leadKey = !known ? 'lot.letter'
      : house ? (street ? 'lot.lead.house_faces' : 'lot.lead.house')
        : street ? 'lot.lead.no_building_faces' : 'lot.lead.no_building';
    const lead: Child = { text: content(leadKey), vars: { letter: derived(`letter.${i}`), ...(known && street ? { street: contract(`map.lots.${i}.frontageStreet`) } : {}) } };
    return node('Button', {
      key: `card-${l.parcelId}`,
      testID: `parcel-lotmap-card-${l.parcelId}`,
      variant: 'outline',
      className: checked ? L.cardChecked : L.card,
      role: 'radio',
      accessibilityState: { checked },
      // SEARCHFIX.3 V3 (task-451; GROUNDER-H D1 "the spoken name is the visible text"): the label is the lead line and the area, the card's own text.
      accessibilityLabel: { text: content('lot.label'), vars: { lead, area } },
      onPress: { action: 'select', parcelId: contract(`map.lots.${i}.parcelId`) },
    }, [node('View', { key: 'card-row', className: L.cardRow }, [
      node('View', { key: 'card-text' }, [
        node('Text', { key: 'card-title', className: L.cardTitle }, [lead]),
        node('Text', { key: 'card-area', className: L.cardArea }, [area]),
      ]),
      ...(checked ? [node('Icon', { key: 'check', icon: 'Check', size: Z.icon, color: H.check })] : []),
    ])]);
  });

/** Nothing picked yet: Choose a lot is disabled and its hint shows (one predicate for both; choose-lot.html:278). */
const awaitingPick = (s: LotMapSituation): boolean => s.route === null;

// SEARCHFIX.3 V3 (task-451): a non-null route always has a picked letter (lotMap.ts builds the route from the picked lot), so the label is "Choose a lot" or
// "Continue with Lot X"; the button speaks its visible text (GROUNDER-H D1), and the generic "open the report" label is retired.
const continueButton = (s: LotMapSituation): PropsNode => {
  const label: Child = s.route === null
    ? content('select.none')
    : { text: content('select.lot'), vars: { letter: derived(`letter.${s.lots.findIndex((l) => l.parcelId === s.selectedParcelId)}`) } };
  return node('Button', {
    key: 'continue',
    testID: 'parcel-lotmap-continue',
    variant: 'default',
    className: L.select,
    disabled: awaitingPick(s),
    accessibilityRole: 'button',
    accessibilityState: { disabled: awaitingPick(s) },
    accessibilityLabel: label,
    // aria-describedby="pick-hint" of the mock: the hint line travels with the disabled button.
    ...(awaitingPick(s) ? { accessibilityHint: content('select.hint') } : {}),
    onPress: s.route === null ? null : { action: 'push', route: s.route },
  }, [node('Text', { key: 'continue-text', className: L.selectText }, [label])]);
};

const body = (s: LotMapSituation): PropsNode[] => {
  switch (s.state) {
    case 'loading':
      return [node('View', { key: 'loading', className: L.loading }, [
        node('ActivityIndicator', { key: 'spinner', testID: 'parcel-lotmap-spinner', size: 'small', color: H.primary, accessibilityLabel: content('state.loading') }),
        node('Text', { key: 'loading-text', className: L.loadingText }, [content('state.loading')]),
      ])];
    case 'error':
      return errorNotices(s);
    case 'intersection':
      return [notice('intersection', 'MapPin', L.noticeIconNeutral, [node('AlertDescription', { key: 'intersection-text', className: L.noticeTextNeutral }, [content('state.intersection')])]), helpLink()];
    case 'too_many_lots':
      return [notice('too-many', 'MapPin', L.noticeIconNeutral, [node('AlertDescription', { key: 'too-many-text', className: L.noticeTextNeutral }, [content('state.too_many')])]), helpLink()];
    case 'unlinked_no_pin':
      return [unlinkedNotice(), helpLink()];
    case 'unlinked':
      return [unlinkedNotice(), helpLink(), ...mapView(s)];
    case 'multi_parcel':
      return [
        node('View', { key: 'list-header', testID: 'parcel-lotmap-header', className: L.listHeader }, [
          // GAP.13 C.1 (v8 choose-lot.html:265): one plain heading with the existing lot_count replaces the rail and the badge.
          node('Text', { key: 'heading', className: L.noticeHeading, role: 'header' }, [{ text: content('map.heading'), vars: { count: derived('lot_count') } }]),
        ]),
        ...mapView(s),
        ...cards(s),
        continueButton(s),
        ...(awaitingPick(s) ? [pickHint()] : []),
        helpRow(),
      ];
    case 'redirect':
      return [];
  }
};

/** The props tree of one render. The redirect state adds `navigate` (the mount's effect replaces the route with it). */
export function lotMapProps(s: LotMapSituation): PropsNode {
  return node('SafeAreaView', { className: L.screen, edges: { top: 'additive' }, testID: 'parcel-lotmap-screen', ...(s.navigate ? { navigate: s.navigate } : {}) }, [
    node('ScrollView', {
      key: 'scroll',
      className: L.scroll,
      contentContainerStyle: { paddingBottom: LOT_MAP_BOTTOM_PADDING, alignItems: 'center' },
      keyboardShouldPersistTaps: 'handled',
    }, [node('View', { key: 'column', testID: 'parcel-lotmap-column', className: L.column, style: { maxWidth: SEARCH_MAX_WIDTH } }, [
      pill(),
      ...body(s),
    ])]),
  ]);
}

export type LotMapBindingData = { contract: Record<string, unknown>; derived: Record<string, unknown> };

/** The values the refs of `lotMapProps(s)` resolve against: the lookup response's map block and 429 detail, and the derived values. */
export function lotMapData(s: LotMapSituation): LotMapBindingData {
  return {
    contract: { [CONTRACT]: { map: s.map, errors: { '429': { retryAfterSeconds: s.errors.retryAfterSeconds } } } },
    derived: {
      query: s.query,
      lot_count: s.lots.length,
      region: s.region,
      pin: s.pin,
      map_style: LOT_MAP_STYLE,
      letter: s.lots.map((l) => l.letter),
      lots: s.lots.map((l) => ({ marker: l.marker, polygons: l.polygons })),
    },
  };
}
