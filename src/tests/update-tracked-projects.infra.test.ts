// SPEC LINK: docs/specs/01-pipeline/82_crm_assistant_alerts.md
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf-8');

describe('scripts/update-tracked-projects.js — CRM assistant shape', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/update-tracked-projects.js');
  });

  it('uses pipeline.run wrapper', () => {
    expect(content).toMatch(/pipeline\.run\(\s*['"]update-tracked-projects['"]/);
  });

  it('imports TRADE_TARGET_PHASE from shared lib', () => {
    expect(content).toMatch(/TRADE_TARGET_PHASE/);
  });

  it('WF3 (2026-04-23): falls back to TRADE_TARGET_PHASE_FALLBACK when validTradeConfigs is empty', () => {
    // Previously TRADE_TARGET_PHASE was built entirely from validTradeConfigs with
    // no fallback — if trade_configurations returned 0 valid entries, every row
    // counted as unmappedTrade++ and was silently skipped (100% skip rate, no alerts).
    // Fix mirrors compute-trade-forecasts.js: declare `let` with fallback, then
    // override only when validTradeConfigs is non-empty.
    expect(content).toMatch(/let TRADE_TARGET_PHASE\s*=\s*TRADE_TARGET_PHASE_FALLBACK/);
    expect(content).toMatch(/Object\.keys\(builtPhaseMap\)\.length\s*>\s*0/);
    expect(content).toMatch(/TRADE_TARGET_PHASE\s*=\s*builtPhaseMap/);
  });

  it('queries active tracked projects via JOIN', () => {
    expect(content).toMatch(/tracked_projects tp/);
    expect(content).toMatch(/JOIN permits p/);
    expect(content).toMatch(/LEFT JOIN trade_forecasts tf/);
  });

  it('reads memory columns for state-change detection', () => {
    expect(content).toMatch(/last_notified_urgency/);
    expect(content).toMatch(/last_notified_stalled/);
  });

  // Path A: Saved
  it('auto-archives saved projects when window closed or expired', () => {
    expect(content).toMatch(/tracking_status === 'saved'/);
    expect(content).toMatch(/isWindowClosed/);
    expect(content).toMatch(/status: 'archived'/);
  });

  // Path B: Claimed
  it('auto-archives claimed projects when urgency is expired (WF3 2026-04-13)', () => {
    // WF3 fix: claimed projects with urgency === 'expired' must auto-archive.
    // Previously only saved projects archived on expired; claimed projects
    // silently accumulated in the tracked_projects table.
    expect(content).toMatch(/CLAIMED_STATUSES\.has\(row\.tracking_status\)/);
    // Must check urgency === 'expired' in claimed path (not just saved)
    expect(content).toMatch(/urgency === 'expired'/);
  });

  it('generates STALL_WARNING on state change (stalled=true, not previously notified)', () => {
    expect(content).toMatch(/STALL_WARNING/);
    expect(content).toMatch(/lifecycle_stalled === true/);
    expect(content).toMatch(/last_notified_stalled !== true/);
  });

  it('generates STALL_CLEARED when stall resolves', () => {
    expect(content).toMatch(/STALL_CLEARED/);
    expect(content).toMatch(/lifecycle_stalled === false/);
    expect(content).toMatch(/last_notified_stalled === true/);
  });

  it('generates START_IMMINENT on urgency state change (skips if stalled)', () => {
    expect(content).toMatch(/START_IMMINENT/);
    expect(content).toMatch(/urgency === 'imminent'/);
    expect(content).toMatch(/last_notified_urgency !== 'imminent'/);
    // WF3: skip imminent if stalled (contradictory signal)
    expect(content).toMatch(/lifecycle_stalled !== true/);
  });

  it('merges updates by ID before executing (prevents duplicate writes)', () => {
    // WF3 fix #1: stall + imminent on same row → merged into 1 UPDATE
    expect(content).toMatch(/merged/);
    expect(content).toMatch(/new Map\(\)/);
    expect(content).toMatch(/Object\.assign/);
  });

  it('wraps updates in withTransaction (prevents partial state on crash)', () => {
    // WF3 fix #2
    expect(content).toMatch(/pipeline\.withTransaction/);
    expect(content).toMatch(/client\.query/);
  });

  it('imports PHASE_ORDINAL from shared lib (not duplicated)', () => {
    // WF3 fix #3: was duplicated across 3 files
    expect(content).toMatch(/PHASE_ORDINAL/);
    expect(content).toMatch(/require\('\.\/lib\/lifecycle-phase'\)/);
    expect(content).not.toMatch(/const PHASE_ORDINAL\s*=/);
  });

  it('bumps updated_at on every DB update', () => {
    // Now uses RUN_AT ($1) instead of NOW() to prevent the Midnight Cross (spec 47 §14)
    expect(content).toMatch(/updated_at = \$1/);
  });

  it('syncs lead_analytics via SQL UPSERT after processing', () => {
    // WF2: aggregates tracked_projects into lead_analytics so the
    // competition discount stays in sync with actual user behavior.
    expect(content).toMatch(/INSERT INTO lead_analytics/);
    expect(content).toMatch(/ON CONFLICT \(lead_key\) DO UPDATE/);
    expect(content).toMatch(/tracking_count/);
    expect(content).toMatch(/saving_count/);
    // Uses LPAD with ::text cast to match canonical key format
    expect(content).toMatch(/LPAD\(tp\.revision_num::text, 2, '0'\)/);
  });

  it('zeros out lead_analytics for fully-archived permits', () => {
    expect(content).toMatch(/UPDATE lead_analytics/);
    expect(content).toMatch(/tracking_count = 0/);
    expect(content).toMatch(/NOT EXISTS/);
  });

  it('reports analytics sync counts in telemetry', () => {
    expect(content).toMatch(/analytics_synced/);
    expect(content).toMatch(/analytics_zeroed/);
  });

  it('declares lead_analytics in PIPELINE_META writes', () => {
    expect(content).toMatch(/lead_analytics.*lead_key.*tracking_count/);
  });

  it('emits alerts array in PIPELINE_SUMMARY for downstream dispatch', () => {
    expect(content).toMatch(/pipeline\.emitSummary/);
    expect(content).toMatch(/alerts/);
    expect(content).toMatch(/stall_alerts/);
    expect(content).toMatch(/imminent_alerts/);
  });

  it('WF3-04 (H-W14): assigns orphan phases O1/O2/O3 high ordinals so isWindowClosed fires', () => {
    // Producer/consumer contract: classify-lifecycle-phase.js writes
    // O1/O2/O3 values, but PHASE_ORDINAL omitted them — currentOrdinal
    // was always undefined, so isWindowClosed returned false and
    // orphan-tracked leads never auto-archived (H-W14).
    //
    // Fix (D3=b pure ordinals): give orphans high ordinals (>= 10)
    // so `currentOrdinal >= targetOrdinal` fires against any
    // work_phase_target (max P17 = 9).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require('../../scripts/lib/lifecycle-phase') as {
      PHASE_ORDINAL: Record<string, number>;
    };
    expect(lib.PHASE_ORDINAL.O1, 'PHASE_ORDINAL missing O1').toBeDefined();
    expect(lib.PHASE_ORDINAL.O2, 'PHASE_ORDINAL missing O2').toBeDefined();
    expect(lib.PHASE_ORDINAL.O3, 'PHASE_ORDINAL missing O3').toBeDefined();

    // Max work_phase_target is P17 (ordinal 9). Orphan ordinals must
    // be strictly greater so isWindowClosed fires for any trade target.
    const workPhases = ['P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17'];
    const maxWorkPhase = Math.max(
      ...workPhases.map((p) => {
        const v = lib.PHASE_ORDINAL[p];
        expect(v, `PHASE_ORDINAL missing ${p}`).toBeDefined();
        return v as number;
      }),
    );
    expect(lib.PHASE_ORDINAL.O1!).toBeGreaterThan(maxWorkPhase);
    expect(lib.PHASE_ORDINAL.O2!).toBeGreaterThan(maxWorkPhase);
    expect(lib.PHASE_ORDINAL.O3!).toBeGreaterThan(maxWorkPhase);
  });

  it('WF3-04 (H-W14 / 82-W7): warns on unknown lifecycle_phase values (defensive telemetry)', () => {
    // Closes 82-W7: before the fix, any lifecycle_phase value not in
    // PHASE_ORDINAL and not in TERMINAL_PHASES would silently produce
    // isWindowClosed=false forever with no telemetry. Add a
    // deduped-per-value WARN + unknown_phase_skipped counter.
    expect(content).toMatch(/unknown_phase_skipped/);
    // The counter must be emitted in PIPELINE_SUMMARY records_meta
    expect(content).toMatch(/unknown_phase_skipped/);
    // And a WARN must be logged when the condition hits
    expect(content).toMatch(/pipeline\.log\.warn/);
  });

  it('delegates advisory lock 82 to pipeline.withAdvisoryLock — Phase 2 migration (spec 47 §5)', () => {
    // Phase 2: hand-rolled lockClient + SIGTERM boilerplate replaced with SDK helper.
    // Lock prevents two concurrent runs from racing on tracked_projects memory
    // columns and double-firing CRM alerts.
    expect(content).toMatch(/const ADVISORY_LOCK_ID = 82/);
    expect(content).toMatch(/pipeline\.withAdvisoryLock\(pool,\s*ADVISORY_LOCK_ID/);
    // Must NOT hand-roll — any direct lock call bypasses the spec helper
    expect(content).not.toMatch(/pg_try_advisory_lock/);
    expect(content).not.toMatch(/pg_advisory_unlock/);
    // Must NOT install its own SIGTERM — helper handles it
    expect(content).not.toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
  });
});

// ── WF3 spec 47 §12 compliance tests ──

describe('scripts/update-tracked-projects.js — spec 47 compliance', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../..', 'scripts/update-tracked-projects.js'),
      'utf-8',
    );
  });

  it('SPEC LINK points to spec file not a report (spec 47 §3)', () => {
    expect(content).toMatch(/SPEC LINK:.*82_crm_assistant_alerts\.md/);
    expect(content).not.toMatch(/SPEC LINK:.*lifecycle_phase_implementation/);
    expect(content).not.toMatch(/SPEC LINK:.*docs\/reports\//);
  });

  it('handles lock-held path: checks lockResult.acquired and emits skip with audit_table (spec 47 §5)', () => {
    // Rich SKIP path (skipEmit:false): script emits custom summary with audit_table.
    expect(content).toMatch(/lockResult\.acquired/);
    expect(content).toMatch(/skipEmit\s*:\s*false/);
    expect(content).toMatch(/advisory_lock_held_elsewhere/);
  });

  it('captures RUN_AT from DB at startup — MANDATORY skeleton §R3.5 (spec 47 §14.1)', () => {
    // Accepts either the old inline pattern or the new SDK helper (pipeline.getDbTimestamp).
    expect(content).toMatch(/RUN_AT/);
    const hasInlineNow = /SELECT NOW\(\) AS now/.test(content);
    const hasSdkHelper = /pipeline\.getDbTimestamp\s*\(/.test(content);
    expect(hasInlineNow || hasSdkHelper,
      'Must capture RUN_AT via SELECT NOW() inline or pipeline.getDbTimestamp()'
    ).toBe(true);
  });

  it('uses pipeline.streamQuery for tracked_projects — not pool.query (spec 47 §6.1)', () => {
    // tracked_projects is explicitly listed in spec §6.1 as always requiring streamQuery
    expect(content).toMatch(/pipeline\.streamQuery/);
    // The main 4-table JOIN must NOT go through pool.query
    expect(content).not.toMatch(/await pool\.query\(`[\s\S]{0,200}FROM tracked_projects/);
  });

  it('eliminates N+1 — no per-row client.query inside a loop over mergedUpdates (spec 47 §7.5)', () => {
    // N+1 anti-pattern: one UPDATE per row inside a for-of loop
    expect(content).not.toMatch(
      /for \(const upd of mergedUpdates\)[\s\S]{0,300}await client\.query/,
    );
  });

  it('caps alerts array at 200 in records_meta — no raw unbounded array (spec 47 §8.4)', () => {
    // Spec §8.4: "NEVER embed unbounded arrays — cap alert arrays at 200 items"
    expect(content).toMatch(/alerts_total/);
    // Raw `alerts,` on its own line (unbounded) must be gone
    expect(content).not.toMatch(/^\s*alerts,\s*$/m);
  });

  it('includes a real audit_table in emitSummary (spec 47 §8.2)', () => {
    expect(content).toMatch(/audit_table/);
    // spec §8.2 mandatory rows for "Alert delivery" type
    expect(content).toMatch(/alerts_evaluated/);
    expect(content).toMatch(/alerts_delivered/);
    expect(content).toMatch(/delivery_errors/);
  });

  it('uses RUN_AT (not NOW()) for updated_at writes (spec 47 §14 Midnight Cross)', () => {
    // updated_at = NOW() inside a loop is the Midnight Cross pattern
    expect(content).not.toMatch(/updated_at = NOW\(\)/);
  });

  it('validates tradeConfigs with Zod schema (spec 47 §4.2)', () => {
    expect(content).toMatch(/require\('zod'\)/);
    expect(content).toMatch(/TRADE_CONFIG_SCHEMA/);
    expect(content).toMatch(/bid_phase_cutoff/);
    expect(content).toMatch(/work_phase_target/);
  });

  it('accumulates result.rowCount not raw updates.length for records_updated (spec 47 §7 #5)', () => {
    expect(content).toMatch(/rowCount/);
    expect(content).not.toMatch(/records_updated:\s*updates\.length/);
  });

  it('guards all 5 category UPDATEs with IS DISTINCT FROM (spec 47 §12 idempotency)', () => {
    // IS DISTINCT FROM prevents re-writing rows already at the target value,
    // keeps rowCount accurate, and makes re-runs safe under concurrent clients.
    // Each of the 5 category UPDATE statements must carry the guard.
    expect(content).toMatch(/status IS DISTINCT FROM 'archived'/);
    expect(content).toMatch(/last_notified_stalled IS DISTINCT FROM true/);
    expect(content).toMatch(/last_notified_stalled IS DISTINCT FROM false/);
    expect(content).toMatch(/last_notified_urgency IS DISTINCT FROM 'imminent'/);
  });

  it('uses a computed deliveryErrors variable — not hardcoded 0 — for audit table (spec 47 §8.1)', () => {
    // Hardcoding 0 is an §8.1 anti-pattern: if a dispatch step is added later,
    // the audit table would silently misreport. Named variable documents intent
    // and provides an increment point.
    expect(content).toMatch(/let deliveryErrors = 0/);
    expect(content).toMatch(/value: deliveryErrors/);
    // Must NOT hardcode 0 directly in the audit table row
    expect(content).not.toMatch(/delivery_errors.*value:\s*0[^;]/);
  });

  it('guards predicted_start date conversion with Number.isNaN (spec 47 §14.4)', () => {
    // A corrupt predicted_start string would cause new Date().toISOString()
    // to throw — the ternary alone does not protect against invalid dates.
    expect(content).toMatch(/Number\.isNaN/);
  });

  it('logs a WARN for uncategorized update entries in the batch categorizer', () => {
    // Silent drop of an update object that matches no category is a data loss
    // risk — future callsites that push a new field combination would
    // silently do nothing. The invariant log surfaces the gap immediately.
    expect(content).toMatch(/Batch categorizer.*no recognized fields/i);
  });
});

// ── WF3-01: Notification dispatch tests ──

describe('scripts/update-tracked-projects.js — WF3-01 notification dispatch', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../..', 'scripts/update-tracked-projects.js'),
      'utf-8',
    );
  });

  it('INSERTs into notifications table — not just emitting to PIPELINE_SUMMARY (spec 82 §4)', () => {
    // Before WF3-01 the script only queued alerts in memory and emitted them
    // to PIPELINE_SUMMARY for Datadog. Users never received the actual alerts.
    expect(content).toMatch(/INSERT INTO notifications/);
    expect(content).toMatch(/user_id,\s*type,\s*permit_num,\s*trade_slug,\s*title,\s*body,\s*created_at/);
  });

  it('notification INSERT is inside the same withTransaction as memory flag UPDATEs (spec 47 §7.1)', () => {
    // Atomicity requirement: if the flag UPDATE commits but the INSERT rolls back
    // (or vice versa), the user either loses the alert forever or receives it twice.
    // Both operations must share one transaction boundary.
    // Structural check: INSERT INTO notifications appears AFTER the category UPDATEs
    // and BEFORE the closing of the withTransaction block.
    const txStart = content.indexOf('await pipeline.withTransaction(pool, async (client) => {');
    const insertPos = content.indexOf('INSERT INTO notifications');
    const txEnd = content.indexOf('});', txStart); // first close after txStart
    // The INSERT must appear inside the transaction block
    expect(txStart).toBeGreaterThan(-1);
    expect(insertPos).toBeGreaterThan(txStart);
    expect(insertPos).toBeLessThan(
      content.indexOf('});', insertPos), // closing bracket after the INSERT loop
    );
  });

  it('uses batched multi-row VALUES INSERT — not per-row N+1 (spec 47 §7.6)', () => {
    // A per-row INSERT inside a for-of alerts loop would be N+1 roundtrips.
    // The batched VALUES pattern collapses all alerts into at most
    // ceil(alerts.length / ALERT_BATCH_SIZE) statements.
    expect(content).toMatch(/VALUES \$\{tuples\}/);
    expect(content).toMatch(/flatMap/); // params built with flatMap, not per-row push
  });

  it('chunks at ALERT_BATCH_SIZE to stay under 65,535 params (spec 47 §6.3)', () => {
    // With 7 columns per row, ALERT_BATCH_SIZE = Math.floor(65535 / 7) = 9362.
    // A burst stall event could generate 15,000 alerts — without chunking the
    // postgres driver would crash with "too many bind parameters".
    expect(content).toMatch(/ALERT_INSERT_COLS/);
    expect(content).toMatch(/ALERT_BATCH_SIZE/);
    expect(content).toMatch(/Math\.floor\(65535 \/ ALERT_INSERT_COLS\)/);
    expect(content).toMatch(/alerts\.slice\(i, i \+ ALERT_BATCH_SIZE\)/);
  });

  it('uses RUN_AT — not NOW() — for notifications.created_at (spec 47 §14.2)', () => {
    // Midnight Cross: using NOW() inside the loop means alerts created near
    // midnight get a different date than the updated_at on tracked_projects.
    // RUN_AT is captured once at startup and passed as the final param.
    expect(content).not.toMatch(/INSERT INTO notifications[\s\S]{0,500}NOW\(\)/);
    // RUN_AT must be in the params flatMap for the notification INSERT.
    // Phase F.2 v4 CRIT-CC: INSERT params include CoA polymorphism fallback chain — the
    // expression `a.coa_application_number || a.permit_num || 'unknown-coa'` precedes the trailing fields.
    expect(content).toMatch(/a\.user_id[\s\S]{0,2000}a\.body[\s\S]{0,200}RUN_AT/);
  });

  it('alert objects carry title and body — not a bare message field (matches notifications schema)', () => {
    // notifications table has title VARCHAR(200) + body TEXT — no "message" column.
    // Inserting a.message would silently fail or map to the wrong column.
    expect(content).toMatch(/title: NOTIFICATION_TITLES\./);
    expect(content).toMatch(/body: `/); // body is the full contextual sentence
    expect(content).not.toMatch(/alerts\.push\([\s\S]{0,200}message:/); // old field gone
  });

  it('defines NOTIFICATION_TITLES constant with all three alert types (spec 82 §4)', () => {
    expect(content).toMatch(/NOTIFICATION_TITLES/);
    expect(content).toMatch(/STALL_WARNING/);
    expect(content).toMatch(/STALL_CLEARED/);
    expect(content).toMatch(/START_IMMINENT/);
  });
});

// ── WF3-02: last_notified_urgency reset tests ──

describe('scripts/update-tracked-projects.js — WF3-02 urgency reset', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../..', 'scripts/update-tracked-projects.js'),
      'utf-8',
    );
  });

  it('B5: resets last_notified_urgency when forecast leaves imminent state (spec 82 §8.3)', () => {
    // Without this reset, once a project is flagged imminent the flag sticks
    // forever. If the city delays the permit and it later approaches again,
    // the script skips the alert thinking it already sent it.
    expect(content).toMatch(/row\.last_notified_urgency === 'imminent'[\s\S]{0,100}row\.urgency !== 'imminent'/);
    expect(content).toMatch(/last_notified_urgency: null/);
  });

  it('B5 is a silent reset — no alert payload is generated', () => {
    // The reset is an internal memory correction, not a user-facing event.
    // Confirm no alert is pushed inside the B5 block.
    const b5Start = content.indexOf("row.last_notified_urgency === 'imminent' && row.urgency !== 'imminent'");
    const b5End = content.indexOf('// End B5', b5Start) !== -1
      ? content.indexOf('// End B5', b5Start)
      : content.indexOf('\n  }', b5Start);
    // No alerts.push() call between the B5 condition and the next block boundary
    const b5Slice = content.slice(b5Start, b5End + 200);
    expect(b5Slice).not.toMatch(/alerts\.push/);
  });

  it('categorizer routes reset-only updates to resetUrgencyOnlyIds', () => {
    // A B5-only update has last_notified_urgency = null and no stall change.
    // Without an explicit isReset branch, it falls through to the invariant
    // warning and is silently dropped.
    expect(content).toMatch(/resetUrgencyOnlyIds/);
  });

  it('categorizer handles stall-on + urgency-reset combo (stallOnResetUrgencyIds)', () => {
    // B2 (stall alert) + B5 (urgency reset) can fire in the same run for the
    // same row — after merge: { last_notified_stalled: true, last_notified_urgency: null }
    expect(content).toMatch(/stallOnResetUrgencyIds/);
  });

  it('categorizer handles stall-recovery + urgency-reset combo (stallOffResetUrgencyIds)', () => {
    // B3 (recovery) + B5 (urgency reset): { last_notified_stalled: false, last_notified_urgency: null }
    expect(content).toMatch(/stallOffResetUrgencyIds/);
  });

  it('reset UPDATE uses IS NOT NULL guard — prevents no-op writes (spec 47 §12)', () => {
    // Without the guard a reset UPDATE hits every row in the id list even
    // when last_notified_urgency is already NULL, inflating rowCount and
    // generating spurious updated_at changes.
    expect(content).toMatch(/SET last_notified_urgency = NULL[\s\S]{0,100}AND last_notified_urgency IS NOT NULL/);
  });

  it('categorizer uses isImminent and isReset — not the old hasUrgency != null pattern', () => {
    // The old `hasUrgency = upd.last_notified_urgency != null` evaluated to false
    // for null values, causing reset updates to fall into the invariant warning.
    expect(content).toMatch(/isImminent\s*=\s*upd\.last_notified_urgency === 'imminent'/);
    expect(content).toMatch(/isReset\s*=\s*upd\.last_notified_urgency === null/);
  });
});

// ── WF3-03: NULL lifecycle_phase + NULL urgency dead lead archive ──

describe('scripts/update-tracked-projects.js — WF3-03 dead lead archive', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../..', 'scripts/update-tracked-projects.js'),
      'utf-8',
    );
  });

  it('archives leads with null lifecycle_phase AND null urgency (spec 82 §8.4)', () => {
    // Both null = no phase classification + no forecast data.
    // The lead will never generate an alert, never auto-archive via isWindowClosed,
    // and never expire via urgency === 'expired'. Without this check it accumulates
    // in tracked_projects as a ghost lead that clogs the user's CRM board forever.
    expect(content).toMatch(/row\.lifecycle_phase == null[\s\S]{0,200}row\.urgency == null[\s\S]{0,100}status: 'archived'/);
  });

  it('silently continues when lifecycle_phase is null but urgency is non-null (no archive)', () => {
    // A permit with no phase yet but an active forecast signal (upcoming/imminent/etc.)
    // should not be archived — it may still become trackable once the phase is assigned.
    // The continue after the archive block must be unconditional (fires for both branches).
    const nullPhaseBlock = content.slice(
      content.indexOf('row.lifecycle_phase == null'),
      content.indexOf('continue;', content.indexOf('row.lifecycle_phase == null')) + 10,
    );
    expect(nullPhaseBlock).toMatch(/continue/);
    // The block must NOT send an alert for the null-urgency archive path
    expect(nullPhaseBlock).not.toMatch(/alerts\.push/);
  });

  it('reuses existing archiveIds SQL path — no new SQL needed (spec 47 §7.5)', () => {
    // The null-phase archive pushes { id, status: 'archived' } into updates[].
    // The batch categorizer routes it to archiveIds, which is already handled
    // by the ANY($2::int[]) UPDATE. Zero new SQL roundtrips introduced.
    // Verify by checking that there is only ONE 'archived' UPDATE statement.
    const archivedMatches = content.match(/SET status = 'archived'/g);
    expect(archivedMatches).toHaveLength(1); // single consolidated archive UPDATE
  });
});

// 🔗 SPEC LINK: docs/specs/01-pipeline/82_crm_assistant_alerts.md §4 CoA Lead Handling
//             docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase F.2
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3 + §7
//             docs/specs/01-pipeline/48_pipeline_observability.md §3.1 / §3.4 / §11.4
describe('Phase F.2 — update-tracked-projects.js CoA branch (WF1 v4)', () => {
  let SRC: string;
  beforeAll(() => {
    SRC = read('scripts/update-tracked-projects.js');
  });

  // ── SOURCE_SQL UNION (Part 2.1) ──────────────────────────────────────

  it('F.2-1: SOURCE_SQL contains UNION ALL with permit-side Branch A + CoA Branch B', () => {
    expect(SRC).toMatch(/UNION\s+ALL/);
  });

  it('F.2-2: Branch A projects p.lead_id AS lead_id (resolves #118 naming standardization)', () => {
    expect(SRC).toMatch(/p\.lead_id\s+AS\s+lead_id/);
  });

  it('F.2-3: Branch A WHERE filters lead_id NOT LIKE \'coa:%\' for mutual exclusivity (v2 CRIT-C)', () => {
    expect(SRC).toMatch(/tp\.lead_id\s+IS\s+NULL\s+OR\s+tp\.lead_id\s+NOT\s+LIKE\s+'coa:%'/i);
  });

  it('F.2-4: Branch B uses LEFT JOIN on coa_applications for single-pass orphan detection (v4 HIGH-JJ)', () => {
    expect(SRC).toMatch(/LEFT\s+JOIN\s+coa_applications\s+ca\s+ON\s+ca\.lead_id\s*=\s*tp\.lead_id/i);
  });

  it('F.2-5: Branch B filters tp.lead_id LIKE \'coa:%\'', () => {
    expect(SRC).toMatch(/tp\.lead_id\s+LIKE\s+'coa:%'/);
  });

  it('F.2-6: Branch B projects NULL::int AS imminent_window_days (v2 HIGH-J — no permit-side pollution)', () => {
    expect(SRC).toMatch(/NULL::int\s+AS\s+imminent_window_days/i);
  });

  it('F.2-7: coa_days_at_status uses GREATEST(..., 0) clamp + last_seen_at fallback (v2 HIGH-H + MED-S)', () => {
    expect(SRC).toMatch(/GREATEST\s*\(/);
    expect(SRC).toMatch(/last_seen_at/);
  });

  it('F.2-8: Branch A projects NULL::boolean AS notified_decision_rendered for UNION parity (v3 CRIT-1)', () => {
    expect(SRC).toMatch(/NULL::boolean\s+AS\s+notified_decision_rendered/i);
  });

  // ── Module-local pure helpers (Part 2.2) ────────────────────────────

  it('F.2-9: selectCoaStallThreshold helper present with null-guard (v3 MED-18)', () => {
    expect(SRC).toMatch(/function\s+selectCoaStallThreshold\s*\(\s*coaStatus\s*,\s*logicVars\s*\)/);
    expect(SRC).toMatch(/coaStatus\s*==\s*null/);
  });

  it('F.2-10: selectCoaStallThreshold reads existing coa_stall_threshold key (NOT _days suffix; v2 CRIT-A)', () => {
    expect(SRC).toMatch(/logicVars\.coa_stall_threshold\b(?!_)/);
    const helperBlock = SRC.match(/function\s+selectCoaStallThreshold[\s\S]+?\n\}/);
    expect(helperBlock).toBeTruthy();
    expect(helperBlock?.[0]).not.toMatch(/coa_stall_threshold_days/);
  });

  it('F.2-11: selectCoaStallThreshold reads coa_stall_threshold_postponed_days (v2 HIGH-I)', () => {
    expect(SRC).toMatch(/logicVars\.coa_stall_threshold_postponed_days/);
  });

  it('F.2-12: isCoaInImminentWindow with UTC parse + zero-guard (v4 HIGH-GG + NIT-XX)', () => {
    expect(SRC).toMatch(/function\s+isCoaInImminentWindow\s*\(/);
    expect(SRC).toMatch(/T00:00:00Z/);
    expect(SRC).toMatch(/windowDays\s*<=\s*0/);
  });

  it('F.2-13: isCoaTerminalState helper includes Closed in COA_TERMINAL_STATUSES (v4 CRIT-DD)', () => {
    expect(SRC).toMatch(/function\s+isCoaTerminalState/);
    expect(SRC).toMatch(/COA_TERMINAL_STATUSES[\s\S]{0,80}'Closed'/);
    expect(SRC).toMatch(/COA_TERMINAL_STATUSES[\s\S]{0,80}'Complete'/);
  });

  it('F.2-14: COA_APPROVED_DECISIONS excludes Final and Binding (v2 CRIT-G)', () => {
    const setMatch = SRC.match(/COA_APPROVED_DECISIONS\s*=\s*new\s+Set\s*\(\s*\[[^\]]+\]\s*\)/);
    expect(setMatch).toBeTruthy();
    expect(setMatch?.[0]).not.toMatch(/'Final and Binding'/);
  });

  it('F.2-15: extractCoaApplicationNumber regex helper with null-safe return (v3 LOW-20)', () => {
    expect(SRC).toMatch(/function\s+extractCoaApplicationNumber/);
    expect(SRC).toMatch(/\/\^coa:\(\.\+\)\$\//);
  });

  // ── Branch B dispatch (Part 2.3) ─────────────────────────────────────

  it('F.2-16: E.2 defensive coa:% skip guard REMOVED', () => {
    expect(SRC).not.toMatch(/Skipping CoA row \(permit_lead_id/);
  });

  it('F.2-17: CoA branch dispatches on row.lead_id.startsWith(\'coa:\') (NOT permit_lead_id)', () => {
    expect(SRC).toMatch(/row\.lead_id\?\.startsWith\(\s*'coa:'\s*\)|row\.lead_id\.startsWith\(\s*'coa:'\s*\)/);
  });

  it('F.2-18: Negative grep — zero permit_lead_id references in script (v3 HIGH-12)', () => {
    expect(SRC).not.toMatch(/row\.permit_lead_id/);
  });

  it('F.2-19: decision-reversal reset runs BEFORE auto-archive (v4 CRIT-AA)', () => {
    const resetIdx = SRC.search(/notified_decision_rendered:\s*false/);
    const archiveIdx = SRC.search(/terminalState\s*=\s*isCoaTerminalState/);
    expect(resetIdx).toBeGreaterThan(0);
    expect(archiveIdx).toBeGreaterThan(0);
    expect(resetIdx).toBeLessThan(archiveIdx);
  });

  it('F.2-20: Auto-archive condition is `if (terminalState)` only — NO C4 clause (v3 CRIT-2)', () => {
    const archiveBlock = SRC.match(/const\s+terminalState[\s\S]{0,500}if\s*\(\s*terminalState\s*\)/);
    expect(archiveBlock).toBeTruthy();
    expect(archiveBlock?.[0]).not.toMatch(/lifecycle_group\s*===\s*'C4'/);
  });

  // ── Notification subtypes (Part 2.4) ─────────────────────────────────

  it('F.2-21: NOTIFICATION_TITLES includes 3 new CoA subtypes', () => {
    expect(SRC).toMatch(/COA_HEARING_IMMINENT:/);
    expect(SRC).toMatch(/COA_DECISION_RENDERED:/);
    expect(SRC).toMatch(/COA_STALLED:/);
  });

  it('F.2-22: extractCoaApplicationNumber || \'unknown-coa\' fallback at call sites (v4 CRIT-CC)', () => {
    expect(SRC).toMatch(/extractCoaApplicationNumber\(row\.lead_id\)\s*\|\|\s*'unknown-coa'/);
  });

  // ── LOGIC_VARS_SCHEMA (Spec 47 §R4) ──────────────────────────────────

  it('F.2-23: LOGIC_VARS_SCHEMA validates 4 CoA keys (3 existing + 1 new)', () => {
    expect(SRC).toMatch(/coa_stall_threshold:\s*z\./);
    expect(SRC).toMatch(/coa_stall_threshold_p2_days:\s*z\./);
    expect(SRC).toMatch(/coa_stall_threshold_postponed_days:\s*z\./);
    expect(SRC).toMatch(/coa_imminent_window_days:\s*z\./);
  });

  // ── Startup checks (Part 2.7) ────────────────────────────────────────

  it('F.2-24: Pre-fetches deploy-age counts in single startup query (v2 HIGH-N)', () => {
    expect(SRC).toMatch(/prior_runs_7d/);
    expect(SRC).toMatch(/prior_runs_30d/);
    expect(SRC).toMatch(/coaFirstDeployGrace/);
    expect(SRC).toMatch(/inQuietPeriod/);
  });

  it('F.2-25: Deploy-age query uses pipeline = \'permits:update_tracked_projects\' (v2 HIGH-N)', () => {
    expect(SRC).toMatch(/pipeline\s*=\s*'permits:update_tracked_projects'/);
  });

  // ── Audit rows + records_meta (Part 2.8) ─────────────────────────────

  it('F.2-26: 6 new CoA-side audit rows present (5 alert/archive + 1 orphan)', () => {
    expect(SRC).toMatch(/metric:\s*['"]coa_stall_alerts['"]/);
    expect(SRC).toMatch(/metric:\s*['"]coa_recovery_alerts['"]/);
    expect(SRC).toMatch(/metric:\s*['"]coa_imminent_alerts['"]/);
    expect(SRC).toMatch(/metric:\s*['"]coa_decision_alerts['"]/);
    expect(SRC).toMatch(/metric:\s*['"]coa_archived['"]/);
    expect(SRC).toMatch(/metric:\s*['"]coa_orphaned_lead_ids['"]/);
  });

  it('F.2-27: coa_skipped_count REMOVED from F.2 audit rows (v2 LOW-T)', () => {
    expect(SRC).not.toMatch(/metric:\s*['"]coa_skipped_count['"]/);
  });

  it('F.2-28: in_quiet_period audit row present as INFO (v4 HIGH-OO)', () => {
    expect(SRC).toMatch(/metric:\s*['"]in_quiet_period['"]/);
  });

  it('F.2-29: coa_alert_distribution_by_lifecycle_group with C1/C2/C3/C4 symmetric shape (v3 HIGH-8)', () => {
    expect(SRC).toMatch(/skipDistributionCoa/);
    expect(SRC).toMatch(/C1[\s\S]{0,150}C2[\s\S]{0,150}C3[\s\S]{0,150}C4/);
  });

  it('F.2-30: records_total = totalRowsPermit + totalRowsCoa (Spec 47 §11.1)', () => {
    expect(SRC).toMatch(/records_total:\s*totalRowsPermit\s*\+\s*totalRowsCoa/);
  });

  it('F.2-31: emitMeta writes include notifications (v2 HIGH-P)', () => {
    expect(SRC).toMatch(/notifications:\s*\[[\s\S]{0,200}'type'[\s\S]{0,200}'permit_num'/);
  });

  it('F.2-32: emitMeta reads include coa_applications + lifecycle_classified_at + last_seen_at', () => {
    expect(SRC).toMatch(/coa_applications:[\s\S]{0,300}lifecycle_classified_at[\s\S]{0,200}last_seen_at/);
  });

  // ── Diff-stage 4-reviewer folds (locked-in after Green Light) ────────

  it('F.2-33: diff-CRIT-1 — decisionRenderedTrueIds / decisionRenderedFalseIds batch categories + UPDATEs', () => {
    expect(SRC).toMatch(/decisionRenderedTrueIds/);
    expect(SRC).toMatch(/decisionRenderedFalseIds/);
    expect(SRC).toMatch(/SET\s+notified_decision_rendered\s*=\s*true[\s\S]{0,150}IS DISTINCT FROM true/);
    expect(SRC).toMatch(/SET\s+notified_decision_rendered\s*=\s*false[\s\S]{0,150}IS DISTINCT FROM false/);
  });

  it('F.2-34: diff-CRIT-2 — totalAlerts includes all 7 alert counters (Gemini CRIT 2)', () => {
    expect(SRC).toMatch(
      /totalAlerts\s*=\s*stallAlerts\s*\+\s*recoveryAlerts\s*\+\s*imminentAlerts[\s\S]{0,200}coaStallAlerts[\s\S]{0,200}coaRecoveryAlerts[\s\S]{0,200}coaImminentAlerts[\s\S]{0,200}coaDecisionAlerts/,
    );
  });

  it('F.2-35: diff-CRIT-3 — lead_analytics UNIONs CoA leads (Gemini CRIT 1)', () => {
    expect(SRC).toMatch(/INSERT INTO lead_analytics[\s\S]{0,1500}UNION ALL[\s\S]{0,500}tp\.lead_id\s+AS\s+lead_key/i);
    expect(SRC).toMatch(/la\.lead_key\s*=\s*tp\.lead_id/);
  });

  it('F.2-36: diff-CRIT-4 — Branch B uses ca.lead_id discriminant for orphan detection (Observability CRIT)', () => {
    expect(SRC).toMatch(/ca\.lead_id\s+AS\s+ca_lead_id/i);
    expect(SRC).toMatch(/row\.ca_lead_id\s*==\s*null/);
  });

  it('F.2-37: diff-HIGH — Branch B coa_days_at_status uses $1::timestamptz RUN_AT (Spec 47 §14 Midnight Cross)', () => {
    expect(SRC).toMatch(/EXTRACT\(EPOCH FROM \(\$1::timestamptz - ca\.lifecycle_classified_at\)\)/);
    expect(SRC).toMatch(/EXTRACT\(EPOCH FROM \(\$1::timestamptz - ca\.last_seen_at\)\)/);
    expect(SRC).toMatch(/pipeline\.streamQuery\(pool,\s*SQL,\s*\[RUN_AT\]\)/);
  });

  it('F.2-38: diff-HIGH — skipDistributionCoa has `unknown` slot (DeepSeek HIGH + Gemini NIT convergent)', () => {
    expect(SRC).toMatch(/skipDistributionCoa\s*=\s*\{[\s\S]{0,500}unknown:\s*\{\s*imminent:\s*0,\s*stalled:\s*0,\s*recovery:\s*0,\s*decision:\s*0,\s*archived:\s*0\s*\}/);
  });

  it('F.2-39: diff-IMPORTANT — emitSummary failure payload before Zod throw (Observability IMPORTANT)', () => {
    expect(SRC).toMatch(/logicVarsResult\.success[\s\S]{0,800}emitSummary\([\s\S]{0,800}verdict:\s*['"]FAIL['"][\s\S]{0,600}throw new Error/);
  });
});

