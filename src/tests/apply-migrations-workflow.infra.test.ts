/**
 * apply-migrations workflow shape lock — the first audited cloud migration-apply path.
 *
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md
 * SPEC LINK: docs/runbook/README.md
 * PLAN: .cursor/wf3_apply_migrations_workflow.md
 *
 * Every assertion here pins a control whose silent loss would let production DDL
 * run unattended, unguarded, or unverified:
 *   · workflow_dispatch-only + the production-db environment IS the entire
 *     authorization model — any second trigger (push/pull_request/schedule)
 *     turns a human-approved apply into an automated one (the 1e405bce fence,
 *     generalized: on THIS workflow every automated trigger is forbidden)
 *   · dry_run defaults 'true' so a mis-click applies nothing
 *   · apply mode silently SKIPS drifted files with a WARN (migrate.js:204-211),
 *     so the drift-abort gate ahead of the apply is load-bearing, not decorative
 *   · a killed CREATE INDEX CONCURRENTLY leaves an INVALID index that
 *     IF NOT EXISTS then skips forever while --verify stays green FOREVER —
 *     the pg_index.indisvalid gate is the only thing that can ever see it
 *   · the 6543 transaction pooler cannot run CONCURRENTLY statements at all,
 *     so the port guard must refuse it before anything touches the DB
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORKFLOW = join(process.cwd(), '.github/workflows/apply-migrations.yml');
const yaml = readFileSync(WORKFLOW, 'utf8');

/** Lines that are actual YAML, not commentary — comments must never satisfy an assertion. */
const activeLines = yaml
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

describe('apply-migrations workflow', () => {
  describe('trigger surface', () => {
    it('is dispatchable on demand', () => {
      expect(activeLines).toMatch(/workflow_dispatch:/);
    });

    it('has NO automated triggers (the 1e405bce fence, generalized)', () => {
      // The dispatch + environment approval is the entire authorization model.
      // A push/pull_request/schedule trigger would apply production DDL with
      // no human in the loop.
      expect(activeLines).not.toMatch(/^\s*push:/m);
      expect(activeLines).not.toMatch(/^\s*pull_request(_target)?:/m);
      expect(activeLines).not.toMatch(/^\s*schedule:/m);
      expect(activeLines).not.toMatch(/^\s*-\s*cron:/m);
    });

    it('defaults dry_run to true so a mis-click applies nothing', () => {
      expect(activeLines).toMatch(/dry_run:[\s\S]{0,200}?default:\s*'true'/);
    });
  });

  describe('authorization + blast radius', () => {
    it('gates the job behind the production-db environment', () => {
      expect(activeLines).toMatch(/environment:\s*production-db/);
    });

    it('holds only contents: read permissions (Fold D4)', () => {
      expect(activeLines).toMatch(/permissions:\s*\n\s*contents:\s*read/);
    });

    it('queues, never cancels, concurrent runs (F8 concurrency convention)', () => {
      expect(activeLines).toMatch(/group:\s*\$\{\{\s*github\.workflow\s*\}\}/);
      expect(activeLines).toMatch(/cancel-in-progress:\s*false/);
    });

    it('caps the job at 15 minutes', () => {
      expect(activeLines).toMatch(/timeout-minutes:\s*15/);
    });
  });

  describe('connection safety', () => {
    it('refuses the 6543 transaction pooler (Fold D2)', () => {
      // CREATE INDEX CONCURRENTLY cannot run through Supavisor transaction
      // pooling; apply must use session mode (port 5432).
      expect(activeLines).toMatch(/:6543/);
    });

    it('guards against an empty SUPABASE_DATABASE_URL secret', () => {
      // A missing GitHub secret interpolates to an empty string and does NOT,
      // on its own, fail a workflow (Spec 115 §3).
      expect(activeLines).toMatch(/-z "\$SUPABASE_DATABASE_URL"/);
    });

    it('pins the committed CA cert path (chain-workflow convention, RC-c)', () => {
      expect(activeLines).toMatch(
        /SUPABASE_CA_CERT_PATH:\s*\$\{\{\s*github\.workspace\s*\}\}\/scripts\/certs\/supabase-ca\.pem/,
      );
    });
  });

  describe('preamble (Fold I3)', () => {
    it('sets up node and installs dependencies before touching migrate.js', () => {
      expect(activeLines).toMatch(/actions\/setup-node/);
      expect(activeLines).toMatch(/npm ci/);
    });
  });

  describe('pre-state verify + drift gate (Fold G3)', () => {
    it('runs the pre-state verify as a bare continue-on-error run (watchdog pattern)', () => {
      // The bare `run:` form is load-bearing: wrapping in `if ! …; then echo; fi`
      // swallows the exit code, renders the step GREEN, and turns
      // continue-on-error into dead configuration (pipeline-watchdog.yml:101-105).
      expect(activeLines).toMatch(
        /continue-on-error:\s*true\s*\n\s*shell:\s*bash\s*\n\s*run:\s*node scripts\/migrate\.js --verify/,
      );
    });

    it('never wraps the verify in an exit-code-swallowing if !', () => {
      expect(activeLines).not.toMatch(/if\s+!\s*node scripts\/migrate\.js/);
    });

    it('parses the Verify summary line and hard-aborts on drift', () => {
      // Apply mode silently SKIPS drifted files with a WARN, so proceeding
      // past drift would record a partial apply as a clean one.
      expect(activeLines).toMatch(/\^Verify: \[0-9\]\+ missing, \[0-9\]\+ drift\$/);
      expect(activeLines).toMatch(/"\$drift"\s+-gt\s+0/);
      expect(activeLines).toMatch(/::error[^\n]*DRIFT/);
    });

    it('proceeds on missing-only, listing what will be applied', () => {
      expect(activeLines).toMatch(/"\$missing"\s+-gt\s+0/);
      expect(activeLines).toMatch(/::notice[^\n]*MISSING/);
    });
  });

  describe('dry-run listing (Fold I1)', () => {
    it('runs the real migrate.js --dry-run would-apply listing', () => {
      expect(activeLines).toMatch(/run:\s*node scripts\/migrate\.js --dry-run/);
    });
  });

  describe('apply path (dry_run=false only)', () => {
    it('runs the bare apply (no flags) only when dry_run == false', () => {
      expect(activeLines).toMatch(
        /if:\s*inputs\.dry_run\s*==\s*'false'\s*\n\s*run:\s*node scripts\/migrate\.js\s*$/m,
      );
    });

    it('re-verifies after apply WITHOUT continue-on-error', () => {
      // The post-apply verify's exit code must be able to redden the job.
      expect(activeLines).toMatch(
        /if:\s*inputs\.dry_run\s*==\s*'false'\s*\n\s*run:\s*node scripts\/migrate\.js --verify/,
      );
      // Exactly ONE continue-on-error in the whole file: the pre-state verify.
      expect(activeLines.match(/continue-on-error/g) ?? []).toHaveLength(1);
    });

    it('gates on INVALID indexes after apply (Fold RC-a)', () => {
      // A killed CREATE INDEX CONCURRENTLY leaves an INVALID index; on retry
      // IF NOT EXISTS silently skips it, the file records as applied, and
      // --verify (checksums only) is green forever. This query is the only
      // signal that the index is permanently broken.
      expect(activeLines).toMatch(/pg_index WHERE NOT indisvalid/);
    });
  });

  describe('failure post-mortem (Fold D3)', () => {
    it('runs a post-mortem step only on failure', () => {
      expect(activeLines).toMatch(/if:\s*failure\(\)/);
    });
  });
});
