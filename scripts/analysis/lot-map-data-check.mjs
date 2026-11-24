#!/usr/bin/env node
// SRCH.LOTCARD (task-336, RR-0284, AC 1) · READ-ONLY data check for the two lot-map reads.
// For the multi-lot address of ~/Buildo-scratch/lanes-20261117/avail-search/SAMPLES.md (sample 9, 26 Kenneth Ave: parcels 5112332 and 5427844),
// plus any parcel ids given with --parcels a,b,c, it counts the lots that have
//   - a footprint (the massing join the lookup uses: a parcel_buildings row for the lot),
//   - a PRIMARY footprint (is_primary), so the reader can see whether "any building" and "the house" differ,
//   - a populated frontage street (primary_frontage_street_name not null and not blank).
// Usage:
//   node scripts/analysis/lot-map-data-check.mjs --dry-run                       prints the SQL and the parameters; no connection
//   node scripts/analysis/lot-map-data-check.mjs --url postgres://...@127.0.0.1:55322/db [--parcels 1,2]
// Only the rehearsal stack (host 127.0.0.1 or localhost, port 55322) is accepted; any other host or port is refused. The session is
// BEGIN READ ONLY, one SELECT, rolled back. The URL is never printed.
import pg from 'pg';
import { pathToFileURL } from 'node:url';

export const SAMPLE_PARCELS = ['5112332', '5427844'];
export const REHEARSAL_PORT = '55322';

export const SQL = `SELECT p.parcel_id,
       EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id) AS has_footprint,
       EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id AND pb.is_primary) AS has_primary_footprint,
       (p.primary_frontage_street_name ~ '[^[:space:]]') AS has_street,
       p.primary_frontage_street_name AS street
FROM parcels p
WHERE p.parcel_id = ANY($1::text[])
ORDER BY p.parcel_id`;

// SEARCHFIX.3 L7 (task-451; GROUNDER-G item 2): a flag whose value is missing or is the next flag sets `error` (main prints the usage and exits 2),
// so "--parcels --url x" is never read as parcels "--url" and a URL of "x".
const valueAfter = (argv, i) => {
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? null : v;
};

export function parseArgs(argv) {
  const o = { dryRun: argv.includes('--dry-run'), url: null, parcels: [...SAMPLE_PARCELS], error: undefined };
  const u = argv.indexOf('--url');
  if (u >= 0) {
    o.url = valueAfter(argv, u);
    if (o.url === null) o.error = '--url needs a value';
  }
  const p = argv.indexOf('--parcels');
  if (p >= 0) {
    const v = valueAfter(argv, p);
    if (v === null) o.error = '--parcels needs a value';
    else o.parcels = [...SAMPLE_PARCELS, ...v.split(',').map((s) => s.trim()).filter(Boolean)];
  }
  o.parcels = [...new Set(o.parcels)];
  return o;
}

const USAGE = 'Usage: node scripts/analysis/lot-map-data-check.mjs --dry-run | --url <rehearsal stack URL> [--parcels 1,2]';

/** Returns null when the URL is the rehearsal stack, else the reason it is refused. */
export function refuse(url) {
  let u;
  try { u = new URL(url); } catch { return 'not a URL'; }
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) return `host ${u.hostname} is not the rehearsal stack`;
  if (!['postgres:', 'postgresql:'].includes(u.protocol)) return `protocol ${u.protocol} is not postgres`;
  if (u.search || u.hash) return 'query string or fragment not accepted';
  if (u.port !== REHEARSAL_PORT) return `port ${u.port || '(default)'} is not the rehearsal port ${REHEARSAL_PORT}`;
  return null;
}

export function summarise(rows) {
  const n = rows.length;
  const c = (f) => rows.filter(f).length;
  return { lots: n, with_footprint: c((r) => r.has_footprint), no_building: c((r) => !r.has_footprint), with_primary_footprint: c((r) => r.has_primary_footprint), with_street: c((r) => r.has_street) };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.error) { console.error(`${o.error}. ${USAGE}`); process.exitCode = 2; return; }
  if (o.dryRun) {
    console.log(`-- BEGIN READ ONLY; parameters: $1 = ${JSON.stringify(o.parcels)}\n${SQL};\n-- ROLLBACK;`);
    return;
  }
  if (!o.url) { console.error('No connection: pass --url <rehearsal stack URL> or --dry-run.'); process.exitCode = 2; return; }
  const why = refuse(o.url);
  if (why) { console.error(`Refused: ${why}. Only the rehearsal stack (127.0.0.1:${REHEARSAL_PORT}) is accepted.`); process.exitCode = 2; return; }
  const u = new URL(o.url); // the client is built from the validated parts only, never from the raw string
  const client = new pg.Client({ host: u.hostname, port: Number(u.port), database: decodeURIComponent(u.pathname.slice(1)), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query(SQL, [o.parcels]);
    await client.query('ROLLBACK');
    for (const r of rows) console.log(`${r.parcel_id}  footprint=${r.has_footprint}  primary=${r.has_primary_footprint}  street=${r.has_street ? JSON.stringify(r.street) : 'MISSING'}`);
    const missing = o.parcels.filter((id) => !rows.some((r) => r.parcel_id === id));
    if (missing.length) console.log(`not found: ${missing.join(', ')}`);
    console.log(JSON.stringify(summarise(rows)));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(`error: ${e.message}`); process.exitCode = 1; });
