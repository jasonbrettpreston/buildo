// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 5, 19.3, 20.4)
// MB-31 B7: the ONE generic neighbour-facts reader (L31-03); FS-SB2a ring facts are a count of distinct lots and a mean (plan 19.3).
'use strict';

const CELL_TARGET = 'averaging_distance_m';

function toList(x) {
  return Array.isArray(x) ? x : [];
}

function isNumber(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Plain mean of a list of finite numbers; null when the list is empty. */
function mean(values) {
  const list = toList(values).filter(isNumber);
  if (list.length === 0) return null;
  let sum = 0;
  for (const v of list) sum += v;
  return sum / list.length;
}

/** Median of a list of finite numbers (sorted middle; even n = mean of the two middle); null when empty. */
function median(values) {
  const list = toList(values).filter(isNumber).sort((a, b) => a - b);
  if (list.length === 0) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 === 1 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

/** One estimate per distinct lot id (the first entry wins); entries with a null estimate are dropped. */
function onePerLot(rows, skip) {
  const seen = new Set();
  const out = [];
  for (const row of toList(rows)) {
    if (!row) continue;
    if (skip && skip(row)) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (!isNumber(row.est)) continue;
    out.push(row.est);
  }
  return out;
}

function isAbutter(row) {
  return row.abutter === true;
}

function cellOk(cell) {
  return !!cell && cell.s === 'applies' && cell.kind === 'number' && isNumber(cell.value);
}

function cellReason(cell) {
  if (cell && typeof cell.reason === 'string') return cell.reason;
  return 'no_candidate';
}

function neighbourFacts(input, averagingCell) {
  const src = input || {};
  const facts = {};

  facts.bt_units = src.bt_units;

  const user = toList(src.user).filter(isNumber);
  facts.user_n = user.length;
  if (user.length > 0) facts.user_mean_m = mean(user);

  const neighbours = toList(src.neighbours).filter((n) => n && n.same_street !== false && n.residential !== false);
  if (cellOk(averagingCell)) {
    const qualifying = neighbours.filter((n) => n.bldg_m === null || n.bldg_m === undefined || n.bldg_m <= averagingCell.value);
    const bad = qualifying.filter((n) => n.est_status !== 'estimated' || n.est === null || n.est === undefined);
    facts.nbr_all_n = neighbours.length;
    facts.nbr_q_n = qualifying.length;
    facts.nbr_q_bad_n = bad.length;
    if (qualifying.length > 0 && bad.length === 0) facts.nbr_q_est_mean_m = mean(qualifying.map((n) => n.est));
  } else {
    const failed = { not_evaluated: cellReason(averagingCell) };
    facts.nbr_all_n = failed;
    facts.nbr_q_n = failed;
    facts.nbr_q_bad_n = failed;
    facts.nbr_q_est_mean_m = failed;
  }

  facts.own_n = src.own === null || src.own === undefined ? 0 : 1;
  if (facts.own_n === 1) facts.own_front_m = src.own;

  const street = onePerLot(src.street, isAbutter);
  facts.street_n = street.length;
  if (street.length > 0) facts.street_median_m = median(street);

  const zone = onePerLot(src.zone, isAbutter);
  facts.zone_n = zone.length;
  if (zone.length > 0) facts.zone_median_m = median(zone);

  const ring = onePerLot(src.ring, null);
  facts.ring_n = ring.length;
  if (ring.length > 0) facts.ring_est_mean_m = mean(ring);

  const reads = [
    {
      kind: 'l2',
      id: CELL_TARGET,
      status: averagingCell ? averagingCell.s : null,
      value: averagingCell ? averagingCell.value : null,
      clause: averagingCell ? averagingCell.clause : null,
    },
  ];

  return { facts, reads };
}

module.exports = { neighbourFacts, median, mean };
