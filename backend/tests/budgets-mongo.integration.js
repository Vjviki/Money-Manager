const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
test('real MongoDB: monthly budgets, expense totals across archives, thresholds and account isolation', { skip: !process.env.MONGO_TEST_URL }, async () => {
  process.env.JWT_SECRET = 'budget-integration-test-only-'.repeat(3);
  process.env.TRUST_PROXY_HOPS = '0';
  const { app, User, Budget, Transaction, Backup, ArchiveReset, archiveService } = require('../index');
  let server;
  try {
    await mongoose.connect(process.env.MONGO_TEST_URL, { dbName: `budgets_test_${Date.now()}` });
    await Promise.all([User.init(), Budget.init(), Transaction.init(), Backup.init(), ArchiveReset.init()]);
    const [alice, bob] = await User.create([{ username: 'alice', email: 'a@example.invalid', password: 'unused' }, { username: 'bob', email: 'b@example.invalid', password: 'unused' }]);
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, method = 'GET', body, user = alice) => {
      const token = jwt.sign({ id: String(user._id), ver: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    const save = (category, amount, month = '2026-09') => request(`/budgets/${month}`, 'PUT', { category, amount });
    assert.equal((await fetch(base + '/budgets?month=2026-09')).status, 401);
    assert.equal((await save('Food', 0)).status, 400);
    assert.equal((await save('Food', 100, '2026-13')).status, 400);
    assert.equal((await request('/budgets?month[$ne]=x')).status, 400);
    const concurrent = await Promise.all([save(' Food ', 100), save('food', 100)]);
    assert.ok(concurrent.every(r => r.status === 200));
    assert.equal(await Budget.countDocuments(), 1);
    await save('Food', 100);
    await save('Food', 200, '2026-10');
    await Transaction.insertMany([
      { user_id: alice._id, title: 'Lunch', category: ' FOOD ', type: 'Expenses', amount: 50, created_at: new Date('2026-09-10T00:00:00.000Z') },
      { user_id: alice._id, title: 'Salary', category: 'Food', type: 'Income', amount: 999, created_at: new Date('2026-09-10T00:00:00.000Z') },
      { user_id: alice._id, title: 'Next month', category: 'Food', type: 'Expenses', amount: 40, created_at: new Date('2026-10-01T00:00:00.000Z') },
      { user_id: bob._id, title: 'Private', category: 'Food', type: 'Expenses', amount: 999, created_at: new Date('2026-09-10T00:00:00.000Z') },
    ]);
    await Backup.create({ user_id: alice._id, title: 'Old dinner', category: 'Food', type: 'Expenses', amount: 30,
      date: '2026-09-01T00:00:00.000Z', backup_month: '2026-10' }); // old incorrect archive label
    const get = async () => (await request('/budgets?month=2026-09')).body;
    let result = await get();
    assert.equal(result.budgets[0].spent, 80); assert.equal(result.budgets[0].remaining, 20); assert.equal(result.budgets[0].status, 'warning');
    const [during] = await Promise.all([get(), archiveService.archive(alice._id, 'budget-archive-test-01')]);
    assert.equal(during.budgets[0].spent, 80);
    assert.equal((await get()).budgets[0].spent, 80);
    assert.equal((await request('/budgets?month=2026-10')).body.budgets[0].spent, 40);
    await save('Food', 80); assert.equal((await get()).budgets[0].status, 'reached');
    await save('Food', 60); result = await get(); assert.equal(result.budgets[0].remaining, -20); assert.equal(result.budgets[0].status, 'exceeded');
    assert.equal((await request('/budgets?month=2026-09', 'GET', null, bob)).body.budgets.length, 0);
    const id = result.budgets[0]._id;
    assert.equal((await request(`/budgets/2026-09/${id}`, 'DELETE', null, bob)).status, 404);
    await Backup.create({ user_id: alice._id, category: 'Food', type: 'Expenses', amount: 10, date: 'invalid' });
    assert.equal((await get()).unreadableArchiveDates, 1);
    const before = await Backup.countDocuments();
    assert.equal((await request(`/budgets/2026-09/${id}`, 'DELETE')).status, 200);
    assert.equal((await get()).budgets.length, 0); assert.equal(await Backup.countDocuments(), before);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
