// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; McTest PLAN §4 (one results page) and §6 (a failure becomes a card).
//
// MF-79 · usage: node scripts/mctest/report.mjs <run dir>
// Reads <run dir>/results.jsonl (written by every McTest runner), adds a WAITS line for every waits row of the catalogue,
// writes <run dir>/index.html and one card per new failure fingerprint under ~/Buildo-scratch/mctest/cards/ (a fingerprint
// seen again updates its card's last-seen date and keeps its owner line). Writes nothing in the repo and nothing in any database.
// The 7-day open-card flag is the orchestrator's morning file (MB-85 expiry rule), read from each card's First seen line.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cardName,
  cardText,
  fingerprint,
  readCatalogue,
  result,
  resultsPage,
  testStack,
  waitsResults,
} from "./lib.cjs";

const runDir = process.argv[2];
if (!runDir) throw new Error("usage: node scripts/mctest/report.mjs <run dir>");
const file = path.join(runDir, "results.jsonl");
const run = fs.existsSync(file)
  ? fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  : [];
// An empty or missing results file is a FAIL, never an all-clear (OUTPUT panel, observability F2).
if (run.length === 0)
  run.push(
    result({
      row: "nightly",
      owner: "MF-79",
      kase: path.basename(runDir),
      status: "FAIL",
      detail: "no_results: no runner wrote a line",
    }),
  );
const results = [...run, ...waitsResults(readCatalogue())];
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();
const stamp = path.basename(runDir);
const stack = testStack(process.env);
fs.writeFileSync(
  path.join(runDir, "index.html"),
  resultsPage(results, {
    sha,
    stamp,
    stackReason: stack.ok ? "" : stack.reason,
  }),
);

const cards = path.join(os.homedir(), "Buildo-scratch/mctest/cards");
fs.mkdirSync(cards, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const existing = fs
  .readdirSync(cards)
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ f, text: fs.readFileSync(path.join(cards, f), "utf8") }));
let made = 0;
let updated = 0;
// One card per fingerprint: the cases that share it are listed; the owner is the one most of them name.
const groups = new Map();
for (const r of run.filter((x) => x.status === "FAIL"))
  groups.set(fingerprint(r), [...(groups.get(fingerprint(r)) ?? []), r]);
for (const group of groups.values()) {
  const counts = new Map(
    group.map((g) => [
      g.owner,
      group.filter((x) => x.owner === g.owner).length,
    ]),
  );
  const owner = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const r = { ...group[0], owner };
  const prev = existing.find((c) => c.text.includes(`\`${fingerprint(r)}\``));
  const firstSeen = prev?.text.match(/^- First seen: (.+)$/m)?.[1] ?? today;
  const name = prev?.f ?? cardName(r, today);
  // A card seen again keeps its owner line, so a hand re-route survives the next night (observability F4).
  const ownerLine = prev?.text.match(/^- Owning task: .+$/m)?.[0];
  const text = cardText(r, {
    sha,
    runDir,
    firstSeen,
    lastSeen: today,
    ownerLine,
    cases: group.map((g) => g.case),
  });
  fs.writeFileSync(path.join(cards, name), text);
  if (!prev) existing.push({ f: name, text });
  if (prev) updated += 1;
  else made += 1;
}
console.log(
  `[mctest] ${path.join(runDir, "index.html")}: ${results.length} lines; cards ${made} new, ${updated} updated`,
);
