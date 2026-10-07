// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §4 (`pending:stale`: an adoption changed the unit's
//            normalized text; counted, never failing), §6 `verified_against_sha256` + `last_changed_in` (adoptions.json
//            records each adoption's per-unit shas), §9 G-CHANGE (change report: added / removed / changed / tag
//            delta / stale units; an on-demand gate counts as run only when its latest record is bound to the
//            current snapshot), SC-7 (stale = changed exactly; 0 unflagged changes), O-6;
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-45; docs/reports/mcbylaw-phase1-plan.md S10
//
// The G-CHANGE stale-unit arm. Unit-level and offline: it compares the per-unit normalized-text shas of two
// adoptions with the pins authored rows carry (`verified_against_sha256`). Every function is PURE.
//
// A unit is a slice id (S4's clause unit). S3's adoptions record per-PAGE shas only; until an adoption records
// `units: {<unit id>: <sha256 of the unit's normalized text>}`, adoptionUnitShas() throws units_not_recorded and
// the arm's state is `not_run` (Spec 79: a gate not run is never a PASS).

const sorted = (xs) => [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export class ChangeError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

/** Per-unit shas recorded by an adoption. Throws units_not_recorded when the adoption predates unit shas. */
export function adoptionUnitShas(adoption) {
  if (!adoption || !adoption.units || typeof adoption.units !== 'object') {
    throw new ChangeError('units_not_recorded', `${adoption ? adoption.adoption_id : 'no adoption'} records no per-unit shas`);
  }
  return adoption.units;
}

/**
 * Compare two unit-sha maps against the authored pins.
 *   changed          in both adoptions, sha differs
 *   stale            pinned units whose pin differs from the CURRENT sha (row_status pending:stale)
 *   already_stale    stale, but the pin already differed from the BASE sha (not this adoption's change)
 *   orphaned_pins    pinned units absent from the current adoption (renumbering: orphan until mapped)
 *   unflagged_changes  changed pinned units that are not stale — the SC-7 failure
 *   sc7              {changed_pinned, newly_stale, equal}: changed units whose pin equalled the base sha vs the
 *                    stale units this adoption caused; SC-7 holds when they are equal and unflagged is empty.
 */
export function staleUnits({ before, after, pins }) {
  const b = before || {};
  const a = after || {};
  const p = pins || {};
  const added = sorted(Object.keys(a).filter((k) => !(k in b)));
  const removed = sorted(Object.keys(b).filter((k) => !(k in a)));
  const both = sorted(Object.keys(a).filter((k) => k in b));
  const changed = both.filter((k) => a[k] !== b[k]);
  const unchanged = both.filter((k) => a[k] === b[k]);
  const pinned = sorted(Object.keys(p));
  const orphanedPins = pinned.filter((k) => !(k in a));
  const stale = pinned.filter((k) => k in a && p[k] !== a[k]);
  const alreadyStale = stale.filter((k) => !(k in b) || p[k] !== b[k]);
  const newlyStale = stale.filter((k) => k in b && p[k] === b[k] && a[k] !== b[k]);
  const changedPinned = changed.filter((k) => k in p && p[k] === b[k]);
  const unflagged = changed.filter((k) => k in p && !stale.includes(k));
  return {
    added,
    removed,
    changed,
    unchanged,
    stale,
    already_stale: alreadyStale,
    orphaned_pins: orphanedPins,
    unflagged_changes: unflagged,
    sc7: {
      changed_pinned: changedPinned.length,
      newly_stale: newlyStale.length,
      equal: changedPinned.length === newlyStale.length && changedPinned.every((k) => newlyStale.includes(k)) && unflagged.length === 0,
    },
  };
}

/** The G-CHANGE record for the latest adoption against its base: bound to both adoption ids. */
export function changeRecord({ adoptions, pins }) {
  const list = adoptions || [];
  if (list.length < 2) throw new ChangeError('no_base_adoption', 'a change record needs a latest adoption and its base');
  const latest = list.at(-1);
  const base = list.at(-2);
  const r = staleUnits({ before: adoptionUnitShas(base), after: adoptionUnitShas(latest), pins });
  return { adoption_id: latest.adoption_id, base_adoption: base.adoption_id, ...r };
}

/** Gate state (closed: pass · fail · not_run) of the stale-unit arm for the current adoption list. */
export function changeGateState({ adoptions, record }) {
  const latest = (adoptions || []).at(-1);
  if (!record || !latest || record.adoption_id !== latest.adoption_id) return 'not_run';
  try {
    adoptionUnitShas(latest);
  } catch (err) {
    if (err instanceof ChangeError) return 'not_run';
    throw err;
  }
  return record.sc7 && record.sc7.equal && record.unflagged_changes.length === 0 ? 'pass' : 'fail';
}

/** Tag delta between two amendments.json builds: per-page singular counts, tag ids and by-laws added/removed. */
export function tagDelta(prev, next) {
  const pp = (prev && prev.pages) || {};
  const np = (next && next.pages) || {};
  const pages = sorted(new Set([...Object.keys(pp), ...Object.keys(np)]))
    .map((k) => ({ page: k, tags_before: pp[k] ? pp[k].tag_count : 0, tags_after: np[k] ? np[k].tag_count : 0 }))
    .filter((r) => r.tags_before !== r.tags_after);
  const ids = (d) => new Set(((d && d.tags) || []).map((t) => t.id));
  const bylaws = (d) => new Set(((d && d.tags) || []).flatMap((t) => (t.refs || []).map((r) => r.bylaw)));
  const [pi, ni, pb, nb] = [ids(prev), ids(next), bylaws(prev), bylaws(next)];
  return {
    pages,
    tags_added: sorted([...ni].filter((x) => !pi.has(x))),
    tags_removed: sorted([...pi].filter((x) => !ni.has(x))),
    bylaws_added: sorted([...nb].filter((x) => !pb.has(x))),
    bylaws_removed: sorted([...pb].filter((x) => !nb.has(x))),
  };
}
