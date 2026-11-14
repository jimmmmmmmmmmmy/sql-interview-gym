import assert from 'node:assert/strict';
import test from 'node:test';
import { executeSelect } from '../src/execute.js';
import { makeDb } from './helpers.js';

test('seed is deterministic and covers the interview shapes', async () => {
  const left = await makeDb();
  const right = await makeDb();
  const checksum = `
    SELECT
      (SELECT COUNT(*) FROM users),
      (SELECT COUNT(*) FROM accounts),
      (SELECT COUNT(*) FROM transfers),
      (SELECT COALESCE(SUM(source_amount_cents), 0) FROM transfers),
      (SELECT COUNT(*) FROM card_transactions),
      (SELECT COALESCE(SUM(amount_cents), 0) FROM card_transactions),
      (SELECT COUNT(*) FROM funnel_events),
      (SELECT COUNT(*) FROM fx_rates),
      (SELECT ROUND(SUM(mid_rate), 2) FROM fx_rates)
  `;
  assert.deepEqual(executeSelect(left, checksum).values, executeSelect(right, checksum).values);

  const counts = Object.fromEntries(
    ['users', 'accounts', 'transfers', 'fx_rates', 'card_transactions', 'funnel_events'].map((name) => [
      name,
      executeSelect(left, `SELECT COUNT(*) FROM ${name}`).values[0][0],
    ]),
  );
  assert.equal(counts.users, 640);
  assert.ok(counts.accounts > counts.users);
  assert.ok(counts.transfers >= 1500);
  assert.ok(counts.card_transactions >= 500);
  assert.ok(counts.funnel_events >= counts.users);
  assert.ok(counts.fx_rates >= 1000);

  const scalar = (sql) => executeSelect(left, sql).values[0][0];
  assert.ok(scalar(`SELECT COUNT(*) FROM users WHERE country = 'BR'`) >= 36);
  assert.ok(scalar(`SELECT COUNT(*) FROM transfers WHERE fee_cents IS NULL`) >= 10);
  assert.ok(scalar(`SELECT COUNT(*) FROM transfers WHERE status = 'refunded'`) >= 20);
  assert.ok(scalar(`
    SELECT COUNT(*) FROM users u
    LEFT JOIN transfers t ON t.user_id = u.user_id
    WHERE t.transfer_id IS NULL
  `) >= 20);
  assert.ok(scalar(`
    SELECT COUNT(*)
    FROM transfers t
    JOIN users u ON u.user_id = t.user_id
    WHERE t.status = 'completed' AND u.kyc_status != 'approved'
  `) >= 8);
  assert.ok(scalar(`
    SELECT COUNT(*) FROM (
      SELECT user_id, currency FROM accounts
      GROUP BY user_id, currency
      HAVING COUNT(*) > 1
    )
  `) >= 20);
  assert.ok(scalar(`
    SELECT COUNT(*) FROM (
      SELECT user_id, merchant_name, amount_cents, currency, created_at
      FROM card_transactions
      GROUP BY 1, 2, 3, 4, 5
      HAVING COUNT(*) >= 2
    )
  `) >= 20);
  assert.ok(scalar(`
    SELECT COUNT(*) FROM (
      SELECT referred_by_user_id
      FROM users
      WHERE referred_by_user_id IS NOT NULL
      GROUP BY referred_by_user_id
      HAVING COUNT(*) >= 2
    )
  `) >= 1);
  assert.equal(scalar(`
    SELECT COUNT(*)
    FROM (
      SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS n
      FROM transfers
      WHERE status = 'completed'
      GROUP BY 1
    )
    WHERE month BETWEEN '2024-01' AND '2024-12' AND n >= 30
  `), 12);
  assert.equal(scalar(`
    SELECT COUNT(*)
    FROM transfers t
    LEFT JOIN fx_rates f
      ON f.rate_date = date(t.created_at)
     AND f.base_currency = t.source_currency
     AND f.quote_currency = t.target_currency
    WHERE f.mid_rate IS NULL
  `), 0);

  left.close();
  right.close();
});
