// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §0b item 10 (dated note 2026-11-12, McTest),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40, docs/specs/02-web-admin/34_web_admin_testing_protocol.md §3.
//
// MF-78 · McFrontend queue · lane T. The McTest checks, in ONE place: pure functions over the catalogue tests/e2e/scenarios.json (CommonJS,
// so the Playwright runner, vitest and the .mjs scripts all load it).
// No DB, no network, no clock. The runners (tests/e2e/*.spec.ts, scripts/mctest/*.mjs) and the canaries (src/tests/mctest/) import them.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const CATALOGUE = "tests/e2e/scenarios.json";
const QUEUES = [".cursor/MCFRONTEND-QUEUE.md", ".cursor/MCBYLAWS-QUEUE.md"];

function readCatalogue(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, CATALOGUE), "utf8"));
}

/** Every task id that is a heading in the MF or MB queue (the owners a failure can be routed to). */
function queueIds(root = ROOT) {
  const ids = new Set();
  for (const q of QUEUES)
    for (const m of fs
      .readFileSync(path.join(root, q), "utf8")
      .matchAll(/^\*\*((?:MF|MB)-\d+) /gm))
      ids.add(m[1]);
  return ids;
}

/** The collections whose rows are run; an active row there names its runner. Personas are fixtures, not runs. */
const RUNNABLE = [
  "lot_cases",
  "bounds",
  "checks",
  "stress_profiles",
  "failure_drills",
];

/** Every row the catalogue holds, with where it sits: [{ where, row, runnable }]. */
function rows(cat) {
  const out = [];
  for (const p of cat.personas ?? [])
    out.push({ where: `personas/${p.id}`, row: p, runnable: false });
  for (const j of cat.journeys ?? [])
    for (const s of j.steps ?? [])
      out.push({
        where: `journeys/${j.id}/${s.step}`,
        row: s,
        runnable: true,
        journey: j,
      });
  if (cat.crawler)
    out.push({
      where: `crawler/${cat.crawler.id}`,
      row: cat.crawler,
      runnable: true,
    });
  for (const k of RUNNABLE)
    for (const r of cat[k] ?? [])
      out.push({ where: `${k}/${r.id}`, row: r, runnable: true });
  return out;
}

/**
 * The catalogue lock (FE-40). Problems as strings; [] = well formed.
 * - every row: status in cat.statuses, owner a queue heading; a waits row names waits_on;
 * - every journey step names its step; an active runnable row names a runner that exists;
 * - ids are unique; seeded emails use the reserved .test domain (no personal names).
 */
function catalogueProblems(cat, { ownerIds, fileExists }) {
  const problems = [];
  const statuses = new Set(cat.statuses ?? []);
  if (statuses.size === 0) problems.push("statuses: missing");
  const seen = new Set();
  for (const { where, row, runnable, journey } of rows(cat)) {
    const id = journey ? `${journey.id}/${row.step}` : row.id;
    if (!id) problems.push(`${where}: no id or step`);
    else if (seen.has(id)) problems.push(`${where}: duplicate id ${id}`);
    seen.add(id);
    if (!statuses.has(row.status))
      problems.push(
        `${where}: status ${JSON.stringify(row.status)} is not one of ${[...statuses].join(", ")}`,
      );
    if (!ownerIds.has(row.owner))
      problems.push(
        `${where}: owner ${JSON.stringify(row.owner)} is not a queue task`,
      );
    if (
      row.status === "waits" &&
      !(typeof row.waits_on === "string" && row.waits_on.trim())
    )
      problems.push(`${where}: waits without waits_on`);
    if (
      row.status === "active" &&
      runnable &&
      !(typeof row.runner === "string" && fileExists(row.runner))
    ) {
      problems.push(
        `${where}: active without an existing runner (${row.runner ?? "none"})`,
      );
    }
    for (const e of [row.email, row.email_pattern].filter(Boolean))
      if (!/@[a-z0-9.-]+\.test$/.test(e))
        problems.push(`${where}: ${e} is not a .test address`);
  }
  for (const b of cat.bounds ?? [])
    if (
      b.status === "active" &&
      !(
        typeof b.lhs === "string" &&
        Array.isArray(b.rhs) &&
        b.rhs.length &&
        typeof b.tol === "number"
      )
    )
      problems.push(
        `bounds/${b.id}: an active bound needs lhs, rhs[] and a numeric tol`,
      );
  const c = cat.crawler ?? {};
  for (const [page, owner] of [
    ...Object.entries(c.page_owners ?? {}),
    ...(c.admin_pages ?? []).map((a) => [a.route, a.owner]),
  ])
    if (!ownerIds.has(owner))
      problems.push(
        `crawler page ${page}: owner ${JSON.stringify(owner)} is not a queue task`,
      );
  return problems;
}

// ── MF-79 · the harness ──────────────────────────────────────────────────────────────────────────────────────────────

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
/** The dev stack's ports (Spec 34 §2.2, decideTestDbTarget): never a McTest target. */
const DEV_PORTS = {
  MCTEST_DATABASE_URL: "54322",
  MCTEST_SUPABASE_URL: "54321",
};

/**
 * The test-stack guard (McTest D-1 a, D-3 a): McTest reads, seeds and signs in ONLY on a separate local stack.
 * { ok: true } or { ok: false, reason } — absent, unparsable, not loopback, or the dev stack's port are all refusals.
 */
function testStack(env) {
  const missing = [
    ...Object.keys(DEV_PORTS),
    "MCTEST_SUPABASE_ANON_KEY",
  ].filter((k) => !env[k]);
  if (missing.length)
    return {
      ok: false,
      reason: `test stack absent (${missing.join(", ")} unset)`,
    };
  for (const [k, devPort] of Object.entries(DEV_PORTS)) {
    let url;
    try {
      url = new URL(env[k]);
    } catch {
      return { ok: false, reason: `${k} is not a URL` };
    }
    if (!LOOPBACK.has(url.hostname))
      return { ok: false, reason: `${k} is not a local stack` };
    if (
      (url.port || (url.protocol.startsWith("postgres") ? "5432" : "80")) ===
      devPort
    )
      return { ok: false, reason: `${k} is the dev stack (port ${devPort})` };
  }
  return { ok: true };
}

/** Visible text that shows a broken value (McTest D-8 a); the regex is the catalogue's, never typed here. */
function brokenText(text, regex) {
  const re = new RegExp(regex, "g");
  return [...new Set((text.match(re) ?? []).map((s) => s.trim()))];
}

/** One result line every runner writes (results.jsonl): the results page and the cards read only these. */
function result({
  row,
  owner,
  kase,
  status,
  detail = "",
  label = "",
  replay = "",
}) {
  if (!["PASS", "FAIL", "SKIP", "WAITS"].includes(status))
    throw new Error(`bad status ${status}`);
  return {
    row,
    owner,
    case: kase,
    status,
    detail: String(detail).slice(0, 2000),
    label,
    replay,
  };
}

/**
 * The error class of a failure detail: its first segment that is not a generic console line, with URLs and paths removed, so one
 * cause on many pages or personas is one class (OUTPUT panel, observability F3).
 */
function errorClass(detail) {
  const parts = String(detail).split(" | ");
  const first =
    parts.find((p) => !p.startsWith("console_error")) ?? parts[0] ?? "";
  return first
    .split("\n")[0]
    .replace(/\S*[/\\]\S*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** A failure's fingerprint: scenario row + error class (PLAN §6). The cases that share it are listed on one card. */
const fingerprint = (r) => `${r.row}|${errorClass(r.detail)}`;

/** The WAITS lines for every waits row and step (shown, never PASS or FAIL). */
function waitsResults(cat) {
  return rows(cat)
    .filter(({ row }) => row.status === "waits")
    .map(({ where, row }) =>
      result({
        row: where,
        owner: row.owner,
        kase: "-",
        status: "WAITS",
        detail: row.waits_on,
      }),
    );
}

/** The card file name for a failure (one per fingerprint; a fingerprint seen again updates its card). */
const cardName = (r, date) =>
  `CARD-MCTEST-${date}-${r.row.replace(/[^A-Za-z0-9-]+/g, "_")}-${hash(fingerprint(r))}.md`;
function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** A failure card for the orchestrator (PLAN §6): routed to the owning task; McTest never edits a queue file. */
function cardText(
  r,
  { sha, runDir, firstSeen, lastSeen, ownerLine = undefined, cases = [r.case] },
) {
  return [
    `# McTest failure: ${r.row}`,
    "",
    `- Fingerprint: \`${fingerprint(r)}\``,
    ownerLine ??
      `- Owning task: ${r.owner} (route as a dated note on that row, Spec 126 §0b item 1)`,
    `- Cases (${cases.length}): ${cases.slice(0, 20).join("; ")}`,
    `- What failed: ${r.detail}`,
    `- Labels: ${r.label || "none"}`,
    `- Ref: ${sha}`,
    `- Run: ${runDir}`,
    `- Replay: \`${r.replay || "see the run page"}\``,
    `- First seen: ${firstSeen}`,
    `- Last seen: ${lastSeen}`,
    "",
  ].join("\n");
}

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

/** The one results page: counts, then one row per result, failures first. */
function resultsPage(results, { sha, stamp, stackReason }) {
  const order = { FAIL: 0, SKIP: 1, WAITS: 2, PASS: 3 };
  const sorted = [...results].sort(
    (a, b) => order[a.status] - order[b.status] || a.row.localeCompare(b.row),
  );
  const n = (s) => results.filter((r) => r.status === s).length;
  const tr = (r) =>
    `<tr class="${r.status}"><td>${r.status}</td><td>${esc(r.row)}</td><td>${esc(r.case)}</td><td>${esc(r.owner)}</td><td>${esc(r.label)}</td><td>${esc(r.detail)}</td><td><code>${esc(r.replay)}</code></td></tr>`;
  const noDb = results.filter(
    (r) => r.status === "PASS" && /no-DB/.test(r.label),
  ).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>McTest run ${esc(stamp)}</title>
<style>:root{--bg:#fff;--fg:#1a1a1a;--line:#ddd;--fail:#b3261e;--pass:#1e7b34;--muted:#666}@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--line:#333;--fail:#ff8a80;--pass:#7bd88f;--muted:#aaa}}
body{background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif;margin:16px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}
tr.FAIL td:first-child{color:var(--fail);font-weight:600}tr.PASS td:first-child{color:var(--pass)}tr.WAITS td,tr.SKIP td{color:var(--muted)}.wrap{overflow-x:auto}</style></head><body>
<h1>McTest run ${esc(stamp)}</h1><p>Ref ${esc(sha)}. FAIL ${n("FAIL")} · PASS ${n("PASS")} (${noDb} of them no-DB) · SKIP ${n("SKIP")} · WAITS ${n("WAITS")}.${stackReason ? ` Test stack: ${esc(stackReason)}.` : ""}</p>
<p>WAITS = the owning task is not built (never a pass or a fail). gate-only = the page is behind an off switch and proves the gate only. no-DB = the app ran with no database.</p>
<div class="wrap"><table><thead><tr><th>Result</th><th>Row</th><th>Case</th><th>Owner</th><th>Labels</th><th>Detail</th><th>Replay</th></tr></thead><tbody>
${sorted.map(tr).join("\n")}
</tbody></table></div></body></html>
`;
}

// ── MF-80 · the lot sweep ────────────────────────────────────────────────────────────────────────────────────────────

/** A dotted path's value (`parcel.areas.x`, `db.zone_d`); a missing step is null. Numeric strings are numbers. */
function getPath(obj, dotted) {
  let v = obj;
  for (const k of dotted.split(".")) v = v == null ? null : v[k];
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
    return Number(v);
  return v ?? null;
}

/**
 * One bound of the catalogue: lhs <= product(rhs) + tol. A missing or non-numeric value is not_evaluated, never a pass
 * (FE-06 honest display; McTest D-11 a).
 */
function evalBound(bound, ctx) {
  const lhs = getPath(ctx, bound.lhs);
  const rhs = bound.rhs.map((r) => getPath(ctx, r));
  if (![lhs, ...rhs].every((v) => typeof v === "number" && Number.isFinite(v)))
    return { result: "not_evaluated", lhs, rhs };
  const limit = rhs.reduce((a, b) => a * b, 1);
  return { result: lhs <= limit + bound.tol ? "pass" : "fail", lhs, limit };
}

/**
 * MF-48 Stage B (operator 2026-11-12, verbatim "S1 a"; Spec 69a M-69 dated note): the screen shows the served report PAGE, so the fields it shows
 * are the value parts of the lookup's `page` (MF-57's pageViewOf, built on the server): each part's declared `field`, read from the payload, never
 * a typed list. A lookup with no page (page null: every lot until MB-44) shows no field: null here, which the sweep records as
 * not_evaluated:no_page, never a pass. Prior text: the payload paths of the S-001 rows of the generated report-field inventory (S-001 retired).
 */
function shownFields(payload) {
  const page = payload == null ? null : payload.page;
  if (page == null || !Array.isArray(page.sections)) return null;
  const out = new Set();
  for (const sec of page.sections)
    for (const p of sec.parts || []) if (p.kind === "value" && typeof p.field === "string") out.add(p.field);
  return out;
}

/** A shown text that is blank or a dead wire. The null dash is an honest "no value" (FE-06, report-presentation null_value), not empty. */
// OUTPUT panel fold (code reviewer F2): blank, a whole-text undefined or null, or NaN / [object Object] anywhere; prose such as "Not null" passes.
const DEAD_TEXT = /^\s*$|^\s*(undefined|null)\s*$|\bNaN\b|\[object Object\]/;

/** The shown fields whose text on the served page is empty (blank or a dead wire), as "<section id>.<field>"; [] when every one has text. */
function emptyShown(payload) {
  const page = payload == null ? null : payload.page;
  if (page == null || !Array.isArray(page.sections)) return [];
  const out = [];
  for (const sec of page.sections)
    for (const p of sec.parts || [])
      if (p.kind === "value" && typeof p.field === "string" && (typeof p.text !== "string" || DEAD_TEXT.test(p.text))) out.push(`${sec.id}.${p.field}`);
  return out;
}

// ── MF-81 · stress (PLAN Layer 4; D-2 a, D-6 load a) ───────────────────────────────────────────────────────────────

/** The class of one answer. 429 and 403 REPORT_LIMIT_REACHED are their own classes, never errors (PLAN Layer 4). */
function statusClass(status, code) {
  if (!status) return "network";
  if (status >= 200 && status < 300) return "2xx";
  if (status === 401) return "401";
  if (status === 403)
    return code === "REPORT_LIMIT_REACHED"
      ? "403_REPORT_LIMIT_REACHED"
      : "403_other";
  if (status === 429) return "429";
  if (status >= 500) return "5xx";
  return "4xx_other";
}
const ERROR_CLASSES = ["401", "403_other", "4xx_other", "5xx", "network"];
/** Errors over all answers; 429 and 403 REPORT_LIMIT_REACHED count as answers, never as errors. */
function errorRate(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return ERROR_CLASSES.reduce((a, k) => a + (counts[k] ?? 0), 0) / total;
}

/** The app under load must be a loopback http app: never production, Vercel or any remote host (D-2 a). */
function loadTarget(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: "the target is not a URL" };
  }
  if (u.protocol !== "http:" || !LOOPBACK.has(u.hostname))
    return { ok: false, reason: "the target is not a local app" };
  return { ok: true };
}

/** Inherited variables that could point the app at another DB, sign-in service, limiter store or error reporter: blanked, then the stack set. */
const APP_BLANKED =
  /^(POSTGRES|DATABASE|ALT_DATABASE|SUPABASE|UPSTASH|PG|KV_|REDIS|SENTRY|NEXT_PUBLIC_SENTRY)/;
/**
 * The environment of the app the stress runner builds and starts: the test stack only (D-1 a); throws "refused: ..." otherwise.
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string | undefined>}
 */
function appEnv(env) {
  const stack = testStack(env);
  if (!stack.ok) throw new Error(`refused: ${stack.reason}`);
  const out = {};
  for (const [k, v] of Object.entries(env))
    if (!k.startsWith("MCTEST_")) out[k] = APP_BLANKED.test(k) ? "" : v;
  return {
    ...out,
    DATABASE_URL: env.MCTEST_DATABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: env.MCTEST_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.MCTEST_SUPABASE_ANON_KEY,
    DEV_MODE: "false",
    NEXT_PUBLIC_DEV_MODE: "false",
  };
}

/** User n's fixed lots (D-12 a): never more than `per`, so a user never passes its allowance; a short sample wraps. */
function userLots(lots, n, per) {
  return Array.from(
    { length: per },
    (_, i) => lots[(n * per + i) % lots.length],
  );
}

/** The request kind for a draw x in [0, 1) by the catalogue mix ({ kind: share }). */
function pickKind(x, mix) {
  let acc = 0;
  const kinds = Object.entries(mix);
  for (const [kind, share] of kinds) {
    acc += share;
    if (x < acc) return kind;
  }
  return kinds[kinds.length - 1][0];
}

/** p50 / p95 / p99 in ms from a Node RecordableHistogram holding microseconds. */
function summarize(h) {
  const ms = (p) => (h.count ? h.percentile(p) / 1000 : null);
  return {
    count: h.count,
    p50_ms: ms(50),
    p95_ms: ms(95),
    p99_ms: ms(99),
  };
}

// ── MF-81 · failure drills (PLAN Layer 5; plan MF81-4..7 a, operator "MF81 all a") ───────────────────────────────────

/** A drill's hang limit (MF81-5 a): no answer within 60 s is a hang. */
const HANG_MS = 60_000;
const LEAK =
  /ECONN|postgres(?:ql)?:\/\/|\bstack\b|\.(?:ts|js):\d+|\bat \S+ \(/i;
const LEAK_SQL = /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/;
/** An error body is sanitised when it is the API envelope ({ data: null, error: { code, message } }) and leaks no SQL, stack or connection. */
function sanitisedError(text) {
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    return false;
  }
  const e = b?.error;
  if (
    !b ||
    b.data !== null ||
    !e ||
    typeof e.code !== "string" ||
    !/^[A-Z_]+$/.test(e.code) ||
    typeof e.message !== "string"
  )
    return false;
  return !LEAK.test(text) && !LEAK_SQL.test(text);
}
const verdict = (ok, detail) => ({ status: ok ? "PASS" : "FAIL", detail });
const hung = (a) => a.status === 0 || a.elapsedMs >= HANG_MS;

/**
 * DB slow (MF81-5 a): measured, labelled LOCAL. FAIL only on a hang, an unsanitised error body, or a meter written for a failed
 * lookup; a late 200 passes (the missing query time limit is carded to MF-45).
 */
function slowVerdict(a) {
  if (hung(a))
    return verdict(false, `hang: no answer within ${HANG_MS / 1000} s`);
  if (a.status >= 200 && a.status < 300)
    return verdict(true, `answered ${a.status} in ${a.elapsedMs} ms`);
  if (!sanitisedError(a.text))
    return verdict(false, `unsanitised error body (http_${a.status})`);
  if (a.metered)
    return verdict(
      false,
      `meter written for a failed lookup (http_${a.status})`,
    );
  return verdict(
    true,
    `answered ${a.status} in ${a.elapsedMs} ms, sanitised, not metered`,
  );
}

/**
 * DB down: the lookup fails closed (no payload, sanitised, nothing metered) and the app answers again once the DB is back.
 * { afterSignIn: true } is the DB lost after sign-in passed: only a server error shows the lookup path was reached (a 401 there means
 * the cut came before the lookup's own DB step, so the drill proved nothing).
 */
function downVerdict(a, { afterSignIn = false } = {}) {
  if (hung(a))
    return verdict(false, `hang: no answer within ${HANG_MS / 1000} s`);
  if (a.status >= 200 && a.status < 300)
    return verdict(false, `served http_${a.status} with the DB down`);
  if (!sanitisedError(a.text))
    return verdict(false, `unsanitised error body (http_${a.status})`);
  if (a.metered)
    return verdict(
      false,
      `meter written for a failed lookup (http_${a.status})`,
    );
  if (afterSignIn && a.status < 500)
    return verdict(
      false,
      `http_${a.status}: the lookup path was not reached (want a server error)`,
    );
  if (!a.recovered)
    return verdict(
      false,
      "the app did not answer again after the DB came back",
    );
  return verdict(
    true,
    `fails closed with http_${a.status} in ${a.elapsedMs} ms; recovered${a.status === 401 ? " (the outage shows as signed out: the sign-in profile read fails first)" : ""}`,
  );
}

/** Signed-out session (MF81-6 a): the old token gets 401 from the lookup and the entitlement, and nothing is metered. */
function sessionVerdict(a) {
  const ok =
    a.lookupStatus === 401 && a.entitlementStatus === 401 && !a.metered;
  return verdict(
    ok,
    `lookup http_${a.lookupStatus}, entitlement http_${a.entitlementStatus}${a.metered ? ", metered" : ""}`,
  );
}

/**
 * Cap reached: at the limit a new counting lot is refused with 403 REPORT_LIMIT_REACHED, no payload, the limit and the reset date;
 * an already-counted lot still opens; nothing more is metered.
 */
function capVerdict(a) {
  if (a.usedAtCap !== a.limit)
    return verdict(
      false,
      `reached ${a.usedAtCap} of ${a.limit}, not the limit`,
    );
  const r = a.refusal;
  const d = r.details ?? {};
  if (!(
    r.status === 403 &&
    r.code === "REPORT_LIMIT_REACHED" &&
    !r.hasData &&
    d.reportsLimit === a.limit &&
    typeof d.resetsOn === "string" &&
    Number.isFinite(Date.parse(d.resetsOn))
  ))
    return verdict(
      false,
      `refusal http_${r.status} ${r.code ?? ""} (want 403 REPORT_LIMIT_REACHED, no payload, reportsLimit ${a.limit} and resetsOn)`,
    );
  if (!(a.reopen.status === 200 && a.reopen.hasData))
    return verdict(
      false,
      `an already-counted lot did not open (http_${a.reopen.status})`,
    );
  if (a.metered) return verdict(false, "metered past the limit");
  return verdict(
    true,
    `refused at ${a.limit} with resetsOn ${d.resetsOn}; counted lot reopens`,
  );
}

/** Rate limit: repeated reopens of one lot reach a 429 with Retry-After, never a 5xx, and reopens are never metered. */
function rateVerdict(a) {
  const first = a.statuses.indexOf(429);
  if (first < 0)
    return verdict(false, `no 429 within ${a.statuses.length} calls`);
  const bad = a.statuses.filter((s) => s === 0 || s >= 500).length;
  if (bad) return verdict(false, `${bad} calls answered 5xx or not at all`);
  if (!a.retryAfter) return verdict(false, "429 without Retry-After");
  if (a.metered) return verdict(false, "a reopen was metered");
  return verdict(
    true,
    `429 after ${first} allowed calls, Retry-After ${a.retryAfter}`,
  );
}

/** The test-stack DB URL with its host and port swapped for the drill relay (same database and credentials). */
function relayUrl(dbUrl, port) {
  const u = new URL(dbUrl);
  u.hostname = "127.0.0.1";
  u.port = String(port);
  return u.toString();
}

module.exports = {
  HANG_MS,
  sanitisedError,
  slowVerdict,
  downVerdict,
  sessionVerdict,
  capVerdict,
  rateVerdict,
  relayUrl,
  statusClass,
  errorRate,
  loadTarget,
  appEnv,
  userLots,
  pickKind,
  summarize,
  errorClass,
  getPath,
  evalBound,
  shownFields,
  emptyShown,
  ROOT,
  CATALOGUE,
  readCatalogue,
  queueIds,
  rows,
  catalogueProblems,
  testStack,
  brokenText,
  result,
  fingerprint,
  waitsResults,
  cardName,
  cardText,
  resultsPage,
};
