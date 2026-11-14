import assert from 'node:assert/strict';
import test from 'node:test';
import { grade } from '../src/grader.js';

const expected = {
  columns: ['country', 'volume'],
  values: [
    ['GB', 10],
    ['IN', 10.004],
  ],
  error: null,
};

test('ignores column names and row order', () => {
  const actual = {
    columns: ['c', 'v'],
    values: [
      ['IN', '10.010'],
      ['GB', 10],
    ],
    error: null,
  };
  const result = grade(actual, expected, { orderSensitive: false });
  assert.equal(result.correct, true);
});

test('requires row order when the question asks for it', () => {
  const actual = {
    columns: ['country', 'volume'],
    values: [
      ['IN', 10],
      ['GB', 10],
    ],
    error: null,
  };
  const ordered = {
    columns: ['country', 'volume'],
    values: [
      ['GB', 10],
      ['IN', 10],
    ],
    error: null,
  };
  assert.equal(grade(actual, ordered, { orderSensitive: true }).correct, false);
  assert.match(grade(actual, ordered, { orderSensitive: true }).message, /order/i);
  assert.equal(grade(actual, ordered, { orderSensitive: false }).correct, true);
});

test('rejects a difference larger than the rounding tolerance', () => {
  const actual = {
    columns: ['volume'],
    values: [[10.05]],
    error: null,
  };
  const target = { columns: ['volume'], values: [[10]], error: null };
  assert.equal(grade(actual, target, { orderSensitive: false }).correct, false);
});

test('accepts a two-cent rounding gap and a relative gap on large numbers', () => {
  assert.equal(
    grade(
      { columns: ['v'], values: [[10.02]], error: null },
      { columns: ['v'], values: [[10]], error: null },
      { orderSensitive: false },
    ).correct,
    true,
  );
  assert.equal(
    grade(
      { columns: ['v'], values: [[100000.03]], error: null },
      { columns: ['v'], values: [[100000]], error: null },
      { orderSensitive: false },
    ).correct,
    true,
  );
});

test('treats NULL as distinct from zero and surfaces SQLite errors', () => {
  assert.equal(
    grade(
      { columns: ['v'], values: [[0]], error: null },
      { columns: ['v'], values: [[null]], error: null },
      { orderSensitive: false },
    ).correct,
    false,
  );
  const failed = grade({ error: 'no such column: foo' }, expected, { orderSensitive: false });
  assert.equal(failed.correct, false);
  assert.match(failed.message, /no such column/);
});
