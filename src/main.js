import { mountEditor } from './editor.js';
import { grade } from './grader.js';
import { sampleQuery } from './execute.js';
import { INTERVIEW_MS, pickInterviewIds } from './interview.js';
import { questionById, QUESTIONS } from './questions.js';
import { render, renderQuestionList } from './render.js';
import { startSql } from './sqlClient.js';
import { clearState, loadState, saveState } from './storage.js';
import { formatRemaining } from './format.js';

const state = {
  mode: 'practice',
  practiceId: QUESTIONS[0].id,
  search: '',
  tierFilter: 'all',
  dataReady: false,
  loadError: null,
  counts: {},
  output: null,
  running: false,
  solutionOpen: false,
  followupsOpen: false,
  expectedOpen: false,
  editorFor: null,
  editorMode: null,
  syncing: false,
};

const store = loadState();
let client = null;
let editor = null;
let editorReady = false;
const expectedCache = new Map();

function saveStore() {
  saveState(store);
}

function ensurePractice(id) {
  if (!store.practice[id]) {
    store.practice[id] = { sql: '', solved: false, attempts: 0, hints: 0 };
  }
  return store.practice[id];
}

function currentAnswer() {
  const session = store.interview;
  if (!session || session.finished) return null;
  return session.answers[session.index] ?? null;
}

function displayedQuestionId() {
  if (!state.dataReady || state.loadError) return null;
  if (state.mode === 'practice') return state.practiceId;
  if (state.mode === 'interview' && store.interview && !store.interview.finished) {
    return store.interview.ids[store.interview.index];
  }
  return null;
}

function storedSql(id) {
  if (state.mode === 'interview' && store.interview) {
    const answer = store.interview.answers.find((item) => item.id === id);
    return answer?.sql?.trim() ? answer.sql : 'SELECT\n';
  }
  const record = store.practice[id];
  return record?.sql?.trim() ? record.sql : 'SELECT\n';
}

function saveCurrentEditor() {
  if (!editorReady || !state.editorFor || !editor) return;
  const sql = editor.get();
  if (state.editorMode === 'practice') {
    ensurePractice(state.editorFor).sql = sql;
  } else if (state.editorMode === 'interview' && store.interview) {
    const answer = store.interview.answers.find((item) => item.id === state.editorFor);
    if (answer) answer.sql = sql;
  }
  saveStore();
}

function syncEditor() {
  const id = displayedQuestionId();
  if (!id || !editor) return;
  if (state.editorFor === id && state.editorMode === state.mode) return;
  state.editorFor = id;
  state.editorMode = state.mode;
  state.syncing = true;
  editor.set(storedSql(id));
  state.syncing = false;
  editorReady = true;
  editor.refresh();
}

function viewModel() {
  const questionId = displayedQuestionId();
  const question = questionId ? questionById(questionId) : null;
  const record = question && state.mode === 'practice' ? store.practice[question.id] : null;
  const answer = state.mode === 'interview' ? currentAnswer() : null;
  const hintsShown = state.mode === 'interview' ? (answer?.hints ?? 0) : (record?.hints ?? 0);
  return {
    mode: state.mode,
    practiceId: state.practiceId,
    search: state.search,
    tierFilter: state.tierFilter,
    dataReady: state.dataReady,
    loadError: state.loadError,
    counts: state.counts,
    output: state.output,
    running: state.running,
    solutionOpen: state.solutionOpen,
    showFollowups: state.mode === 'interview' ? Boolean(answer?.submitted) : state.followupsOpen,
    expectedOpen: state.expectedOpen,
    session: store.interview,
    history: store.history,
    question,
    answer,
    hintsShown,
    attempts: record?.attempts ?? 0,
    note: answer?.note ?? '',
    solvedCurrent: Boolean(record?.solved),
    solved: Object.fromEntries(QUESTIONS.map((item) => [item.id, Boolean(store.practice[item.id]?.solved)])),
    solvedCount: QUESTIONS.filter((item) => store.practice[item.id]?.solved).length,
  };
}

function draw() {
  render(viewModel());
  if (!document.getElementById('workspace').hidden) {
    syncEditor();
    editor?.refresh();
  }
}

function readHash() {
  const parts = (location.hash || '#/practice').replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'interview') {
    state.mode = 'interview';
    return;
  }
  state.mode = 'practice';
  if (parts[1] && questionById(parts[1])) state.practiceId = parts[1];
}

function onHash() {
  saveCurrentEditor();
  readHash();
  state.editorFor = null;
  state.editorMode = null;
  state.output = null;
  state.solutionOpen = false;
  state.followupsOpen = false;
  state.expectedOpen = false;
  draw();
}

function finishInterview() {
  const session = store.interview;
  if (!session || session.finished) return;
  saveCurrentEditor();
  session.finished = true;
  session.finishedAt = Date.now();
  for (const answer of session.answers) {
    if (answer.correct !== true) answer.correct = false;
  }
  const score = session.answers.filter((answer) => answer.correct === true).length;
  store.history.unshift({
    finishedAt: session.finishedAt,
    score,
    total: session.answers.length,
    elapsedMs: Math.min(INTERVIEW_MS, session.finishedAt - session.startedAt),
    ids: session.ids.slice(),
  });
  store.history = store.history.slice(0, 8);
  saveStore();
  state.mode = 'interview';
  state.output = null;
  draw();
}

function startInterview() {
  if (store.interview && !store.interview.finished) {
    const abandon = window.confirm('Abandon the interview in progress and start a new one?');
    if (!abandon) return;
  }
  saveCurrentEditor();
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const ids = pickInterviewIds(seed);
  store.interview = {
    seed,
    ids,
    index: 0,
    startedAt: Date.now(),
    deadline: Date.now() + INTERVIEW_MS,
    finished: false,
    finishedAt: null,
    answers: ids.map((id) => ({
      id,
      sql: '',
      correct: null,
      submitted: false,
      skipped: false,
      hints: 0,
      note: '',
    })),
  };
  saveStore();
  state.output = null;
  state.solutionOpen = false;
  state.followupsOpen = false;
  state.expectedOpen = false;
  state.editorFor = null;
  state.editorMode = null;
  if ((location.hash || '') === '#/interview') {
    readHash();
    draw();
  } else {
    location.hash = '#/interview';
  }
}

function advance(skip) {
  const session = store.interview;
  if (!session || session.finished) return;
  saveCurrentEditor();
  const answer = session.answers[session.index];
  if (skip && answer.correct !== true) {
    answer.submitted = true;
    answer.skipped = true;
    answer.correct = false;
  }
  if (session.index >= session.ids.length - 1) {
    finishInterview();
    return;
  }
  session.index += 1;
  state.editorFor = null;
  state.editorMode = null;
  state.output = null;
  state.solutionOpen = false;
  state.followupsOpen = false;
  state.expectedOpen = false;
  saveStore();
  draw();
}

function showHint() {
  const question = questionById(displayedQuestionId());
  if (!question) return;
  if (state.mode === 'practice') {
    const record = ensurePractice(question.id);
    record.hints = Math.min(question.hints.length, record.hints + 1);
  } else {
    const answer = currentAnswer();
    if (!answer) return;
    answer.hints = Math.min(question.hints.length, (answer.hints || 0) + 1);
  }
  saveStore();
  draw();
}

async function expectedFor(question) {
  if (!expectedCache.has(question.id)) {
    expectedCache.set(question.id, client.query(question.solution));
  }
  const result = await expectedCache.get(question.id);
  if (result.error) expectedCache.delete(question.id);
  return result;
}

async function run(submit) {
  if (state.running || !client) return;
  const question = questionById(displayedQuestionId());
  if (!question) return;
  saveCurrentEditor();
  state.running = true;
  state.output = { kind: 'pending' };
  draw();
  const sql = editor.get();
  try {
    const actual = await client.query(sql);
    if (state.mode === 'interview' && store.interview?.finished) return;
    if (!submit) {
      state.output = actual.error
        ? { kind: 'error', message: `SQLite error: ${actual.error}` }
        : { kind: 'table', ...actual, label: 'Result' };
      return;
    }
    const expected = await expectedFor(question);
    const graded = grade(actual, expected, { orderSensitive: question.orderSensitive });
    if (state.mode === 'practice') {
      const record = ensurePractice(question.id);
      record.attempts += 1;
      record.sql = sql;
      if (graded.correct) record.solved = true;
    } else if (store.interview && !store.interview.finished) {
      const answer = currentAnswer();
      answer.submitted = true;
      answer.skipped = false;
      answer.correct = graded.correct;
      answer.sql = sql;
    }
    state.followupsOpen = true;
    saveStore();
    state.output = {
      kind: 'grade',
      graded,
      columns: actual.columns || [],
      values: actual.values || [],
      ms: actual.ms,
      expected,
    };
  } catch (err) {
    state.output = { kind: 'error', message: err.message || String(err) };
  } finally {
    state.running = false;
    draw();
    if (window.innerWidth < 1100) {
      document.getElementById('results')?.scrollIntoView({ block: 'nearest' });
    }
  }
}

async function sample(tableName) {
  if (!client || state.running) return;
  state.running = true;
  state.output = { kind: 'pending' };
  draw();
  try {
    const actual = await client.query(sampleQuery(tableName));
    state.output = actual.error
      ? { kind: 'error', message: `SQLite error: ${actual.error}` }
      : { kind: 'table', ...actual, label: `Sample of ${tableName}` };
  } catch (err) {
    state.output = { kind: 'error', message: err.message || String(err) };
  } finally {
    state.running = false;
    draw();
  }
}

function openPractice(id) {
  if (!questionById(id)) return;
  saveCurrentEditor();
  state.output = null;
  state.solutionOpen = false;
  state.followupsOpen = false;
  state.expectedOpen = false;
  state.editorFor = null;
  state.editorMode = null;
  const next = `#/practice/${id}`;
  if (location.hash === next) {
    readHash();
    draw();
  } else {
    location.hash = next;
  }
}

function resetProgress() {
  const ok = window.confirm('Clear solved questions, drafts, and interview history on this browser?');
  if (!ok) return;
  clearState();
  location.reload();
}

async function bootDatabase() {
  state.dataReady = false;
  state.loadError = null;
  draw();
  try {
    client = await startSql();
    state.counts = client.counts;
    state.dataReady = true;
  } catch (err) {
    state.loadError = err.message || String(err);
  }
  draw();
}

function tick() {
  const session = store.interview;
  if (!session || session.finished || state.mode !== 'interview') return;
  const left = session.deadline - Date.now();
  if (left <= 0) {
    finishInterview();
    return;
  }
  const timer = document.getElementById('timer');
  if (!timer) return;
  timer.textContent = formatRemaining(left);
  timer.classList.toggle('warn', left < 5 * 60 * 1000);
  timer.classList.toggle('danger', left < 60 * 1000);
}

function bind() {
  document.body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'run') run(false);
    else if (action === 'submit') run(true);
    else if (action === 'hint') showHint();
    else if (action === 'solution') {
      state.solutionOpen = !state.solutionOpen;
      draw();
    } else if (action === 'followups') {
      state.followupsOpen = true;
      draw();
    } else if (action === 'expected') {
      state.expectedOpen = !state.expectedOpen;
      draw();
    } else if (action === 'filter') {
      state.tierFilter = button.dataset.tier;
      draw();
    } else if (action === 'open') openPractice(button.dataset.id);
    else if (action === 'next') advance(false);
    else if (action === 'skip') advance(true);
    else if (action === 'start') startInterview();
    else if (action === 'sample') sample(button.dataset.table);
    else if (action === 'reset') resetProgress();
    else if (action === 'retry') bootDatabase();
    else if (action === 'practice-question') {
      location.hash = `#/practice/${button.dataset.id}`;
    }
  });

  document.body.addEventListener('input', (event) => {
    if (event.target.id === 'q-search') {
      state.search = event.target.value;
      renderQuestionList(viewModel());
      return;
    }
    if (event.target.id === 'followup-note') {
      const answer = currentAnswer();
      if (!answer) return;
      answer.note = event.target.value;
      saveStore();
    }
  });

  document.body.addEventListener('change', (event) => {
    if (event.target.id === 'q-jump') openPractice(event.target.value);
  });

  window.addEventListener('hashchange', onHash);
  window.setInterval(tick, 250);
}

function resumeClock() {
  const session = store.interview;
  if (session && !session.finished && session.deadline <= Date.now()) finishInterview();
}

bind();
editor = mountEditor(document.getElementById('editor-host'), {
  onChange(sql) {
    if (state.syncing || !editorReady || !state.editorFor) return;
    if (state.editorMode === 'practice') ensurePractice(state.editorFor).sql = sql;
    else if (state.editorMode === 'interview' && store.interview) {
      const answer = store.interview.answers.find((item) => item.id === state.editorFor);
      if (answer) answer.sql = sql;
    }
    saveStore();
  },
  onRun: () => run(false),
  onSubmit: () => run(true),
});

readHash();
resumeClock();
if (!location.hash) location.hash = '#/practice';
else draw();
bootDatabase();
