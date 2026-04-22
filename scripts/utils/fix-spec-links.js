#!/usr/bin/env node
/**
 * fix-spec-links.js — One-off utility to repair broken SPEC LINK: references.
 *
 * After the docs/specs/ reorganisation into Two-Client Architecture silos
 * (00-architecture/, 01-pipeline/, 02-web-admin/, 03-mobile/, archive/),
 * all legacy paths (pipeline/, platform/, product/) are broken. This script
 * applies the full mapping from the migration plan to every .js/.ts/.tsx file
 * under scripts/ and src/.
 *
 * Usage:  node scripts/utils/fix-spec-links.js [--dry-run]
 *
 * --dry-run  Print what would change without writing any files.
 */
'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DRY_RUN   = process.argv.includes('--dry-run');

// ── Replacement table ────────────────────────────────────────────────────────
//
// Ordered specific-before-general so a more-specific prefix (e.g.
// product/future/85_...) is replaced before a shorter prefix could
// accidentally match it. All replacements are plain-string (no regex) so
// special characters in filenames never cause surprises.
//
const REPLACEMENTS = [
  // ── platform/ individual files ─────────────────────────────────────────────
  ['docs/specs/platform/03_permit_change_tracking.md',       'docs/specs/01-pipeline/03_permit_change_tracking.md'],
  ['docs/specs/platform/06_permits_rest_api.md',             'docs/specs/00-architecture/06_permits_rest_api.md'],
  ['docs/specs/platform/10_lead_scoring.md',                 'docs/specs/01-pipeline/10_lead_scoring.md'],
  ['docs/specs/platform/13_authentication.md',               'docs/specs/00-architecture/13_authentication.md'],
  ['docs/specs/platform/37_entity_model.md',                 'docs/specs/01-pipeline/37_entity_model.md'],
  ['docs/specs/platform/70_frontend_platform_foundation.md', 'docs/specs/03-mobile/70_frontend_platform_foundation.md'],
  ['docs/specs/platform/71_lead_feed_discovery_interface.md','docs/specs/03-mobile/71_lead_feed_discovery_interface.md'],

  // ── product/admin/ ─────────────────────────────────────────────────────────
  ['docs/specs/product/admin/26_admin_dashboard.md',             'docs/specs/02-web-admin/26_admin_dashboard.md'],
  ['docs/specs/product/admin/76_lead_feed_health_dashboard.md',  'docs/specs/02-web-admin/76_lead_feed_health_dashboard.md'],

  // ── product/deferred/ ──────────────────────────────────────────────────────
  ['docs/specs/product/deferred/21_deferred_features.md', 'docs/specs/archive/21_deferred_features.md'],

  // ── product/future/ individual files ──────────────────────────────────────
  ['docs/specs/product/future/74_lead_feed_design.md',             'docs/specs/03-mobile/74_lead_feed_design.md'],
  ['docs/specs/product/future/75_lead_feed_implementation_guide.md','docs/specs/03-mobile/75_lead_feed_implementation_guide.md'],
  ['docs/specs/product/future/80_lead_feed.md',                    'docs/specs/archive/80_deprecated_web_lead_feed.md'],
  ['docs/specs/product/future/81_opportunity_score_engine.md',     'docs/specs/01-pipeline/81_opportunity_score_engine.md'],
  ['docs/specs/product/future/82_crm_assistant_alerts.md',         'docs/specs/01-pipeline/82_crm_assistant_alerts.md'],
  ['docs/specs/product/future/83_lead_cost_model.md',              'docs/specs/01-pipeline/83_lead_cost_model.md'],
  ['docs/specs/product/future/84_lifecycle_phase_engine.md',       'docs/specs/01-pipeline/84_lifecycle_phase_engine.md'],
  ['docs/specs/product/future/85_trade_forecast_engine.md',        'docs/specs/01-pipeline/85_trade_forecast_engine.md'],
  ['docs/specs/product/future/86_control_panel.md',                'docs/specs/02-web-admin/86_control_panel.md'],

  // ── product/user/ prefix (specs 14, 19, 20, 24, 27) ──────────────────────
  ['docs/specs/product/user/', 'docs/specs/03-mobile/'],

  // ── pipeline/ prefix (specs 30–60, 80_taxonomies, runbooks/) ─────────────
  // Applied last so more-specific entries above win when the same file is
  // referenced via both a full path and the prefix.
  ['docs/specs/pipeline/', 'docs/specs/01-pipeline/'],
];

// ── File walker ──────────────────────────────────────────────────────────────

const TARGET_DIRS  = ['scripts', 'src'];
const TARGET_EXTS  = new Set(['.js', '.ts', '.tsx']);
const SKIP_DIRS    = new Set(['node_modules', '.next', 'dist', '.git', '.turbo']);

function walkDir(dirPath, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.isFile() && TARGET_EXTS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

let filesScanned  = 0;
let filesModified = 0;

if (DRY_RUN) {
  console.log('[dry-run] No files will be written.\n');
}

for (const dir of TARGET_DIRS) {
  const dirPath = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(dirPath)) continue;

  for (const filePath of walkDir(dirPath)) {
    // Never rewrite ourselves — the replacement table contains the FROM strings.
    if (filePath === __filename) continue;
    filesScanned++;
    const original = fs.readFileSync(filePath, 'utf8');
    let updated    = original;

    for (const [from, to] of REPLACEMENTS) {
      if (updated.includes(from)) {
        // split/join is the safe global replace — no regex special chars to escape.
        updated = updated.split(from).join(to);
      }
    }

    if (updated !== original) {
      const rel = path.relative(REPO_ROOT, filePath);
      if (DRY_RUN) {
        console.log(`  would update: ${rel}`);
      } else {
        fs.writeFileSync(filePath, updated, 'utf8');
        console.log(`  updated: ${rel}`);
      }
      filesModified++;
    }
  }
}

const verb = DRY_RUN ? 'would modify' : 'modified';
console.log(`\nDone. Scanned ${filesScanned} files, ${verb} ${filesModified}.`);
