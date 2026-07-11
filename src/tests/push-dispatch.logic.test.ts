// SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md §4 (two-stage pruning)
//
// The Expo transport, extracted from classify-lifecycle-phase.js and made
// transport-injectable. These tests drive a MOCK transport (no network) and pin
// the WF3 2026-05-04 hardening: reject on non-2xx, reject on top-level errors,
// surface per-ticket DeviceNotRegistered aligned to the input token (so the
// dispatcher prunes the EXACT dead token, never a user's other devices).

import { describe, it, expect } from 'vitest';

const {
  sendPushChunk,
  fetchReceipts,
  DEVICE_NOT_REGISTERED,
} = require('../../scripts/lib/push-dispatch');

function mockTransport(statusCode: number, body: unknown) {
  return async () => ({ statusCode, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

describe('push-dispatch — sendPushChunk', () => {
  it('returns tickets aligned to input messages by index (carrying the token)', async () => {
    const messages = [
      { to: 'ExponentPushToken[AAA]', title: 't', body: 'b' },
      { to: 'ExponentPushToken[BBB]', title: 't', body: 'b' },
    ];
    const transport = mockTransport(200, {
      data: [
        { status: 'ok', id: 'ticket-1' },
        { status: 'error', message: 'not registered', details: { error: DEVICE_NOT_REGISTERED } },
      ],
    });
    const { tickets } = await sendPushChunk(messages, { transport });
    expect(tickets).toHaveLength(2);
    expect(tickets[0]).toMatchObject({ status: 'ok', id: 'ticket-1', to: 'ExponentPushToken[AAA]' });
    expect(tickets[1]).toMatchObject({ status: 'error', error: DEVICE_NOT_REGISTERED, to: 'ExponentPushToken[BBB]' });
  });

  it('rejects on non-2xx HTTP status (the WF3 reject contract)', async () => {
    const transport = mockTransport(429, 'rate limited');
    await expect(sendPushChunk([{ to: 'x', title: 't', body: 'b' }], { transport })).rejects.toThrow(/429/);
  });

  it('rejects on Expo top-level errors', async () => {
    const transport = mockTransport(200, { errors: [{ code: 'INTERNAL_SERVER_ERROR' }] });
    await expect(sendPushChunk([{ to: 'x', title: 't', body: 'b' }], { transport })).rejects.toThrow(/top-level errors/);
  });

  it('is a no-op for an empty chunk (no transport call)', async () => {
    let called = 0;
    const transport = async () => { called++; return { statusCode: 200, body: '{}' }; };
    const { tickets } = await sendPushChunk([], { transport });
    expect(tickets).toEqual([]);
    expect(called).toBe(0);
  });

  it('throws if a chunk exceeds the 100-message Expo limit', async () => {
    const big = Array.from({ length: 101 }, () => ({ to: 'x', title: 't', body: 'b' }));
    await expect(sendPushChunk(big, { transport: mockTransport(200, { data: [] }) })).rejects.toThrow(/100/);
  });
});

describe('push-dispatch — fetchReceipts', () => {
  it('maps ticket ids to { status, error } and no-ops on empty', async () => {
    expect(await fetchReceipts([], {})).toEqual({ receipts: {} });
    const transport = mockTransport(200, {
      data: { 'ticket-1': { status: 'ok' }, 'ticket-2': { status: 'error', details: { error: DEVICE_NOT_REGISTERED } } },
    });
    const { receipts } = await fetchReceipts(['ticket-1', 'ticket-2'], { transport });
    expect(receipts['ticket-1']).toEqual({ status: 'ok', error: null });
    expect(receipts['ticket-2']).toEqual({ status: 'error', error: DEVICE_NOT_REGISTERED });
  });
});
