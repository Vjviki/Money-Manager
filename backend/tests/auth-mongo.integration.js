// Run only against a disposable replica set: MONGO_TEST_URL=... node --test tests/auth-mongo.integration.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

test('real MongoDB: unique registrations, reset cooldown/attempts, single-use reset and session revocation', { skip: !process.env.MONGO_TEST_URL }, async () => {
  process.env.JWT_SECRET = 'integration-test-only-'.repeat(3);
  process.env.TRUST_PROXY_HOPS = '0';
  Object.assign(process.env, { SMTP_HOST: 'unused.invalid', SMTP_PORT: '587', SMTP_USER: 'test', SMTP_PASS: 'test' });
  const sent = [];
  const originalTransport = nodemailer.createTransport;
  nodemailer.createTransport = () => ({ sendMail: async mail => { sent.push(mail); } });
  const { app, User, PasswordReset } = require('../index');
  let server;
  try {
    await mongoose.connect(process.env.MONGO_TEST_URL, { dbName: `auth_test_${Date.now()}` });
    await Promise.all([User.init(), PasswordReset.init()]);
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, body, token, method = 'POST') => {
      const res = await fetch(url + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: res.status, body: await res.json() };
    };
    const account = { name: 'Test', username: 'alice', email: 'alice@example.invalid', gender: 'Female', password: 'old-password' };
    const signups = await Promise.all([request('/register', account), request('/register', account)]);
    assert.deepEqual(signups.map(x => x.status).sort(), [201, 409]);
    assert.equal(await User.countDocuments(), 1);
    // Existing accounts created before token_version was introduced remain usable.
    await User.collection.updateOne({ username: 'alice' }, { $unset: { token_version: '' } });
    const login = await request('/login', { username: 'alice', password: 'old-password' }); assert.equal(login.status, 200);
    const token = login.body.jwtToken;
    assert.equal((await request('/profile', null, token, 'GET')).status, 200);
    const sends = await Promise.all([request('/forgot-password/request', { email: account.email }), request('/forgot-password/request', { email: account.email })]);
    assert.ok(sends.every(x => x.status === 200)); assert.equal(sent.length, 1);
    const otp = sent[0].text.match(/code is (\d{6})/)[1];
    const resets = await Promise.all([request('/forgot-password/reset', { email: account.email, otp, newPassword: 'new-password' }), request('/forgot-password/reset', { email: account.email, otp, newPassword: 'other-password' })]);
    assert.deepEqual(resets.map(x => x.status).sort(), [200, 400]);
    assert.equal((await request('/profile', null, token, 'GET')).status, 401);
    assert.equal((await User.findOne({ username: 'alice' })).token_version, 1);
    assert.equal(await PasswordReset.countDocuments(), 0);
    const user = await User.findOne({ username: 'alice' });
    await PasswordReset.create({ user_id: user._id, otp_hash: await bcrypt.hash('123456', 4), attempts: 0, requested_at: new Date(), expires_at: new Date(Date.now() + 600000) });
    const failures = await Promise.all(Array.from({ length: 8 }, () => request('/forgot-password/reset', { email: account.email, otp: '000000', newPassword: 'later-password' })));
    assert.ok(failures.every(x => x.status === 400)); assert.equal((await PasswordReset.findOne({ user_id: user._id })).attempts, 5);
    assert.equal((await request('/forgot-password/reset', { email: account.email, otp: '123456', newPassword: 'later-password' })).status, 400);
    // Fifth allowed attempt can succeed; expiry remains enforced even before TTL cleanup.
    await PasswordReset.updateOne({ user_id: user._id }, { $set: { attempts: 4 } });
    assert.equal((await request('/forgot-password/reset', { email: account.email, otp: '123456', newPassword: 'later-password' })).status, 200);
    assert.equal((await User.findById(user._id)).token_version, 2);
    const newLogin = await request('/login', { username: 'alice', password: 'later-password' }); assert.equal(newLogin.status, 200);
    await PasswordReset.create({ user_id: user._id, otp_hash: await bcrypt.hash('123456', 4), attempts: 0, expires_at: new Date(Date.now() - 1000) });
    assert.equal((await request('/forgot-password/reset', { email: account.email, otp: '123456', newPassword: 'expired-password' })).status, 400);
    const changes = await Promise.all([request('/change-password', { currentPassword: 'later-password', newPassword: 'final-password' }, newLogin.body.jwtToken, 'PUT'), request('/change-password', { currentPassword: 'later-password', newPassword: 'final-password2' }, newLogin.body.jwtToken, 'PUT')]);
    assert.equal(changes.filter(x => x.status === 200).length, 1);
    assert.equal((await request('/profile', null, newLogin.body.jwtToken, 'GET')).status, 401);
  } finally {
    nodemailer.createTransport = originalTransport;
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
