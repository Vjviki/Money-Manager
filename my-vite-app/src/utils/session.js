import Cookies from 'js-cookie';

export function tokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Number.isInteger(payload.exp) ? payload.exp * 1000 : 0;
  } catch { return 0; }
}
export function validToken() {
  const token = Cookies.get('jwt_token');
  if (token && tokenExpiry(token) > Date.now()) return token;
  if (token) Cookies.remove('jwt_token', { path: '/' });
  return null;
}
export function endSession(token = Cookies.get('jwt_token')) {
  if (token !== Cookies.get('jwt_token')) return;
  Cookies.remove('jwt_token', { path: '/' });
  window.dispatchEvent(new Event('session-ended'));
}
export async function apiFetch(url, options = {}) {
  const authorization = new Headers(options.headers).get('Authorization');
  const response = await fetch(url, options);
  if (response.status === 401 && authorization?.startsWith('Bearer ')) endSession(authorization.slice(7));
  return response;
}
