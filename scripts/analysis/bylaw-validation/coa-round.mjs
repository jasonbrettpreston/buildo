// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.305 (CoA tools coa-*), m.56 (--accept --ruling is the one door for a pin), m.70 (pre-registration committed before the round), m.307 (classes outside both percentages)
// SPEC LINK: pending rows CHAT-63.C3 (BY-LAW CHANGED), CHAT-63.C4 (per-round pre-registration), CHAT-63.C5 (floors through the pin door)
//
// Pure helpers the CoA scorer (coa-scorecard.mjs) calls; no IO except the ruling reader the table pins already use.
//   C-3  bylawStatusAtDecision   a verified in-force date after the decision date -> 'changed'; a tag without one -> 'unverified'; nothing guessed
//   CHAT-198.NN-Q1  ANSWERED (no City figure): the evaluator answers, the notice prints no figure to compare: in the answered numerator and denominator, out of accuracy
//   C-5  statsOf / floorsFrom / evalFloors / checkFloors / reportFloors / parseOwed / acceptFloors   floors per article (>= 10 scored rows) + pooled rest + overall; moved only by --accept --ruling
//   C-4  diffMoves / checkPrereg / checkPreregShape   expected moves and totals registered before a round; an unexpected move is a finding
import { lawAtHearing, pathCompatible } from '../bylaw/oracle-c.mjs';

export const CHANGED_CLASS = 'BY-LAW CHANGED';
export const FLOOR_MIN_SCORED = 10; // CHAT-63.C5: a floor per article with at least this many scored rows; the smaller ones are pooled

// ---------------------------------------------------------------- C-3
/**
 * Amendment tags of the cited provision against the decision date. tags = the provisions row's amendments
 * ({bylaw, clause_path, qualifier}); only tags on the cited clause path count.
 * 'changed' only on a VERIFIED in-force date after the decision date; a tag with no verified date is 'unverified' (the oracle C reason
 * amendment_status_unverified), even when its by-law number year or order qualifier suggests a later date (oracle C's inferences are not used here).
 */
export function bylawStatusAtDecision(tags, statuses, date, clausePath) {
  const on = (tags || []).filter((t) => pathCompatible(t.clause_path, clausePath || ''));
  if (!on.length) return { state: 'none', bylaws: [] };
  const key = (t) => t.bylaw || `order:${t.qualifier || 'unknown'}`;
  if (!date) return { state: 'unverified', bylaws: [...new Set(on.map(key))].sort() };
  const changed = [];
  const unverified = [];
  for (const t of on) {
    const r = lawAtHearing([t], statuses, date);
    if (!r) continue;
    if (r.basis === 'verified_in_force_on') changed.push(key(t)); else unverified.push(key(t));
  }
  if (changed.length) return { state: 'changed', bylaws: [...new Set(changed)].sort() };
  if (unverified.length) return { state: 'unverified', bylaws: [...new Set(unverified)].sort() };
  return { state: 'none', bylaws: [] };
}

// ---------------------------------------------------------------- C-5
/** The article of a normalised clause: its first three dotted numbers (10.20.40.70(1) -> 10.20.40). */
export const articleOf = (norm) => (/^(\d+\.\d+\.\d+)/.exec(String(norm || '')) || [])[1] || 'other';

export const ANSWERED_CLASS = 'ANSWERED';
const blank = () => ({ match: 0, differ: 0, na: 0, ow: 0, an: 0 });
const rates = (c) => {
  const scored = c.match + c.differ;
  const ans = scored + c.an; // answered rows: scored plus ANSWERED (no City figure)
  return { ...c, scored, accuracy: scored ? c.match / scored : null, answered: ans + c.na + c.ow ? ans / (ans + c.na + c.ow) : null };
};
const KEY = { MATCH: 'match', DIFFER: 'differ', 'NO ANSWER': 'na', OWED: 'ow', [ANSWERED_CLASS]: 'an' };

/** accuracy = MATCH/(MATCH+DIFFER); answered = (MATCH+DIFFER+ANSWERED)/(MATCH+DIFFER+ANSWERED+NO ANSWER+OWED) (CHAT-198.NN-Q1). Every other class is in neither. */
export function statsOf(rows) {
  const overall = blank();
  const art = {};
  for (const r of rows) {
    const k = KEY[r.class];
    if (!k) continue;
    const a = articleOf(r.clause_norm);
    art[a] = art[a] || blank();
    art[a][k] += 1;
    overall[k] += 1;
  }
  return { overall: rates(overall), articles: Object.fromEntries(Object.keys(art).sort().map((a) => [a, rates(art[a])])) };
}

const down = (x) => (x == null ? null : Math.floor(x * 100 + 1e-9)); // percent, rounded down
const floorOf = (s) => ({ accuracy: down(s.accuracy), answered: down(s.answered) });
const pool = (list) => rates(list.reduce((t, s) => ({ match: t.match + s.match, differ: t.differ + s.differ, na: t.na + s.na, ow: t.ow + s.ow, an: t.an + s.an }), blank()));

/** Floors from a run: overall, one per article with >= FLOOR_MIN_SCORED scored rows, one pooled floor for the rest. */
export function floorsFrom(stats) {
  const big = Object.entries(stats.articles).filter(([, s]) => s.scored >= FLOOR_MIN_SCORED);
  const small = Object.entries(stats.articles).filter(([, s]) => s.scored < FLOOR_MIN_SCORED).map(([, s]) => s);
  return {
    overall: floorOf(stats.overall),
    articles: Object.fromEntries(big.map(([a, s]) => [a, floorOf(s)])),
    pooled: small.length ? floorOf(pool(small)) : null,
  };
}

/**
 * Every floor line with its status. A line is "<scope> <metric>": scope = "overall", "article <a>" or "pooled articles"; metric = accuracy | answered;
 * an article with >= FLOOR_MIN_SCORED scored rows and no floor is the single line "article <a>". Percent compared unrounded: a run below the floor fails.
 */
export function evalFloors(floors, stats) {
  const out = [];
  const cmp = (label, f, s) => {
    for (const m of ['accuracy', 'answered']) {
      if (f[m] == null || s[m] == null) continue;
      const bad = s[m] * 100 + 1e-9 < f[m];
      out.push({ line: `${label} ${m}`, status: bad ? 'FAIL' : 'PASS', measured: s[m] * 100, floor: f[m], msg: bad ? `${label} ${m} ${(s[m] * 100).toFixed(1)} % is below its floor ${f[m]} %` : '' });
    }
  };
  cmp('overall', floors.overall, stats.overall);
  const small = [];
  for (const [a, s] of Object.entries(stats.articles)) {
    if (floors.articles[a]) cmp(`article ${a}`, floors.articles[a], s);
    else if (s.scored >= FLOOR_MIN_SCORED) out.push({ line: `article ${a}`, status: 'FAIL', msg: `article ${a} has ${FLOOR_MIN_SCORED} or more scored rows and no floor (add it with --accept --ruling)` });
    else small.push(s);
  }
  if (small.length && floors.pooled) cmp('pooled articles', floors.pooled, pool(small));
  return out;
}

/** Violations (empty = every floor holds). OWED is not known here: a caller cannot count a failing line as passing. */
export function checkFloors(floors, stats) {
  return evalFloors(floors, stats).filter((x) => x.status === 'FAIL').map((x) => x.msg);
}

/**
 * The lines the register owes to Phase 3 (M-372..M-374): a row whose title is "OWED to Phase 3: [cumulative] <line>." and whose status is
 * RULED or RATIFIED with "OWED to Phase 3 (<tasks>) since <date>". Only such a row can make a failing line OWED. Map(line -> {row, tasks, since}). PURE.
 */
export function parseOwed(registerText) {
  const out = new Map();
  for (const ln of String(registerText).split(/\r?\n/)) {
    const id = /^\|\s*\*\*(M-\d+)\*\*\s*\|/.exec(ln);
    if (!id) continue;
    const cells = ln.split('|').map((c) => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
    const title = /^\*\*OWED to Phase 3: (?:cumulative )?(.+?)\.\*\*/.exec(cells[1] || '');
    const st = /^(?:RULED|RATIFIED)\b.*OWED to Phase 3 \((.+)\) since (\d{4}-\d{2}-\d{2})/.exec(cells[cells.length - 1] || '');
    if (!title || !st) continue;
    const tasks = [...new Set(st[1].match(/MB-\d+/g) || [])];
    if (!tasks.length) continue;
    const am = /^(\d[\d.]*) (accuracy|answered)$/.exec(title[1]);
    const line = am ? `article ${am[1]} ${am[2]}` : /^pooled articles (accuracy|answered)$/.test(title[1]) ? title[1] : /^overall (accuracy|answered)$/.test(title[1]) ? title[1] : null;
    if (line) out.set(line, { row: id[1], tasks, since: st[2] });
  }
  return out;
}

/**
 * The floors check as the scorer prints it. FAIL lines first (exit 1); OWED lines (below floor and named by an owing row) in their own section, never PASS.
 * Exit 0 only when every line is PASS or OWED. The first line is "FLOORS FAIL: ..." or "FLOORS OK ...". PURE.
 */
export function reportFloors(floors, stats, registerText) {
  const owing = parseOwed(registerText);
  const lines = evalFloors(floors, stats);
  const fail = lines.filter((x) => x.status === 'FAIL' && !(owing.has(x.line) && x.floor != null));
  const owed = lines.filter((x) => x.status === 'FAIL' && owing.has(x.line) && x.floor != null).map((x) => ({ ...x, ...owing.get(x.line) }));
  const section = owed.length ? ['OWED (not counted as PASS): each is a hard FAIL again at Phase 3 close (MB-46) if not fixed', ...owed.map((x) => `  OWED ${x.line} ${x.measured.toFixed(1)} % against floor ${x.floor} % | ${x.row} | fixed by ${x.tasks.join(', ')} | owed since ${x.since}`)] : [];
  const head = fail.length ? `FLOORS FAIL: ${fail.map((x) => x.msg).join('; ')}`
    : owed.length ? `FLOORS OK (OWED: ${owed.length}, listed)`
      : `FLOORS OK: overall ${JSON.stringify(floors.overall)}, ${Object.keys(floors.articles).length} article floors + pooled`;
  return { code: fail.length ? 1 : 0, fail, owed, pass: lines.filter((x) => x.status === 'PASS'), text: [head, ...section].join('\n') };
}

/** Rows that are authority for --accept --ruling (M-343): RATIFIED, or RULED (operator approved, recorded via the decision log). */
const AUTHORITY = new Set(['RATIFIED', 'RULED']);

/**
 * The one door for a floor change (Spec 133 m.56: --accept --ruling=<RATIFIED or RULED id>, M-343). Moves ONLY the lines named (P2C-Q5): each named line is set
 * to its measured value from this run, or to the value the ruling states ("<line>=<n>"); every other line, and the dataset, are untouched. The ruling and the
 * lines moved are appended to the history. `rulings` = Map(id -> status) from universe.mjs parseRulings. `lines` = ["article 150.8.60", "pooled articles accuracy=95", ...].
 */
export function acceptFloors(floors, stats, ruling, rulings, lines) {
  if (!ruling) throw new Error('floors: a change needs --accept --ruling=<RATIFIED or RULED register id>');
  if (!AUTHORITY.has(rulings.get(ruling))) throw new Error(`floors: ruling ${ruling} is not RATIFIED or RULED (${rulings.get(ruling) || 'absent'})`);
  if (!lines || !lines.length) throw new Error('floors: --accept names no line (--line="article 150.8.60", --line="pooled articles accuracy=95"); it moves only the lines named');
  const next = JSON.parse(JSON.stringify(floors));
  next.articles = next.articles || {};
  const measured = floorsFrom(stats);
  const moved = [];
  for (const spec of lines) {
    const vm = /^(.*?)(?:=(.*))?$/.exec(spec);
    const name = vm[1].trim();
    const stated = vm[2] === undefined ? null : Number(vm[2]);
    if (stated !== null && !(Number.isFinite(stated) && stated >= 0 && stated <= 100)) throw new Error(`floors: value for "${name}" is not a percent (${vm[2]})`);
    const m = /^(?:(overall|pooled articles) (accuracy|answered)|article (\d[\d.]*)(?: (accuracy|answered))?)$/.exec(name);
    if (!m) throw new Error(`floors: "${name}" is not a line`);
    const metrics = m[2] ? [m[2]] : m[4] ? [m[4]] : ['accuracy', 'answered'];
    if (stated !== null && metrics.length !== 1) throw new Error(`floors: a stated value needs a metric ("${name} accuracy=${vm[2]}")`);
    const measure = m[1] === 'overall' ? measured.overall : m[1] === 'pooled articles' ? measured.pooled : stats.articles[m[3]] ? floorOf(stats.articles[m[3]]) : null;
    if (!measure) throw new Error(`floors: "${name}" is not a line (no such article or pool in this run)`);
    const target = m[1] === 'overall' ? (next.overall = next.overall || {}) : m[1] === 'pooled articles' ? (next.pooled = next.pooled || {}) : (next.articles[m[3]] = next.articles[m[3]] || {});
    const from = {};
    const to = {};
    for (const k of metrics) {
      const v = stated !== null ? stated : measure[k];
      if (v == null) throw new Error(`floors: "${name}" has no measured ${k} in this run`);
      from[k] = target[k] === undefined ? null : target[k];
      to[k] = v;
      target[k] = v;
    }
    moved.push({ line: name, from, to });
  }
  next.rulings = [...(floors.rulings || []), { ruling, lines: moved }];
  return next;
}

// ---------------------------------------------------------------- C-4
/** Every row whose class differs between two scorer runs (rows keyed by notice and item). */
export function diffMoves(base, cur) {
  const k = (r) => `${r.notice}|${r.n}`;
  const b = new Map(base.map((r) => [k(r), r]));
  const c = new Map(cur.map((r) => [k(r), r]));
  const out = [];
  for (const key of [...new Set([...b.keys(), ...c.keys()])].sort()) {
    const x = b.get(key);
    const y = c.get(key);
    const from = x ? x.class : 'ABSENT';
    const to = y ? y.class : 'ABSENT';
    if (from !== to) { const r = y || x; out.push({ notice: r.notice, n: r.n, clause: r.clause_norm || r.clause, from, to }); }
  }
  return out;
}

/** Expected against actual. A move or total nobody registered is a finding, not a pass. moves = null when no baseline was given (moves not checked). */
export function checkPrereg(pre, moves, totals) {
  const unexpected = [];
  const left = [...pre.expected_moves];
  for (const m of moves || []) {
    const i = left.findIndex((e) => e.clause === m.clause && e.from === m.from && e.to === m.to && (!e.notice || e.notice === m.notice));
    if (i < 0) unexpected.push(m); else left.splice(i, 1);
  }
  const missing = moves ? left : [];
  const totals_diff = [];
  for (const c of [...new Set([...Object.keys(pre.expected_totals), ...Object.keys(totals)])].sort()) {
    if ((pre.expected_totals[c] || 0) !== (totals[c] || 0)) totals_diff.push(`${c} expected ${pre.expected_totals[c] || 0} got ${totals[c] || 0}`);
  }
  return { verdict: unexpected.length || missing.length || totals_diff.length ? 'finding' : 'ok', moves_checked: Boolean(moves), unexpected, missing, totals_diff };
}

/** The prereg-0 form (schema id, round, plan_ref, $comment) with a small body: expected_moves and expected_totals. */
export function checkPreregShape(p) {
  const v = [];
  if (p.schema !== 'coa-round-prereg-v1') v.push('schema must be coa-round-prereg-v1');
  if (!Number.isInteger(p.round) || p.round < 0) v.push('round must be an integer >= 0');
  for (const k of ['$comment', 'plan_ref']) if (typeof p[k] !== 'string' || !p[k]) v.push(`${k} must be a non-empty string`);
  if (!Array.isArray(p.expected_moves) || p.expected_moves.some((m) => !m || typeof m.clause !== 'string' || typeof m.from !== 'string' || typeof m.to !== 'string')) v.push('expected_moves must be [{clause, from, to}]');
  if (!p.expected_totals || typeof p.expected_totals !== 'object' || Object.values(p.expected_totals).some((x) => !Number.isInteger(x))) v.push('expected_totals must be {class: integer}');
  return v;
}
