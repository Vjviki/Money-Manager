const { test } = require('node:test');
const assert = require('node:assert/strict');
const { monthRange, budgetInput, progress } = require('../budgets');
test('budget months validate and roll December into the next year', () => {
  assert.equal(monthRange('2026-12').end.toISOString(), '2027-01-01T00:00:00.000Z');
  for (const value of ['2026-13', '2026-1', '1999-12', undefined, {}]) assert.throws(() => monthRange(value));
});
test('budget amounts and categories validate without coercion; category identity is normalized', () => {
  assert.deepEqual(budgetInput({ category: ' Food ', amount: 1200.25 }), { category: 'Food', category_key: 'food', limit_paise: 120025 });
  for (const amount of [0, -1, NaN, Infinity, '100', {}, 1.234, 1000000001]) assert.throws(() => budgetInput({ category: 'Food', amount }));
  for (const category of ['', ' ', {}, 'a'.repeat(81)]) assert.throws(() => budgetInput({ category, amount: 100 }));
});
test('budget progress changes at exactly 80%, 100%, and overspending', () => {
  const budget = { category: 'Food', limit_paise: 10000 };
  assert.equal(progress(budget, 79.99).status, 'on-track');
  assert.equal(progress(budget, 80).status, 'warning');
  assert.equal(progress(budget, 100).status, 'reached');
  assert.equal(progress(budget, 101).status, 'exceeded');
  assert.equal(progress(budget, 101).remaining, -1);
  assert.equal(progress(budget, 0).percent, 0);
});
