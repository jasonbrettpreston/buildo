// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §0b item 10 (dated note 2026-11-12, McTest),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40, docs/specs/02-web-admin/34_web_admin_testing_protocol.md §3.
//
// MF-78 · McFrontend queue · lane T. The McTest checks, in ONE place: pure functions over the catalogue tests/e2e/scenarios.json (CommonJS,
// so the Playwright runner, vitest and the .mjs scripts all load it).
// No DB, no network, no clock. The runners (tests/e2e/*.spec.ts, scripts/mctest/*.mjs) and the canaries (src/tests/mctest/) import them.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

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

module.exports = { ROOT, CATALOGUE, readCatalogue, queueIds, rows, catalogueProblems };
