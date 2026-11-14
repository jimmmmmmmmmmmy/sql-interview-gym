import { TABLES } from './schema.js';

const ALLOWED = new Set(TABLES.map((table) => table.name));

export function executeSelect(db, sql) {
  const text = String(sql ?? '').trim();
  if (!text) {
    return { columns: [], values: [], error: 'Write a SELECT query first.' };
  }
  let results;
  try {
    results = db.exec(text);
  } catch (err) {
    const message = String(err?.message || err).replace(/^Error:\s*/, '');
    return { columns: [], values: [], error: message };
  }
  const tables = (results || []).filter((result) => Array.isArray(result.columns));
  if (!tables.length) {
    return {
      columns: [],
      values: [],
      error: 'That ran, but it did not return a table. Finish with a SELECT.',
    };
  }
  const last = tables[tables.length - 1];
  return { columns: last.columns, values: last.values, error: null };
}

export function sampleQuery(tableName) {
  if (!ALLOWED.has(tableName)) {
    throw new Error('Unknown table.');
  }
  return `SELECT * FROM ${tableName} LIMIT 5`;
}
