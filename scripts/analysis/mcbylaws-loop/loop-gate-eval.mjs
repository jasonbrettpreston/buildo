// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 (the gate composes every check: oracle-first G68-04, records G68-01/G68-06, floors M-322, OWED M-372/PR-68-7, prereg M-321, regression M-343)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 1, 6, 8 (the gate contract and its order of work, the classes V68-1, run honesty and increment green)
// Pure composition: every rule lives in its own module and is imported here, never restated. evaluateGate does no IO.
// -> { violations: string[], notes: string[] }; a code with a detail is `code:detail`. Violations are de-duplicated in first-seen order.
import { metadataOnly, commitStageFires, checkOracleFirst, recordMissing } from './loop-oracle.mjs';
import {
  checkRecordsAddOnly,
  checkRecordShape,
  checkBound,
  statusOf,
} from './loop-record.mjs';
import { checkDecision, checkRun } from './loop-decide.mjs';
import { checkOneIncrement, checkSkipAhead, incrementGreen } from './loop-increment.mjs';
import { checkRegression, checkCasesPresent } from './loop-regression.mjs';
import { checkFloorEdit, checkCountFloors, checkOwedRatchet } from './loop-floors.mjs';
import { checkPreregFile, checkPreregMoves, preregRefusesAccept, checkPreregHistory } from './loop-prereg.mjs';

const OUT_OF_SCOPE = 'out of scope: no code, oracle or generated path changed';
const CI_NO_RUN = 'external groups: not run in CI';

const asArray = (value) => (Array.isArray(value) ? value : []);

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// The non-git inputs a run binds (O68-02): a `data:<group>` content hash and a `pin / <group> / <key>` scorer pin value.
const LIVE_INPUT_RE = /^(data:|pin \/ )/;

const hasViolation = (violations, code) => violations.some((v) => v === code || String(v).startsWith(`${code}:`));

/**
 * O68-02: every non-git input of the record (`data:` / `pin / `) against the run's recomputed value (`inputsFresh`).
 * A value that differs is `stale_green:<key>` (the round WAS green on an input that has since moved). At `ci`, or with no
 * run (the recomputed side does not exist there), or for a key the run does not recompute, nothing is judged.
 */
function staleLiveInputs(ctx, rec) {
  const run = ctx.run;
  if (!run || !isObject(run.inputsFresh)) return [];
  if (ctx.mode === 'ci') return [];
  const fresh = isObject(run.inputsFresh) ? run.inputsFresh : {};
  const inputs = isObject(rec && rec.inputs) ? rec.inputs : {};
  const out = [];
  for (const key of Object.keys(inputs)) {
    if (!LIVE_INPUT_RE.test(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(fresh, key)) continue;
    if (fresh[key] !== inputs[key]) out.push(`stale_green:${key}`);
  }
  return out;
}

/**
 * Every active id of every group of a regression set (G68-01: the declared set). `ranGroups` (the ids a run actually ran) narrows
 * it to those groups: a commit run runs the fast groups only, so the groups it skips by design are not declared. Absent = all.
 */
function activeIds(regression, ranGroups = null) {
  const scope = ranGroups instanceof Set ? ranGroups : Array.isArray(ranGroups) ? new Set(ranGroups) : null;
  const out = [];
  for (const group of asArray(regression && regression.groups)) {
    if (scope && !(group && scope.has(group.id))) continue;
    for (const id of asArray(group && group.ids)) out.push(id);
  }
  return out;
}

/** The id -> group map of a regression set (the record-vs-run comparison reads it). PURE. */
function groupOfId(regression) {
  const out = new Map();
  for (const group of asArray(regression && regression.groups)) {
    for (const id of asArray(group && group.ids)) if (!out.has(id)) out.set(id, group.id);
  }
  return out;
}

/**
 * The groups a run actually ran (computeRun's `ranGroups`), or null when the run does not say: then every group is in scope, as
 * before. A commit run runs the fast groups only, so the groups it skips by design are not its to answer for.
 */
function ranGroupsOf(ctx) {
  const ran = ctx.run ? ctx.run.ranGroups : null;
  return Array.isArray(ran) ? new Set(ran) : null;
}

/** PURE. A case `case_missing` line is demanded by one group; this reads that group off it. */
const CASE_MISSING_RE = /^case_missing:(.*)$/;

/**
 * The `case_missing` lines an absent-group scope excuses: a declared id of a group the run never ran (it cannot carry its case).
 * Every other violation passes through untouched. PURE.
 */
function withoutUnranGroups(violations, regression, ranGroups) {
  if (ranGroups === null) return violations;
  const groupOf = groupOfId(regression);
  return violations.filter((v) => {
    const m = CASE_MISSING_RE.exec(String(v));
    if (!m) return true;
    const group = groupOf.get(m[1] === undefined ? '' : m[1]);
    return group === undefined || ranGroups.has(group);
  });
}

/** The case ids an accepted finding names (a covered case is a registered value change). */
function findingCases(rec) {
  const out = new Set();
  for (const item of asArray(rec && rec.accepted_findings)) {
    if (item && typeof item === 'object' && typeof item.case === 'string') out.add(item.case);
  }
  return out;
}

function dedupe(list) {
  return [...new Set(list)];
}

/** Stage 1 + 2: scope, add-only records, oracle-first, record presence. -> { early: boolean, violations }. */
function stageScopeAndRecords(ctx) {
  const nameStatus = asArray(ctx.nameStatus);
  if (!commitStageFires(nameStatus, ctx.classify)) {
    return { early: true, outOfScope: true, violations: [] };
  }
  const violations = [
    ...checkRecordsAddOnly(nameStatus),
    ...checkOracleFirst(asArray(ctx.commits), ctx.classify),
    ...recordMissing(nameStatus, ctx.classify),
  ];
  return { early: hasViolation(violations, 'record_missing'), outOfScope: false, violations };
}

/** Stage 3: the newest record of the current increment — shape, binding, decision, one increment, skip-ahead, prereg. */
function stageRecord(ctx, rec) {
  const out = [];
  out.push(...checkRecordShape(rec));
  out.push(...checkBound({ inputs: rec.inputs, treeBlobs: ctx.treeBlobs, changedBound: ctx.changedBound }));
  out.push(...staleLiveInputs(ctx, rec));
  out.push(...checkDecision(rec, ctx.rulings, ctx.cardExists));
  out.push(
    ...checkOneIncrement({
      prereg: ctx.prereg || { increment: null },
      record: rec,
      rowsTouched: asArray(ctx.rowsTouched),
      newCases: asArray(ctx.newCases),
      ids: ctx.incrementIds,
    }),
  );
  if (ctx.firstRoundOfIncrement) {
    out.push(...checkSkipAhead(rec.increment, asArray(ctx.greenHistory), ctx.incrementIds));
  }
  if (!ctx.prereg) {
    out.push('prereg_missing');
  } else {
    out.push(...checkPreregFile(ctx.prereg));
    const run = ctx.run;
    if (run) {
      const moves = checkPreregMoves(ctx.prereg, run.baseRows, run.curRows);
      out.push(...moves);
      out.push(...preregRefusesAccept(moves, rec.decision));
    }
    if (ctx.mode !== 'commit' && ctx.preregHistory) {
      out.push(...checkPreregHistory(ctx.preregHistory));
    }
  }
  return out;
}

/**
 * Stage 4: the regression ratchet, floor edits, OWED, and the run's own report. `presence` holds the `checkCasesPresent` lines,
 * gathered with the run's `declaredIds` in stage 5: a group the run never ran is not demanded by either of the two.
 */
function stageRatchet(ctx, rec, presence) {
  const out = [];
  const regression = ctx.regression || { base: null, cur: null };
  if (regression.cur) {
    out.push(...checkRegression(regression.base, regression.cur, ctx.rulings));
    out.push(...presence);
  }
  const floors = ctx.floors || {};
  if (floors.percentBase && floors.percentCur) out.push(...checkFloorEdit(floors.percentBase, floors.percentCur, ctx.rulings));
  if (floors.countBase && floors.countCur) out.push(...checkFloorEdit(floors.countBase, floors.countCur, ctx.rulings));
  const run = ctx.run;
  if (run && run.report) {
    out.push(...checkOwedRatchet(ctx.baselineOwed, asArray(run.report.owed)));
    out.push(...asArray(run.report.violations));
    if (floors.countCur) out.push(...checkCountFloors(floors.countCur, run.counts));
  }
  return out;
}

/**
 * Stage 5: run honesty. A null run is run_missing, except in CI where the external groups simply do not run.
 * -> { violations, notes, declaredIds } (`declaredIds` is the scope stage 4's case presence is measured in).
 */
function stageRun(ctx, rec) {
  const notes = [];
  const out = [];
  const run = ctx.run;
  if (!run) {
    if (ctx.mode === 'ci') notes.push(CI_NO_RUN);
    else out.push('run_missing');
    return { violations: out, notes, declaredIds: null };
  }
  // Only the ids of the groups THIS run ran are declared (commit runs the fast ones; a group skipped by design is not its case set).
  const declaredIds = activeIds(ctx.regression ? ctx.regression.cur : null, ranGroupsOf(ctx));
  out.push(...checkRun({
    declaredIds,
    cases: run.cases,
    skipped: run.skipped,
    canary: run.canary,
  }));
  out.push(...asArray(run.regenMismatch));
  const ranGroups = ranGroupsOf(ctx);
  const groupOf = groupOfId(ctx.regression ? ctx.regression.cur : null);

  const prev = ctx.prevCases || {};
  const covered = findingCases(rec);
  const byId = new Map();
  for (const item of asArray(run.cases)) if (item && typeof item.id === 'string') byId.set(item.id, item);
  for (const item of asArray(rec.cases)) {
    if (!item || typeof item.id !== 'string') continue;
    // A case of a group this run never ran has no run case to be compared with: it is not `record_differs_from_run`.
    if (ranGroups !== null && !byId.has(item.id)) {
      const group = groupOf.get(item.id);
      if (group !== undefined && !ranGroups.has(group)) continue;
    }
    const before = prev[item.id];
    // Both sides are GATE STATUSES (O68-01): the record's status and the previous round's status share one vocabulary.
    const status = statusOf(item.status);
    const beforeStatus = before ? statusOf(before.status) : undefined;
    if (before && beforeStatus === status && before.got_sha !== item.got_sha && !covered.has(item.id)) {
      out.push(`value_changed_unregistered:${item.id}`);
    }
    const ran = byId.get(item.id);
    // The run case is compared on the same gate status (O68-01): a raw scorer class is never compared with a record status.
    if (!ran || statusOf(ran.status) !== status || ran.got_sha !== item.got_sha) {
      out.push(`record_differs_from_run:${item.id}`);
    }
  }
  return { violations: out, notes, declaredIds };
}

/** Stage 6: an accept is only lawful on a green increment; every reason is named. */
function stageAccept(ctx, rec) {
  if (rec.decision !== 'accept') return [];
  const run = ctx.run;
  if (!run) return [];
  const cases = asArray(run.cases).map((c) => ({
    id: c.id,
    // incrementGreen judges a gate status (its GREEN_STATUSES are pass|accepted); a class is mapped through the one map (O68-01).
    status: statusOf(c.status),
    group: c.group === undefined ? null : c.group,
  }));
  const verdict = incrementGreen({
    increment: rec.increment,
    ids: ctx.incrementIds,
    groups: asArray(run.groups),
    cases,
    floorsOk: run.floorsOk === true,
    canaryOk: Boolean(run.canary) && run.canary.observed === 'fail',
  });
  return asArray(verdict.reasons).map((reason) => `accept_but_not_green:${reason}`);
}

/**
 * O68-01 (operator fix 1): a change whose every classified path is METADATA (the rule map, the amendment index) is not a round:
 * no record stage is judged. What IS judged is the run's regeneration and its own report (the pin and the floors still run), and a
 * missing run is `run_missing` (or the CI note). -> { violations, notes }.
 */
function stageMetadataOnly(ctx) {
  const run = ctx.run;
  const violations = run
    ? [...asArray(run.regenMismatch), ...asArray(run.report && run.report.violations)]
    : [];
  if (run) return { violations, notes: [] };
  if (ctx.mode === 'ci') return { violations, notes: [CI_NO_RUN] };
  return { violations: [...violations, 'run_missing'], notes: [] };
}

/**
 * The whole gate as one pure decision over plain data. Order of work follows plan section 1: scope, records, the
 * newest record, the ratchet and floors, the run, and finally the accept's increment-green verdict. The run's stage is computed
 * before the ratchet (its `declaredIds` scope stage 4's case presence), but both are reported in that order.
 */
export function evaluateGate(ctx) {
  // O68-01 (operator fix 1): a metadata-only change skips the record stages and is judged on the run alone.
  if (metadataOnly(asArray(ctx.nameStatus), ctx.classify)) {
    const verdict = stageMetadataOnly(ctx);
    return { violations: dedupe(verdict.violations), notes: verdict.notes };
  }
  const scope = stageScopeAndRecords(ctx);
  if (scope.outOfScope) return { violations: [], notes: [OUT_OF_SCOPE] };
  const violations = [...scope.violations];
  if (scope.early) return { violations: dedupe(violations), notes: [] };

  const rec = ctx.latest ? ctx.latest.rec : null;
  if (!rec) return { violations: dedupe([...violations, 'record_missing']), notes: [] };

  const runStage = stageRun(ctx, rec);
  const presence = withoutUnranGroups(
    checkCasesPresent(ctx.regression ? ctx.regression.cur : null, asArray(rec.cases).map((c) => (c ? c.id : null))),
    ctx.regression ? ctx.regression.cur : null,
    ranGroupsOf(ctx),
  );
  violations.push(...stageRecord(ctx, rec));
  violations.push(...stageRatchet(ctx, rec, presence));
  violations.push(...runStage.violations);
  violations.push(...stageAccept(ctx, rec));
  return { violations: dedupe(violations), notes: [...runStage.notes] };
}
