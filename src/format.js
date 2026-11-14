export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function formatCell(value) {
  if (value === null || value === undefined) return { text: 'NULL', nullish: true };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { text: String(value), nullish: false };
    if (Number.isInteger(value)) return { text: String(value), nullish: false };
    return { text: String(Math.round(value * 1e6) / 1e6), nullish: false };
  }
  return { text: String(value), nullish: false };
}

export function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatElapsed(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
