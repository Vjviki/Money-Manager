// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import Cookies from 'js-cookie';
import History from '../src/components/History';
vi.mock('../src/components/TransactionItem', () => ({ default: ({ transactionDetails, deleteTransaction }) =>
  <li>{transactionDetails.title}<button onClick={() => deleteTransaction(transactionDetails._id)}>Delete {transactionDetails.title}</button></li> }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); Cookies.remove('jwt_token'); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const row = title => ({ _id: title, title, category: 'Food', type: 'Expenses', amount: 10, created_at: '2026-09-23T00:00:00Z' });
const response = body => ({ status: 200, ok: true, json: async () => body });
const page = (title, number = 1, total = 21) => response({ transactions: [row(title)], page: number, total,
  totalPages: Math.max(1, Math.ceil(total / 20)), categories: ['Food', 'Salary'] });

it('requests pages from the server and resets to page one when a filter changes', async () => {
  const fetch = vi.fn(async url => {
    const params = new URL(url).searchParams;
    return page(params.has('type') ? 'Filtered payment' : params.get('page') === '2' ? 'Second page' : 'First page', Number(params.get('page')));
  });
  vi.stubGlobal('fetch', fetch);
  render(<History />);
  await screen.findByText('First page');
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get('limit')).toBe('20');
  expect(screen.getByRole('option', { name: 'Salary' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Second page');
  expect(screen.getByText('Page 2 of 2')).toBeTruthy();
  fireEvent.change(screen.getByDisplayValue('All types'), { target: { value: 'Expenses' } });
  await screen.findByText('Filtered payment');
  const params = new URL(fetch.mock.calls.at(-1)[0]).searchParams;
  expect(params.get('page')).toBe('1'); expect(params.get('type')).toBe('Expenses');
});

it('an older search response cannot overwrite newer search results', async () => {
  let resolveOld;
  vi.stubGlobal('fetch', vi.fn(async url => {
    const q = new URL(url).searchParams.get('q');
    if (q === 'old') return new Promise(resolve => { resolveOld = resolve; });
    return page(q === 'new' ? 'New result' : 'Initial result');
  }));
  render(<History />); await screen.findByText('Initial result');
  const search = screen.getByPlaceholderText('Search title or category...');
  fireEvent.change(search, { target: { value: 'old' } });
  await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
  fireEvent.change(search, { target: { value: 'new' } });
  await screen.findByText('New result');
  await act(async () => resolveOld(page('Stale result')));
  expect(screen.queryByText('Stale result')).toBeNull(); expect(screen.getByText('New result')).toBeTruthy();
});

it('refreshes after deleting the last record on a page and accepts the clamped page', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  let deleted = false;
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (options?.method === 'DELETE') { deleted = true; return response({ message: 'Deleted' }); }
    const requestedPage = new URL(url).searchParams.get('page');
    return deleted ? page('Remaining payment', 1, 20) : requestedPage === '2' ? page('Last payment', 2) : page('First payment');
  }));
  render(<History />); await screen.findByText('First payment');
  fireEvent.click(screen.getByRole('button', { name: 'Next' })); await screen.findByText('Last payment');
  fireEvent.click(screen.getByRole('button', { name: 'Delete Last payment' }));
  await screen.findByText('Remaining payment');
  expect(screen.getByText('Page 1 of 1')).toBeTruthy(); expect(screen.getByText('20 records')).toBeTruthy();
});

it('shows a retry action on network failure instead of presenting an empty history', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(page('Recovered payment'));
  vi.stubGlobal('fetch', fetch);
  render(<History />); await screen.findByRole('alert');
  expect(screen.queryByText('No transactions match these filters.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await screen.findByText('Recovered payment');
});
