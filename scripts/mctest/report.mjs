// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-40; McTest PLAN §4 (one results page) and §6 (a failure becomes a card).
//
// MF-79 · usage: node scripts/mctest/report.mjs <run dir>
// Reads <run dir>/results.jsonl (written by every McTest runner), adds a WAITS line for every waits row of the catalogue,
// writes <run dir>/index.html and one card per new failure fingerprint under ~/Buildo-scratch/mctest/cards/ (a fingerprint
// seen again updates its card's last-seen date). Writes nothing in the repo and nothing in any database.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cardName,
  cardText,
  fingerprint,
  readCatalogue,
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
  .map((f) => ({ f, text: fs.readFileSync(path.join(cards, f), "utf8") }));
let made = 0;
let updated = 0;
for (const r of run.filter((x) => x.status === "FAIL")) {
  const prev = existing.find((c) => c.text.includes(`\`${fingerprint(r)}\``));
  const firstSeen = prev?.text.match(/^- First seen: (.+)$/m)?.[1] ?? today;
  const name = prev?.f ?? cardName(r, today);
  const text = cardText(r, { sha, runDir, firstSeen, lastSeen: today });
  fs.writeFileSync(path.join(cards, name), text);
  if (!prev) existing.push({ f: name, text });
  if (prev) updated += 1;
  else made += 1;
}
console.log(
  `[mctest] ${path.join(runDir, "index.html")}: ${results.length} lines; cards ${made} new, ${updated} updated`,
);
