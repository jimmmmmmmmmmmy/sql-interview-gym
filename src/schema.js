export const DATA_NOTES = [
  'Amounts are integer cents (source_amount_cents, target_amount_cents, fee_cents, amount_cents), including for yen in this gym. Divide by 100.0 after you aggregate, and round money to 2 decimals when a question asks for major units.',
  'Timestamps are UTC text, YYYY-MM-DD HH:MM:SS. They sort chronologically. rate_date and date_of_birth are YYYY-MM-DD.',
  'Each Run and Submit starts from a fresh copy of the seed. UPDATE and DELETE do not stick.',
  'If you send several statements, only the last result is graded.',
];

export const SQLITE_NOTES = [
  "Month bucket: strftime('%Y-%m', created_at). Calendar day: date(created_at).",
  'Day difference: julianday(later) - julianday(earlier). strftime(\'%w\') is 0 for Sunday and 6 for Saturday.',
  'Multiply by 1.0 before you divide integers, or SQLite uses integer division.',
  'Window functions work: ROW_NUMBER, RANK, DENSE_RANK, LAG, and SUM() OVER.',
  'There is no DATE_TRUNC, QUALIFY, or aggregate FILTER. Put the window in a subquery instead of QUALIFY.',
];

export const TABLES = [
  {
    name: 'users',
    description: 'One row per customer profile. country is the profile country, not the IP country.',
    primaryKey: ['user_id'],
    columns: [
      { name: 'user_id', type: 'INTEGER', notNull: true, description: 'Surrogate key.' },
      { name: 'full_name', type: 'TEXT', notNull: true, description: 'Synthetic display name.' },
      { name: 'country', type: 'TEXT', notNull: true, description: 'ISO 3166-1 alpha-2 profile country.' },
      { name: 'signup_at', type: 'TEXT', notNull: true, description: 'UTC timestamp of signup_started.' },
      { name: 'kyc_status', type: 'TEXT', notNull: true, description: 'not_started, pending, approved, or rejected.' },
      { name: 'acquisition_channel', type: 'TEXT', notNull: true, description: 'organic, paid, partner, or referral.' },
      { name: 'referred_by_user_id', type: 'INTEGER', notNull: false, description: 'Referring user, or NULL.' },
      { name: 'date_of_birth', type: 'TEXT', notNull: false, description: 'YYYY-MM-DD, or NULL when unknown.' },
    ],
  },
  {
    name: 'accounts',
    description: 'A customer can hold more than one currency, and can have a replacement account in the same currency.',
    primaryKey: ['account_id'],
    columns: [
      { name: 'account_id', type: 'INTEGER', notNull: true, description: 'Surrogate key.' },
      { name: 'user_id', type: 'INTEGER', notNull: true, description: 'Owner. References users.user_id.' },
      { name: 'currency', type: 'TEXT', notNull: true, description: 'ISO 4217 code.' },
      { name: 'status', type: 'TEXT', notNull: true, description: 'open, frozen, or closed.' },
      { name: 'opened_at', type: 'TEXT', notNull: true, description: 'UTC timestamp.' },
      { name: 'closed_at', type: 'TEXT', notNull: false, description: 'UTC timestamp, or NULL if not closed.' },
    ],
  },
  {
    name: 'transfers',
    description: 'Cross-border sends. status refunded means a completed send that was later reversed. Fee and FX can be missing.',
    primaryKey: ['transfer_id'],
    columns: [
      { name: 'transfer_id', type: 'INTEGER', notNull: true, description: 'Surrogate key.' },
      { name: 'user_id', type: 'INTEGER', notNull: true, description: 'Sender. References users.user_id.' },
      { name: 'source_account_id', type: 'INTEGER', notNull: false, description: 'Funding account, when known.' },
      { name: 'source_currency', type: 'TEXT', notNull: true, description: 'Currency the customer paid in.' },
      { name: 'target_currency', type: 'TEXT', notNull: true, description: 'Currency the recipient was paid in.' },
      { name: 'source_amount_cents', type: 'INTEGER', notNull: true, description: 'Principal in source minor units. Always positive.' },
      { name: 'target_amount_cents', type: 'INTEGER', notNull: false, description: 'Principal in target minor units, or NULL when FX is missing.' },
      { name: 'fee_cents', type: 'INTEGER', notNull: false, description: 'Fee in source minor units. NULL means unknown, 0 means a promo.' },
      { name: 'fx_rate', type: 'REAL', notNull: false, description: 'Target units per 1 source unit, or NULL.' },
      { name: 'status', type: 'TEXT', notNull: true, description: 'pending, completed, failed, cancelled, or refunded.' },
      { name: 'created_at', type: 'TEXT', notNull: true, description: 'UTC timestamp the transfer was created.' },
      { name: 'completed_at', type: 'TEXT', notNull: false, description: 'UTC timestamp for completed and refunded transfers, else NULL.' },
      { name: 'source_country', type: 'TEXT', notNull: true, description: 'Sender profile country.' },
      { name: 'target_country', type: 'TEXT', notNull: true, description: 'Recipient country. Different from source_country.' },
      { name: 'payout_method', type: 'TEXT', notNull: true, description: 'bank, balance, or card.' },
    ],
  },
  {
    name: 'fx_rates',
    description: 'Daily mid-market rates for 2024, quote currency per 1 unit of base currency. Synthetic, not a dealing price.',
    primaryKey: ['rate_date', 'base_currency', 'quote_currency'],
    columns: [
      { name: 'rate_date', type: 'TEXT', notNull: true, description: 'YYYY-MM-DD.' },
      { name: 'base_currency', type: 'TEXT', notNull: true, description: 'Source side of the pair.' },
      { name: 'quote_currency', type: 'TEXT', notNull: true, description: 'Target side of the pair.' },
      { name: 'mid_rate', type: 'REAL', notNull: true, description: 'Quote units per 1 base unit.' },
    ],
  },
  {
    name: 'card_transactions',
    description: 'Card spend on a Wise-style balance. A logical duplicate repeats user, merchant, amount, currency, and timestamp.',
    primaryKey: ['txn_id'],
    columns: [
      { name: 'txn_id', type: 'INTEGER', notNull: true, description: 'Surrogate key.' },
      { name: 'user_id', type: 'INTEGER', notNull: true, description: 'Cardholder.' },
      { name: 'account_id', type: 'INTEGER', notNull: false, description: 'Account that was charged.' },
      { name: 'merchant_name', type: 'TEXT', notNull: true, description: 'Merchant display name.' },
      { name: 'mcc', type: 'TEXT', notNull: true, description: 'Merchant category code.' },
      { name: 'amount_cents', type: 'INTEGER', notNull: true, description: 'Charge in minor units.' },
      { name: 'currency', type: 'TEXT', notNull: true, description: 'ISO 4217 code.' },
      { name: 'country', type: 'TEXT', notNull: true, description: 'Merchant country.' },
      { name: 'status', type: 'TEXT', notNull: true, description: 'approved, declined, or refunded.' },
      { name: 'created_at', type: 'TEXT', notNull: true, description: 'UTC timestamp.' },
    ],
  },
  {
    name: 'funnel_events',
    description: 'Signup and KYC events. The same event_name can repeat for one user, and timestamps are sometimes out of order.',
    primaryKey: ['event_id'],
    columns: [
      { name: 'event_id', type: 'INTEGER', notNull: true, description: 'Surrogate key.' },
      { name: 'user_id', type: 'INTEGER', notNull: true, description: 'Customer.' },
      { name: 'event_name', type: 'TEXT', notNull: true, description: 'signup_started, email_verified, kyc_submitted, kyc_approved, or kyc_rejected.' },
      { name: 'event_at', type: 'TEXT', notNull: true, description: 'UTC timestamp.' },
      { name: 'platform', type: 'TEXT', notNull: false, description: 'ios, android, web, or NULL.' },
    ],
  },
];

export function createSql(tables = TABLES) {
  return tables
    .map((table) => {
      const lines = table.columns.map((column) => {
        let line = `  ${column.name} ${column.type}${column.notNull ? ' NOT NULL' : ''}`;
        if (table.primaryKey?.length === 1 && table.primaryKey[0] === column.name) {
          line += ' PRIMARY KEY';
        }
        return line;
      });
      if (table.primaryKey?.length > 1) {
        lines.push(`  PRIMARY KEY (${table.primaryKey.join(', ')})`);
      }
      return `CREATE TABLE ${table.name} (\n${lines.join(',\n')}\n);`;
    })
    .join('\n');
}
