import { questionById, QUESTIONS, TIER_LABELS } from './questions.js';
import { DATA_NOTES, SQLITE_NOTES, TABLES } from './schema.js';
import { esc, formatCell, formatElapsed, formatRemaining } from './format.js';
import { INTERVIEW_MS } from './interview.js';

function tableHtml(columns, values, caption) {
  const shown = values.slice(0, 150);
  const extra = values.length - shown.length;
  const head = columns.map((column) => `<th>${esc(column)}</th>`).join('');
  const body = shown.map((row) => {
    const cells = row.map((value) => {
      const formatted = formatCell(value);
      return `<td class="${formatted.nullish ? 'is-null' : ''}">${esc(formatted.text)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `
    <div class="table-wrap">
      <table>
        <caption>${esc(caption)}</caption>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${shown.length === 0 ? '<p class="muted">0 rows.</p>' : ''}
    ${extra > 0 ? `<p class="muted">Showing 150 of ${values.length} rows. Grading uses every row.</p>` : ''}
  `;
}

function matches(question, vm) {
  if (vm.tierFilter !== 'all' && String(question.tier) !== String(vm.tierFilter)) return false;
  const needle = vm.search.trim().toLowerCase();
  if (!needle) return true;
  return question.title.toLowerCase().includes(needle)
    || question.id.includes(needle)
    || question.topics.some((topic) => topic.toLowerCase().includes(needle));
}

function practiceList(vm) {
  const filtered = QUESTIONS.filter((question) => matches(question, vm));
  const options = filtered.map((question) => `
    <option value="${esc(question.id)}" ${question.id === vm.practiceId ? 'selected' : ''}>
      Tier ${question.tier} · ${esc(question.title)}
    </option>
  `).join('');
  const items = filtered.map((question) => `
    <button type="button" class="q-item ${question.id === vm.practiceId ? 'active' : ''} ${vm.solved[question.id] ? 'solved' : ''}" data-action="open" data-id="${esc(question.id)}">
      <span class="tier tier-${question.tier}">${question.tier}</span>
      <span class="q-title">${esc(question.title)}</span>
      ${vm.solved[question.id] ? '<span class="dot" aria-label="Solved"></span>' : ''}
    </button>
  `).join('');
  return `
    <label class="mobile-only jump">Question
      <select id="q-jump">${options || '<option value="">No matches</option>'}</select>
    </label>
    <div class="q-list desktop-only">
      ${items || '<p class="muted">No questions match.</p>'}
    </div>
    <p class="muted tiny">${filtered.length} shown</p>
  `;
}

function interviewList(vm) {
  const session = vm.session;
  if (!session) return '';
  const items = session.answers.map((answer, index) => {
    const question = questionById(answer.id);
    const locked = index > session.index;
    const mark = answer.correct === true ? 'pass' : answer.submitted ? 'fail' : '';
    return `
      <div class="q-item static ${index === session.index ? 'active' : ''} ${locked ? 'locked' : ''}">
        <span class="tier tier-${question.tier}">${index + 1}</span>
        <span class="q-title">${locked ? 'Locked' : esc(question.title)}</span>
        ${mark ? `<span class="mark-dot ${mark}"></span>` : ''}
      </div>
    `;
  }).join('');
  return `<div class="q-list">${items}</div>`;
}

export function renderQuestionList(vm) {
  const list = document.getElementById('nav-list');
  if (!list || vm.mode !== 'practice') return;
  list.innerHTML = practiceList(vm);
}

function renderNav(vm) {
  const controls = document.getElementById('nav-controls');
  const list = document.getElementById('nav-list');
  if (vm.mode !== 'practice') {
    controls.innerHTML = '<p class="nav-label">This round</p>';
    list.innerHTML = interviewList(vm);
    return;
  }
  if (!controls.querySelector('#q-search')) {
    const tiers = ['all', '1', '2', '3', '4', '5'].map((tier) => `
      <button type="button" class="chip ${String(vm.tierFilter) === tier ? 'on' : ''}" data-action="filter" data-tier="${tier}" aria-pressed="${String(vm.tierFilter) === tier}">
        ${tier === 'all' ? 'All' : tier}
      </button>
    `).join('');
    controls.innerHTML = `
      <label class="search-label">Search
        <input id="q-search" type="search" placeholder="Title or topic" value="${esc(vm.search)}">
      </label>
      <div class="filters" role="group" aria-label="Tier">${tiers}</div>
    `;
  } else {
    controls.querySelectorAll('[data-action="filter"]').forEach((button) => {
      const on = button.dataset.tier === String(vm.tierFilter);
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  list.innerHTML = practiceList(vm);
}

function promptHtml(vm) {
  const question = vm.question;
  const order = question.orderSensitive
    ? 'Row order is graded.'
    : 'Row order is not graded.';
  const blocks = question.prompt.map((part) => (
    part.type === 'code'
      ? `<pre class="prompt-sql">${esc(part.text)}</pre>`
      : `<p>${esc(part.text)}</p>`
  )).join('');
  const hints = question.hints.slice(0, vm.hintsShown).map((hint) => `<li>${esc(hint)}</li>`).join('');
  const followups = vm.showFollowups ? `
    <section class="followups">
      <h2>Interviewer follow-ups</h2>
      <p class="muted">Talk these through. They are not graded.</p>
      <ol>${question.followups.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>
      ${vm.mode === 'interview' ? `
        <label class="note-label">What you would say
          <textarea id="followup-note" rows="3">${esc(vm.note || '')}</textarea>
        </label>
      ` : ''}
    </section>
  ` : '';
  const solution = vm.solutionOpen ? `<pre class="solution">${esc(question.solution.trim())}</pre>` : '';
  const position = vm.mode === 'interview'
    ? `<p class="kicker">Question ${vm.session.index + 1} of ${vm.session.ids.length} · Tier ${question.tier} · ${esc(TIER_LABELS[question.tier])}</p>`
    : `<p class="kicker">Tier ${question.tier} · ${esc(TIER_LABELS[question.tier])}</p>`;
  return `
    ${position}
    <h1>${esc(question.title)} ${vm.solvedCurrent ? '<span class="badge">Solved</span>' : ''}</h1>
    <div class="topics">${question.topics.map((topic) => `<span>${esc(topic)}</span>`).join('')}</div>
    <div class="prompt">${blocks}</div>
    <p class="grade-note">Return the columns in the order listed. Names are not graded. Numbers can be off by about 0.02. ${order}</p>
    ${vm.attempts ? `<p class="muted">Submissions on this question: ${vm.attempts}</p>` : ''}
    ${hints ? `<ol class="hints">${hints}</ol>` : ''}
    ${solution}
    ${followups}
  `;
}

function actionsHtml(vm) {
  const question = vm.question;
  const disabled = vm.running ? 'disabled' : '';
  const hint = vm.hintsShown < question.hints.length
    ? `<button type="button" data-action="hint" ${disabled}>Hint ${vm.hintsShown + 1} of ${question.hints.length}</button>`
    : '';
  const canSolution = vm.mode === 'practice' || vm.answer?.submitted;
  const solution = canSolution
    ? `<button type="button" data-action="solution">${vm.solutionOpen ? 'Hide reference SQL' : 'Show reference SQL'}</button>`
    : '';
  const follow = vm.mode === 'practice' && !vm.showFollowups
    ? '<button type="button" data-action="followups">Show follow-ups</button>'
    : '';
  let interview = '';
  if (vm.mode === 'interview') {
    const last = vm.session.index === vm.session.ids.length - 1;
    interview = vm.answer?.submitted
      ? `<button type="button" class="primary" data-action="next">${last ? 'Finish interview' : 'Next question'}</button>`
      : `<button type="button" data-action="skip">${last ? 'Skip and finish' : 'Skip'}</button>`;
  }
  return `
    <div class="actions">
      <button type="button" class="primary" data-action="run" ${disabled}>Run</button>
      <button type="button" data-action="submit" ${disabled}>Submit</button>
      ${interview}
      ${hint}
      ${solution}
      ${follow}
    </div>
    <p class="kbd">Ctrl/Cmd+Enter runs. Ctrl/Cmd+Shift+Enter submits.</p>
  `;
}

function resultsHtml(vm) {
  const output = vm.output;
  if (!output) return '<p class="muted empty-result">Run a query to see rows. Submit when you want it graded.</p>';
  if (output.kind === 'pending') return '<p class="pending">Running…</p>';
  if (output.kind === 'error') {
    return `<div class="banner bad" role="status">${esc(output.message)}</div>`;
  }
  if (output.kind === 'table') {
    const caption = `${output.label || 'Result'} · ${output.values.length} rows${output.ms != null ? ` · ${output.ms} ms` : ''}`;
    return tableHtml(output.columns, output.values, caption);
  }
  const bannerClass = output.graded.correct ? 'good' : 'bad';
  const expectedButton = output.expected && !output.expected.error
    ? `<button type="button" data-action="expected">${vm.expectedOpen ? 'Hide reference rows' : 'Show reference rows'}</button>`
    : '';
  const table = output.columns?.length
    ? tableHtml(output.columns, output.values, `Your result · ${output.values.length} rows${output.ms != null ? ` · ${output.ms} ms` : ''}`)
    : '';
  const preview = vm.expectedOpen && output.expected && !output.expected.error
    ? tableHtml(output.expected.columns, output.expected.values.slice(0, 8), 'Reference result (up to 8 rows)')
    : '';
  return `
    <div class="banner ${bannerClass}" role="status">${esc(output.graded.message)}</div>
    <div class="actions tight">${expectedButton}</div>
    ${table}
    ${preview}
  `;
}

function schemaHtml(vm, openMap) {
  const tables = TABLES.map((table) => {
    const count = vm.counts[table.name];
    const open = openMap[table.name] ? 'open' : '';
    const columns = table.columns.map((column) => `
      <li>
        <code>${esc(column.name)}</code>
        <span>${esc(column.type)}${column.notNull ? '' : ' · null'}</span>
        <p>${esc(column.description)}</p>
      </li>
    `).join('');
    return `
      <details data-table="${esc(table.name)}" ${open}>
        <summary>
          <span>${esc(table.name)}</span>
          <span class="count">${count == null ? '' : `${count.toLocaleString()} rows`}</span>
        </summary>
        <p>${esc(table.description)}</p>
        <ul class="cols">${columns}</ul>
        <button type="button" data-action="sample" data-table="${esc(table.name)}">Sample 5 rows</button>
      </details>
    `;
  }).join('');
  return `
    <div class="schema-card">
      <h2>Schema</h2>
      ${DATA_NOTES.map((note) => `<p class="note">${esc(note)}</p>`).join('')}
      ${tables}
      <h2>SQLite in this gym</h2>
      <ul class="notes">${SQLITE_NOTES.map((note) => `<li>${esc(note)}</li>`).join('')}</ul>
      <button type="button" class="ghost" data-action="reset">Reset saved progress</button>
    </div>
  `;
}

function gateHtml(vm) {
  if (vm.loadError) {
    return `
      <section class="gate-card">
        <p class="kicker">Database</p>
        <h1>SQLite did not start</h1>
        <p>${esc(vm.loadError)}</p>
        <button type="button" class="primary" data-action="retry">Try again</button>
      </section>
    `;
  }
  if (!vm.dataReady) {
    return `
      <section class="gate-card">
        <p class="kicker">Loading</p>
        <h1>Seeding the payments database</h1>
        <p>SQLite is starting in your browser. The first load builds a few thousand customers, transfers, card charges, and daily FX rates.</p>
      </section>
    `;
  }
  if (vm.mode === 'interview' && vm.session?.finished) return summaryHtml(vm);
  return startHtml(vm);
}

function startHtml(vm) {
  const history = vm.history.slice(0, 5).map((item) => `
    <li>
      <strong>${item.score}/${item.total}</strong>
      <span>${formatElapsed(item.elapsedMs)}</span>
    </li>
  `).join('');
  const resume = vm.session && !vm.session.finished
    ? '<p class="note">An interview is already on the clock. Starting a new one abandons it.</p>'
    : '';
  return `
    <section class="gate-card">
      <p class="kicker">Mock interview</p>
      <h1>40 minutes, five questions</h1>
      <p>This is practice for a live analyst SQL round. It is not an official Wise interview. You get one original question from each tier, easiest first. The clock keeps running if you refresh.</p>
      <ul class="start-list">
        <li>Run as often as you want. Submit grades the current SQL.</li>
        <li>After each answer, follow-up prompts show up. Talk them through. They are not graded.</li>
        <li>Skip if you are stuck. A skip scores as incorrect.</li>
      </ul>
      ${resume}
      <button type="button" class="primary" data-action="start">Start the 40-minute interview</button>
      ${history ? `<h2>Recent scores</h2><ul class="history">${history}</ul>` : ''}
      <p class="disclaimer">Synthetic Wise-style payments data. Not affiliated with Wise.</p>
    </section>
  `;
}

function summaryHtml(vm) {
  const session = vm.session;
  const score = session.answers.filter((answer) => answer.correct === true).length;
  const elapsed = Math.min(INTERVIEW_MS, (session.finishedAt || Date.now()) - session.startedAt);
  const rows = session.answers.map((answer) => {
    const question = questionById(answer.id);
    const label = answer.correct ? 'Pass' : answer.skipped ? 'Skipped' : 'Miss';
    return `
      <li class="${answer.correct ? 'pass' : 'fail'}">
        <div class="summary-row">
          <div>
            <strong>${esc(question.title)}</strong>
            <span>Tier ${question.tier} · ${label}${answer.hints ? ' · hint used' : ''}</span>
          </div>
          <button type="button" data-action="practice-question" data-id="${esc(question.id)}">Practice</button>
        </div>
        <details>
          <summary>Reference SQL</summary>
          <pre class="solution">${esc(question.solution.trim())}</pre>
        </details>
      </li>
    `;
  }).join('');
  return `
    <section class="gate-card">
      <p class="kicker">Round complete</p>
      <h1>${score} / ${session.answers.length}</h1>
      <p>Time used: ${formatElapsed(elapsed)}. Follow-ups were for discussion and are not in this score.</p>
      <ul class="summary">${rows}</ul>
      <div class="actions">
        <button type="button" class="primary" data-action="start">Start another interview</button>
        <a class="button" href="#/practice">Back to practice</a>
      </div>
      <p class="disclaimer">Scores stay in this browser only.</p>
    </section>
  `;
}

function renderTopbar(vm) {
  const left = vm.mode === 'interview' && vm.session && !vm.session.finished
    ? vm.session.deadline - Date.now()
    : null;
  const timer = left == null ? '' : `<span id="timer" class="timer ${left < 60000 ? 'danger' : left < 300000 ? 'warn' : ''}">${formatRemaining(left)}</span>`;
  document.getElementById('topbar').innerHTML = `
    <div class="topbar-inner">
      <a class="brand" href="#/practice">
        <span class="mark">SQL</span>
        <span class="brand-text">
          <strong>Interview Gym</strong>
          <small>Wise-style payments SQL</small>
        </span>
      </a>
      <nav class="mode-nav">
        <a href="#/practice" class="${vm.mode === 'practice' ? 'on' : ''}">Practice</a>
        <a href="#/interview" class="${vm.mode === 'interview' ? 'on' : ''}">Mock interview</a>
      </nav>
      <div class="top-meta">
        <span>${vm.solvedCount}/${QUESTIONS.length} solved</span>
        ${timer}
      </div>
    </div>
  `;
}

export function render(vm) {
  renderTopbar(vm);
  const workspace = document.getElementById('workspace');
  const gate = document.getElementById('gate');
  const live = vm.dataReady && !vm.loadError && (
    vm.mode === 'practice' || (vm.mode === 'interview' && vm.session && !vm.session.finished)
  );
  if (!live) {
    workspace.hidden = true;
    gate.hidden = false;
    gate.innerHTML = gateHtml(vm);
    return;
  }
  workspace.hidden = false;
  gate.hidden = true;
  gate.innerHTML = '';
  renderNav(vm);
  document.getElementById('prompt').innerHTML = promptHtml(vm);
  document.getElementById('actions').innerHTML = actionsHtml(vm);
  document.getElementById('results').innerHTML = resultsHtml(vm);
  const schema = document.getElementById('schema');
  const existing = [...schema.querySelectorAll('details[data-table]')];
  const openMap = {};
  if (!existing.length) {
    openMap.users = true;
    openMap.transfers = true;
  } else {
    for (const node of existing) openMap[node.dataset.table] = node.open;
  }
  schema.innerHTML = schemaHtml(vm, openMap);
}
