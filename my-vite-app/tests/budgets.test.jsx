// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import Budgets from '../src/components/Budgets';
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const response = body => ({ ok: true, status: 200, json: async () => body });
const item = { _id: 'food', category: 'Food', amount: 1000, spent: 800, remaining: 200, percent: 80, status: 'warning' };
const data = budgets => ({ budgets, categories: ['Food'], unreadableArchiveDates: 0 });

it('shows 80% and exceeded warnings with capped visual progress', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data([item, { ...item, _id: 'bills', category: 'Bills', spent: 1200, remaining: -200, percent: 120, status: 'exceeded' }]))));
  render(<Budgets />);
  await screen.findByText('Near limit');
  expect(screen.getByText('Over budget')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Bills budget used' }).value).toBe(100);
  expect(screen.getByText('120% used')).toBeTruthy();
});

it('saves a category budget and reloads actual spending from the backend', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(data([])))
    .mockResolvedValueOnce(response({ message: 'Budget saved' }))
    .mockResolvedValueOnce(response(data([item])));
  vi.stubGlobal('fetch', fetch);
  render(<Budgets />); await screen.findByText('No budgets for this month yet. Add your first category above.');
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Food' } });
  fireEvent.change(screen.getByLabelText('Monthly limit (₹)'), { target: { value: '1000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
  await screen.findByText('Near limit');
  expect(fetch.mock.calls[1][1].method).toBe('PUT');
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ category: 'Food', amount: 1000 });
});

it('edits a limit and removes only the selected budget after confirmation', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  let removed = false;
  const fetch = vi.fn(async (_url, options) => {
    if (options?.method === 'DELETE') { removed = true; return response({ message: 'Budget removed' }); }
    if (options?.method === 'PUT') return response({ message: 'Budget saved' });
    return response(data(removed ? [] : [item]));
  });
  vi.stubGlobal('fetch', fetch);
  render(<Budgets />); await screen.findByText('Near limit');
  fireEvent.click(screen.getByRole('button', { name: 'Edit Food budget' }));
  expect(screen.getByLabelText('Category').disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Monthly limit (₹)'), { target: { value: '1500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
  await waitFor(() => expect(screen.queryByText('Edit budget')).toBeNull());
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Food budget' }));
  await screen.findByText('No budgets for this month yet. Add your first category above.');
  expect(fetch.mock.calls.find(([, options]) => options?.method === 'DELETE')[0]).toContain('/food');
});

it('ignores an earlier month response after switching months', async () => {
  let resolveOld;
  const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValue(response(data([])));
  vi.stubGlobal('fetch', fetch);
  render(<Budgets />);
  fireEvent.change(screen.getByLabelText('Budget month'), { target: { value: '2027-05' } });
  await screen.findByText('No budgets for this month yet. Add your first category above.');
  await act(async () => resolveOld(response(data([item]))));
  expect(screen.queryByText('Near limit')).toBeNull();
});

it('shows a failed load as an error and allows retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(response(data([]))));
  render(<Budgets />); await screen.findByRole('alert');
  expect(screen.queryByText('No budgets for this month yet. Add your first category above.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('No budgets for this month yet. Add your first category above.');
});
