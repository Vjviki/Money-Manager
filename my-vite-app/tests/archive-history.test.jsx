// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import Cookies from 'js-cookie';
import History from '../src/components/History';
vi.mock('../src/components/TransactionItem', () => ({ default: ({ transactionDetails }) => <p>{transactionDetails.title}</p> }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); Cookies.remove('jwt_token'); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('reloads History after archiving so payments added during the reset remain visible', async () => {
  Cookies.set('jwt_token', `h.${btoa(JSON.stringify({ id: 'alice' }))}.s`);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const row = (id, title) => ({ _id: id, title, amount: 50, category: 'Food', type: 'Expenses', created_at: '2026-09-10T00:00:00Z' });
  const response = body => ({ status: 200, ok: true, json: async () => body });
  const fetch = vi.fn().mockResolvedValueOnce(response({ transactions: [row('old', 'Old payment')] }))
    .mockResolvedValueOnce(response({ archivedCount: 1 }))
    .mockResolvedValueOnce(response({ transactions: [row('new', 'New arrival')] }));
  vi.stubGlobal('fetch', fetch);
  render(<History />);
  await screen.findByText('Old payment');
  fireEvent.click(screen.getByRole('button', { name: 'Archive Transactions' }));
  await screen.findByText('New arrival');
  await waitFor(() => expect(screen.queryByText('Old payment')).toBeNull());
  expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toBeTruthy();
});
