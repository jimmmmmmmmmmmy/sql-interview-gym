const ABS_TOLERANCE = 0.02;
const REL_TOLERANCE = 1e-4;

function normalizeCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) return numeric;
    }
    return trimmed;
  }
  return value;
}

function normalizeRow(row) {
  return row.map(normalizeCell);
}

function cellsEqual(left, right) {
  if (left === null || right === null) return left === right;
  if (typeof left === 'number' && typeof right === 'number') {
    const diff = Math.abs(left - right);
    const scale = Math.max(Math.abs(left), Math.abs(right));
    return diff <= ABS_TOLERANCE || diff <= scale * REL_TOLERANCE;
  }
  return left === right;
}

function rowsEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (!cellsEqual(left[i], right[i])) return false;
  }
  return true;
}

function show(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 1e6) / 1e6);
  }
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function showRow(row) {
  if (!row) return '(none)';
  return `(${row.map(show).join(', ')})`;
}

function matchMultisets(expected, actual) {
  const pool = actual.map((row) => ({ row, used: false }));
  const buckets = new Map();
  for (const item of pool) {
    const key = JSON.stringify(item.row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  const pending = [];
  for (const row of expected) {
    const hit = buckets.get(JSON.stringify(row))?.pop();
    if (hit) hit.used = true;
    else pending.push(row);
  }
  for (const row of pending) {
    const hit = pool.find((item) => !item.used && rowsEqual(item.row, row));
    if (!hit) {
      const leftover = pool.find((item) => !item.used);
      return { ok: false, expectedRow: row, actualRow: leftover ? leftover.row : null };
    }
    hit.used = true;
  }
  return { ok: true };
}

function passed(rowCount) {
  const noun = rowCount === 1 ? 'row matches' : 'rows match';
  return { correct: true, message: `Correct. ${rowCount} ${noun}.` };
}

export function grade(actual, expected, options = {}) {
  const orderSensitive = Boolean(options.orderSensitive);
  if (!actual || actual.error) {
    return {
      correct: false,
      message: actual?.error ? `SQLite error: ${actual.error}` : 'Query failed.',
    };
  }
  if (!expected || expected.error) {
    return { correct: false, message: 'Reference solution failed to run.' };
  }
  if (expected.columns.length !== actual.columns.length) {
    return {
      correct: false,
      message: `Expected ${expected.columns.length} columns and got ${actual.columns.length}.`,
    };
  }
  const expectedRows = expected.values.map(normalizeRow);
  const actualRows = actual.values.map(normalizeRow);
  if (expectedRows.length !== actualRows.length) {
    return {
      correct: false,
      message: `Expected ${expectedRows.length} rows and got ${actualRows.length}.`,
    };
  }
  if (orderSensitive) {
    for (let i = 0; i < expectedRows.length; i += 1) {
      if (rowsEqual(expectedRows[i], actualRows[i])) continue;
      if (matchMultisets(expectedRows, actualRows).ok) {
        return {
          correct: false,
          message: `Values match, but row order differs at row ${i + 1}.`,
        };
      }
      let column = 0;
      for (let c = 0; c < expectedRows[i].length; c += 1) {
        if (!cellsEqual(expectedRows[i][c], actualRows[i][c])) {
          column = c;
          break;
        }
      }
      return {
        correct: false,
        message: `Row ${i + 1}, column ${column + 1} does not match. Expected ${show(expected.values[i][column])}, got ${show(actual.values[i][column])}.`,
      };
    }
    return passed(expectedRows.length);
  }
  const matched = matchMultisets(expectedRows, actualRows);
  if (!matched.ok) {
    return {
      correct: false,
      message: `A row is missing or unexpected. One expected row that was not found: ${showRow(matched.expectedRow)}. One returned row that was not expected: ${showRow(matched.actualRow)}.`,
    };
  }
  return passed(expectedRows.length);
}
