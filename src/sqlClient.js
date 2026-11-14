import { executeSelect } from './execute.js';
import { populate, tableCounts } from './seed.js';

function createWorkerClient() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sql.worker.js', import.meta.url), { type: 'module' });
    const pending = new Map();
    let seq = 0;
    let settled = false;
    const initTimer = setTimeout(() => failInit('SQLite took too long to start.'), 30000);

    function failInit(message) {
      if (settled) return;
      settled = true;
      clearTimeout(initTimer);
      worker.terminate();
      reject(new Error(message));
    }

    worker.onerror = (event) => {
      if (!settled) failInit(event.message || 'The SQL worker failed to start.');
    };

    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'ready') {
        if (settled) return;
        settled = true;
        clearTimeout(initTimer);
        resolve({
          counts: message.counts,
          destroy() {
            worker.terminate();
          },
          query(sql) {
            const requestId = ++seq;
            return new Promise((resolveQuery, rejectQuery) => {
              const timer = setTimeout(() => {
                pending.delete(requestId);
                rejectQuery(new Error('Query timed out after 8 seconds. It may be an accidental cross join. Each run uses a fresh copy of the seed.'));
              }, 8000);
              pending.set(requestId, { resolve: resolveQuery, timer });
              worker.postMessage({ type: 'query', requestId, sql });
            });
          },
        });
        return;
      }
      if (message.type === 'init-error') {
        failInit(message.message || 'SQLite failed to start.');
        return;
      }
      if (message.type === 'result') {
        const waiter = pending.get(message.requestId);
        if (!waiter) return;
        clearTimeout(waiter.timer);
        pending.delete(message.requestId);
        waiter.resolve(message.result);
      }
    };

    worker.postMessage({ type: 'init' });
  });
}

async function createLocalClient() {
  const initSqlJs = (await import('sql.js')).default;
  const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database();
  populate(db);
  const snapshot = db.export();
  const counts = tableCounts(db);
  db.close();
  return {
    counts,
    destroy() {},
    query(sql) {
      const copy = new SQL.Database(snapshot);
      const started = performance.now();
      try {
        const result = executeSelect(copy, sql);
        result.ms = Math.round(performance.now() - started);
        return result;
      } finally {
        copy.close();
      }
    },
  };
}

export async function startSql() {
  let current;
  try {
    current = await createWorkerClient();
  } catch (err) {
    console.warn('SQL worker unavailable, running on the page thread.', err);
    current = await createLocalClient();
  }
  return {
    get counts() {
      return current.counts;
    },
    async query(sql) {
      try {
        return await current.query(sql);
      } catch (err) {
        if (!/timed out/i.test(err.message || '')) throw err;
        try {
          current.destroy();
        } catch {
          // The worker may already be gone.
        }
        current = await createWorkerClient().catch(() => createLocalClient());
        throw err;
      }
    },
  };
}
