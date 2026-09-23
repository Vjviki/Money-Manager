// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
import { archiveTransactions } from '../src/utils/archive';
const token = id => `header.${btoa(JSON.stringify({ id }))}.signature`;
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

it('reuses the same request after a lost response and starts a new one only after confirmation', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({ archivedCount: 2 }) });
  vi.stubGlobal('fetch', fetch);
  await expect(archiveTransactions('/api', token('alice'))).rejects.toThrow('Connection lost');
  const first = fetch.mock.calls[0][1].headers['Idempotency-Key'];
  expect(localStorage.getItem('pending-archive:alice')).toBe(first);
  expect(await archiveTransactions('/api', token('alice'))).toEqual({ archivedCount: 2 });
  expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toBe(first);
  expect(localStorage.getItem('pending-archive:alice')).toBeNull();
  await archiveTransactions('/api', token('alice'));
  expect(fetch.mock.calls[2][1].headers['Idempotency-Key']).not.toBe(first);
});

it('keeps uncertain requests separate for different accounts', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'Please retry' }) });
  vi.stubGlobal('fetch', fetch);
  await expect(archiveTransactions('/api', token('alice'))).rejects.toThrow('Please retry');
  await expect(archiveTransactions('/api', token('bob'))).rejects.toThrow('Please retry');
  expect(localStorage.getItem('pending-archive:alice')).not.toBe(localStorage.getItem('pending-archive:bob'));
});
