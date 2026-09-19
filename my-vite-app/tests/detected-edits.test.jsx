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

it('remembers an opted-in category after saving, restores it, allows overrides and forgetting', async () => {
  let view = mount(); await screen.findByRole('article', { name: 'Detected payment A' });
  fireEvent.change(card('A').getByLabelText('Category'), { target: { value: 'Food' } });
  fireEvent.click(card('A').getByRole('checkbox'));
  fireEvent.click(card('A').getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Detected payment A' })).toBeNull());
  view.unmount(); pending = [item('B', ' SHOP@UPI ')]; view = mount();
  await screen.findByRole('article', { name: 'Detected payment B' });
  expect(card('B').getByLabelText('Category')).toHaveValue('Food');
  expect(card('B').getByText('Suggested from your remembered category.')).toBeTruthy();
  fireEvent.change(card('B').getByLabelText('Category'), { target: { value: 'Shopping' } });
  fireEvent.click(screen.getByText('Remembered categories (1)'));
  fireEvent.click(screen.getByRole('button', { name: /Forget Expenses category/ }));
  expect(card('B').getByLabelText('Category')).toHaveValue('Shopping');
  await waitFor(() => expect(localStorage.getItem('money-manager:category-memory:alice')).toBeNull());
  pending.push(item('C')); await act(async () => mocks.callback());
  expect(card('C').getByLabelText('Category')).toHaveValue('Other');
});
it('does not learn without opt-in, on Ignore, or after a failed upload', async () => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    pending.push(item('B'), item('C'));
    mount(); await screen.findByRole('article', { name: 'Detected payment A' });
    fireEvent.change(card('A').getByLabelText('Category'), { target: { value: 'Food' } });
    fireEvent.click(card('A').getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Detected payment A' })).toBeNull());
    fireEvent.click(card('B').getByRole('checkbox'));
    fireEvent.click(card('B').getByRole('button', { name: 'Ignore' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Detected payment B' })).toBeNull());
    fireEvent.click(card('C').getByRole('checkbox')); post = async () => ({ ok: false });
    fireEvent.click(card('C').getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Failed to add detected transaction'));
    expect(localStorage.getItem('money-manager:category-memory:alice')).toBeNull();
  } finally { quiet.mockRestore(); }
});
it('scopes rules by account, direction and exact recipient; excludes unknown recipients', async () => {
  const rule = { merchant: 'shop@upi', type: 'Expenses', category: 'Food' };
  localStorage.setItem('money-manager:category-memory:alice', JSON.stringify({ '["Expenses","shop@upi"]': rule }));
  pending = [item('A'), { ...item('B'), type: 'Income' }, item('C', 'shop2@upi'), item('D', 'Unknown')];
  let view = mount(); await screen.findByRole('article', { name: 'Detected payment A' });
  expect(card('A').getByLabelText('Category')).toHaveValue('Food');
  expect(card('B').getByLabelText('Category')).toHaveValue('Other');
  expect(card('C').getByLabelText('Category')).toHaveValue('Other');
  expect(card('D').queryByRole('checkbox')).toBeNull();
  view.unmount(); mocks.token = token('bob'); view = mount();
  await screen.findByRole('article', { name: 'Detected payment A' });
  expect(card('A').getByLabelText('Category')).toHaveValue('Other');
});
it('Add All freezes reviewed categories and only learns successful opted-in rows', async () => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    pending.push(item('B', 'bus@upi')); mount(); await screen.findByRole('button', { name: 'Add All' });
    for (const [id, category] of [['A', 'Food'], ['B', 'Transport']]) {
      fireEvent.change(card(id).getByLabelText('Category'), { target: { value: category } });
      fireEvent.click(card(id).getByRole('checkbox'));
    }
    post = async () => ({ ok: requests.length === 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Add All' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Could not add all transactions. Review remaining items before retrying.'));
    const rules = JSON.parse(localStorage.getItem('money-manager:category-memory:alice'));
    expect(Object.values(rules)).toEqual([{ merchant: 'shop@upi', type: 'Expenses', category: 'Food' }]);
    expect(card('B').getByRole('checkbox')).toBeChecked();
  } finally { quiet.mockRestore(); }
});
it('handles malformed memory and reports storage failure without preventing payment save', async () => {
  localStorage.setItem('money-manager:category-memory:alice', '{bad json');
  const original = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
    if (key.includes('category-memory')) throw new Error('Storage full');
    return original.call(this, key, value);
  });
  try {
    mount(); await screen.findByRole('article', { name: 'Detected payment A' });
    fireEvent.click(card('A').getByRole('checkbox'));
    fireEvent.click(card('A').getByRole('button', { name: 'Add' }));
    await screen.findByText(/Category memory could not be saved/);
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Detected payment A' })).toBeNull());
    expect(requests).toHaveLength(1);
  } finally { spy.mockRestore(); }
});
it('keeps reviewed batch categories unchanged when an earlier row teaches the same recipient', async () => {
  pending.push(item('B')); mount(); await screen.findByRole('button', { name: 'Add All' });
  fireEvent.change(card('A').getByLabelText('Category'), { target: { value: 'Food' } });
  fireEvent.click(card('A').getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Add All' }));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests.map(row => row.category)).toEqual(['Food', 'Other']);
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Detected payment B' })).toBeNull());
  pending.push(item('C')); await act(async () => mocks.callback());
  expect(card('C').getByLabelText('Category')).toHaveValue('Food');
});
