const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createAuth, authConfig, limiter, identityKey, validPassword, versionFilter } = require('../auth');
const secret = 'test-only-secret-'.repeat(4);
const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
function model() {
  const rows = new Map(); let count = 0;
  return { rows,
    async create(row) {
      if ([...rows.values()].some(x => x.username === row.username || x.email === row.email)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      const saved = { ...row, _id: (++count).toString(16).padStart(24, '0') }; rows.set(saved._id, saved); return { ...saved };
    },
    async findOne(filter) { const row = [...rows.values()].find(x => Object.entries(filter).every(([key,value]) => x[key] === value)); return row ? { ...row } : null; },
    async findById(id) { return rows.has(id) ? { ...rows.get(id) } : null; },
    async updateOne(filter, update) {
      const row = rows.get(filter._id);
      if (!row || row.password !== filter.password || (filter.token_version !== undefined && row.token_version !== filter.token_version) || (filter.$or && (row.token_version || 0) !== 0)) return { modifiedCount: 0 };
      Object.assign(row, update.$set); row.token_version = (row.token_version || 0) + update.$inc.token_version;
      return { modifiedCount: 1 };
    },
  };
}
const signup = (n = 'alice') => ({ name: 'Alice', username: n, email: `${n}@example.invalid`, gender: 'Female', password: 'test-password' });
test('configuration rejects absent/short secrets and unsafe proxy values', () => {
  for (const JWT_SECRET of [undefined, 'MY_SECRET_KEY', 'short']) assert.throws(() => authConfig({ JWT_SECRET }));
  assert.throws(() => authConfig({ JWT_SECRET: secret, TRUST_PROXY_HOPS: 'true' }));
  assert.equal(authConfig({ JWT_SECRET: secret, TRUST_PROXY_HOPS: '1' }).hops, 1);
});
test('server rejects malformed, missing, short and oversized registration fields before writing', async () => {
  const db = model(), auth = createAuth(db, secret);
  for (const body of [{}, { ...signup(), password: 'x' }, { ...signup(), username: { $ne: '' } }, { ...signup(), email: 'invalid' }, { ...signup(), password: '😀'.repeat(19) }]) {
    const res = response(); await auth.register({ body }, res); assert.equal(res.statusCode, 400);
  }
  assert.equal(db.rows.size, 0); assert.equal(validPassword('x'.repeat(72)), true);
});
test('concurrent duplicate username or email creates one account and returns 409 for the other', async () => {
  for (const sameEmail of [true, false]) {
    const db = model(), auth = createAuth(db, secret), a = response(), b = response();
    const second = sameEmail ? { ...signup(), username: 'bob' } : { ...signup(), email: 'other@example.invalid' };
    await Promise.all([auth.register({ body: signup() }, a), auth.register({ body: second }, b)]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [201, 409]); assert.equal(db.rows.size, 1);
    assert.notEqual([...db.rows.values()][0].password, signup().password);
  }
});
test('100 concurrent logins preserve identity with real password checking and signed expiring tokens', async () => {
  const db = model(), hash = await bcrypt.hash('test-password', 4);
  for (let i = 0; i < 100; i++) await db.create({ ...signup(`user${i}`), password: hash });
  const auth = createAuth(db, secret);
  await Promise.all(Array.from({ length: 100 }, async (_, i) => {
    const res = response(); await auth.login({ body: { username: `user${i}`, password: 'test-password' } }, res);
    assert.equal(res.statusCode, 200); const payload = jwt.verify(res.body.jwtToken, secret);
    assert.equal(payload.username, `user${i}`); assert.equal(payload.exp - payload.iat, 86400);
    const req = { headers: { authorization: `Bearer ${res.body.jwtToken}` } }; let called = false;
    await auth.authenticateToken(req, response(), () => called = true);
    assert.equal(called, true); assert.equal(req.user.id, payload.id);
  }));
});
test('invalid credentials, expired tokens, old tokens and database outages have controlled responses', async () => {
  const db = model(), auth = createAuth(db, secret);
  const res = response(); await auth.login({ body: { username: 'missing', password: 'test' } }, res); assert.equal(res.statusCode, 401);
  for (const token of ['bad', jwt.sign({ id: '1'.repeat(24) }, secret), jwt.sign({ id: '1'.repeat(24), ver: 0 }, secret, { expiresIn: -1 })]) {
    const out = response(); await auth.authenticateToken({ headers: { authorization: `Bearer ${token}` } }, out, () => assert.fail()); assert.equal(out.statusCode, 401);
  }
  db.findById = async () => { throw Error('offline'); };
  const out = response(); await auth.authenticateToken({ headers: { authorization: `Bearer ${jwt.sign({ id: '1'.repeat(24), ver: 0 }, secret, { expiresIn: '1d' })}` } }, out, () => assert.fail());
  assert.equal(out.statusCode, 503);
});
test('password change handles legacy accounts, rejects concurrent stale updates and revokes old sessions', async () => {
  const db = model(), user = await db.create({ ...signup(), password: await bcrypt.hash('test-password', 4) });
  const auth = createAuth(db, secret), login = response(); await auth.login({ body: signup() }, login);
  assert.ok(versionFilter({ token_version: 0 }).$or);
  const a = response(), b = response(), req = { user: { id: user._id }, body: { currentPassword: 'test-password', newPassword: 'new-password' } };
  await Promise.all([auth.changePassword(req, a), auth.changePassword(req, b)]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
  const out = response(); await auth.authenticateToken({ headers: { authorization: `Bearer ${login.body.jwtToken}` } }, out, () => assert.fail());
  assert.equal(out.statusCode, 401); assert.equal(db.rows.get(user._id).token_version, 1);
});
test('rate limiting returns 429 with retry information and independent account buckets', async () => {
  const app = express(); app.use(express.json()); app.post('/login', limiter(2, identityKey), (_req,res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const send = username => fetch(`http://127.0.0.1:${server.address().port}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
    assert.equal((await send('a')).status, 200); assert.equal((await send('a')).status, 200);
    const blocked = await send('a'); assert.equal(blocked.status, 429); assert.ok(blocked.headers.get('retry-after'));
    assert.equal((await send('b')).status, 200);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
