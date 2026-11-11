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
  /^(lots|neighbours)\.(0|[1-9][0-9]*)\.polygons\.(0|[1-9][0-9]*)\.(coordinates|holes)$/,
];

const CONTRACT = 'contract_parcels_lookup';
const content = (key: string): Ref => ({ content: key });
const contract = (p: string): Ref => ({ contract: `${CONTRACT}.${p}` });
const derived = (name: string): Ref => ({ derived: name });
const node = (component: string, props: Record<string, unknown>, children: Child[] = []): PropsNode => ({ component, props, children });
/** A lot fact that may be null: the contract value, else the content null value "—" (never "0", never blank). */
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

const notice = (key: string, icon: string, iconClassName: string, children: Child[]): PropsNode =>
  node('Alert', { key, testID: `parcel-lotmap-${key}`, icon, iconClassName, className: L.notice }, children as PropsNode[]);

const errorNotices = (s: LotMapSituation): PropsNode[] => [
  ...(s.errors.rateLimited
    ? [notice('ratelimit', 'AlertTriangle', L.noticeIcon, [node('AlertDescription', { key: 'ratelimit-text', className: L.noticeText }, [
      { text: content('state.ratelimit'), vars: { seconds: contract('errors.429.retryAfterSeconds') } },
    ])])]
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
    ])]
    : []),
];

const unlinkedNotice = (): PropsNode =>
  notice('unlinked', 'MapPin', L.noticeIconNeutral, [
    node('Text', { key: 'unlinked-heading', className: L.noticeHeading, role: 'header' }, [content('unlinked.heading')]),
    node('AlertDescription', { key: 'unlinked-text', className: L.noticeTextNeutral }, [
      { text: content('unlinked.body'), vars: { address: contract('map.address') } },
    ]),
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
  const neighbourShapes = s.neighbours.flatMap((n, i) => n.polygons.map((_, j) => {
    const on = n.parcelId === s.selectedParcelId;
    return polygon(`neighbour-${n.parcelId}-${j}`, `neighbours.${i}.polygons.${j}.coordinates`, `neighbours.${i}.polygons.${j}.holes`,
      on ? H.neighbourStrokeChecked : H.neighbourStroke, on ? H.neighbourFillChecked : H.neighbourFill, Z.neighbourStroke, `map.neighbours.${i}.parcelId`);
  }));
  const lotShapes = s.lots.flatMap((l, i) => l.polygons.map((_, j) => {
    const on = l.parcelId === s.selectedParcelId;
    return polygon(`lot-${l.parcelId}-${j}`, `lots.${i}.polygons.${j}.coordinates`, `lots.${i}.polygons.${j}.holes`,
      H.lotStroke, on ? H.lotFillChecked : H.lotFill, Z.lotStroke, `map.lots.${i}.parcelId`);
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
    userInterfaceStyle: 'dark',
    customMapStyle: derived('map_style'),
    rotateEnabled: false,
    pitchEnabled: false,
    toolbarEnabled: false,
  }, [...neighbourShapes, ...lotShapes, ...markers, ...pin])])];
};

const cards = (s: LotMapSituation): PropsNode[] =>
  s.lots.map((l, i) => {
    const lot = s.map!.lots[i]!;
    const checked = l.parcelId === s.selectedParcelId;
    const area = fact(lot.area, `map.lots.${i}.area`);
    const frontage = fact(lot.frontage, `map.lots.${i}.frontage`);
    const zoning = fact(lot.zoning, `map.lots.${i}.zoning`);
    return node('Button', {
      key: `card-${l.parcelId}`,
      testID: `parcel-lotmap-card-${l.parcelId}`,
      variant: 'outline',
      className: checked ? L.cardChecked : L.card,
      role: 'radio',
      accessibilityState: { checked },
      accessibilityLabel: { text: content('lot.label'), vars: { letter: derived(`letter.${i}`), area, frontage, zoning } },
      onPress: { action: 'select', parcelId: contract(`map.lots.${i}.parcelId`) },
    }, [node('View', { key: 'card-row', className: L.cardRow }, [
      node('View', { key: 'card-text' }, [
        node('Text', { key: 'card-title', className: L.cardTitle }, [{ text: content('lot.letter'), vars: { letter: derived(`letter.${i}`) } }]),
        node('Text', { key: 'card-area', className: L.cardArea }, [area]),
        node('Text', { key: 'card-facts', className: L.cardFacts }, [{ text: content('lot.facts'), vars: { frontage, zoning } }]),
      ]),
      ...(checked ? [node('Icon', { key: 'check', icon: 'Check', size: Z.icon, color: H.primary })] : []),
    ])]);
  });

const continueButton = (s: LotMapSituation): PropsNode => {
  const label: Child = s.route === null
    ? content('select.none')
    : s.selectedLetter === null
      ? content('select.label')
      : { text: content('select.lot'), vars: { letter: derived(`letter.${s.lots.findIndex((l) => l.parcelId === s.selectedParcelId)}`) } };
  return node('Button', {
    key: 'continue',
    testID: 'parcel-lotmap-continue',
    variant: 'default',
    className: L.select,
    disabled: s.route === null,
    accessibilityRole: 'button',
    accessibilityState: { disabled: s.route === null },
    accessibilityLabel: content('select.label'),
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
      return [notice('intersection', 'MapPin', L.noticeIconNeutral, [node('AlertDescription', { key: 'intersection-text', className: L.noticeTextNeutral }, [content('state.intersection')])])];
    case 'too_many_lots':
      return [notice('too-many', 'MapPin', L.noticeIconNeutral, [node('AlertDescription', { key: 'too-many-text', className: L.noticeTextNeutral }, [content('state.too_many')])])];
    case 'unlinked_no_pin':
      return [unlinkedNotice()];
    case 'unlinked':
      return [unlinkedNotice(), ...mapView(s), ...(s.neighbours.length > 0 ? [continueButton(s)] : [])];
    case 'multi_parcel':
      return [
        node('View', { key: 'list-header', testID: 'parcel-lotmap-header', className: L.listHeader }, [
          node('Text', { key: 'rail', className: L.rail, role: 'header' }, [content('map.rail')]),
          node('Text', { key: 'badge', className: L.badge }, [{ text: content('map.badge'), vars: { count: derived('lot_count') } }]),
        ]),
        ...mapView(s),
        ...cards(s),
        continueButton(s),
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
      neighbours: s.neighbours.map((n) => ({ polygons: n.polygons })),
    },
  };
}
