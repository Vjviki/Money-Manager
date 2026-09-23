// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Cookies from 'js-cookie';
import { validToken, apiFetch } from '../src/utils/session';
import ProtectedRoutes from '../src/components/ProtectedRoutes';
vi.mock('../src/components/Navbar', () => ({ default: () => null }));
const token = (exp) => `header.${btoa(JSON.stringify({ exp }))}.signature`;
beforeEach(() => Cookies.remove('jwt_token', { path: '/' }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('rejects malformed, legacy and expired sessions without retaining the cookie', () => {
  for (const value of ['bad', 'header.e30.signature', token(1)]) {
    Cookies.set('jwt_token', value); expect(validToken()).toBeNull(); expect(Cookies.get('jwt_token')).toBeUndefined();
  }
});
it('ends the active session on authenticated 401, but not on server failure or stale responses', async () => {
  const current = token(Math.floor(Date.now() / 1000) + 60); Cookies.set('jwt_token', current);
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 503 })));
  await apiFetch('/profile', { headers: { Authorization: `Bearer ${current}` } }); expect(validToken()).toBe(current);
  fetch.mockResolvedValue({ status: 401 });
  await apiFetch('/profile', { headers: { Authorization: 'Bearer older-session' } }); expect(validToken()).toBe(current);
  await apiFetch('/login'); expect(validToken()).toBe(current);
  await apiFetch('/profile', { headers: { Authorization: `Bearer ${current}` } }); expect(validToken()).toBeNull();
});
it('redirects an open protected screen when its token expires', async () => {
  vi.useFakeTimers(); Cookies.set('jwt_token', token(Math.floor(Date.now() / 1000) + 2));
  render(<MemoryRouter><Routes><Route element={<ProtectedRoutes />}><Route path="/" element={<p>Private screen</p>} /></Route><Route path="/login" element={<p>Sign in</p>} /></Routes></MemoryRouter>);
  expect(screen.getByText('Private screen')).toBeTruthy();
  await act(async () => vi.advanceTimersByTime(2100)); expect(screen.getByText('Sign in')).toBeTruthy();
});
