import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { executeSelect } from './execute.js';
import { populate, tableCounts } from './seed.js';

let SQL;
let snapshot;

self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      SQL = await initSqlJs({ locateFile: () => wasmUrl });
      const db = new SQL.Database();
      populate(db);
      snapshot = db.export();
      const counts = tableCounts(db);
      db.close();
      self.postMessage({ type: 'ready', counts });
      return;
    }
    if (message.type === 'query') {
      const db = new SQL.Database(snapshot);
      const started = performance.now();
      try {
        const result = executeSelect(db, message.sql);
        result.ms = Math.round(performance.now() - started);
        self.postMessage({ type: 'result', requestId: message.requestId, result });
      } finally {
        db.close();
      }
    }
  } catch (err) {
    const text = err?.message || String(err);
    if (message?.type === 'init') {
      self.postMessage({ type: 'init-error', message: text });
    } else {
      self.postMessage({
        type: 'result',
        requestId: message?.requestId,
        result: { columns: [], values: [], error: text, ms: 0 },
      });
    }
  }
};
