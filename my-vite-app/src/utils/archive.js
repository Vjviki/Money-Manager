import { apiFetch } from './session';

// Retain the request ID after a timeout and across screen reloads. A retry must
// confirm the original archive, rather than clear payments that arrived afterward.
export async function archiveTransactions(api, token) {
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  if (!payload.id) throw new Error('Please sign in again');
  const key = `pending-archive:${payload.id}`;
  let requestId = localStorage.getItem(key);
  if (!requestId) {
    requestId = crypto.randomUUID();
    localStorage.setItem(key, requestId);
  }
  const response = await apiFetch(`${api}/reset-month`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': requestId },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to confirm archive completion. Please retry.');
  if (localStorage.getItem(key) === requestId) localStorage.removeItem(key);
  return result;
}
