/**
 * Pipeline Tracing — opt-in OpenTelemetry instrumentation.
 *
 * Gracefully degrades to no-op when @opentelemetry/api is not installed.
 * Zero overhead when disabled — the no-op stubs are plain objects with
 * empty methods that get inlined by V8.
 *
 * To enable:
 *   npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 node scripts/load-permits.js
 *
 * SPEC LINK: docs/specs/00_engineering_standards.md §9.7
 */

// ---------------------------------------------------------------------------
// No-op stubs — used when @opentelemetry/api is not available
// ---------------------------------------------------------------------------

const NOOP_SPAN = {
  setAttribute() { return this; },
  setAttributes() { return this; },
  addEvent() { return this; },
  setStatus() { return this; },
  recordException() { return this; },
  end() {},
  isRecording() { return false; },
};

const NOOP_TRACER = {
  startSpan() { return NOOP_SPAN; },
  startActiveSpan(name, ...args) {
    // startActiveSpan(name, fn) or startActiveSpan(name, opts, fn)
    const fn = args[args.length - 1];
    return fn(NOOP_SPAN);
  },
};

// ---------------------------------------------------------------------------
// Attempt to load @opentelemetry/api
// ---------------------------------------------------------------------------

let api = null;
try {
  api = require('@opentelemetry/api');
} catch {
  // Not installed — tracing is disabled (no-op)
}

/**
 * Get a tracer instance. Returns a real OTel tracer when the API is
 * available and an SDK is registered, otherwise returns NOOP_TRACER.
 *
 * @param {string} name - Instrumentation scope name
 * @returns {object} Tracer (real or no-op)
 */
function getTracer(name) {
  if (!api) return NOOP_TRACER;
  return api.trace.getTracer(name || 'buildo-pipeline', '1.0.0');
}

/**
 * Check if tracing is active (OTel API loaded AND an SDK is registered).
 * @returns {boolean}
 */
function isEnabled() {
  if (!api) return false;
  // A registered SDK replaces the no-op TracerProvider
  const tracer = api.trace.getTracer('buildo-pipeline');
  const span = tracer.startSpan('probe');
  const recording = span.isRecording();
  span.end();
  return recording;
}

/** OTel SpanStatusCode constants (safe even without the package). */
const SpanStatusCode = api
  ? { OK: api.SpanStatusCode.OK, ERROR: api.SpanStatusCode.ERROR }
  : { OK: 1, ERROR: 2 };

module.exports = { getTracer, isEnabled, SpanStatusCode, NOOP_SPAN, NOOP_TRACER };
