// Disposable replica-set only; never use the application's production database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

test('archive: atomic rollback, races, retries, account isolation and payment identity', { skip: !process.env.MONGO_TEST_URL }, async () => {
  process.env.JWT_SECRET = 'archive-integration-test-only-'.repeat(3);
  process.env.TRUST_PROXY_HOPS = '0';
  const { app, User, Transaction, Backup, ArchiveReset, archiveService } = require('../index');
  let server;
  try {
    await mongoose.connect(process.env.MONGO_TEST_URL, { dbName: `archive_test_${Date.now()}` });
    await Promise.all([User.init(), Transaction.init(), Backup.init(), ArchiveReset.init()]);
    const alice = await User.create({ username: 'alice', email: 'alice@example.invalid', password: 'unused' });
    const bob = await User.create({ username: 'bob', email: 'bob@example.invalid', password: 'unused' });
    const payment = (user, title, date = '2026-08-15T12:00:00Z') => ({ user_id: user._id, title, amount: 50, type: 'Expenses', category: 'Food', created_at: new Date(date) });
    await Transaction.create(payment(bob, 'private'));
    await Transaction.create(payment(alice, 'August'));
    await archiveService.addTransaction({ ...payment(alice, 'September', '2026-09-15T12:00:00Z'), detected_id: 'bank-1' });

    // Inject failure AFTER the database accepted archive inserts: both copies and
    // deletions must roll back, not leave a partial archive.
    const insertMany = Backup.insertMany;
    Backup.insertMany = async function (...args) { await insertMany.apply(this, args); throw new Error('Injected archive failure'); };
    try { await assert.rejects(archiveService.archive(alice._id, 'rollback-request-0001'), /Injected/); }
    finally { Backup.insertMany = insertMany; }
    assert.equal(await Backup.countDocuments(), 0);
    assert.equal(await Transaction.countDocuments({ user_id: alice._id }), 2);
    assert.equal(await ArchiveReset.countDocuments(), 0);

    const createReceipt = ArchiveReset.create;
    ArchiveReset.create = async () => { throw new Error('Injected receipt failure'); };
    try { await assert.rejects(archiveService.archive(alice._id, 'rollback-request-0002'), /Injected/); }
    finally { ArchiveReset.create = createReceipt; }
    assert.equal(await Backup.countDocuments(), 0);
    assert.equal(await Transaction.countDocuments({ user_id: alice._id }), 2);

    // Add a backdated payment after selection. It must survive the reset.
    const startSession = mongoose.startSession;
    let added = false;
    mongoose.startSession = async function (...args) {
      if (!added) { added = true; await Transaction.create(payment(alice, 'New arrival')); }
      return startSession.apply(this, args);
    };
    try { assert.equal(await archiveService.archive(alice._id, 'archive-request-0001'), 2); }
    finally { mongoose.startSession = startSession; }
    assert.deepEqual((await Transaction.find({ user_id: alice._id })).map(t => t.title), ['New arrival']);
    assert.deepEqual((await Backup.find({ user_id: alice._id }).sort({ backup_month: 1 })).map(t => t.backup_month), ['2026-08', '2026-09']);
    assert.equal(await archiveService.archive(alice._id, 'archive-request-0001'), 2);
    assert.equal(await Transaction.countDocuments({ user_id: alice._id }), 1);
    await archiveService.addTransaction({ ...payment(alice, 'retry'), detected_id: 'bank-1' });
    assert.equal(await Transaction.countDocuments({ user_id: alice._id }), 1);

    // Different reset requests race, and a detected upload races archiving.
    await Promise.all([
      archiveService.archive(alice._id, 'concurrent-request-01'),
      archiveService.archive(alice._id, 'concurrent-request-02'),
      archiveService.addTransaction({ ...payment(alice, 'bank-2'), detected_id: 'bank-2' }),
    ]);
    await Promise.all([
      archiveService.archive(alice._id, 'concurrent-request-03'),
      archiveService.addTransaction({ ...payment(alice, 'bank-2 retry'), detected_id: 'bank-2' }),
    ]);
    assert.equal(await Backup.countDocuments({ user_id: alice._id }), 4);
    assert.equal(await Transaction.countDocuments({ user_id: alice._id }), 0);
    assert.equal(await Backup.countDocuments({ user_id: alice._id, detected_id: 'bank-2' }), 1);
    assert.equal(await Transaction.countDocuments({ user_id: bob._id }), 1);
    assert.equal(await Backup.countDocuments({ user_id: bob._id }), 0);

    await Transaction.create(payment(alice, 'same request'));
    assert.deepEqual(await Promise.all([
      archiveService.archive(alice._id, 'same-request-000001'),
      archiveService.archive(alice._id, 'same-request-000001'),
    ]), [1, 1]);
    assert.equal(await ArchiveReset.countDocuments({ request_id: 'same-request-000001' }), 1);
    assert.equal(await archiveService.archive(alice._id, 'empty-request-00001'), 0);

    // Legacy archive rows without source IDs still coexist under the partial index.
    await Backup.create([{ user_id: alice._id, title: 'legacy1' }, { user_id: alice._id, title: 'legacy2' }]);
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/reset-month`;
    assert.equal((await fetch(url, { method: 'POST' })).status, 401);
    const token = jwt.sign({ id: String(alice._id), ver: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': 'bad' } })).status, 400);
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': 'archive-request-0001' } });
    assert.equal(response.status, 200); assert.equal((await response.json()).archivedCount, 2);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
