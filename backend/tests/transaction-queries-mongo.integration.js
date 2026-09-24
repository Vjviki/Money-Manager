const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

test('real MongoDB: paginated account history, filters, totals and indexed ordering', { skip: !process.env.MONGO_TEST_URL }, async () => {
  process.env.JWT_SECRET = 'query-integration-test-only-'.repeat(3);
  process.env.TRUST_PROXY_HOPS = '0';
  const { app, User, Transaction } = require('../index');
  let server;
  try {
    await mongoose.connect(process.env.MONGO_TEST_URL, { dbName: `queries_test_${Date.now()}` });
    await Promise.all([User.init(), Transaction.init()]);
    const [alice, bob] = await User.create([
      { username: 'alice', email: 'alice@example.invalid', password: 'unused' },
      { username: 'bob', email: 'bob@example.invalid', password: 'unused' },
    ]);
    const rows = Array.from({ length: 45 }, (_, i) => ({ user_id: alice._id, title: `Payment ${i}`, amount: i + 1,
      type: i % 2 ? 'Expenses' : 'Income', category: i % 2 ? 'Food' : 'Salary',
      created_at: new Date('2026-09-23T00:00:00.000Z') }));
    rows[0].title = 'A+B (gift)'; rows[0].category = ' Gift ';
    rows[1].category = 'food'; rows[2].created_at = new Date('2026-09-24T00:00:00.000Z');
    await Transaction.insertMany(rows);
    await Transaction.create({ ...rows[0], user_id: bob._id, amount: 99999, category: 'Private' });
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = user => jwt.sign({ id: String(user._id), ver: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const get = async (path, user = alice) => {
      const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token(user)}` } });
      return { status: response.status, body: await response.json() };
    };
    const first = (await get('/transactions?page=1&limit=20&categories=1')).body;
    assert.equal(first.transactions.length, 20); assert.equal(first.total, 45); assert.equal(first.totalPages, 3);
    assert.deepEqual(first.categories, ['Food', 'Gift', 'Salary']);
    const second = (await get('/transactions?page=2&limit=20')).body;
    const third = (await get('/transactions?page=3&limit=20')).body;
    const all = [...first.transactions, ...second.transactions, ...third.transactions];
    assert.equal(third.transactions.length, 5); assert.equal(new Set(all.map(row => row._id)).size, 45);
    assert.equal(all[0].created_at, '2026-09-24T00:00:00.000Z');
    assert.equal((await get('/transactions?page=999&limit=20')).body.page, 3);
    assert.equal((await get('/transactions?page=1&limit=5')).body.transactions.length, 5);
    assert.equal((await get('/transactions?page=1&q=A%2BB%20%28gift%29')).body.total, 1);
    assert.equal((await get('/transactions?page=1&category=FOOD&type=Expenses')).body.total, 22);
    assert.equal((await get('/transactions?page=1&category=FOOD&type=Income')).body.total, 0);
    assert.equal((await get('/transactions?page=1&from=2026-09-23T00%3A00%3A00.000Z&to=2026-09-24T00%3A00%3A00.000Z')).body.total, 44);
    assert.equal((await get('/transactions?page=1&limit=101')).status, 400);
    assert.equal((await get('/transactions?page=1&q%5B%24ne%5D=x')).status, 400);
    assert.equal((await fetch(base + '/transactions?page=1')).status, 401);
    const summary = (await get('/')).body;
    assert.deepEqual(summary, { income: 529, expenses: 506, balance: 23, transactionCount: 45 });
    assert.equal((await get('/transactions')).body.transactions.length, 45); // older apps
    assert.equal((await get('/transactions?page=1', bob)).body.total, 1);
    const plan = await Transaction.find({ user_id: alice._id }).sort({ created_at: -1, _id: -1 }).limit(20).explain('executionStats');
    assert.ok(plan.executionStats.totalDocsExamined <= 20);
    // Deleting the last page clamps the next refresh; totals reflect the deletion.
    await Transaction.deleteMany({ _id: { $in: third.transactions.map(row => row._id) } });
    assert.equal((await get('/transactions?page=3&limit=20')).body.page, 2);
    await Transaction.deleteMany({ user_id: alice._id });
    assert.deepEqual((await get('/')).body, { income: 0, expenses: 0, balance: 0, transactionCount: 0 });
    assert.equal((await get('/transactions?page=3&limit=20')).body.page, 1);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
