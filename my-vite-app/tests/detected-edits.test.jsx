// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../src/components/Home';

const mocks = vi.hoisted(() => ({
  plugin: { getPendingQueue: vi.fn(), recoverListener: vi.fn(), addListener: vi.fn(), removePending: vi.fn() },
  token: '', callback: null, error: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => mocks.plugin }));
vi.mock('js-cookie', () => ({ default: { get: () => mocks.token } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: mocks.error } }));
const item = (id, merchant = 'shop@upi') => ({ id, merchant, amount: 150, type: 'Expenses', category: 'Other', detectedAt: Date.now() });
let pending;
let requests;
let post;
const token = (id) => `header.${btoa(JSON.stringify({ id }))}.signature`;
const mount = () => render(<MemoryRouter><Home /></MemoryRouter>);
const card = (id) => within(screen.getByRole('article', { name: `Detected payment ${id}` }));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.token = token('alice');
  pending = [item('A')]; requests = [];
  post = async () => ({ ok: true });
  mocks.plugin.getPendingQueue.mockImplementation(async () => ({ transactions: [...pending] }));
  mocks.plugin.recoverListener.mockResolvedValue({});
  mocks.plugin.addListener.mockImplementation(async (_event, callback) => { mocks.callback = callback; return { remove: vi.fn() }; });
  mocks.plugin.removePending.mockImplementation(async ({ id }) => { pending = pending.filter(x => x.id !== id); });
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    if (options?.method === 'POST') { requests.push(JSON.parse(options.body)); return post(); }
    return { ok: true, json: async () => ({ transactions: [] }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('keeps edits during incoming notifications and saves the edited single payment', async () => {
  mount(); await screen.findByLabelText('Title', { selector: '#detected-title-A' });
  fireEvent.change(card('A').getByLabelText('Title'), { target: { value: '  Lunch  ' } });
  fireEvent.change(card('A').getByLabelText('Category'), { target: { value: 'Food' } });
  pending = [item('A'), item('B', 'bus@upi')];
  await act(async () => mocks.callback());
  expect(card('A').getByLabelText('Title')).toHaveValue('  Lunch  ');
  expect(card('A').getByLabelText('Category')).toHaveValue('Food');
  fireEvent.click(card('A').getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]).toMatchObject({ title: 'Lunch', category: 'Food', amount: 150, type: 'Expenses', detected_id: 'A' });
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Detected payment A' })).toBeNull());
  expect(card('B').getByLabelText('Title')).toHaveValue('bus@upi');
});
it('Add All uses each draft and keeps a new payment arriving during upload', async () => {
  pending.push(item('B'));
  mount(); await screen.findByRole('button', { name: 'Add All' });
  fireEvent.change(card('A').getByLabelText('Title'), { target: { value: 'Breakfast' } });
  fireEvent.change(card('A').getByLabelText('Category'), { target: { value: 'Food' } });
  fireEvent.change(card('B').getByLabelText('Title'), { target: { value: 'Bus ticket' } });
  fireEvent.change(card('B').getByLabelText('Category'), { target: { value: 'Transport' } });
  post = async () => { if (requests.length === 1) pending.push(item('C')); return { ok: true }; };
  fireEvent.click(screen.getByRole('button', { name: 'Add All' }));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests.map(x => [x.title, x.category])).toEqual([['Breakfast', 'Food'], ['Bus ticket', 'Transport']]);
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Detected payment A' })).toBeNull());
  expect(card('C').getByLabelText('Title')).toHaveValue('shop@upi');
});
it('validates every title before Add All sends any request', async () => {
  pending.push(item('B')); mount(); await screen.findByRole('button', { name: 'Add All' });
  fireEvent.change(card('B').getByLabelText('Title'), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add All' }));
  expect(requests).toHaveLength(0);
  expect(card('B').getByLabelText('Title')).toHaveFocus();
  expect(mocks.error).toHaveBeenCalled();
});
it('preserves drafts on upload failure and across remount; removes them on Ignore', async () => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    let view = mount(); await screen.findByRole('article', { name: 'Detected payment A' });
    fireEvent.change(card('A').getByLabelText('Title'), { target: { value: 'Dinner' } });
    post = async () => ({ ok: false });
    fireEvent.click(card('A').getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Failed to add detected transaction'));
    expect(card('A').getByLabelText('Title')).toHaveValue('Dinner');
    view.unmount(); view = mount();
    await screen.findByRole('article', { name: 'Detected payment A' });
    expect(card('A').getByLabelText('Title')).toHaveValue('Dinner');
    fireEvent.click(card('A').getByRole('button', { name: 'Ignore' }));
    await waitFor(() => expect(localStorage.getItem('money-manager:detected-edits:alice')).toBeNull());
  } finally { quiet.mockRestore(); }
});
it('does not load another account drafts', async () => {
  localStorage.setItem('money-manager:detected-edits:alice', JSON.stringify({ A: { title: 'Private lunch', category: 'Food' } }));
  mocks.token = token('bob'); mount(); await screen.findByRole('article', { name: 'Detected payment A' });
  expect(card('A').getByLabelText('Title')).toHaveValue('shop@upi');
});
it('locks editing while the payment upload is in progress', async () => {
  let finish; post = () => new Promise(resolve => { finish = resolve; });
  mount(); await screen.findByRole('article', { name: 'Detected payment A' });
  fireEvent.click(card('A').getByRole('button', { name: 'Add' }));
  expect(card('A').getByLabelText('Title')).toBeDisabled();
  expect(card('A').getByLabelText('Category')).toBeDisabled();
  await act(async () => finish({ ok: true }));
});
it('partial Add All failure keeps the failed draft while clearing the saved draft', async () => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    pending.push(item('B')); mount(); await screen.findByRole('button', { name: 'Add All' });
    fireEvent.change(card('A').getByLabelText('Title'), { target: { value: 'Saved lunch' } });
    fireEvent.change(card('B').getByLabelText('Title'), { target: { value: 'Retry bus fare' } });
    fireEvent.change(card('B').getByLabelText('Category'), { target: { value: 'Transport' } });
    post = async () => ({ ok: requests.length === 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Add All' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Could not add all transactions. Review remaining items before retrying.'));
    expect(screen.queryByRole('article', { name: 'Detected payment A' })).toBeNull();
    expect(card('B').getByLabelText('Title')).toHaveValue('Retry bus fare');
    expect(card('B').getByLabelText('Category')).toHaveValue('Transport');
    expect(JSON.parse(localStorage.getItem('money-manager:detected-edits:alice'))).toEqual({ B: { title: 'Retry bus fare', category: 'Transport' } });
  } finally { quiet.mockRestore(); }
});
