import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The package's browser entry looks for a different wasm file. Pin the
// Node build and pass sql-wasm.wasm explicitly so GitHub Pages, which
// cannot set cross-origin isolation headers, can still boot SQLite.
export default defineConfig({
  base: '/sql-interview-gym/',
  resolve: {
    alias: [
      {
        find: /^sql\.js$/,
        replacement: fileURLToPath(new URL('./node_modules/sql.js/dist/sql-wasm.js', import.meta.url)),
      },
    ],
  },
  build: {
    target: 'es2022',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
