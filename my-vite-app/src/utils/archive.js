import { apiFetch } from './session';

// Keep a separate idempotency key for each selected salary cycle. If the response
// is lost, retrying the same month confirms the original archive instead of
// archiving transactions that arrived after it.
export async function archiveTransactions(api, token, archiveMonth) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(archiveMonth || '')) {
    throw new Error('Please select a valid archive month');
  }

  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  if (!payload.id) throw new Error('Please sign in again');

  const key = `pending-archive:${payload.id}:${archiveMonth}`;
  let requestId = localStorage.getItem(key);
  if (!requestId) {
    requestId = crypto.randomUUID();
    localStorage.setItem(key, requestId);
  }

  const response = await apiFetch(`${api}/reset-month`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': requestId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ archiveMonth }),
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to confirm archive completion. Please retry.');
  if (localStorage.getItem(key) === requestId) localStorage.removeItem(key);
  return result;
}
