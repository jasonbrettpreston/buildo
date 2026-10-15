'use strict';
/**
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-CQ
 *
 * The host-memory floor the orchestrator checks before a DB-lane job or a
 * full suite (R-CQ, 2026-10-15, Mac mini). macOS keeps "free" pages near zero
 * by design (file cache + compressor), so the Windows-era "≥ 4 GB free" read
 * 0.06–0.13 GB on every measured run; the right signal is `memory_pressure -Q`
 * "System-wide memory free percentage". Pure parse + classify here so it is
 * testable; scripts/ai-env-check.mjs runs the probe and prints the line.
 */

const HOST_MEMORY_FLOOR_PCT = 25;

/** `memory_pressure -Q` output → the integer free percentage, or null if absent. */
function parseMemoryPressureFreePct(text) {
  const m = /System-wide memory free percentage:\s*(\d+)\s*%/.exec(String(text ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * hostMemoryLine(platform, probeText) → the one ai-env-check line.
 * Non-macOS hosts are reported as skipped (the probe is macOS-only); an
 * unparseable probe is a WARN, never a silent pass.
 */
function hostMemoryLine(platform, probeText) {
  if (platform !== 'darwin') {
    return `⚠  Host memory: skipped (memory_pressure is macOS-only; R-CQ floor ${HOST_MEMORY_FLOOR_PCT}% free)`;
  }
  const pct = parseMemoryPressureFreePct(probeText);
  if (pct === null) {
    return `⚠  Host memory: probe FAILED — could not read memory_pressure -Q (R-CQ floor ${HOST_MEMORY_FLOOR_PCT}% free)`;
  }
  if (pct < HOST_MEMORY_FLOOR_PCT) {
    return `⚠  Host memory: ${pct}% free < R-CQ floor ${HOST_MEMORY_FLOOR_PCT}% — wait (poll ≤ 30 min, then park) before a DB-lane job or full suite`;
  }
  return `✔ Host memory: ${pct}% free (R-CQ floor ${HOST_MEMORY_FLOOR_PCT}%)`;
}

module.exports = { HOST_MEMORY_FLOOR_PCT, parseMemoryPressureFreePct, hostMemoryLine };
