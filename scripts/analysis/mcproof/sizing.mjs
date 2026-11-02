// SPEC LINK: docs/reports/decisions/2026-10-31-batch-an.json (M-440 six-stage review, M-444 sizing by risk,
//            M-445 the generated sizing decision, M-446 record integrity);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md
//
// MB-77 (a) — the sizing generator: one size path per example (`full`, `sample`, `quick`) by the numbered rules
// R0..R5, and the writer that stamps `sizing.json`.
//
// Rules, first match wins (each rule names its evidence string):
//   R1a-amended-ruling        an amended ruling still cited by the example            -> full
//   R1b-new-reading           an example flagged new                                  -> full
//   R1c-never-quick-layer     a layer listed in `never_quick_layers`                  -> full
//   R1d-full-review-increment an increment in `full_review_increments`                -> full
//   R0-quick-failed           a depth-`quick` review that differs on question or arithmetic (or, for a low-risk
//                             example, on question or claude)                          -> full
//   R2-approved-clause        every clause of a non-empty chain was approved (here or by an earlier example that is
//                             fully approved at depth `full` or `sample`)               -> quick
//   R3-approved-pattern       the signature (layer, formula_row, ordered chain, sorted rulings, branch) equals that
//                             of an earlier fully approved example at depth `full`/`sample` -> quick
//   rule 4 per agreement group (increment+layer, narrowed by `agreement_scope`): the first
//                             `agreement_min_sample` candidates are full (R4-fill); until the group has
//                             `agreement_min_sample` fully reviewed examples at `agreement_min_share` agreement no
//                             candidate may sample (R4-unchecked); then the seeded hash picks `sample` members
//                             (R4-sample, widened to `sample_min_per_layer`), the rest are quick (R4-sample-rest);
//                             with `sample_miss_reverts` a disagreeing sample member reverts the group (R4-reverted).
//   R5-unmatched              no rule matched                                           -> full
//
// "Fully approved" (a precedent) uses `mandatoryStages(layer, {path: depth, lowRisk:false, config}).required` from
// approval.mjs: every required stage is `approved`, and every other stage present is `approved` or `n/a` with a
// reason. "Fully reviewed" = blind and claude each `approved` or `differs`. "Agree" = both `approved`.
//
// Every settled value comes from the config through `cv(config, key)`; pure functions, no clock, no environment:
// the same inputs yield the same rows and the same `inputs_sha`.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { STAGES, mandatoryStages } from './approval.mjs';
import { assertSafeKeys, canonicalJson, compareIds, cv, loadConfig, sha16 } from './config.mjs';

/** The five honest reasons that make an example `full` before any precedent is consulted. */
const NEVER_QUICK = 'R1c-never-quick-layer';

/** True when `v` is a plain object (not null, not an array). */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** True when `k` is one of the map keys that would reach the prototype chain. */
function isForbiddenKey(k) {
  return k === '__proto__' || k === 'constructor' || k === 'prototype';
}

/** True when `s` is a non-empty, non-blank string. */
function hasText(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

/** Copy `xs` to a fresh string array; a non-array reads as the empty array. */
function asStrings(xs) {
  return Array.isArray(xs) ? xs.map((x) => String(x)) : [];
}

/** A null-prototype map carrying every own key of `obj` whose value is not `undefined`. */
function nullProtoFrom(obj) {
  const out = Object.create(null);
  if (!isPlainObject(obj)) return out;
  for (const k of Object.keys(obj)) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** The keys of a map-like input, sorted with `compareIds` (order never depends on the input file). */
function sortedMapKeys(map) {
  return Object.keys(map).sort(compareIds);
}

/** The status of one stage entry; a missing or malformed entry reads `absent`. */
function stageStatus(entry) {
  return isPlainObject(entry) && typeof entry.status === 'string' ? entry.status : 'absent';
}

/**
 * True when the review record makes every stage of the planned path approved: each required stage `approved` and
 * every other stage present `approved` or `n/a` with a reason. `mandatoryStages` throws `unknown_layer`.
 */
function fullyApproved(layer, depth, review, config) {
  const plan = mandatoryStages(layer, { path: depth, lowRisk: false, config });
  const required = new Set(asStrings(plan.required));
  if (required.size === 0) return false;
  for (const stage of required) {
    if (stageStatus(review[stage]) !== 'approved') return false;
  }
  for (const stage of STAGES) {
    if (required.has(stage)) continue;
    if (!Object.prototype.hasOwnProperty.call(review, stage)) continue;
    const entry = review[stage];
    if (!isPlainObject(entry) || entry.status === undefined) continue;
    const status = entry.status;
    if (status === 'approved') continue;
    if (status === 'n/a' && hasText(entry.reason)) continue;
    return false;
  }
  return true;
}

/** The depth the review stages were actually run at; anything but `full`/`quick`/`sample` reads `unknown`. */
function reviewDepth(review) {
  const depth = isPlainObject(review) ? review.depth : undefined;
  return depth === 'full' || depth === 'quick' || depth === 'sample' ? depth : 'unknown';
}

/** The seeded sample rank of an id: sha256(`sample_seed`:id) first 8 hex as a big-endian unsigned int. */
function sampleRank(seed, id) {
  const hex = crypto.createHash('sha256').update(String(seed) + ':' + String(id), 'utf8').digest('hex').slice(0, 8);
  return Number.parseInt(hex, 16);
}

/** The plain text of an increment: a string as it stands, a number or boolean as written, `null` for nothing. */
function incrementText(example) {
  const inc = example.increment;
  if (inc === undefined || inc === null) return 'null';
  return typeof inc === 'string' ? inc : String(inc);
}

/** The increment key of an example (the plain text, so `"1"` and `1` name the same group). */
function incrementKey(example) {
  return incrementText(example);
}

/** The agreement group of an example under `agreement_scope` (default `['increment','layer']`). */
function groupKey(example, scope) {
  const parts = [];
  if (scope.includes('increment')) parts.push('i=' + incrementKey(example));
  if (scope.includes('layer')) parts.push('l=' + String(example.layer));
  return parts.length === 0 ? 'all' : parts.join('|');
}

/** The ordered clause chain of an example. */
function chainOf(example) {
  return asStrings(example.clause_chain);
}

/**
 * `true` when the example's chain is non-empty and every clause of it is either in `approvals.approved_clauses`
 * or in the chain of an earlier example that is fully approved at depth `full` or `sample`.
 */
function clausesApproved(example, group, approvedClauses) {
  const chain = chainOf(example);
  if (chain.length === 0) return false;
  const approved = new Set();
  for (const prior of group) {
    if (!prior.fullyApproved) continue;
    for (const clause of chainOf(prior.example)) approved.add(clause);
  }
  for (const clause of approvedClauses) approved.add(clause);
  return chain.every((clause) => approved.has(clause));
}

/** The clause a licence cites (its newest clause, the end of the chain). */
function licenceClause(example) {
  const chain = chainOf(example);
  return chain.length === 0 ? '' : chain[chain.length - 1];
}

/** The precedent signature: layer, formula_row, ordered chain, sorted rulings, branch. */
function signatureOf(example) {
  return canonicalJson({
    layer: String(example.layer),
    formula_row: example.formula_row === undefined ? null : example.formula_row,
    clause_chain: chainOf(example),
    rulings_cited: asStrings(example.rulings_cited).sort(compareIds),
    branch: example.branch === undefined ? null : example.branch,
  });
}

/** `true` when an earlier fully approved example at depth `full` or `sample` carries the signature. */
function patternApproved(example, group) {
  if (chainOf(example).length === 0) return false;
  const signature = signatureOf(example);
  return group.some((prior) => prior.fullyApproved && prior.signature === signature);
}

/**
 * The amendment set of one example: its declared `amended_rulings` ids, intersected with the rulings it cites.
 * A missing or malformed entry fails closed: it reads as "changed", so the example is reviewed in full.
 */
function amendedFor(example, amendedRulings) {
  const id = String(example.id);
  if (!Object.prototype.hasOwnProperty.call(amendedRulings, id)) return [];
  const entry = amendedRulings[id];
  if (!Array.isArray(entry)) return null;
  const cited = new Set(asStrings(example.rulings_cited));
  const out = [];
  for (const r of entry) {
    const ruling = String(r);
    if (!cited.has(ruling)) continue;
    if (!out.includes(ruling)) out.push(ruling);
  }
  return out.sort(compareIds);
}

/** True when a depth-`quick` review differs on question or arithmetic (for a low-risk example: question or claude). */
function quickFailed(example, review, lowRiskLayer) {
  const question = stageStatus(review.question);
  const arithmetic = stageStatus(review.arithmetic);
  const claude = stageStatus(review.claude);
  return question === 'differs' || arithmetic === 'differs' || (String(example.layer) === lowRiskLayer && claude === 'differs');
}

/**
 * `computeSizing({examples, approvals, reviews, amended_rulings, config}) -> {config_sha, inputs_sha, rows}`.
 * Examples are processed in `compareIds` order, first matching rule wins; the rows are pure functions of the
 * inputs, so the same inputs always yield the same result.
 */
export function computeSizing(input) {
  const { examples, approvals, reviews, amended_rulings: amendedRulingsIn, config } = input ?? {};

  if (!isPlainObject(config)) throw new Error('config_key_missing:values');
  if (!Array.isArray(examples)) throw new Error('malformed:examples');
  assertSafeKeys(examples);
  assertSafeKeys(approvals);
  assertSafeKeys(reviews);
  assertSafeKeys(amendedRulingsIn);

  const approvalMap = nullProtoFrom(approvals);
  const approvedClauses = new Set(asStrings(approvalMap.approved_clauses));
  const reviewMap = nullProtoFrom(reviews);
  const amendedRulings = nullProtoFrom(amendedRulingsIn);

  const neverQuick = new Set(asStrings(cv(config, 'never_quick_layers')));
  const fullIncrements = new Set(asStrings(cv(config, 'full_review_increments')));
  const scope = asStrings(cv(config, 'agreement_scope'));
  const minSample = Number(cv(config, 'agreement_min_sample'));
  const minShare = Number(cv(config, 'agreement_min_share'));
  const seed = cv(config, 'sample_seed');
  const sampleShare = Number(cv(config, 'sample_share'));
  const sampleMin = Number(cv(config, 'sample_min_per_layer'));
  const missReverts = cv(config, 'sample_miss_reverts') === true;
  const lowRisk = cv(config, 'low_risk_arithmetic');
  const lowRiskLayer = isPlainObject(lowRisk) ? String(lowRisk.layer) : '';
  const lowRiskPath = isPlainObject(lowRisk) ? String(lowRisk.sizing_path) : '';

  // Every layer name must be known before any rule runs: `mandatoryStages` throws `unknown_layer`.
  for (const example of examples) mandatoryStages(example.layer, { path: 'full', lowRisk: false, config });
  // An example id is a map key of `reviews` / `amended_rulings`, so it obeys the same forbidden-key rule.
  for (const example of examples) {
    const key = String(example?.id);
    if (isForbiddenKey(key)) throw new Error(`forbidden_key:${key}`);
  }

  // One entry per example id: a map-like input repeats an id, and a row is keyed by id, so the later occurrence
  // (in input order) supersedes the earlier one and the list is then in `compareIds` order.
  const byExampleId = new Map();
  for (const example of examples) byExampleId.set(String(example.id), example);
  const ordered = [...byExampleId.entries()]
    .map(([id, example]) => ({ example, id }))
    .sort((a, b) => compareIds(a.id, b.id));

  const group = [];
  const decided = Object.create(null);
  const candidates = Object.create(null);

  for (const { example, id } of ordered) {
    const review = Object.prototype.hasOwnProperty.call(reviewMap, id) ? reviewMap[id] : undefined;
    const depth = reviewDepth(review);
    const precedent = depth === 'full' || depth === 'sample' ? fullyApproved(example.layer, depth, review, config) : false;
    const signature = signatureOf(example);
    const decide = (rule, evidence) => {
      decided[id] = { rule, evidence };
    };

    const amended = amendedFor(example, amendedRulings);
    if (amended === null || amended.length > 0) {
      decide('R1a-amended-ruling', amended === null ? 'amended rulings unreadable: fail closed' : 'ruling ' + amended.join(', ') + ' amended');
    } else if (example.is_new === true) {
      decide('R1b-new-reading', 'example flagged new');
    } else if (neverQuick.has(String(example.layer))) {
      decide(NEVER_QUICK, 'layer ' + String(example.layer) + ' is never quick');
    } else if (fullIncrements.has(incrementText(example))) {
      decide('R1d-full-review-increment', 'increment ' + incrementText(example) + ' is fully reviewed');
    } else if (depth === 'quick' && quickFailed(example, review, lowRiskLayer)) {
      decide('R0-quick-failed', 'the quick-path check differs: the example goes to full review');
    } else if (clausesApproved(example, group, approvedClauses)) {
      decide('R2-approved-clause', 'clause ' + licenceClause(example) + ' approved');
    } else if (patternApproved(example, group)) {
      decide('R3-approved-pattern', 'pattern of an earlier fully approved example');
    } else {
      const key = groupKey(example, scope);
      if (candidates[key] === undefined) candidates[key] = [];
      candidates[key].push(id);
    }
    // Rules R2 and R3 look only at examples EARLIER in `compareIds` order: this example joins the pool after its own decision.
    group.push({ example, id, fullyApproved: precedent, signature });
  }

  // Rule 4, per agreement group: the first `agreement_min_sample` candidates are full (R4-fill); beyond them
  // sampling is open only when the group has `agreement_min_sample` fully reviewed examples at the agreement share.
  const rankOf = Object.create(null);
  for (const { id } of ordered) rankOf[id] = sampleRank(seed, id);
  for (const key of sortedMapKeys(candidates)) {
    const ids = candidates[key];
    const members = ordered.filter((entry) => groupKey(entry.example, scope) === key);
    const reviewed = members.filter((entry) => {
      const review = Object.prototype.hasOwnProperty.call(reviewMap, entry.id) ? reviewMap[entry.id] : undefined;
      const blind = stageStatus(isPlainObject(review) ? review.blind : undefined);
      const claude = stageStatus(isPlainObject(review) ? review.claude : undefined);
      return (blind === 'approved' || blind === 'differs') && (claude === 'approved' || claude === 'differs');
    });
    const agreeing = reviewed.filter((entry) => {
      const review = reviewMap[entry.id];
      return stageStatus(review.blind) === 'approved' && stageStatus(review.claude) === 'approved';
    });
    const sampleOpen = reviewed.length >= minSample && agreeing.length / reviewed.length >= minShare;

    const fill = ids.slice(0, minSample);
    const rest = ids.slice(minSample);
    for (const id of fill) decided[id] = { rule: 'R4-fill', evidence: 'among the first ' + String(minSample) + ' unchecked examples of the group: full review' };
    if (!sampleOpen) {
      for (const id of rest) {
        decided[id] = { rule: 'R4-unchecked', evidence: String(reviewed.length) + ' fully reviewed in the group, ' + String(agreeing.length) + ' agreeing: the agreement window is not reached' };
      }
      continue;
    }

    // The seeded hash picks the sample; the floor `sample_min_per_layer` adds the lowest-hash candidates (id tie-break).
    const chosen = new Set(rest.filter((id) => rankOf[id] / 0xffffffff < sampleShare));
    const floorCount = Math.min(rest.length, Math.max(0, Number.isFinite(sampleMin) ? sampleMin : 0));
    if (chosen.size < floorCount) {
      const byRank = rest.filter((id) => !chosen.has(id)).sort((a, b) => (rankOf[a] !== rankOf[b] ? rankOf[a] - rankOf[b] : compareIds(a, b)));
      for (const id of byRank) {
        if (chosen.size >= floorCount) break;
        chosen.add(id);
      }
    }
    // A reviewed sample member that disagrees (blind or claude not approved) sends the whole group back to full.
    let missed = false;
    if (missReverts) {
      for (const id of chosen) {
        const review = Object.prototype.hasOwnProperty.call(reviewMap, id) ? reviewMap[id] : undefined;
        if (!isPlainObject(review)) continue;
        const blind = stageStatus(review.blind);
        const claude = stageStatus(review.claude);
        const ran = blind !== 'absent' || claude !== 'absent';
        if (ran && (blind !== 'approved' || claude !== 'approved')) missed = true;
      }
    }
    for (const id of rest) {
      if (missed) decided[id] = { rule: 'R4-reverted', evidence: 'a sampled example disagreed: the group returns to full review' };
      else if (chosen.has(id)) decided[id] = { rule: 'R4-sample', evidence: 'seeded hash selects the example for full review' };
      else decided[id] = { rule: 'R4-sample-rest', evidence: 'seeded hash leaves the example on the quick path' };
    }
  }

  const rows = ordered.map(({ example, id }) => {
    const entry = decided[id] ?? { rule: 'R5-unmatched', evidence: 'no rule matched' };
    const sizePath =
      entry.rule === 'R2-approved-clause' || entry.rule === 'R3-approved-pattern' || entry.rule === 'R4-sample-rest'
        ? 'quick'
        : entry.rule === 'R4-sample'
          ? 'sample'
          : 'full';
    return {
      id,
      layer: String(example.layer),
      path: sizePath,
      rule: entry.rule,
      evidence: entry.evidence,
      low_risk_arithmetic: String(example.layer) === lowRiskLayer && sizePath === lowRiskPath,
    };
  });

  const approvalsSorted = nullProtoFrom(approvals);
  approvalsSorted.approved_clauses = asStrings(approvalsSorted.approved_clauses).sort(compareIds);
  const reviewsSorted = Object.create(null);
  for (const id of sortedMapKeys(reviewMap)) reviewsSorted[id] = reviewMap[id];
  const amendedSorted = Object.create(null);
  for (const id of sortedMapKeys(amendedRulings)) amendedSorted[id] = amendedRulings[id];

  const inputsSha = sha16(
    canonicalJson({
      examples: ordered.map((entry) => entry.example),
      approvals: approvalsSorted,
      reviews: reviewsSorted,
      amended_rulings: amendedSorted,
    }),
  );

  const configSha = typeof config.config_sha === 'string' ? config.config_sha : sha16(canonicalJson(config.values));

  return { config_sha: configSha, inputs_sha: inputsSha, rows };
}

/**
 * Resolve `p` to a path that stays inside `root` once symlinks are resolved on both sides: a `..` jump, an absolute
 * path elsewhere, or a symlinked directory that leads out is refused (`path_outside_task_root:<label>`).
 */
function resolveInside(root, p, label) {
  if (!hasText(p)) throw new Error(`path_outside_task_root:${label}`);
  const realRoot = fs.realpathSync(root);
  const target = path.resolve(p);
  let probe = target;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const realTarget = path.join(fs.realpathSync(probe), path.relative(probe, target));
  const rel = path.relative(realRoot, realTarget);
  if (path.isAbsolute(rel) || rel === '..' || rel.startsWith('..' + path.sep)) {
    throw new Error(`path_outside_task_root:${label}`);
  }
  return target;
}

/** Read a JSON file, failing closed: a missing or unreadable file throws `unreadable:<label>`. */
function readJson(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`unreadable:${label}`, { cause: err });
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`malformed:${label}`, { cause: err });
  }
}

/**
 * `runSizingFiles({examplesPath, approvalsPath, reviewsPath, amendedPath, outPath, configPath?, taskRoot})`:
 * every input and `outPath` must resolve inside `taskRoot`, a symlink at `outPath` is refused, a missing
 * `amendedPath` throws. Writes `sizing.json` as 2-space JSON with a stable key order and no timestamp, and
 * returns the written object.
 */
export function runSizingFiles(input) {
  const { examplesPath, approvalsPath, reviewsPath, amendedPath, outPath, taskRoot } = input ?? {};
  if (!hasText(taskRoot)) throw new Error('task_root_required');
  if (!fs.existsSync(taskRoot)) throw new Error('task_root_missing');
  const resolved = {
    examplesPath: resolveInside(taskRoot, examplesPath, 'examplesPath'),
    approvalsPath: resolveInside(taskRoot, approvalsPath, 'approvalsPath'),
    reviewsPath: resolveInside(taskRoot, reviewsPath, 'reviewsPath'),
    amendedPath: resolveInside(taskRoot, amendedPath, 'amendedPath'),
  };
  const resolvedOut = resolveInside(taskRoot, outPath, 'outPath');

  if (fs.existsSync(resolvedOut) && fs.lstatSync(resolvedOut).isSymbolicLink()) throw new Error('out_path_symlink');

  // `amendedPath` fails closed: it must exist and parse, or nothing is written.
  const amended = readJson(resolved.amendedPath, 'amendedPath');
  if (!isPlainObject(amended)) throw new Error('malformed:amendedPath');

  const examples = readJson(resolved.examplesPath, 'examplesPath');
  const approvals = readJson(resolved.approvalsPath, 'approvalsPath');
  const reviews = readJson(resolved.reviewsPath, 'reviewsPath');
  if (!Array.isArray(examples)) throw new Error('malformed:examplesPath');
  if (!isPlainObject(approvals)) throw new Error('malformed:approvalsPath');
  if (!isPlainObject(reviews)) throw new Error('malformed:reviewsPath');

  const config = hasText(input.configPath) ? loadConfig(input.configPath) : loadConfig();

  const result = computeSizing({ examples, approvals, reviews, amended_rulings: amended, config });
  const payload = JSON.parse(JSON.stringify(result));
  fs.writeFileSync(resolvedOut, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}
