const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseTransactionQuery } = require('../transaction-queries');

test('pagination bounds and filter types reject unsafe inputs', () => {
  for (const query of [{ page: '0' }, { page: '-1' }, { page: '1.5' }, { page: '1000001' },
    { limit: '101' }, { limit: '0' }, { q: { $ne: '' } }, { category: ['Food'] },
    { type: 'invalid' }, { from: '2026-02-30T00:00:00.000Z' }, { to: 'invalid' },
    { from: '2026-09-20T00:00:00.000Z', to: '2026-09-19T00:00:00.000Z' }]) {
    assert.throws(() => parseTransactionQuery(query, 'alice'), error => error.status === 400);
  }
});
test('search treats regex characters literally and all filters stay scoped to the account', () => {
  const { filter, page, limit } = parseTransactionQuery({ q: 'a+b (food)', category: ' Food+ ', type: 'Expenses' }, 'alice');
  assert.equal(page, 1); assert.equal(limit, 20); assert.equal(filter.user_id, 'alice');
  assert.equal(filter.type, 'Expenses');
  const pattern = new RegExp(filter.$or[0].title.$regex, 'i');
  assert.ok(pattern.test('A+B (Food)')); assert.ok(!pattern.test('aaab food'));
  assert.ok(new RegExp(filter.category.$regex, 'i').test(' food+ '));
});
test('date bounds preserve explicit instants and use an exclusive end', () => {
  const { filter } = parseTransactionQuery({ from: '2026-09-22T18:30:00.000Z', to: '2026-09-23T18:30:00.000Z' }, 'alice');
  assert.equal(filter.created_at.$gte.toISOString(), '2026-09-22T18:30:00.000Z');
  assert.equal(filter.created_at.$lt.toISOString(), '2026-09-23T18:30:00.000Z');
});
