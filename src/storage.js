const KEY = 'sql-interview-gym-v1';

function empty() {
  return { version: 1, practice: {}, interview: null, history: [] };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return empty();
    parsed.practice ??= {};
    parsed.history ??= [];
    return parsed;
  } catch {
    return empty();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode and full disks should not break the gym.
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore.
  }
}
