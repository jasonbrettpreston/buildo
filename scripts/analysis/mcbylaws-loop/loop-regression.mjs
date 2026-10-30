// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68-2 / M-3xx (R-KI extended: the regression set only ratchets; a removal needs a RATIFIED or RULED ruling, M-343)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 3 (the regression set ratchet, G68-01 case_missing, G68-02 ruling lookup)
// Pure functions return string[] of violation codes (empty = green); a code with a detail is `code:detail`.
// The only disk access is mcbylaws/loop/regression-set.json and mcbylaws/loop/data/ids-<group>.json, resolved under the root passed in.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SET_REL = 'mcbylaws/loop/regression-set.json';
const IDS_DIR_REL = 'mcbylaws/loop/data';

/** M-343: a ruling whose register status is RATIFIED or RULED is authority, the same as --accept --ruling. PURE. */
export function isAuthorityStatus(status) {
  return status === 'RATIFIED' || status === 'RULED';
}

/** G68-02: look a ruling up in the register map (parseRulings' Map(id -> status)). PURE. */
function isAuthority(ruling, rulings) {
  if (typeof ruling !== 'string' || !(rulings instanceof Map)) return false;
  return isAuthorityStatus(rulings.get(ruling));
}

const isStringArray = (value) => Array.isArray(value) && value.every((v) => typeof v === 'string');

const activeIdsOf = (group) => (isStringArray(group && group.ids) ? group.ids : []);

const asArray = (value) => (Array.isArray(value) ? value : []);

const idsByGroup = (groups) => {
  const out = new Map();
  for (const g of groups) out.set(g.id, activeIdsOf(g));
  return out;
};

/** sha256 hex of the exact JSON encoding of the id list. PURE. */
export function idsSha(ids) {
  return crypto.createHash('sha256').update(JSON.stringify(ids)).digest('hex');
}

/**
 * The removals entries of `cur` beyond the `base` history (a NEW entry), per group: the ids an authority
 * ruling excuses, and every ruling that is not authority. PURE.
 */
function newRemovals(base, cur, rulings) {
  const history = asArray(base && base.removals).length;
  const excused = new Map();
  const refusedRulings = [];
  for (const entry of asArray(cur && cur.removals).slice(history)) {
    if (!entry || typeof entry.group !== 'string' || !isStringArray(entry.ids)) continue;
    if (!isAuthority(entry.ruling, rulings)) {
      if (typeof entry.ruling === 'string' && !refusedRulings.includes(entry.ruling)) refusedRulings.push(entry.ruling);
      continue;
    }
    const ids = excused.get(entry.group) || new Set();
    for (const id of entry.ids) ids.add(id);
    excused.set(entry.group, ids);
  }
  return { excused, refusedRulings };
}

/** Read the set and each group's ids file under `root` through `readText` (injected for tests). Throws `data_missing: <path>`. */
export function loadRegression(root, readText = (p) => fs.readFileSync(p, 'utf8')) {
  const file = path.join(root, SET_REL);
  let parsed;
  try {
    parsed = JSON.parse(readText(file));
  } catch {
    throw new Error(`data_missing: ${file}`);
  }
  if (!parsed || !Array.isArray(parsed.groups)) throw new Error(`data_missing: ${file}`);
  const groups = parsed.groups.map((g) => {
    const groupFile = path.join(root, IDS_DIR_REL, `ids-${g.id}.json`);
    let ids;
    try {
      ids = JSON.parse(readText(groupFile));
    } catch {
      throw new Error(`data_missing: ${groupFile}`);
    }
    if (!isStringArray(ids)) throw new Error(`data_missing: ${groupFile}`);
    const { ids: _omit, ...rest } = g;
    return { ...rest, ids };
  });
  return {
    groups,
    pending: asArray(parsed.pending),
    removals: asArray(parsed.removals),
  };
}

/** Write the set (without ids) and one ids file per group under `root`, creating directories. */
export function saveRegression(root, set) {
  fs.mkdirSync(path.join(root, IDS_DIR_REL), { recursive: true });
  const onDisk = { ...set, groups: set.groups.map(({ ids, ...rest }) => rest) };
  fs.writeFileSync(path.join(root, SET_REL), JSON.stringify(onDisk, null, 2) + '\n');
  for (const g of set.groups) {
    fs.writeFileSync(path.join(root, IDS_DIR_REL, `ids-${g.id}.json`), JSON.stringify(g.ids) + '\n');
  }
}

/** The ratchet: internal integrity, active-vs-pending, and nothing lost against `base` except by an authority removal. PURE. */
export function checkRegression(base, cur, rulings) {
  const out = [];
  const groups = asArray(cur && cur.groups);
  const curIds = idsByGroup(groups);

  for (const g of groups) {
    const ids = activeIdsOf(g);
    if (idsSha(ids) !== g.ids_sha256) out.push(`ids_sha_mismatch:${g.id}`);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) out.push(`duplicate_id:${g.id}|${id}`);
      seen.add(id);
    }
  }

  for (const row of asArray(cur && cur.pending)) {
    if (!row || typeof row.id !== 'string') continue;
    const active = curIds.get(row.group);
    if (active && active.includes(row.id)) out.push(`case_both_active_and_pending:${row.id}`);
  }

  if (base) {
    const { excused, refusedRulings } = newRemovals(base, cur, rulings);
    for (const ruling of refusedRulings) out.push(`ruling_not_authority:${ruling}`);
    for (const [groupId, ids] of idsByGroup(asArray(base.groups))) {
      if (!curIds.has(groupId)) {
        out.push(`regression_group_removed:${groupId}`);
        continue;
      }
      const now = curIds.get(groupId);
      const excusedHere = excused.get(groupId) || new Set();
      const gone = ids.filter((id) => !now.includes(id));
      // An excuse counts only for an id that actually fell from this group.
      const excusedGone = gone.filter((id) => excusedHere.has(id));
      // The count may fall by exactly the excused ids that fell, never further.
      const allowed = ids.length - excusedGone.length;
      if (now.length < allowed) out.push(`regression_count_fell:${groupId}`);
      for (const id of gone) {
        if (!excusedHere.has(id)) out.push(`regression_case_removed:${groupId}|${id}`);
      }
    }
    if (asArray(cur && cur.removals).length < asArray(base.removals).length) out.push('removals_history_shortened');
  }
  return out;
}

/** G68-01: every active id of every group must have its record case. PURE. */
export function checkCasesPresent(cur, recordCaseIds) {
  const recorded = new Set(asArray(recordCaseIds));
  const out = [];
  for (const g of asArray(cur && cur.groups)) {
    for (const id of activeIdsOf(g)) {
      if (!recorded.has(id)) out.push(`case_missing:${id}`);
    }
  }
  return out;
}

/** The only door: remove ids from a group under an authority ruling, recompute the hash, append the removal. PURE. */
export function removeCases(cur, groupId, ids, ruling, rulings) {
  if (!isAuthority(ruling, rulings)) {
    return { set: cur, violations: [`ruling_not_authority:${ruling}`] };
  }
  const target = asArray(cur && cur.groups).find((g) => g.id === groupId);
  if (!target) return { set: cur, violations: [`remove_unknown_id:${groupId}`] };
  const active = activeIdsOf(target);
  const unknown = ids.filter((id) => !active.includes(id));
  if (unknown.length > 0) return { set: cur, violations: unknown.map((id) => `remove_unknown_id:${id}`) };
  const set = JSON.parse(JSON.stringify(cur));
  set.pending = asArray(set.pending);
  set.removals = asArray(set.removals);
  const g = set.groups.find((x) => x.id === groupId);
  g.ids = g.ids.filter((id) => !ids.includes(id));
  g.ids_sha256 = idsSha(g.ids);
  set.removals.push({ ruling, group: groupId, ids: [...ids] });
  return { set, violations: [] };
}
