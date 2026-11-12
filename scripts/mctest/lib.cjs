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
  const missing = Object.keys(DEV_PORTS).filter((k) => !env[k]);
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

/** A failure's fingerprint: scenario row + case + error class (the detail's first word), so one class makes one card. */
const fingerprint = (r) =>
  `${r.row}|${r.case}|${String(r.detail).split(/[\s:]/)[0]}`;

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
function cardText(r, { sha, runDir, firstSeen, lastSeen }) {
  return [
    `# McTest failure: ${r.row}`,
    "",
    `- Fingerprint: \`${fingerprint(r)}\``,
    `- Owning task: ${r.owner} (route as a dated note on that row, Spec 126 §0b item 1)`,
    `- Case: ${r.case}`,
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
    `<tr class="${r.status}"><td>${r.status}</td><td>${esc(r.row)}</td><td>${esc(r.case)}</td><td>${esc(r.owner)}</td><td>${esc(r.label)}</td><td>${esc(r.detail)}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>McTest run ${esc(stamp)}</title>
<style>:root{--bg:#fff;--fg:#1a1a1a;--line:#ddd;--fail:#b3261e;--pass:#1e7b34;--muted:#666}@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--line:#333;--fail:#ff8a80;--pass:#7bd88f;--muted:#aaa}}
body{background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif;margin:16px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}
tr.FAIL td:first-child{color:var(--fail);font-weight:600}tr.PASS td:first-child{color:var(--pass)}tr.WAITS td,tr.SKIP td{color:var(--muted)}.wrap{overflow-x:auto}</style></head><body>
<h1>McTest run ${esc(stamp)}</h1><p>Ref ${esc(sha)}. FAIL ${n("FAIL")} · PASS ${n("PASS")} · SKIP ${n("SKIP")} · WAITS ${n("WAITS")}.${stackReason ? ` Test stack: ${esc(stackReason)}.` : ""}</p>
<p>WAITS = the owning task is not built (never a pass or a fail). gate-only = the page is behind an off switch and proves the gate only. no-DB = the app ran with no database.</p>
<div class="wrap"><table><thead><tr><th>Result</th><th>Row</th><th>Case</th><th>Owner</th><th>Labels</th><th>Detail</th></tr></thead><tbody>
${sorted.map(tr).join("\n")}
</tbody></table></div></body></html>
`;
}

module.exports = {
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
