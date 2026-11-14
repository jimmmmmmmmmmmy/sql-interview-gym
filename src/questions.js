export const TIER_LABELS = {
  1: 'Foundations',
  2: 'Aggregation',
  3: 'Multi-step',
  4: 'Windows',
  5: 'Product metrics',
};

function q(question) {
  return question;
}

export const QUESTIONS = [
  q({
    id: 'completed-transfers-march',
    tier: 1,
    title: 'Completed transfers in March',
    topics: ['filter', 'dates', 'order by'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Payments ops wants every completed transfer created in March 2024. Use created_at, not completed_at. status must be the lowercase value completed. Use a half-open window from 2024-03-01 inclusive to 2024-04-01 exclusive.' },
      { type: 'p', text: 'Columns, in order: transfer_id, user_id, source_amount_cents, target_currency, created_at. Leave the amount in cents. Order by created_at ascending, then transfer_id ascending.' },
    ],
    hints: [
      'Refunded, failed, cancelled, and pending rows do not belong in this list.',
      'Text timestamps in this database sort in time order, so two inequalities on created_at are enough.',
    ],
    followups: [
      'created_at and completed_at can fall in different months. Which clock should a March volume dashboard use, and what would you tell finance if they disagree?',
      'How would this list change if a completed transfer could later be refunded? Would you delete the row, overwrite status, or append a refund event?',
    ],
    solution: `
SELECT transfer_id, user_id, source_amount_cents, target_currency, created_at
FROM transfers
WHERE status = 'completed'
  AND created_at >= '2024-03-01'
  AND created_at < '2024-04-01'
ORDER BY created_at, transfer_id;`,
  }),
  q({
    id: 'brazil-signups',
    tier: 1,
    title: 'Signups from Brazil',
    topics: ['filter', 'order by'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Growth wants the customers whose profile country is Brazil. country is the ISO code BR. This is the profile country, not a transfer destination.' },
      { type: 'p', text: 'Columns, in order: user_id, full_name, signup_at, kyc_status. Order by user_id ascending.' },
    ],
    hints: [
      'Filter users, not transfers.',
      'The code is the two letters BR, uppercase.',
    ],
    followups: [
      'Profile country and the country on a transfer can disagree. When would you use each one for a launch decision in Brazil?',
      'Some of these people never reach KYC approved. How would you split this list before handing it to a lifecycle campaign?',
    ],
    solution: `
SELECT user_id, full_name, signup_at, kyc_status
FROM users
WHERE country = 'BR'
ORDER BY user_id;`,
  }),
  q({
    id: 'missing-fees',
    tier: 1,
    title: 'Transfers with a missing fee',
    topics: ['nulls', 'filter'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Finance cannot bill a fee that was never written down. Find every transfer, of any status, whose fee_cents is NULL. A stored zero is a promo, not a missing fee, so leave zeros out.' },
      { type: 'p', text: 'Columns, in order: transfer_id, user_id, source_currency, source_amount_cents. Order by transfer_id ascending.' },
    ],
    hints: [
      'In SQL, "missing" is fee_cents IS NULL. fee_cents = NULL does not do what it looks like.',
      'Do not filter on status. A failed transfer can still have a missing fee.',
    ],
    followups: [
      'If finance says a missing fee means zero, which revenue numbers move, and which definition would you ship?',
      'A NULL fee and a 0 fee both show up as no revenue in a naive SUM. Why keep them distinct in the warehouse?',
    ],
    solution: `
SELECT transfer_id, user_id, source_currency, source_amount_cents
FROM transfers
WHERE fee_cents IS NULL
ORDER BY transfer_id;`,
  }),
  q({
    id: 'open-accounts',
    tier: 1,
    title: 'Open accounts by customer',
    topics: ['join', 'filter'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Support wants every account that is currently open, with the customer name beside it. status is the lowercase value open. Closed and frozen accounts stay out.' },
      { type: 'p', text: 'Columns, in order: user_id, full_name, account_id, currency, status. Order by user_id ascending, then account_id ascending.' },
    ],
    hints: [
      'This is an inner join from users to accounts on user_id.',
      'A customer can have more than one open account, so do not collapse to one row per user.',
    ],
    followups: [
      'A frozen account can still have historical transfers. Why is filtering status = open the wrong predicate for a lifetime volume report?',
      'What would you add to this query if support only wanted the home-currency account?',
    ],
    solution: `
SELECT u.user_id, u.full_name, a.account_id, a.currency, a.status
FROM users u
JOIN accounts a ON a.user_id = u.user_id
WHERE a.status = 'open'
ORDER BY u.user_id, a.account_id;`,
  }),
  q({
    id: 'users-without-transfers',
    tier: 1,
    title: 'Customers who never sent',
    topics: ['left join', 'anti-join'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Lifecycle wants customers who have no transfer rows at all, of any status. A failed or cancelled attempt still counts as a transfer. Card spend does not.' },
      { type: 'p', text: 'Columns, in order: user_id, country, kyc_status. Order by user_id ascending.' },
    ],
    hints: [
      'Left join users to transfers and keep the rows where the transfer key is NULL.',
      'A NOT EXISTS or NOT IN subquery is the same idea. If you use NOT IN, watch out for NULLs. user_id is never NULL here.',
    ],
    followups: [
      'Some of these people are rejected at KYC and some are approved and dormant. How would you split them before an email campaign?',
      'A dormant customer can still have card transactions. How would that change who you call "inactive"?',
    ],
    solution: `
SELECT u.user_id, u.country, u.kyc_status
FROM users u
LEFT JOIN transfers t ON t.user_id = u.user_id
WHERE t.transfer_id IS NULL
ORDER BY u.user_id;`,
  }),
  q({
    id: 'large-failed-transfers',
    tier: 1,
    title: 'Large failed or cancelled sends',
    topics: ['filter', 'in list', 'order by'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Risk wants failed or cancelled transfers whose source amount is at least 100,000 cents (1,000 major units). Include both statuses. Do not include pending, completed, or refunded.' },
      { type: 'p', text: 'Columns, in order: transfer_id, user_id, status, source_amount_cents, source_currency. Order by source_amount_cents descending, then transfer_id ascending.' },
    ],
    hints: [
      'status IN (\'failed\', \'cancelled\') is clearer than two OR branches.',
      'The threshold is in cents, so compare source_amount_cents to 100000, not 1000.',
    ],
    followups: [
      'Failed and cancelled are lumped together here. What would ops do differently for each status?',
      'On a billion rows, which columns would you want indexed for this filter, and would you still scan transfers live?',
    ],
    solution: `
SELECT transfer_id, user_id, status, source_amount_cents, source_currency
FROM transfers
WHERE status IN ('failed', 'cancelled')
  AND source_amount_cents >= 100000
ORDER BY source_amount_cents DESC, transfer_id ASC;`,
  }),
  q({
    id: 'volume-by-destination',
    tier: 2,
    title: 'Completed volume by destination',
    topics: ['group by', 'having'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Country management wants completed transfer volume by target_country. Count transfers and sum source_amount_cents. Keep destinations with at least 10 completed transfers. Convert the sum to major units by dividing by 100.0 once, after the sum, and round to 2 decimals.' },
      { type: 'p', text: 'Columns, in order: target_country, completed_transfers, volume_major. Order by volume_major descending, then target_country ascending.' },
    ],
    hints: [
      'Filter status = completed before you group. HAVING is for the aggregate threshold, not for status.',
      'SUM of integer cents is exact. Divide that sum by 100.0 and ROUND to 2 decimals. Do not average the amounts.',
    ],
    followups: [
      'How would this change if transfers could be refunded?',
      'Source amount is denominated in different currencies. When is summing it by destination actively misleading?',
    ],
    solution: `
SELECT target_country,
       COUNT(*) AS completed_transfers,
       ROUND(SUM(source_amount_cents) / 100.0, 2) AS volume_major
FROM transfers
WHERE status = 'completed'
GROUP BY target_country
HAVING COUNT(*) >= 10
ORDER BY volume_major DESC, target_country ASC;`,
  }),
  q({
    id: 'average-fee-by-corridor',
    tier: 2,
    title: 'Average fee by corridor',
    topics: ['group by', 'having', 'nulls'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Pricing wants the average fee on completed transfers, by corridor. A corridor is source_country, then the two characters ->, then target_country, with no spaces, for example GB->IN. Ignore NULL fees. Keep zero fees, because a promo is a real price. Keep corridors with at least 8 such transfers. Average fee_cents, divide by 100.0, and round to 2 decimals.' },
      { type: 'p', text: 'Columns, in order: corridor, transfers, avg_fee_major. Order by avg_fee_major descending, then corridor ascending.' },
    ],
    hints: [
      'AVG skips NULLs on its own, but a WHERE fee_cents IS NOT NULL makes the count match the rows you averaged.',
      'Build the corridor with ||. Group by the two country columns, not by a transfer id.',
    ],
    followups: [
      'A corridor of small transfers looks expensive as a percentage and cheap as an average fee. Which one would you show a pricing lead?',
      'What about performance on 1 billion rows? Would you pre-aggregate this corridor report, and at what grain?',
    ],
    solution: `
SELECT source_country || '->' || target_country AS corridor,
       COUNT(*) AS transfers,
       ROUND(AVG(fee_cents) / 100.0, 2) AS avg_fee_major
FROM transfers
WHERE status = 'completed'
  AND fee_cents IS NOT NULL
GROUP BY source_country, target_country
HAVING COUNT(*) >= 8
ORDER BY avg_fee_major DESC, corridor ASC;`,
  }),
  q({
    id: 'power-senders',
    tier: 2,
    title: 'Power senders',
    topics: ['group by', 'having'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Find customers with at least 5 completed transfers. Count those transfers and sum source_amount_cents, converted to major units by dividing the sum by 100.0 and rounding to 2 decimals.' },
      { type: 'p', text: 'Columns, in order: user_id, completed_transfers, volume_major. Order by completed_transfers descending, then user_id ascending.' },
    ],
    hints: [
      'GROUP BY user_id and put the threshold in HAVING, not WHERE.',
      'WHERE status = completed has to happen before the count, or failed attempts inflate it.',
    ],
    followups: [
      'These people dominate volume. How would you tell a payroll use case from a mule account with SQL you could run next?',
      'If the threshold moved from 5 transfers to 5 transfers in the last 30 days, what date column would you use?',
    ],
    solution: `
SELECT user_id,
       COUNT(*) AS completed_transfers,
       ROUND(SUM(source_amount_cents) / 100.0, 2) AS volume_major
FROM transfers
WHERE status = 'completed'
GROUP BY user_id
HAVING COUNT(*) >= 5
ORDER BY completed_transfers DESC, user_id ASC;`,
  }),
  q({
    id: 'monthly-completed-volume',
    tier: 2,
    title: 'Monthly completed volume',
    topics: ['date bucket', 'group by'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Build the 2024 monthly series of completed transfers using the month of created_at. One row per month that has at least one completed transfer. Count the transfers and sum source_amount_cents. Convert the sum to major units (divide by 100.0 once) and round to 2 decimals.' },
      { type: 'p', text: 'Columns, in order: month as YYYY-MM, completed_transfers, volume_major. Order by month ascending.' },
    ],
    hints: [
      "strftime('%Y-%m', created_at) is the month bucket in SQLite.",
      'Group by that same expression. Do not use completed_at for this question, or a late settlement slips into the next month.',
    ],
    followups: [
      'How would you add a year-to-date column without double counting a month?',
      'A month with zero completed transfers disappears from this query. How would you keep it in the series?',
    ],
    solution: `
SELECT strftime('%Y-%m', created_at) AS month,
       COUNT(*) AS completed_transfers,
       ROUND(SUM(source_amount_cents) / 100.0, 2) AS volume_major
FROM transfers
WHERE status = 'completed'
GROUP BY strftime('%Y-%m', created_at)
ORDER BY month;`,
  }),
  q({
    id: 'fee-tiers',
    tier: 2,
    title: 'Fee tiers',
    topics: ['case', 'group by'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Label every completed transfer with a fee tier. NULL fee_cents is unknown. A non-null fee under 200 cents is low. A fee from 200 cents up to but not including 1000 cents is mid. 1000 cents or more is high. Zero is low, not unknown.' },
      { type: 'p', text: 'Columns, in order: fee_tier, transfers. The tier strings are exactly unknown, low, mid, and high. Order by fee_tier ascending.' },
    ],
    hints: [
      'Put the NULL test first in the CASE. A later comparison does not catch NULL.',
      'GROUP BY the same CASE expression, or by its alias. SQLite accepts the alias.',
    ],
    followups: [
      'These cut points are arbitrary. How would you check whether they hide a pricing change?',
      'If unknown is a large share of completed volume, is that a data bug or a product like a fee-free corridor?',
    ],
    solution: `
SELECT
  CASE
    WHEN fee_cents IS NULL THEN 'unknown'
    WHEN fee_cents < 200 THEN 'low'
    WHEN fee_cents < 1000 THEN 'mid'
    ELSE 'high'
  END AS fee_tier,
  COUNT(*) AS transfers
FROM transfers
WHERE status = 'completed'
GROUP BY fee_tier
ORDER BY fee_tier;`,
  }),
  q({
    id: 'fix-distinct-senders',
    tier: 2,
    title: 'Fix a distinct-sender count',
    topics: ['count', 'distinct', 'debugging'],
    orderSensitive: false,
    prompt: [
      { type: 'p', text: 'An analyst tried to count January 2024 senders with this query. It counts transfer rows, it does not count people, and it includes transfers that are not completed.' },
      { type: 'code', text: `SELECT COUNT(user_id) AS senders
FROM transfers
WHERE created_at >= '2024-01-01'
  AND created_at < '2024-02-01';` },
      { type: 'p', text: 'Write the corrected query. Count distinct users with a completed transfer whose created_at falls in that half-open window. Return one column. One row is enough, so row order is not graded.' },
    ],
    hints: [
      'COUNT(DISTINCT user_id) counts people. COUNT(user_id) counts non-null ids, which here is the same as COUNT(*).',
      'Add status = completed. Keep the half-open created_at window.',
    ],
    followups: [
      'Why did COUNT(user_id) and COUNT(*) match on this table, and when would they differ?',
      'The original query was described as "slow" in a review. What would you look at before rewriting the logic?',
    ],
    solution: `
SELECT COUNT(DISTINCT user_id) AS distinct_senders
FROM transfers
WHERE status = 'completed'
  AND created_at >= '2024-01-01'
  AND created_at < '2024-02-01';`,
  }),
  q({
    id: 'days-to-first-transfer',
    tier: 3,
    title: 'Days from signup to first transfer',
    topics: ['cte', 'aggregation', 'dates'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'For each customer who has at least one completed transfer, find the earliest completed_at. Measure days from signup_at to that timestamp as the julianday difference, rounded to the nearest integer with ROUND, then cast to an integer. Do not truncate. Customers with no completed transfer stay out.' },
      { type: 'p', text: 'Columns, in order: user_id, signup_at, first_completed_at, days_to_first. Order by user_id ascending.' },
    ],
    hints: [
      'A CTE that groups transfers by user_id and takes MIN(completed_at) keeps the join simple.',
      'CAST(ROUND(julianday(first_completed_at) - julianday(signup_at)) AS INTEGER). CAST alone truncates.',
    ],
    followups: [
      'A customer who passes KYC on day 10 and transfers on day 11 looks slow on this clock. Which timestamp would you start from instead?',
      'How would this change if transfers could be refunded and the first completed send was later reversed?',
    ],
    solution: `
WITH firsts AS (
  SELECT user_id, MIN(completed_at) AS first_completed_at
  FROM transfers
  WHERE status = 'completed'
    AND completed_at IS NOT NULL
  GROUP BY user_id
)
SELECT u.user_id,
       u.signup_at,
       f.first_completed_at,
       CAST(ROUND(julianday(f.first_completed_at) - julianday(u.signup_at)) AS INTEGER) AS days_to_first
FROM firsts f
JOIN users u ON u.user_id = f.user_id
ORDER BY u.user_id;`,
  }),
  q({
    id: 'highest-fee-rate-corridors',
    tier: 3,
    title: 'Corridors with the highest fee rate',
    topics: ['cte', 'having', 'limit'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Fee rate is fee_cents divided by source_amount_cents, using real division, on completed transfers with a non-null fee and a positive source amount. Zero fees stay in. Average that rate by corridor. A corridor is source_country || \'->\' || target_country, for example GB->IN. Keep corridors with at least 8 transfers. Return the 5 highest averages.' },
      { type: 'p', text: 'Columns, in order: corridor, transfers, avg_fee_rate rounded to 4 decimals. Order by avg_fee_rate descending, then corridor ascending. The LIMIT makes that order part of the answer.' },
    ],
    hints: [
      'Multiply by 1.0 before dividing two integers, or the rate collapses to 0.',
      'Compute the row-level rate in a CTE, then average it. Averaging the fee and the amount separately is a different number.',
    ],
    followups: [
      'A corridor of small transfers looks expensive on a percentage because of the fixed part of the fee. When would you compare the fixed fee instead?',
      'What about performance on 1 billion rows if this report is refreshed every hour?',
    ],
    solution: `
WITH rated AS (
  SELECT source_country || '->' || target_country AS corridor,
         fee_cents * 1.0 / source_amount_cents AS fee_rate
  FROM transfers
  WHERE status = 'completed'
    AND fee_cents IS NOT NULL
    AND source_amount_cents > 0
)
SELECT corridor,
       COUNT(*) AS transfers,
       ROUND(AVG(fee_rate), 4) AS avg_fee_rate
FROM rated
GROUP BY corridor
HAVING COUNT(*) >= 8
ORDER BY avg_fee_rate DESC, corridor ASC
LIMIT 5;`,
  }),
  q({
    id: 'kyc-mismatch',
    tier: 3,
    title: 'Completed sends before KYC approval',
    topics: ['join', 'data quality'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Data quality thinks a completed transfer should only exist for a customer whose kyc_status is approved. Find completed transfers where the profile status is anything else. Do not try to rebuild status from the event log. Use users.kyc_status.' },
      { type: 'p', text: 'Columns, in order: transfer_id, user_id, kyc_status, created_at. Order by transfer_id ascending.' },
    ],
    hints: [
      'Join transfers to users on user_id.',
      'kyc_status != \'approved\' keeps rejected, pending, and not_started. NULL is not used for this column.',
    ],
    followups: [
      'Is a row like this fraud, a backfill, or a test account? What would you check next before paging an on-call engineer?',
      'If the event log says kyc_approved but the profile says pending, which source would you trust for a regulatory report?',
    ],
    solution: `
SELECT t.transfer_id, t.user_id, u.kyc_status, t.created_at
FROM transfers t
JOIN users u ON u.user_id = t.user_id
WHERE t.status = 'completed'
  AND u.kyc_status != 'approved'
ORDER BY t.transfer_id;`,
  }),
  q({
    id: 'referrer-activation',
    tier: 3,
    title: 'Referrers whose friends send',
    topics: ['self join', 'having'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'A referred customer is a user with referred_by_user_id set. For each referrer who has at least 2 referred customers, count those customers and count how many of them have at least one completed transfer. Count people, not transfers. A referred customer with three completed sends still contributes 1.' },
      { type: 'p', text: 'Columns, in order: referrer_id, referred_users, referred_who_sent. Order by referred_who_sent descending, then referrer_id ascending.' },
    ],
    hints: [
      'Join users to itself: the referrer on one side, the referred customer on the other.',
      'A DISTINCT set of user ids who have a completed transfer, left joined, stops you from counting a person once per transfer.',
    ],
    followups: [
      'A referrer with many invited people and no sends might still be valuable. What second metric would you add before cutting the program?',
      'How would this change if a referral only counted when the friend\'s first completed transfer was within 14 days of signup?',
    ],
    solution: `
SELECT r.user_id AS referrer_id,
       COUNT(u.user_id) AS referred_users,
       SUM(CASE WHEN t.user_id IS NOT NULL THEN 1 ELSE 0 END) AS referred_who_sent
FROM users r
JOIN users u ON u.referred_by_user_id = r.user_id
LEFT JOIN (
  SELECT DISTINCT user_id
  FROM transfers
  WHERE status = 'completed'
) t ON t.user_id = u.user_id
GROUP BY r.user_id
HAVING COUNT(u.user_id) >= 2
ORDER BY referred_who_sent DESC, referrer_id ASC;`,
  }),
  q({
    id: 'weekday-weekend',
    tier: 3,
    title: 'Weekday and weekend volume',
    topics: ['case', 'date bucket'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Split completed transfers into weekend and weekday using created_at. In SQLite, strftime(\'%w\', created_at) is 0 on Sunday and 6 on Saturday. Those two values are weekend. Everything else is weekday. Count transfers and sum source_amount_cents as major units rounded to 2 decimals.' },
      { type: 'p', text: 'Columns, in order: day_type, transfers, volume_major. The strings are exactly weekend and weekday. Order by day_type ascending.' },
    ],
    hints: [
      'CAST the strftime result to an integer before you compare it. It comes back as text.',
      'Group by the CASE expression. Both buckets should be able to appear. Do not filter to one of them.',
    ],
    followups: [
      'Wise moves money on weekends when a lot of banks do not. What operational question is this query not answering?',
      'A Monday 00:30 UTC transfer was still Sunday evening in Mexico. Which timezone would you use for an ops staffing chart?',
    ],
    solution: `
SELECT
  CASE
    WHEN CAST(strftime('%w', created_at) AS INTEGER) IN (0, 6) THEN 'weekend'
    ELSE 'weekday'
  END AS day_type,
  COUNT(*) AS transfers,
  ROUND(SUM(source_amount_cents) / 100.0, 2) AS volume_major
FROM transfers
WHERE status = 'completed'
GROUP BY day_type
ORDER BY day_type;`,
  }),
  q({
    id: 'fx-outliers',
    tier: 3,
    title: 'Rates far from the mid-market',
    topics: ['join', 'dates', 'nulls'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Compare each completed transfer\'s fx_rate to the mid_rate in fx_rates for the same pair on the calendar date of created_at. The pair is base = source_currency and quote = target_currency. rate_date matches date(created_at). Keep rows where both rates are present and ABS(fx_rate - mid_rate) / mid_rate is strictly greater than 0.02. A normal customer spread under that threshold should drop out.' },
      { type: 'p', text: 'Columns, in order: transfer_id, pair as source_currency || \'/\' || target_currency (for example GBP/INR), transfer_rate as fx_rate rounded to 6 decimals, mid_rate rounded to 6 decimals, relative_gap rounded to 4 decimals. Order by relative_gap descending, then transfer_id ascending.' },
    ],
    hints: [
      'date(created_at) strips the time so it can match rate_date.',
      'Drop NULL fx_rate in the WHERE clause. Dividing by a NULL mid-market rate will not produce a useful gap.',
    ],
    followups: [
      'A rate 3% off mid could be a bug or a partner spread. What extra column would you ask engineering for before calling it an incident?',
      'What about performance on 1 billion rows? The join is on date plus two currency codes. What would you partition or cluster on?',
    ],
    solution: `
SELECT t.transfer_id,
       t.source_currency || '/' || t.target_currency AS pair,
       ROUND(t.fx_rate, 6) AS transfer_rate,
       ROUND(f.mid_rate, 6) AS mid_rate,
       ROUND(ABS(t.fx_rate - f.mid_rate) / f.mid_rate, 4) AS relative_gap
FROM transfers t
JOIN fx_rates f
  ON f.rate_date = date(t.created_at)
 AND f.base_currency = t.source_currency
 AND f.quote_currency = t.target_currency
WHERE t.status = 'completed'
  AND t.fx_rate IS NOT NULL
  AND f.mid_rate > 0
  AND ABS(t.fx_rate - f.mid_rate) / f.mid_rate > 0.02
ORDER BY relative_gap DESC, t.transfer_id ASC;`,
  }),
  q({
    id: 'top-senders-by-country',
    tier: 4,
    title: 'Top senders in each home country',
    topics: ['window', 'rank'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Rank customers inside their profile country by completed source volume. Volume is the sum of source_amount_cents on completed transfers. Use RANK, not ROW_NUMBER, ordered only by that cent total descending, so equal totals share a rank and the next rank skips. Keep ranks 1, 2, and 3. A three-way tie for first is three rows of rank 1 and nobody at rank 2.' },
      { type: 'p', text: 'Columns, in order: country, user_id, volume_major (cents divided by 100.0, rounded to 2 decimals), volume_rank. Order by country ascending, volume_rank ascending, user_id ascending. The rank itself must not use user_id as a tie break.' },
    ],
    hints: [
      'Aggregate to one row per country and user first. Rank that result, not the raw transfers.',
      'RANK() OVER (PARTITION BY country ORDER BY volume_cents DESC). Filter volume_rank <= 3 in an outer query.',
    ],
    followups: [
      'RANK and ROW_NUMBER disagree when two customers send the same amount. Which one would you put in a top-3 customers email, and why?',
      'What about performance on 1 billion rows? Would you compute this rank in the warehouse every night or on demand?',
    ],
    solution: `
WITH totals AS (
  SELECT u.country AS country,
         t.user_id AS user_id,
         SUM(t.source_amount_cents) AS volume_cents
  FROM transfers t
  JOIN users u ON u.user_id = t.user_id
  WHERE t.status = 'completed'
  GROUP BY u.country, t.user_id
),
ranked AS (
  SELECT country,
         user_id,
         ROUND(volume_cents / 100.0, 2) AS volume_major,
         RANK() OVER (PARTITION BY country ORDER BY volume_cents DESC) AS volume_rank
  FROM totals
)
SELECT country, user_id, volume_major, volume_rank
FROM ranked
WHERE volume_rank <= 3
ORDER BY country ASC, volume_rank ASC, user_id ASC;`,
  }),
  q({
    id: 'running-completed-volume',
    tier: 4,
    title: 'Running completed volume',
    topics: ['window', 'running total', 'dates'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'For each calendar date that has at least one completed transfer, sum source_amount_cents, divide by 100.0, and round to 2 decimals. Call that day_volume. The date is date(completed_at), so a December transfer that settles in January 2025 can open a 2025 day. Then take a running sum of day_volume in day order, and round that running sum to 2 decimals. Days with no completed transfers are omitted.' },
      { type: 'p', text: 'Columns, in order: day, day_volume, running_volume. Order by day ascending.' },
    ],
    hints: [
      'Group to one row per day first. A running sum over raw transfers double-counts the rounding.',
      'SUM(day_volume) OVER (ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), then ROUND to 2 decimals.',
    ],
    followups: [
      'What about performance on 1 billion rows?',
      'How would this change if transfers could be refunded on a later day than completed_at? Which day should the negative volume hit?',
    ],
    solution: `
WITH daily AS (
  SELECT date(completed_at) AS day,
         ROUND(SUM(source_amount_cents) / 100.0, 2) AS day_volume
  FROM transfers
  WHERE status = 'completed'
    AND completed_at IS NOT NULL
  GROUP BY date(completed_at)
)
SELECT day,
       day_volume,
       ROUND(SUM(day_volume) OVER (
         ORDER BY day
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ), 2) AS running_volume
FROM daily
ORDER BY day;`,
  }),
  q({
    id: 'month-over-month-growth',
    tier: 4,
    title: 'Month-over-month growth',
    topics: ['window', 'lag', 'dates'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Count completed transfers by the month of created_at (YYYY-MM). Growth is (this month minus the previous row) divided by the previous row, as a fraction, not a percent. 0.05 means 5% growth. Round to 4 decimals. The first month has no previous row, so its previous count and growth are NULL. Use the previous row in month order, which is the previous calendar month when every month is present.' },
      { type: 'p', text: 'Columns, in order: month, completed_transfers, prev_month_transfers, mom_growth. Order by month ascending.' },
    ],
    hints: [
      'Aggregate in a CTE, then LAG(completed_transfers) OVER (ORDER BY month) in the outer query.',
      'Guard the division with CASE WHEN the lag is NULL. Do not multiply by 100.',
    ],
    followups: [
      'January 2025 is not in this extract. How do you stop a missing month from being compared with the wrong previous month?',
      'Count growth and volume growth can point in opposite directions. Which one would you lead a monthly review with?',
    ],
    solution: `
WITH monthly AS (
  SELECT strftime('%Y-%m', created_at) AS month,
         COUNT(*) AS completed_transfers
  FROM transfers
  WHERE status = 'completed'
  GROUP BY strftime('%Y-%m', created_at)
)
SELECT month,
       completed_transfers,
       LAG(completed_transfers) OVER (ORDER BY month) AS prev_month_transfers,
       ROUND(
         CASE
           WHEN LAG(completed_transfers) OVER (ORDER BY month) IS NULL THEN NULL
           ELSE (completed_transfers - LAG(completed_transfers) OVER (ORDER BY month)) * 1.0
                / LAG(completed_transfers) OVER (ORDER BY month)
         END,
         4
       ) AS mom_growth
FROM monthly
ORDER BY month;`,
  }),
  q({
    id: 'second-completed-transfer',
    tier: 4,
    title: 'Each customer\'s second completed transfer',
    topics: ['window', 'row_number'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'For each customer, number their completed transfers by created_at ascending, breaking ties with transfer_id ascending. Return the transfer that gets number 2. Customers with fewer than two completed transfers drop out. Do not use RANK. A tie on the timestamp must not produce two "seconds".' },
      { type: 'p', text: 'Columns, in order: user_id, transfer_id, created_at. Order by user_id ascending.' },
    ],
    hints: [
      'ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, transfer_id).',
      'Filter to rn = 2 in an outer query. You cannot filter a window alias in the same WHERE.',
    ],
    followups: [
      'How would you change this if "second" meant the second calendar day with a completed transfer, not the second row?',
      'If two completed transfers share a timestamp and you had used RANK, what would the product manager see that ROW_NUMBER hides?',
    ],
    solution: `
WITH ranked AS (
  SELECT user_id,
         transfer_id,
         created_at,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY created_at, transfer_id
         ) AS rn
  FROM transfers
  WHERE status = 'completed'
)
SELECT user_id, transfer_id, created_at
FROM ranked
WHERE rn = 2
ORDER BY user_id;`,
  }),
  q({
    id: 'current-account-per-currency',
    tier: 4,
    title: 'Current account per currency',
    topics: ['window', 'dedup'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'A customer can have more than one account in the same currency. Keep one row per user_id and currency: the account with the latest opened_at. If two accounts open at the same timestamp, keep the higher account_id. Include pairs that only have one account. Do not filter on status. A closed account is current if it is the latest row.' },
      { type: 'p', text: 'Columns, in order: user_id, currency, account_id, status. Order by user_id ascending, then currency ascending.' },
    ],
    hints: [
      'ROW_NUMBER() OVER (PARTITION BY user_id, currency ORDER BY opened_at DESC, account_id DESC).',
      'Keep rn = 1. This is the dedup, not a "top 3".',
    ],
    followups: [
      'Why might a customer have two GBP accounts? What if the latest row is closed and an older one is still open?',
      'What about performance on 1 billion rows? When would you maintain a current_account table instead of computing this latest-row query live?',
    ],
    solution: `
WITH ranked AS (
  SELECT user_id,
         currency,
         account_id,
         status,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, currency
           ORDER BY opened_at DESC, account_id DESC
         ) AS rn
  FROM accounts
)
SELECT user_id, currency, account_id, status
FROM ranked
WHERE rn = 1
ORDER BY user_id, currency;`,
  }),
  q({
    id: 'days-between-transfers',
    tier: 4,
    title: 'Days between completed transfers',
    topics: ['window', 'lag', 'dates'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'For each completed transfer after a customer\'s first, measure the gap from the previous completed transfer. Order each customer by created_at, then transfer_id. The gap is the julianday difference, rounded to the nearest integer with ROUND, then cast to an integer. The first completed transfer for each customer has no previous row and must be excluded.' },
      { type: 'p', text: 'Columns, in order: user_id, transfer_id, prev_created_at, days_since_previous. Order by user_id ascending, created_at ascending, transfer_id ascending.' },
    ],
    hints: [
      'LAG(created_at) OVER (PARTITION BY user_id ORDER BY created_at, transfer_id).',
      'Filter out the NULL lag in the outer query. Use ROUND, not a bare CAST, so a 1.6 day gap becomes 2.',
    ],
    followups: [
      'A 0-day gap is two transfers on the same calendar day. Is that churn risk or a power user?',
      'How would this change if a refunded transfer should reset the gap, as if the send had not happened?',
    ],
    solution: `
WITH ordered AS (
  SELECT user_id,
         transfer_id,
         created_at,
         LAG(created_at) OVER (
           PARTITION BY user_id
           ORDER BY created_at, transfer_id
         ) AS prev_created_at
  FROM transfers
  WHERE status = 'completed'
)
SELECT user_id,
       transfer_id,
       prev_created_at,
       CAST(ROUND(julianday(created_at) - julianday(prev_created_at)) AS INTEGER) AS days_since_previous
FROM ordered
WHERE prev_created_at IS NOT NULL
ORDER BY user_id, created_at, transfer_id;`,
  }),
  q({
    id: 'signup-cohort-retention',
    tier: 5,
    title: 'Signup-month retention',
    topics: ['cohort', 'retention', 'cte'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Cohort is the YYYY-MM of users.signup_at. A customer is retained when they have at least one completed transfer whose completed_at falls in the next calendar month. December 2024 looks at January 2025. A customer with no such transfer counts in the cohort and contributes 0 retained. Include every signup month in the table.' },
      { type: 'p', text: 'Columns, in order: cohort_month, users, retained_users, retention_rate. The rate is retained_users divided by users, rounded to 4 decimals. Order by cohort_month ascending.' },
    ],
    hints: [
      'Build a distinct set of (user_id, active month) from completed_at, then left join it to the cohort on the next month.',
      "Next month: strftime('%Y-%m', date(cohort_month || '-01', '+1 month')). Left join so a quiet cohort still appears.",
    ],
    followups: [
      'Is "a transfer in the next calendar month" the retention event you would ship, or a 30-day window from signup? What decision changes?',
      'A cohort\'s next month can be only partly observed if the extract ends mid-month. How would you mark that cohort as incomplete so a PM does not panic?',
    ],
    solution: `
WITH cohort AS (
  SELECT user_id,
         strftime('%Y-%m', signup_at) AS cohort_month
  FROM users
),
activity AS (
  SELECT DISTINCT user_id,
         strftime('%Y-%m', completed_at) AS active_month
  FROM transfers
  WHERE status = 'completed'
    AND completed_at IS NOT NULL
)
SELECT c.cohort_month,
       COUNT(*) AS users,
       SUM(CASE WHEN a.user_id IS NOT NULL THEN 1 ELSE 0 END) AS retained_users,
       ROUND(SUM(CASE WHEN a.user_id IS NOT NULL THEN 1 ELSE 0 END) * 1.0 / COUNT(*), 4) AS retention_rate
FROM cohort c
LEFT JOIN activity a
  ON a.user_id = c.user_id
 AND a.active_month = strftime('%Y-%m', date(c.cohort_month || '-01', '+1 month'))
GROUP BY c.cohort_month
ORDER BY c.cohort_month;`,
  }),
  q({
    id: 'kyc-funnel',
    tier: 5,
    title: 'Ordered KYC funnel',
    topics: ['funnel', 'cte', 'dedup'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Count users, not event rows. Events can repeat, and a later step only counts when its earliest timestamp is at or after the previous step. The steps, in order, are signup_started, email_verified, kyc_submitted, kyc_approved. A user who reaches a step without the earlier steps in order does not count at that step or after it.' },
      { type: 'p', text: 'Columns, in order: step_order (1 to 4), step_name (those exact strings), users, conversion_from_start, conversion_from_previous. Both rates are users at this step divided by users at the start, or by the previous step, rounded to 4 decimals. Step 1 divides by itself, so both rates are 1. Order by step_order ascending.' },
    ],
    hints: [
      'Collapse each user to the MIN(event_at) of each event name, then CASE the chain with >= comparisons.',
      'UNION ALL four one-row selects from that totals row, and order the outside query.',
    ],
    followups: [
      'Product wants to count anyone who reached kyc_approved even if the events arrived out of order. How does the rate change, and which definition matches the onboarding screen?',
      'What about performance on 1 billion event rows? Which index makes the per-user MIN cheap?',
    ],
    solution: `
WITH firsts AS (
  SELECT user_id,
         MIN(CASE WHEN event_name = 'signup_started' THEN event_at END) AS t1,
         MIN(CASE WHEN event_name = 'email_verified' THEN event_at END) AS t2,
         MIN(CASE WHEN event_name = 'kyc_submitted' THEN event_at END) AS t3,
         MIN(CASE WHEN event_name = 'kyc_approved' THEN event_at END) AS t4
  FROM funnel_events
  GROUP BY user_id
),
flags AS (
  SELECT
    CASE WHEN t1 IS NOT NULL THEN 1 ELSE 0 END AS s1,
    CASE WHEN t1 IS NOT NULL AND t2 IS NOT NULL AND t2 >= t1 THEN 1 ELSE 0 END AS s2,
    CASE WHEN t1 IS NOT NULL AND t2 IS NOT NULL AND t3 IS NOT NULL AND t2 >= t1 AND t3 >= t2 THEN 1 ELSE 0 END AS s3,
    CASE WHEN t1 IS NOT NULL AND t2 IS NOT NULL AND t3 IS NOT NULL AND t4 IS NOT NULL
              AND t2 >= t1 AND t3 >= t2 AND t4 >= t3 THEN 1 ELSE 0 END AS s4
  FROM firsts
),
counts AS (
  SELECT SUM(s1) AS c1, SUM(s2) AS c2, SUM(s3) AS c3, SUM(s4) AS c4
  FROM flags
)
SELECT step_order, step_name, users,
       ROUND(users * 1.0 / start_users, 4) AS conversion_from_start,
       ROUND(users * 1.0 / prev_users, 4) AS conversion_from_previous
FROM (
  SELECT 1 AS step_order, 'signup_started' AS step_name, c1 AS users, c1 AS start_users, c1 AS prev_users FROM counts
  UNION ALL
  SELECT 2, 'email_verified', c2, c1, c1 FROM counts
  UNION ALL
  SELECT 3, 'kyc_submitted', c3, c1, c2 FROM counts
  UNION ALL
  SELECT 4, 'kyc_approved', c4, c1, c3 FROM counts
) steps
ORDER BY step_order;`,
  }),
  q({
    id: 'activation-14-day',
    tier: 5,
    title: 'Activation within 14 days of KYC',
    topics: ['funnel', 'dates', 'left join'],
    orderSensitive: false,
    prompt: [
      { type: 'p', text: 'Among customers who have a kyc_approved event, take the earliest event_at as approved_at. They are activated when their earliest completed_at is on or after that timestamp and the julianday difference is between 0 and 14 inclusive. A transfer before approval does not count. This definition does not require the funnel steps to be in order. One row is the whole answer, so row order is not graded.' },
      { type: 'p', text: 'Columns, in order: approved_users, activated_14d, activation_rate. The rate is activated_14d divided by approved_users, rounded to 4 decimals.' },
    ],
    hints: [
      'Two grouped CTEs, one for MIN(event_at) of kyc_approved and one for MIN(completed_at) of completed transfers, then a left join.',
      'BETWEEN 0 AND 14 is inclusive. A negative difference means the transfer happened first.',
    ],
    followups: [
      'If the customer transferred 14 days and 2 hours later, do you want them in the numerator? Who reads this KPI?',
      'This clock starts at KYC approval, not signup. When would signup be the wrong start for an activation target?',
    ],
    solution: `
WITH approved AS (
  SELECT user_id, MIN(event_at) AS approved_at
  FROM funnel_events
  WHERE event_name = 'kyc_approved'
  GROUP BY user_id
),
first_transfer AS (
  SELECT user_id, MIN(completed_at) AS first_completed_at
  FROM transfers
  WHERE status = 'completed'
    AND completed_at IS NOT NULL
  GROUP BY user_id
)
SELECT COUNT(*) AS approved_users,
       SUM(CASE
             WHEN f.first_completed_at IS NOT NULL
              AND julianday(f.first_completed_at) - julianday(a.approved_at) BETWEEN 0 AND 14
             THEN 1 ELSE 0 END) AS activated_14d,
       ROUND(SUM(CASE
             WHEN f.first_completed_at IS NOT NULL
              AND julianday(f.first_completed_at) - julianday(a.approved_at) BETWEEN 0 AND 14
             THEN 1 ELSE 0 END) * 1.0 / COUNT(*), 4) AS activation_rate
FROM approved a
LEFT JOIN first_transfer f ON f.user_id = a.user_id;`,
  }),
  q({
    id: 'duplicate-card-charges',
    tier: 5,
    title: 'Duplicate card charges',
    topics: ['dedup', 'having', 'group by'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'A logical duplicate is more than one card row with the same user_id, merchant_name, amount_cents, currency, and created_at. txn_id differs. Find the groups with a count of at least 2. This can be a retry or two real purchases. The query only finds the pattern.' },
      { type: 'p', text: 'Columns, in order: user_id, merchant_name, amount_cents, currency, created_at, duplicate_count. Order by duplicate_count descending, then user_id ascending, then created_at ascending.' },
    ],
    hints: [
      'GROUP BY the five business columns and HAVING COUNT(*) >= 2.',
      'Do not group by txn_id. That column is unique, so every group would have a count of 1.',
    ],
    followups: [
      'The same amount and timestamp can be a processor retry or two coffees. What would you ask the payments log for before refunding?',
      'How would you change the grain if the retry lands a few seconds later instead of on the same timestamp?',
    ],
    solution: `
SELECT user_id,
       merchant_name,
       amount_cents,
       currency,
       created_at,
       COUNT(*) AS duplicate_count
FROM card_transactions
GROUP BY user_id, merchant_name, amount_cents, currency, created_at
HAVING COUNT(*) >= 2
ORDER BY duplicate_count DESC, user_id ASC, created_at ASC;`,
  }),
  q({
    id: 'net-volume-after-refunds',
    tier: 5,
    title: 'Net volume after refunds',
    topics: ['case', 'refunds', 'group by'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'Treat a completed transfer as positive source volume and a refunded transfer as negative source volume of the same source_amount_cents. Ignore pending, failed, and cancelled. Group by source_currency, because mixing currencies in one sum is not a volume. Also count the refunded transfers in that currency.' },
      { type: 'p', text: 'Columns, in order: source_currency, net_volume_major, refunded_transfers. net_volume_major is the signed sum of cents divided by 100.0 and rounded to 2 decimals. Order by source_currency ascending.' },
    ],
    hints: [
      'SUM(CASE WHEN status = \'completed\' THEN source_amount_cents WHEN status = \'refunded\' THEN -source_amount_cents END).',
      'Filter to those two statuses so a NULL case does not appear. Divide the sum, not each row, by 100.0.',
    ],
    followups: [
      'How would this change if transfers could be refunded for a partial amount, or in the target currency instead of the source currency?',
      'Refunds are applied to source currency here. When would target-currency net volume tell a different story?',
    ],
    solution: `
SELECT source_currency,
       ROUND(SUM(CASE
         WHEN status = 'completed' THEN source_amount_cents
         WHEN status = 'refunded' THEN -source_amount_cents
         ELSE 0
       END) / 100.0, 2) AS net_volume_major,
       SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded_transfers
FROM transfers
WHERE status IN ('completed', 'refunded')
GROUP BY source_currency
ORDER BY source_currency;`,
  }),
  q({
    id: 'second-sender-by-destination',
    tier: 5,
    title: 'Second-largest sender per destination',
    topics: ['window', 'row_number', 'ties'],
    orderSensitive: true,
    prompt: [
      { type: 'p', text: 'For each target_country, rank customers by completed source volume using ROW_NUMBER, not RANK. Order the window by volume cents descending, then user_id ascending, so a tie has a single winner. Return the customer in position 2. Destinations with fewer than two distinct senders drop out.' },
      { type: 'p', text: 'Columns, in order: target_country, user_id, volume_major (cents / 100.0, rounded to 2 decimals). Order by target_country ascending.' },
    ],
    hints: [
      'Aggregate to target_country and user_id first, then number the rows.',
      'ROW_NUMBER with user_id in the ORDER BY makes the second place unique. Filter rn = 2 outside the window.',
    ],
    followups: [
      'If finance asks for everyone tied for second, which function replaces ROW_NUMBER, and what happens to the row count?',
      'What about performance on 1 billion rows? Would you keep a daily aggregate of (destination, user, volume) so this rank does not scan transfers?',
    ],
    solution: `
WITH totals AS (
  SELECT target_country,
         user_id,
         SUM(source_amount_cents) AS volume_cents
  FROM transfers
  WHERE status = 'completed'
  GROUP BY target_country, user_id
),
ranked AS (
  SELECT target_country,
         user_id,
         volume_cents,
         ROW_NUMBER() OVER (
           PARTITION BY target_country
           ORDER BY volume_cents DESC, user_id ASC
         ) AS rn
  FROM totals
)
SELECT target_country,
       user_id,
       ROUND(volume_cents / 100.0, 2) AS volume_major
FROM ranked
WHERE rn = 2
ORDER BY target_country;`,
  }),
];

export function questionById(id) {
  return QUESTIONS.find((question) => question.id === id) ?? null;
}
