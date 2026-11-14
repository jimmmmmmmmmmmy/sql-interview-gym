import assert from 'node:assert/strict';
import test from 'node:test';
import { executeSelect } from '../src/execute.js';
import { grade } from '../src/grader.js';
import { pickInterviewIds } from '../src/interview.js';
import { QUESTIONS, TIER_LABELS } from '../src/questions.js';
import { makeDb } from './helpers.js';

function strip(sql) {
  return sql.trim().replace(/;+\s*$/u, '');
}

test('question bank covers every tier and is well formed', () => {
  assert.ok(QUESTIONS.length >= 25);
  const ids = new Set();
  for (const tier of [1, 2, 3, 4, 5]) {
    assert.ok(TIER_LABELS[tier]);
    assert.ok(QUESTIONS.filter((question) => question.tier === tier).length >= 4);
  }
  for (const question of QUESTIONS) {
    assert.equal(ids.has(question.id), false, question.id);
    ids.add(question.id);
    assert.equal(typeof question.orderSensitive, 'boolean');
    assert.ok(question.title.length > 0);
    assert.ok(question.topics.length > 0);
    assert.ok(question.prompt.length > 0);
    assert.ok(question.hints.length >= 2);
    assert.ok(question.followups.length >= 2);
    assert.match(question.solution, /select/i);
  }
});

test('interview sets escalate and stay fixed for a seed', () => {
  const first = pickInterviewIds(123456);
  assert.deepEqual(first, pickInterviewIds(123456));
  assert.deepEqual(first.map((id) => QUESTIONS.find((question) => question.id === id).tier), [1, 2, 3, 4, 5]);
  const tiers = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    pickInterviewIds(seed).forEach((id, index) => {
      assert.equal(QUESTIONS.find((question) => question.id === id).tier, index + 1);
    });
    tiers.add(pickInterviewIds(seed).join('|'));
  }
  assert.ok(tiers.size > 1);
});

test('every reference solution runs and grades itself correct', async () => {
  const db = await makeDb();
  try {
    for (const question of QUESTIONS) {
      const result = executeSelect(db, question.solution);
      assert.equal(result.error, null, `${question.id}: ${result.error}`);
      assert.ok(result.values.length >= 1, `${question.id} returned no rows`);
      assert.ok(result.columns.length >= 1, `${question.id} returned no columns`);
      const graded = grade(result, result, { orderSensitive: question.orderSensitive });
      assert.equal(graded.correct, true, `${question.id}: ${graded.message}`);
    }

    const distinct = QUESTIONS.find((question) => question.id === 'fix-distinct-senders');
    const aliased = executeSelect(
      db,
      `SELECT distinct_senders AS sender_count FROM (${strip(distinct.solution)}) q`,
    );
    const direct = executeSelect(db, distinct.solution);
    assert.equal(grade(aliased, direct, { orderSensitive: false }).correct, true);

    const monthly = QUESTIONS.find((question) => question.id === 'monthly-completed-volume');
    const forward = executeSelect(db, monthly.solution);
    const reversed = executeSelect(db, `SELECT * FROM (${strip(monthly.solution)}) t ORDER BY month DESC`);
    assert.equal(reversed.error, null, reversed.error);
    assert.equal(grade(reversed, forward, { orderSensitive: true }).correct, false);
    assert.equal(grade(reversed, forward, { orderSensitive: false }).correct, true);

    const wrong = executeSelect(
      db,
      `SELECT user_id, full_name, signup_at, kyc_status FROM users WHERE country = 'PT' ORDER BY user_id`,
    );
    const brazil = executeSelect(db, QUESTIONS.find((question) => question.id === 'brazil-signups').solution);
    assert.equal(grade(wrong, brazil, { orderSensitive: true }).correct, false);
  } finally {
    db.close();
  }
});
