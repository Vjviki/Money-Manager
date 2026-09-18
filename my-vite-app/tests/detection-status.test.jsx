// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../src/components/Home';

const plugin = vi.hoisted(() => ({
  getPendingQueue: vi.fn(), recoverListener: vi.fn(), openNotificationSettings: vi.fn(),
  addListener: vi.fn(), remove: vi.fn(), onChange: null,
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true }, registerPlugin: () => plugin,
}));
vi.mock('js-cookie', () => ({ default: { get: () => 'test-token' } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
const status = { accessEnabled: true, connected: false, lastResult: 'Waiting for Android to connect the listener', lastCheckedAt: 0 };
beforeEach(() => {
  vi.clearAllMocks();
  plugin.getPendingQueue.mockResolvedValue({ transactions: [], status });
  plugin.recoverListener.mockResolvedValue({});
  plugin.openNotificationSettings.mockResolvedValue({});
  plugin.addListener.mockImplementation(async (_event, callback) => {
    plugin.onChange = callback;
    return { remove: plugin.remove };
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ transactions: [] }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = () => render(<MemoryRouter><Home /></MemoryRouter>);
describe('payment detection status', () => {
  it('shows live disconnection and requests recovery on mount and Check again', async () => {
    mount();
    await screen.findByText('Payment listener disconnected');
    expect(plugin.recoverListener).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(plugin.recoverListener).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/Dismissed notifications cannot be recovered/)).toBeTruthy();
  });
  it('updates connection and queue after a native change event', async () => {
    mount();
    await screen.findByText('Payment listener disconnected');
    plugin.getPendingQueue.mockResolvedValue({ transactions: [{ id: 'p1', amount: 20, type: 'Income', merchant: 'Friend' }], status: { ...status, connected: true, lastResult: 'Payment added to review queue' } });
    await act(async () => plugin.onChange());
    await screen.findByText('Payment listener connected');
    expect(screen.getByText('1 transaction detected')).toBeTruthy();
  });
  it('opens access settings and removes its listener when unmounted', async () => {
    plugin.getPendingQueue.mockResolvedValue({ transactions: [], status: { ...status, accessEnabled: false } });
    const view = mount();
    await screen.findByText('Notification access is off');
    fireEvent.click(screen.getByRole('button', { name: 'Notification settings' }));
    expect(plugin.openNotificationSettings).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(plugin.remove).toHaveBeenCalledTimes(1);
  });
  it('shows a queue read failure instead of claiming no payments', async () => {
    plugin.getPendingQueue.mockRejectedValue(new Error('unreadable storage'));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mount();
      await screen.findByRole('alert');
      expect(screen.getByRole('alert').textContent).toMatch(/Unable to read pending payments/);
    } finally { quiet.mockRestore(); }
  });
});
