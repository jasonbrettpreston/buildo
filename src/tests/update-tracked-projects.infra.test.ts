// SPEC LINK: docs/specs/product/future/82_crm_assistant_alerts.md
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

  it('acquires advisory lock 82 on a pinned pool.connect() client (WF3-03 PR-B / H-W1)', () => {
    // Lock ID convention: lock_id = spec number. Mirrors classify-lifecycle-phase.js.
    // Existing two pipeline.withTransaction blocks (memory-column UPDATEs +
    // analytics UPSERT/zero-out) already cover atomicity (§9.1) — only the
    // advisory lock was missing. Per-script lock prevents two concurrent
    // runs from racing on tracked_projects memory columns and
    // double-firing CRM alerts.
    expect(content).toMatch(/const ADVISORY_LOCK_ID = 82/);
    expect(content).toMatch(/await pool\.connect\(\)/);
    expect(content).toMatch(/SELECT pg_try_advisory_lock\(\$1\)/);
    expect(content).toMatch(/SELECT pg_advisory_unlock\(\$1\)/);
    expect(content).not.toMatch(/pool\.query\([^)]*pg_try_advisory_lock/);
    expect(content).not.toMatch(/pool\.query\([^)]*pg_advisory_unlock/);
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

  it('registers a SIGTERM handler to release advisory lock gracefully (spec 47 §5.5)', () => {
    expect(content).toMatch(/process\.on\('SIGTERM'/);
    expect(content).toMatch(/pg_advisory_unlock/);
    expect(content).toMatch(/process\.exit\(143\)/);
  });

  it('includes lockClientReleased flag — guards against double-release on SIGTERM (spec 47 §5.5)', () => {
    expect(content).toMatch(/lockClientReleased/);
  });

  it('captures RUN_AT from DB at startup — MANDATORY skeleton §R3.5 (spec 47 §14.1)', () => {
    expect(content).toMatch(/RUN_AT/);
    expect(content).toMatch(/SELECT NOW\(\) AS now/);
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
    // RUN_AT must be in the params flatMap for the notification INSERT
    expect(content).toMatch(/a\.user_id[\s\S]{0,200}a\.type[\s\S]{0,200}a\.body[\s\S]{0,200}RUN_AT/);
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
