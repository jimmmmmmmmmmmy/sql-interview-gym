import { createSql, TABLES } from './schema.js';
import { intBetween, mulberry32, shuffle } from './rng.js';

export const SEED = 20241114;
const USER_COUNT = 640;

const COUNTRIES = [
  { code: 'GB', currency: 'GBP', quota: 120 },
  { code: 'DE', currency: 'EUR', quota: 40 },
  { code: 'FR', currency: 'EUR', quota: 36 },
  { code: 'ES', currency: 'EUR', quota: 28 },
  { code: 'IT', currency: 'EUR', quota: 24 },
  { code: 'NL', currency: 'EUR', quota: 20 },
  { code: 'IE', currency: 'EUR', quota: 16 },
  { code: 'PL', currency: 'PLN', quota: 28 },
  { code: 'RO', currency: 'RON', quota: 16 },
  { code: 'HU', currency: 'HUF', quota: 12 },
  { code: 'US', currency: 'USD', quota: 56 },
  { code: 'CA', currency: 'CAD', quota: 20 },
  { code: 'BR', currency: 'BRL', quota: 36 },
  { code: 'MX', currency: 'MXN', quota: 20 },
  { code: 'IN', currency: 'INR', quota: 40 },
  { code: 'SG', currency: 'SGD', quota: 18 },
  { code: 'AU', currency: 'AUD', quota: 28 },
  { code: 'AE', currency: 'AED', quota: 20 },
  { code: 'NG', currency: 'NGN', quota: 20 },
  { code: 'PH', currency: 'PHP', quota: 24 },
  { code: 'JP', currency: 'JPY', quota: 18 },
];

const COUNTRY = Object.fromEntries(COUNTRIES.map((country) => [country.code, country]));

// Synthetic units of each currency per 1 USD. Roughly 2024-like, not a market rate.
const PER_USD = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.78,
  AUD: 1.52,
  CAD: 1.36,
  SGD: 1.34,
  AED: 3.67,
  PLN: 3.95,
  RON: 4.57,
  BRL: 5.05,
  MXN: 17.2,
  INR: 83.4,
  PHP: 56.2,
  JPY: 151,
  HUF: 362,
  NGN: 1450,
};

const FIRST = [
  'Ava', 'Noah', 'Mia', 'Leo', 'Sofia', 'Omar', 'Priya', 'Jonas', 'Elena', 'Hugo',
  'Amira', 'Luca', 'Nina', 'Kai', 'Fatima', 'Owen', 'Isha', 'Mateo', 'Hana', 'Yuri',
  'Chloe', 'Adam', 'Leila', 'Theo', 'Sara', 'Ivan', 'Noor', 'Felix', 'Aisha', 'Marko',
  'Ines', 'Ravi', 'Emma', 'Luis', 'Anya', 'Kenji',
];

const LAST = [
  'Nguyen', 'Silva', 'Kowalski', 'Nowak', 'Rossi', 'Bernard', 'Keller', 'Patel', 'Ionescu', 'Nagy',
  'Santos', 'Almeida', 'Cohen', 'Diallo', 'Okeke', 'Reyes', 'Tanaka', 'Fischer', 'Dubois', 'Horvath',
  'Singh', 'Garcia', 'Martin', 'Novak', 'Kim', 'Brown', 'Wright', 'Costa', 'Moreau', 'Ibrahim',
  'Rossi', 'Berg', 'Santos', 'Khan', 'Vogel', 'Park',
];

const HOT_DESTINATIONS = ['IN', 'PH', 'NG', 'PL', 'MX', 'BR', 'GB', 'FR', 'DE', 'US', 'AU', 'ES'];

const MERCHANTS = [
  ['Tesco', '5411'],
  ['Uber', '4121'],
  ['Amazon', '5999'],
  ['Spotify', '5815'],
  ['Netflix', '4899'],
  ['Pret', '5812'],
  ['Starbucks', '5812'],
  ['Shell', '5541'],
  ['Airbnb', '7011'],
  ['Apple', '5734'],
  ['Grab', '4121'],
  ['Carrefour', '5411'],
  ['Mercado Livre', '5999'],
  ['7-Eleven', '5411'],
  ['Local Market', '5411'],
  ['City Transport', '4111'],
  ['Bolt', '4121'],
  ['Lidl', '5411'],
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatUtc(ms) {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function addMinutes(iso, minutes) {
  const ms = Date.parse(iso.replace(' ', 'T') + 'Z') + minutes * 60000;
  return formatUtc(ms);
}

function midRate(dateStr, base, quote) {
  if (base === quote) return 1;
  const basePerUsd = PER_USD[base];
  const quotePerUsd = PER_USD[quote];
  if (!basePerUsd || !quotePerUsd) {
    throw new Error(`Missing FX constant for ${base}/${quote}`);
  }
  const month = Number(dateStr.slice(5, 7));
  const day = Number(dateStr.slice(8, 10));
  const wobble = Math.sin((month * 31 + day + base.charCodeAt(0) * 5 + quote.charCodeAt(0) * 3) * 0.37) * 0.012;
  return Math.round((quotePerUsd / basePerUsd) * (1 + wobble) * 1e6) / 1e6;
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function yearDays(year) {
  const days = [];
  for (let month = 0; month < 12; month += 1) {
    const last = daysInMonth(year, month);
    for (let day = 1; day <= last; day += 1) {
      days.push(`${year}-${pad(month + 1)}-${pad(day)}`);
    }
  }
  return days;
}

function pickTarget(rng, source) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = rng() < 0.7
      ? HOT_DESTINATIONS[Math.floor(rng() * HOT_DESTINATIONS.length)]
      : COUNTRIES[Math.floor(rng() * COUNTRIES.length)].code;
    if (code !== source) return code;
  }
  return source === 'GB' ? 'IN' : 'GB';
}

function amountCents(rng) {
  const min = Math.log(2000);
  const max = Math.log(1500000);
  return Math.max(500, Math.round(Math.exp(min + rng() * (max - min))));
}

function pickStatus(rng) {
  const roll = rng();
  if (roll < 0.74) return 'completed';
  if (roll < 0.81) return 'refunded';
  if (roll < 0.87) return 'failed';
  if (roll < 0.93) return 'cancelled';
  return 'pending';
}

function payoutMethod(rng) {
  const roll = rng();
  if (roll < 0.62) return 'bank';
  if (roll < 0.9) return 'balance';
  return 'card';
}

function platformFor(rng) {
  const roll = rng();
  if (roll < 0.05) return null;
  if (roll < 0.42) return 'ios';
  if (roll < 0.74) return 'android';
  return 'web';
}

function transferCount(rng) {
  const roll = rng();
  if (roll < 0.15) return intBetween(rng, 2, 3);
  if (roll < 0.45) return intBetween(rng, 4, 6);
  if (roll < 0.8) return intBetween(rng, 7, 10);
  return intBetween(rng, 11, 16);
}

function buildDataset() {
  const quota = COUNTRIES.reduce((sum, country) => sum + country.quota, 0);
  if (quota !== USER_COUNT) {
    throw new Error(`Country quotas sum to ${quota}, expected ${USER_COUNT}`);
  }
  const rng = mulberry32(SEED);
  const codes = shuffle(rng, COUNTRIES.flatMap((country) => Array(country.quota).fill(country.code)));
  const users = codes.map((code, index) => {
    const userId = index + 1;
    const signupMs = userId <= 48
      ? Date.UTC(2024, 0, 2, 8, 0, 0) + Math.floor(rng() * (Date.UTC(2024, 0, 8, 20, 0, 0) - Date.UTC(2024, 0, 2, 8, 0, 0)))
      : Date.UTC(2024, 0, 10) + Math.floor(rng() * (Date.UTC(2024, 11, 20) - Date.UTC(2024, 0, 10)));
    let referredBy = null;
    const channelRoll = rng();
    let channel = channelRoll < 0.55 ? 'organic' : channelRoll < 0.85 ? 'paid' : 'partner';
    if (userId > 80 && rng() < 0.22) {
      referredBy = 1 + Math.floor(rng() * Math.min(60, userId - 1));
      channel = 'referral';
    }
    const dob = rng() < 0.08
      ? null
      : `${intBetween(rng, 1965, 2000)}-${pad(intBetween(rng, 1, 12))}-${pad(intBetween(rng, 1, 28))}`;
    return {
      user_id: userId,
      full_name: `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`,
      country: code,
      signup_at: formatUtc(signupMs),
      signupMs,
      kyc_status: 'not_started',
      acquisition_channel: channel,
      referred_by_user_id: referredBy,
      date_of_birth: dob,
      currency: COUNTRY[code].currency,
    };
  });

  for (const referrerId of [1, 2, 3]) {
    let count = users.filter((user) => user.referred_by_user_id === referrerId).length;
    for (const user of users) {
      if (count >= 5) break;
      if (user.user_id > 100 && user.referred_by_user_id == null) {
        user.referred_by_user_id = referrerId;
        user.acquisition_channel = 'referral';
        count += 1;
      }
    }
  }

  const events = [];
  let eventId = 1;
  const pushEvent = (user, name, ms) => {
    events.push({
      event_id: eventId,
      user_id: user.user_id,
      event_name: name,
      event_at: formatUtc(ms),
      platform: platformFor(rng),
    });
    eventId += 1;
  };

  for (const user of users) {
    let cursor = user.signupMs;
    pushEvent(user, 'signup_started', cursor);
    if (user.user_id <= 48) {
      cursor += (30 + intBetween(rng, 0, 120)) * 60000;
      pushEvent(user, 'email_verified', cursor);
      cursor += (12 * 60 + intBetween(rng, 0, 12 * 60)) * 60000;
      pushEvent(user, 'kyc_submitted', cursor);
      cursor += (8 * 60 + intBetween(rng, 0, 24 * 60)) * 60000;
      pushEvent(user, 'kyc_approved', cursor);
      user.kyc_status = 'approved';
      continue;
    }
    if (rng() < 0.1) continue;
    cursor += intBetween(rng, 15, 600) * 60000;
    pushEvent(user, 'email_verified', cursor);
    if (rng() < 0.18) continue;
    cursor += intBetween(rng, 60, 60 * 24 * 5) * 60000;
    pushEvent(user, 'kyc_submitted', cursor);
    const roll = rng();
    if (roll < 0.78) {
      cursor += intBetween(rng, 30, 60 * 24 * 3) * 60000;
      pushEvent(user, 'kyc_approved', cursor);
      user.kyc_status = 'approved';
    } else if (roll < 0.92) {
      cursor += intBetween(rng, 30, 60 * 48) * 60000;
      pushEvent(user, 'kyc_rejected', cursor);
      user.kyc_status = 'rejected';
    } else {
      user.kyc_status = 'pending';
    }
  }

  let swapped = 0;
  for (const user of users) {
    if (swapped >= 8) break;
    if (user.user_id <= 48 || user.user_id % 9 === 0 || user.kyc_status !== 'approved') continue;
    const submitted = events.find((event) => event.user_id === user.user_id && event.event_name === 'kyc_submitted');
    const approved = events.find((event) => event.user_id === user.user_id && event.event_name === 'kyc_approved');
    if (!submitted || !approved) continue;
    const stamp = submitted.event_at;
    submitted.event_at = approved.event_at;
    approved.event_at = stamp;
    swapped += 1;
  }
  if (swapped < 8) throw new Error(`Only swapped ${swapped} KYC timestamps`);

  for (const user of users) {
    if (user.user_id % 9 !== 0) continue;
    const submitted = events.find((event) => event.user_id === user.user_id && event.event_name === 'kyc_submitted');
    if (!submitted) continue;
    events.push({
      event_id: eventId,
      user_id: user.user_id,
      event_name: 'kyc_submitted',
      event_at: addMinutes(submitted.event_at, 60 * 26),
      platform: submitted.platform,
    });
    eventId += 1;
  }

  const accounts = [];
  const accountsByUser = new Map();
  let accountId = 1;
  const currencies = [...new Set(COUNTRIES.map((country) => country.currency))];
  for (const user of users) {
    const home = {
      account_id: accountId,
      user_id: user.user_id,
      currency: user.currency,
      status: user.user_id > 40 && rng() < 0.08 ? 'frozen' : 'open',
      opened_at: user.signup_at,
      closed_at: null,
    };
    accountId += 1;
    const list = [home];
    accounts.push(home);
    if (rng() < 0.42) {
      const choices = currencies.filter((currency) => currency !== user.currency);
      const openedMs = user.signupMs + intBetween(rng, 2, 60) * 86400000;
      const extra = {
        account_id: accountId,
        user_id: user.user_id,
        currency: choices[Math.floor(rng() * choices.length)],
        status: 'open',
        opened_at: formatUtc(openedMs),
        closed_at: null,
      };
      accountId += 1;
      accounts.push(extra);
      list.push(extra);
    }
    accountsByUser.set(user.user_id, list);
  }
  for (const user of users) {
    if (user.user_id > 40) continue;
    const list = accountsByUser.get(user.user_id);
    const home = list[0];
    const openedMs = user.signupMs + intBetween(rng, 12, 40) * 86400000;
    home.status = 'closed';
    home.closed_at = formatUtc(openedMs);
    const replacement = {
      account_id: accountId,
      user_id: user.user_id,
      currency: user.currency,
      status: 'open',
      opened_at: formatUtc(openedMs),
      closed_at: null,
    };
    accountId += 1;
    accounts.push(replacement);
    list.push(replacement);
  }

  const transfers = [];
  let transferId = 1;
  const endMs = Date.UTC(2024, 11, 31, 20, 0, 0);

  function addTransfer(user, options = {}) {
    const list = accountsByUser.get(user.user_id);
    const account = list[Math.floor(rng() * list.length)];
    let createdMs = options.createdMs ?? null;
    if (options.month) {
      const start = Date.UTC(2024, options.month - 1, 1);
      const monthEnd = Date.UTC(2024, options.month, 1) - 1000;
      const from = Math.max(start, user.signupMs + 3600000);
      if (from > monthEnd) return null;
      createdMs = from + Math.floor(rng() * (monthEnd - from));
    } else if (createdMs == null) {
      const from = user.signupMs + 3600000;
      if (from >= endMs) return null;
      createdMs = from + Math.floor(rng() * (endMs - from));
    }
    const createdAt = formatUtc(createdMs);
    const status = options.forceStatus || pickStatus(rng);
    const completedAt = status === 'completed' || status === 'refunded'
      ? formatUtc(createdMs + intBetween(rng, 10, 36 * 60) * 60000)
      : null;
    const targetCountry = pickTarget(rng, user.country);
    const sourceCurrency = account.currency;
    const targetCurrency = COUNTRY[targetCountry].currency;
    const sourceAmount = amountCents(rng);
    const mid = midRate(createdAt.slice(0, 10), sourceCurrency, targetCurrency);
    const fxRoll = rng();
    let fxRate = Math.round(mid * 1.004 * 1e6) / 1e6;
    if (fxRoll < 0.06) fxRate = Math.round(mid * 1.05 * 1e6) / 1e6;
    else if (fxRoll < 0.085) fxRate = null;
    const feeRoll = rng();
    let fee = Math.max(30, Math.round(sourceAmount * (0.004 + rng() * 0.004) + 40 + rng() * 120));
    if (feeRoll < 0.045) fee = null;
    else if (feeRoll < 0.08) fee = 0;
    const row = {
      transfer_id: transferId,
      user_id: user.user_id,
      source_account_id: account.account_id,
      source_currency: sourceCurrency,
      target_currency: targetCurrency,
      source_amount_cents: sourceAmount,
      target_amount_cents: fxRate == null ? null : Math.max(1, Math.round(sourceAmount * fxRate)),
      fee_cents: fee,
      fx_rate: fxRate,
      status,
      created_at: createdAt,
      completed_at: completedAt,
      source_country: user.country,
      target_country: targetCountry,
      payout_method: payoutMethod(rng),
      quality: Boolean(options.quality),
    };
    transferId += 1;
    transfers.push(row);
    return row;
  }

  for (const user of users) {
    if (user.kyc_status !== 'approved' || user.user_id > 590) continue;
    if (rng() >= 0.92) continue;
    const count = transferCount(rng);
    for (let i = 0; i < count; i += 1) addTransfer(user);
  }

  const mismatchPool = users.filter((user) => user.user_id <= 590 && user.kyc_status !== 'approved');
  if (mismatchPool.length < 12) throw new Error('Not enough non-approved users for KYC mismatches');
  for (let i = 0; i < 12; i += 1) {
    if (!addTransfer(mismatchPool[i], { forceStatus: 'completed', quality: true })) {
      throw new Error('Failed to place a KYC-mismatch transfer');
    }
  }

  function ensureStatus(predicate, mutate, minimum) {
    let count = transfers.filter(predicate).length;
    if (count >= minimum) return;
    for (const transfer of transfers) {
      if (count >= minimum) return;
      if (transfer.status === 'completed' && !transfer.quality && mutate(transfer)) count += 1;
    }
  }

  ensureStatus(
    (transfer) => (transfer.status === 'failed' || transfer.status === 'cancelled') && transfer.source_amount_cents >= 100000,
    (transfer) => {
      if (transfer.source_amount_cents < 100000) return false;
      transfer.status = 'failed';
      transfer.completed_at = null;
      return true;
    },
    8,
  );
  ensureStatus(
    (transfer) => transfer.status === 'refunded',
    (transfer) => {
      if (!transfer.completed_at) return false;
      transfer.status = 'refunded';
      return true;
    },
    30,
  );
  ensureStatus(
    (transfer) => transfer.fee_cents == null,
    (transfer) => {
      transfer.fee_cents = null;
      return true;
    },
    20,
  );

  const isOutlier = (transfer) => {
    if (transfer.status !== 'completed' || transfer.fx_rate == null) return false;
    const mid = midRate(transfer.created_at.slice(0, 10), transfer.source_currency, transfer.target_currency);
    return Math.abs(transfer.fx_rate - mid) / mid > 0.02;
  };
  let outliers = transfers.filter(isOutlier).length;
  if (outliers < 25) {
    for (const transfer of transfers) {
      if (outliers >= 25) break;
      if (transfer.status !== 'completed' || transfer.fx_rate == null || isOutlier(transfer)) continue;
      const mid = midRate(transfer.created_at.slice(0, 10), transfer.source_currency, transfer.target_currency);
      transfer.fx_rate = Math.round(mid * 1.05 * 1e6) / 1e6;
      transfer.target_amount_cents = Math.max(1, Math.round(transfer.source_amount_cents * transfer.fx_rate));
      outliers += 1;
    }
  }

  const fillers = users.filter((user) => user.user_id <= 48 && user.kyc_status === 'approved');
  if (fillers.length < 10) throw new Error('Not enough early approved users');
  for (let month = 1; month <= 12; month += 1) {
    const key = `2024-${pad(month)}`;
    let guard = 0;
    while (transfers.filter((transfer) => transfer.status === 'completed' && transfer.created_at.startsWith(key)).length < 30) {
      guard += 1;
      if (guard > 80) throw new Error(`Could not fill ${key}`);
      const user = fillers[Math.floor(rng() * fillers.length)];
      if (!addTransfer(user, { forceStatus: 'completed', month })) {
        throw new Error(`Could not place a top-up transfer in ${key}`);
      }
    }
  }

  const completed = transfers.filter((transfer) => transfer.status === 'completed');
  completed[0].fee_cents = null;
  completed[1].fee_cents = 0;
  completed[2].fee_cents = 450;
  completed[3].fee_cents = 2400;

  const cards = [];
  let txnId = 1;
  for (const user of users) {
    if (rng() >= 0.72) continue;
    const list = accountsByUser.get(user.user_id);
    const count = intBetween(rng, 1, 5);
    for (let i = 0; i < count; i += 1) {
      const account = list[Math.floor(rng() * list.length)];
      const merchant = MERCHANTS[Math.floor(rng() * MERCHANTS.length)];
      const from = user.signupMs + 3600000;
      const createdMs = from >= endMs ? user.signupMs : from + Math.floor(rng() * (endMs - from));
      const roll = rng();
      cards.push({
        txn_id: txnId,
        user_id: user.user_id,
        account_id: account.account_id,
        merchant_name: merchant[0],
        mcc: merchant[1],
        amount_cents: intBetween(rng, 150, 25000),
        currency: account.currency,
        country: rng() < 0.8 ? user.country : pickTarget(rng, user.country),
        status: roll < 0.12 ? 'declined' : roll < 0.17 ? 'refunded' : 'approved',
        created_at: formatUtc(createdMs),
      });
      txnId += 1;
    }
  }
  if (cards.length < 30) throw new Error('Not enough card transactions to clone');
  for (const card of cards.slice(0, 30)) {
    cards.push({ ...card, txn_id: txnId });
    txnId += 1;
  }

  const pairs = [...new Set(transfers.map((transfer) => `${transfer.source_currency}|${transfer.target_currency}`))].sort();
  const fxRates = [];
  for (const pair of pairs) {
    const [base, quote] = pair.split('|');
    for (const day of yearDays(2024)) {
      fxRates.push({
        rate_date: day,
        base_currency: base,
        quote_currency: quote,
        mid_rate: midRate(day, base, quote),
      });
    }
  }

  return { users, accounts, transfers, fxRates, cards, events };
}

function insertRows(db, tableName, objects) {
  const columns = TABLES.find((table) => table.name === tableName).columns;
  const sql = `INSERT INTO ${tableName} (${columns.map((column) => column.name).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  const stmt = db.prepare(sql);
  for (const object of objects) {
    stmt.run(columns.map((column) => {
      if (!Object.prototype.hasOwnProperty.call(object, column.name) || object[column.name] === undefined) {
        throw new Error(`${tableName}.${column.name} is missing`);
      }
      return object[column.name];
    }));
  }
  stmt.free();
}

let cachedDataset;

function dataset() {
  cachedDataset ??= buildDataset();
  return cachedDataset;
}

export function populate(db) {
  const data = dataset();
  db.exec(createSql());
  db.run('BEGIN');
  insertRows(db, 'users', data.users);
  insertRows(db, 'accounts', data.accounts);
  insertRows(db, 'transfers', data.transfers);
  insertRows(db, 'fx_rates', data.fxRates);
  insertRows(db, 'card_transactions', data.cards);
  insertRows(db, 'funnel_events', data.events);
  db.run('COMMIT');
  db.exec(`
    CREATE INDEX idx_transfers_user ON transfers(user_id, status);
    CREATE INDEX idx_transfers_created ON transfers(created_at);
    CREATE INDEX idx_events_user ON funnel_events(user_id, event_name);
    CREATE INDEX idx_accounts_user ON accounts(user_id);
    CREATE INDEX idx_card_user ON card_transactions(user_id);
  `);
}

export function tableCounts(db) {
  const counts = {};
  for (const table of TABLES) {
    const result = db.exec(`SELECT COUNT(*) FROM ${table.name}`);
    counts[table.name] = result[0].values[0][0];
  }
  return counts;
}
