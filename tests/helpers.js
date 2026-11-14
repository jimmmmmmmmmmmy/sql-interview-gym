import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { populate, tableCounts } from '../src/seed.js';

const require = createRequire(import.meta.url);

let sqlPromise;

export function loadSql() {
  sqlPromise ??= (async () => {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    return initSqlJs({ wasmBinary: readFileSync(wasmPath) });
  })();
  return sqlPromise;
}

export async function makeDb() {
  const SQL = await loadSql();
  const db = new SQL.Database();
  populate(db);
  return db;
}

export { tableCounts };
