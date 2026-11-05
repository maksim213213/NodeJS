const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getSearchQuery, validateUser } = require('../dist/validation.js');

test('search accepts a value and rejects missing or blank q', () => {
  assert.equal(getSearchQuery(new URLSearchParams('q=node')), 'node');
  assert.throws(() => getSearchQuery(new URLSearchParams()), { statusCode: 400 });
  assert.throws(() => getSearchQuery(new URLSearchParams('q=')), { statusCode: 400 });
  assert.throws(() => getSearchQuery(new URLSearchParams('q=+++')), { statusCode: 400 });
});

test('user validation ignores extra fields and rejects a non-object body', () => {
  assert.deepEqual(validateUser({ name: 'Anna', age: 25, admin: true }),
    { name: 'Anna', age: 25 });
  assert.throws(() => validateUser(null), { statusCode: 400 });
});
