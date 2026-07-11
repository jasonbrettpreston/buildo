#!/usr/bin/env node
/**
 * Expo push transport — extracted from classify-lifecycle-phase.js (P25 25A)
 * and made TRANSPORT-INJECTABLE so the dispatch step's test battery can drive a
 * mock transport (no network) and assert exact behaviour against the ledger.
 *
 * Preserves the WF3 2026-05-04 hardening byte-for-behavior:
 *   - reject on non-2xx HTTP status (pre-WF3 silently dropped 4xx/5xx),
 *   - reject on Expo top-level `errors[]`,
 *   - parse the per-ticket `data[]` array and surface `status:'error'` tickets
 *     (Expo returns HTTP 200 with per-ticket errors embedded in the body),
 *   - align tickets to input messages by index so the caller can prune the
 *     EXACT dead token on `DeviceNotRegistered` (never a user's other devices).
 *
 * Unlike the pre-P25 `callExpoPushApi` (which resolved the raw body and only
 * logged per-ticket errors), `sendPushChunk` RETURNS the parsed tickets so the
 * dispatcher can: (a) record `expo_ticket_id` for the next-run receipt pass, and
 * (b) identify the exact tokens to prune.
 *
 * SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md §4
 */
'use strict';

const https = require('https');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPT_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';

// Expo accepts up to 100 messages per push request.
const MAX_CHUNK = 100;

/**
 * Default HTTPS transport. `transport(url, bodyString)` → Promise<{ statusCode, body }>.
 * Injecting a different transport in tests avoids any network I/O.
 */
function httpsTransport(url, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Send a single chunk of <=100 messages. Returns `{ tickets }` where each ticket
 * is Expo's per-message result `{ status, id?, message?, details? }` augmented
 * with `to` (the target token, aligned by index).
 *
 * Throws on non-2xx or top-level errors (the WF3 reject contract) — the caller's
 * try/catch surfaces it via pipeline.log and records a delivery_error.
 */
async function sendPushChunk(messages, { transport = httpsTransport, url = EXPO_PUSH_URL } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) return { tickets: [] };
  if (messages.length > MAX_CHUNK) {
    throw new Error(`sendPushChunk: ${messages.length} messages exceeds Expo's ${MAX_CHUNK}-per-request limit — chunk upstream`);
  }
  const body = JSON.stringify(messages);
  const { statusCode, body: resBody } = await transport(url, body);

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Expo Push API ${statusCode}: ${String(resBody).slice(0, 500)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(resBody);
  } catch {
    // Non-JSON 2xx body — exotic; treat as opaque success (pre-WF3 contract).
    return { tickets: [] };
  }

  if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
    throw new Error(`Expo Push API top-level errors: ${JSON.stringify(parsed.errors).slice(0, 500)}`);
  }

  const raw = Array.isArray(parsed?.data) ? parsed.data : [];
  const tickets = raw.map((t, i) => ({
    status: t?.status,
    id: t?.id ?? null,
    message: t?.message ?? null,
    error: t?.details?.error ?? null,
    to: messages[i]?.to ?? null,
  }));
  return { tickets };
}

/**
 * Fetch delivery receipts for a set of Expo ticket ids (the next-run receipt
 * pass). Returns `{ receipts }` — a map of ticketId → { status, error }.
 * Errors are non-fatal for the caller (receipts are best-effort).
 */
async function fetchReceipts(ticketIds, { transport = httpsTransport, url = EXPO_RECEIPT_URL } = {}) {
  const ids = (ticketIds || []).filter(Boolean);
  if (ids.length === 0) return { receipts: {} };
  const body = JSON.stringify({ ids });
  const { statusCode, body: resBody } = await transport(url, body);
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Expo receipts API ${statusCode}: ${String(resBody).slice(0, 500)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(resBody);
  } catch {
    return { receipts: {} };
  }
  const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : {};
  const receipts = {};
  for (const [id, r] of Object.entries(data)) {
    receipts[id] = { status: r?.status, error: r?.details?.error ?? null };
  }
  return { receipts };
}

module.exports = {
  EXPO_PUSH_URL,
  EXPO_RECEIPT_URL,
  DEVICE_NOT_REGISTERED,
  MAX_CHUNK,
  httpsTransport,
  sendPushChunk,
  fetchReceipts,
};
