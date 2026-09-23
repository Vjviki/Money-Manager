const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createArchiveService } = require('../archive');

// Service-level tests with transactional persistence simulated. Real MongoDB
// locking, rollback and unique indexes are covered by archive-mongo.integration.js.
function setup() {
  let state = { active: [], backup: [], resets: [] };
  let hook = () => {}, failInsert = false;
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) =>
    value?.$in ? value.$in.includes(row[key]) : row[key] === value);
  const query = get => ({ session() { return this; }, select() { return this; }, limit() { return this; },
    lean: async () => structuredClone(get()), then(resolve, reject) { return Promise.resolve(get()).then(resolve, reject); } });
  const models = {
    mongoose: { startSession: async () => {
      await hook();
      return { endSession: async () => {}, withTransaction: async work => {
        const before = structuredClone(state);
        try { return await work({}); } catch (error) { state = before; throw error; }
      } };
    } },
    User: { updateOne: async () => ({ matchedCount: 1 }) },
    Transaction: {
      find: filter => query(() => state.active.filter(row => matches(row, filter))),
      exists: filter => query(() => state.active.some(row => matches(row, filter))),
      create: async rows => state.active.push(...(Array.isArray(rows) ? rows : [rows])),
      deleteMany: async filter => {
        const before = state.active.length;
        state.active = state.active.filter(row => !matches(row, filter));
        return { deletedCount: before - state.active.length };
      },
    },
    Backup: {
      exists: filter => query(() => state.backup.some(row => matches(row, filter))),
      insertMany: async rows => { state.backup.push(...rows); if (failInsert) throw new Error('Storage failed'); },
    },
    ArchiveReset: {
      findOne: filter => query(() => state.resets.find(row => matches(row, filter))),
      create: async rows => state.resets.push(...rows),
    },
  };
  return { service: createArchiveService(models), state: () => state,
    seed: row => state.active.push({ title: 'Food', amount: 10, type: 'Expenses', category: 'Food', created_at: new Date('2026-08-01T00:00:00Z'), ...row }),
    hook: callback => { hook = callback; }, fail: value => { failInsert = value; } };
}

test('archive preserves new arrivals and other users; same-key retry leaves new payments active', async () => {
  const fixture = setup();
  fixture.seed({ _id: 'a', user_id: 'alice' }); fixture.seed({ _id: 'b', user_id: 'bob' });
  fixture.hook(() => { fixture.seed({ _id: 'c', user_id: 'alice' }); fixture.hook(() => {}); });
  assert.equal(await fixture.service.archive('alice', 'request1'), 1);
  assert.deepEqual(fixture.state().active.map(row => row._id), ['b', 'c']);
  assert.equal(fixture.state().backup[0].source_id, 'a');
  assert.equal(fixture.state().backup[0].backup_month, '2026-08');
  assert.equal(await fixture.service.archive('alice', 'request1'), 1);
  assert.equal(fixture.state().active.length, 2);
});

test('failed archive leaves active data intact and request can be retried', async () => {
  const fixture = setup(); fixture.seed({ _id: 'a', user_id: 'alice' }); fixture.fail(true);
  await assert.rejects(fixture.service.archive('alice', 'request1'), /Storage failed/);
  assert.equal(fixture.state().active.length, 1); assert.equal(fixture.state().backup.length, 0);
  assert.equal(fixture.state().resets.length, 0);
  fixture.fail(false); assert.equal(await fixture.service.archive('alice', 'request1'), 1);
});

test('notification retries after archiving do not recreate a payment, while another account can use the same ID', async () => {
  const fixture = setup(); fixture.seed({ _id: 'a', user_id: 'alice', detected_id: 'bank1' });
  await fixture.service.archive('alice', 'request1');
  await fixture.service.addTransaction({ user_id: 'alice', detected_id: 'bank1' });
  assert.equal(fixture.state().active.length, 0);
  await fixture.service.addTransaction({ user_id: 'bob', detected_id: 'bank1' });
  assert.equal(fixture.state().active.length, 1);
});
