// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6, §3.2 and §4 (dated note 2026-11-11, MF-53: the "choose your lot" page)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST archetype; a map is `render.projection: map`), §11b.2
//            Surface S-071 `mobile_parcel_disambiguation_map` · contract C-001 `contract_parcels_lookup`
//
// MF-53 · the page's declared client derivations (the P35-D14 a deviation form, as mobile/src/lib/parcelSearchMatch.ts is for the search page).
// Pure helpers the mount feeds and the binding (mobile/src/components/surfaces/LotMapBinding.tsx) reads; the binding does no maths (FE-05).
//   - the outcome comes from the SAME `deriveMatchType` the search page uses (PLAN panel regression HIGH-1: a server no_match on an
//     intersection-shaped query is the intersection state, never a bounce back to search);
//   - a server outline (GeoJSON, ST_AsGeoJSON) is reshaped into react-native-maps polygons ({latitude, longitude} rings, holes kept, every
//     part of a MultiPolygon drawn);
//   - the server's start view (a box) becomes the map's initial region; the map never animates (reduce motion);
//   - lot letters follow the server's lot order (A, B, C ...); nothing is selected at open (DECISIONS-v3 Q4; P35-D17 a);
//   - the chosen lot opens through the ONE report route helper the search page's `unique` uses (operator 2026-11-11: the new report only;
//     plan v4 §4): this module names no screen.
import type { ConsumerParcelLookupResult, LotOutline, ParcelLotMap } from '@/lib/schemas';
import {
  classifyParcelSearchError,
  deriveMatchType,
  PARCEL_TAB_ROUTE,
  parcelSearchRoute,
  type ParcelSearchErrorClass,
  type ParcelSearchOutcome,
} from '@/lib/parcelSearchMatch';
import { LOT_MAP_REGION_PAD } from '@/constants/lotMap';

export type MapPoint = { latitude: number; longitude: number };
export type MapPolygon = { coordinates: MapPoint[]; holes: MapPoint[][] };
export type MapRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

/** The page's states (one golden each; the descriptor's states[]). */
export const LOT_MAP_STATES = [
  'loading', 'multi_parcel', 'unlinked', 'unlinked_no_pin', 'too_many_lots', 'intersection', 'redirect', 'error',
] as const;
export type LotMapState = (typeof LOT_MAP_STATES)[number];

export type LotMapSituation = {
  query: string;
  state: LotMapState;
  outcome: ParcelSearchOutcome;
  errors: ParcelSearchErrorClass;
  /** The contract's map block as sent (cards bind to it), or null. */
  map: ParcelLotMap | null;
  lots: Array<{ parcelId: string; letter: string; polygons: MapPolygon[]; marker: MapPoint | null }>;
  neighbours: Array<{ parcelId: string; polygons: MapPolygon[] }>;
  pin: MapPoint | null;
  region: MapRegion | null;
  /** The tapped lot or neighbour, or null (nothing selected at open). */
  selectedParcelId: string | null;
  selectedLetter: string | null;
  /** Where Continue goes (the report route of the picked lot), else null (Continue disabled). */
  route: string | null;
  /** The redirect state's target (the report for `unique`; the search page otherwise), else null. */
  navigate: string | null;
};

const point = ([lng, lat]: [number, number]): MapPoint => ({ latitude: lat, longitude: lng });

/** GeoJSON Polygon / MultiPolygon -> react-native-maps polygons: the outer ring as coordinates, the inner rings as holes. */
export function polygonsOf(outline: LotOutline | null): MapPolygon[] {
  if (outline === null) return [];
  const parts = outline.type === 'Polygon' ? [outline.coordinates] : outline.coordinates;
  return parts.filter((rings) => rings.length > 0).map(([outer, ...holes]) => ({ coordinates: outer!.map(point), holes: holes.map((h) => h.map(point)) }));
}

/** The server's start view -> the initial region, padded so the outlines do not touch the frame. */
export function regionOf(fit: ParcelLotMap['fit']): MapRegion | null {
  if (fit === null) return null;
  return {
    latitude: (fit.north + fit.south) / 2,
    longitude: (fit.east + fit.west) / 2,
    latitudeDelta: (fit.north - fit.south) * LOT_MAP_REGION_PAD,
    longitudeDelta: (fit.east - fit.west) * LOT_MAP_REGION_PAD,
  };
}

/** Lot letters follow the server's order: A, B, C ... */
export const letterOf = (i: number): string => String.fromCharCode('A'.charCodeAt(0) + i);

export function buildLotMapSituation(args: {
  query: string;
  data: ConsumerParcelLookupResult | undefined;
  error: unknown;
  isFetching: boolean;
  schemaDrift: boolean;
  selectedParcelId: string | null;
}): LotMapSituation {
  const { query, data, error, isFetching } = args;
  const errors = classifyParcelSearchError(error, args.schemaDrift);
  const outcome = deriveMatchType(query, error ? undefined : data);
  const map = !error && data?.map ? data.map : null;

  const lots = (map?.lots ?? []).map((l, i) => ({
    parcelId: l.parcelId,
    letter: letterOf(i),
    polygons: polygonsOf(l.outline),
    marker: l.centroid ? { latitude: l.centroid.lat, longitude: l.centroid.lng } : null,
  }));
  const neighbours = (map?.neighbours ?? []).map((n) => ({ parcelId: n.parcelId, polygons: polygonsOf(n.outline) }));

  let state: LotMapState;
  let navigate: string | null = null;
  if (error != null) state = 'error';
  else if (outcome === 'intersection') state = 'intersection';
  else if (!data) {
    if (isFetching) state = 'loading';
    else { state = 'redirect'; navigate = PARCEL_TAB_ROUTE.lookup; }
  } else if (outcome === 'multi_parcel' && map) state = map.truncated ? 'too_many_lots' : 'multi_parcel';
  else if (outcome === 'unlinked' && map) state = map.pin ? 'unlinked' : 'unlinked_no_pin';
  else {
    state = 'redirect';
    navigate = outcome === 'unique' && data.match ? parcelSearchRoute('unique', { parcelId: data.match.parcelId, query }) : PARCEL_TAB_ROUTE.lookup;
  }

  const pickable = state === 'multi_parcel' ? lots : state === 'unlinked' ? neighbours : [];
  const selectedParcelId = pickable.some((p) => p.parcelId === args.selectedParcelId) ? args.selectedParcelId : null;
  const selectedLetter = lots.find((l) => l.parcelId === selectedParcelId)?.letter ?? null;
  const drawn = state === 'multi_parcel' || state === 'unlinked';
  return {
    query,
    state,
    outcome,
    errors: error != null ? errors : { ...errors, unexpected: false },
    map: drawn || state === 'too_many_lots' || state === 'unlinked_no_pin' ? map : null,
    lots: state === 'multi_parcel' ? lots : [],
    neighbours: state === 'unlinked' ? neighbours : [],
    pin: drawn && map?.pin ? { latitude: map.pin.lat, longitude: map.pin.lng } : null,
    region: drawn ? regionOf(map?.fit ?? null) : null,
    selectedParcelId,
    selectedLetter,
    route: selectedParcelId ? parcelSearchRoute('unique', { parcelId: selectedParcelId, query }) : null,
    navigate,
  };
}

