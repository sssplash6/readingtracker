/* Reading Journal - page tracker */

const startDate = new Date('2026-03-01');
const endDate = new Date('2026-12-31');

const monthLabel = document.getElementById('month-label');
const grid = document.getElementById('days-grid');
const prevBtn = document.getElementById('prev-month');
const nextBtn = document.getElementById('next-month');
const drawer = document.getElementById('drawer');
const drawerDate = document.getElementById('drawer-date');
const drawerTotal = document.getElementById('drawer-total');
const logList = document.getElementById('log-list');
const logForm = document.getElementById('log-form');
const pagesInput = document.getElementById('pages');
const bookInput = document.getElementById('book');
const bookSelect = document.getElementById('book-select');
const addBookBtn = document.getElementById('add-book-btn');
const backdrop = document.getElementById('backdrop');
const drawerClose = document.getElementById('drawer-close');
const authForm = document.getElementById('auth-form');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const authSession = document.getElementById('auth-session');
const authUserLabel = document.getElementById('auth-user-label');
const signoutBtn = document.getElementById('signout-btn');
const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');
const toggleAuthModeBtn = document.getElementById('toggle-auth-mode');
const authModeInput = document.getElementById('auth-mode');
const authError = document.getElementById('auth-error');
const leaderboardBtn = document.getElementById('leaderboard-btn');
const leaderboardModal = document.getElementById('leaderboard-modal');
const leaderboardClose = document.getElementById('leaderboard-close');
const leaderboardTable = document.getElementById('leaderboard-table');
const lbBackdrop = document.getElementById('lb-backdrop');
const modeRadios = document.querySelectorAll('input[name="log-mode"]');
const modeAmountRow = document.querySelector('.mode-amount');
const modeRangeRow = document.querySelector('.mode-range');
const pageStartInput = document.getElementById('page-start');
const pageEndInput = document.getElementById('page-end');

let currentMonth = new Date(startDate);
let activeDayKey = null;
let lastDeleted = null;
let toastTimer = null;
let apiBase = window.API_BASE || 'https://readingtracker.onrender.com';
let token = null;
let logsCache = {};
let booksCache = {};

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(key) {
  const d = dateFromKey(key);
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function resetOverlays() {
  closeDrawer();
  closeLeaderboard();
  lbBackdrop?.classList.add('hidden');
  backdrop?.classList.remove('show');
  document.querySelector('.page-wrap')?.classList.remove('blurred');
}

function keyForDate(date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // local noon to avoid DST edge
}

function getMonthDays(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  return { first, last };
}

function loadData() {
  if (!logsCache || Object.keys(logsCache).length === 0) {
    loadFromLocal();
  }
  return logsCache;
}

function loadBooks() {
  if (!booksCache || Object.keys(booksCache).length === 0) {
    loadFromLocal();
  }
  return booksCache;
}

function saveBooks(data) {
  booksCache = data;
  saveLocal();
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function saveData(data) {
  logsCache = data;
  saveLocal();
}

function totalForDay(logs) {
  return logs.reduce((sum, item) => sum + (item.pages || 0), 0);
}

function colorForTotal(total) {
  // thresholds: red (<50), yellow (50-99), green (100-199), purple (200+)
  if (total >= 200) return 'color-purple';
  if (total >= 100) return 'color-green';
  if (total >= 50) return 'color-yellow';
  if (total > 0) return 'color-red';
  return 'color-zero';
}

function addScribble(btn) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('scribble');

  const paths = [
    'M8 16 Q 26 6 52 16 T 94 14',
    'M10 74 C 32 60 54 86 76 70 88 62 94 78 92 82',
    'M6 46 C 20 52 36 44 50 50 66 56 82 44 94 50',
    'M12 26 Q 30 34 46 26 T 82 28'
  ];

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', paths[Math.floor(Math.random() * paths.length)]);
  path.setAttribute('stroke', 'rgba(0,0,0,0.24)');
  path.setAttribute('stroke-width', '1.2');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-dasharray', '2 6');

  svg.appendChild(path);
  btn.appendChild(svg);
}

function spawnPressRipple(btn, evt) {
  const ripple = document.createElement('span');
  ripple.className = 'press-ripple';
  const rect = btn.getBoundingClientRect();
  const x = evt.clientX ? evt.clientX - rect.left : rect.width / 2;
  const y = evt.clientY ? evt.clientY - rect.top : rect.height * 0.7;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

function renderMonth() {
  const data = loadData();
  const { first, last } = getMonthDays(currentMonth);
  monthLabel.textContent = `${first.toLocaleString('default', { month: 'long' })} ${first.getFullYear()}`;
  const todayDate = today();
  const todayKey = keyForDate(todayDate);
  const bestDayKey = getBestDayKey(data, first, last);
  updateSummary(data, first, last);
  updateStreakChip(data);
  populateBookOptions();

  grid.innerHTML = '';

  const startOffset = first.getDay(); // 0=Sun
  for (let i = 0; i < startOffset; i++) {
    const placeholder = document.createElement('div');
    placeholder.className = 'day-cell placeholder';
    grid.appendChild(placeholder);
  }

  for (let day = 1; day <= last.getDate(); day++) {
    const dateObj = new Date(first.getFullYear(), first.getMonth(), day, 12);
    const key = keyForDate(dateObj);
    const dayLogs = data[key] || [];
    const total = totalForDay(dayLogs);
    const isPast = key < todayKey;
    const isFuture = key > todayKey;

    const cell = document.createElement('div');
    cell.className = 'day-cell';

    const btn = document.createElement('button');
    const color = colorForTotal(total);
    const extras = [];
    if (isPast && total === 0) extras.push('zero-past');
    if (bestDayKey === key && total > 0) extras.push('best-day');
    const streakDays = getStreakSet(data);
    if (streakDays.has(key)) extras.push('streak');
    if (isFuture) extras.push('future');
    btn.className = `day-btn ${color} ${dayLogs.length ? 'has-logs' : ''} ${extras.join(' ')}`.trim();
    btn.style.setProperty('--tilt', `${(Math.random() * 1.2 - 0.6).toFixed(2)}deg`);
    btn.setAttribute('data-date', key);
    btn.setAttribute('role', 'gridcell');
    btn.setAttribute('aria-label', `${key}: ${total} pages`);

    const number = document.createElement('div');
    number.className = 'day-number';
    const monthAbbr = first.toLocaleString('default', { month: 'short' }).toLowerCase();
    number.textContent = `${monthAbbr} ${day}`;

    const totalEl = document.createElement('div');
    totalEl.className = 'day-total';
    const displayTotal = total.toLocaleString();
    totalEl.innerHTML = `<span class="bookmark"></span><span>${displayTotal}</span>`;

    btn.appendChild(number);
    btn.appendChild(totalEl);
    if (isPast && total === 0) {
      const crack = document.createElement('div');
      crack.className = 'crack';
      btn.appendChild(crack);
    }
    addScribble(btn);
    if (key === todayKey) {
      const ring = document.createElement('div');
      ring.className = 'today-ring';
      btn.appendChild(ring);
    }
    cell.appendChild(btn);
    grid.appendChild(cell);

    btn.addEventListener('click', (e) => {
      if (isFuture) return;
      spawnPressRipple(btn, e);
      openDrawer(key);
    });
  }

  prevBtn.disabled = first <= startDate;
  nextBtn.disabled = last >= endDate;
}

function openDrawer(key) {
  activeDayKey = key;
  const date = dateFromKey(key);
  const future = key > keyForDate(today());
  drawerDate.textContent = formatDateKey(key);
  renderLogs();
  drawer.classList.add('open');
  backdrop.classList.add('show');
  document.querySelector('.page-wrap').classList.add('blurred');
  drawer.setAttribute('aria-hidden', 'false');
  backdrop.setAttribute('aria-hidden', 'false');
  const note = document.getElementById('future-note');
  if (future) note?.classList.remove('hidden');
  else note?.classList.add('hidden');
  pagesInput.focus();
}

function closeDrawer() {
  drawer.classList.remove('open');
  backdrop.classList.remove('show');
  document.querySelector('.page-wrap').classList.remove('blurred');
  drawer.setAttribute('aria-hidden', 'true');
  backdrop.setAttribute('aria-hidden', 'true');
}

backdrop.addEventListener('click', closeDrawer);
drawerClose.addEventListener('click', closeDrawer);

authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = authUsername.value.trim();
  const password = authPassword.value;
  if (!username || !password) return;
  authError?.classList.add('hidden');
  try {
    const mode = authModeInput?.value === 'signup' ? 'signup' : 'login';
    const path = mode === 'signup' ? '/auth/signup' : '/auth/login';
    const resp = await apiFetch(path, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    rememberToken(resp.token, username);
  }
  catch (err) {
    authError.textContent = err.message || 'Auth failed';
    authError.classList.remove('hidden');
    return;
  }
  toggleAuthUI();
  await syncFromRemote();
  authPassword.value = '';
});

toggleAuthModeBtn?.addEventListener('click', () => {
  const mode = authModeInput.value === 'signup' ? 'login' : 'signup';
  authModeInput.value = mode;
  toggleAuthModeBtn.textContent = mode === 'signup' ? 'Switch to sign in' : 'Create account instead';
});

signoutBtn?.addEventListener('click', async () => {
  rememberToken(null);
  toggleAuthUI();
  resetOverlays();
  loadFromLocal();
  renderMonth();
  if (activeDayKey) renderLogs();
});

leaderboardBtn?.addEventListener('click', async () => {
  lbBackdrop.classList.remove('hidden');
  document.querySelector('.page-wrap').classList.add('blurred');
  await renderLeaderboard();
  leaderboardModal.classList.add('show');
  leaderboardModal.classList.remove('hidden');
});

function closeLeaderboard() {
  leaderboardModal?.classList.remove('show');
  leaderboardModal?.classList.add('hidden');
  lbBackdrop?.classList.add('hidden');
  document.querySelector('.page-wrap')?.classList.remove('blurred');
}

leaderboardClose?.addEventListener('click', closeLeaderboard);
lbBackdrop?.addEventListener('click', closeLeaderboard);

function renderLogs() {
  const data = loadData();
  const logs = data[activeDayKey] || [];
  const total = totalForDay(logs);
  drawerTotal.textContent = total;
  logList.innerHTML = '';

  if (!logs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No logs yet for this day.';
    logList.appendChild(empty);
    return;
  }

  logs
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .forEach((log, idx) => {
      const item = document.createElement('div');
      item.className = 'log-item';
      item.style.animationDelay = `${idx * 40}ms`;

      const left = document.createElement('div');
      left.innerHTML = `<div class="log-meta">${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>`;
      if (log.book) {
        const book = document.createElement('div');
        book.className = 'log-book';
        book.textContent = log.book;
        left.appendChild(book);
      }

      const actions = document.createElement('div');
      actions.className = 'log-actions';

      const right = document.createElement('div');
      right.className = 'log-pages';
      right.textContent = `${log.pages} pages`;

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'delete-log';
      del.dataset.ts = log.timestamp;
      del.dataset.id = log.id || '';
      del.setAttribute('aria-label', 'Delete log');
      del.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><path d="M6 7h12l-1 13H7L6 7Z" fill="#4a1c1c" stroke="none"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-7 0h8" stroke="#4a1c1c" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M10 10v7M14 10v7" stroke="#fef6f0" stroke-width="1.6" stroke-linecap="round"/></svg>`;

      actions.appendChild(right);
      actions.appendChild(del);

      item.appendChild(left);
      item.appendChild(actions);
      logList.appendChild(item);
    });
}

logForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!activeDayKey) return;
  if (activeDayKey > keyForDate(today())) return; // prevent future logging

  const mode = document.querySelector('input[name="log-mode"]:checked')?.value || 'amount';
  let pages = 0;
  if (mode === 'range') {
    const startVal = parseInt(pageStartInput.value, 10);
    const endVal = parseInt(pageEndInput.value, 10);
    if (!startVal || !endVal || endVal < startVal) {
      alert('Please enter a valid start and end page.');
      return;
    }
    pages = endVal - startVal + 1;
  } else {
    pages = parseInt(pagesInput.value, 10);
    if (!pages || pages <= 0) {
      pagesInput.focus();
      return;
    }
  }

  let book = '';
  if (bookSelect.value === '__custom__') {
    book = bookInput.value.trim();
  } else {
    book = bookSelect.value || '';
  }
  const data = loadData();
  const logs = data[activeDayKey] || [];
  const newLog = { pages, book, timestamp: new Date().toISOString() };

  const finish = (stored) => {
    logs.push(stored);
    data[activeDayKey] = logs;
    saveData(data);
    pagesInput.value = '';
    pageStartInput.value = '';
    pageEndInput.value = '';
    bookInput.value = '';
    bookSelect.value = '';
    renderLogs();
    renderMonth();
  };

  if (token) {
    apiFetch('/logs', {
      method: 'POST',
      body: JSON.stringify({ date: activeDayKey, pages, book }),
    })
      .then((row) => {
        finish({ ...newLog, id: row.id, timestamp: row.created_at });
      })
      .catch((err) => alert(err.message || 'Could not save log'));
  } else {
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    finish({ ...newLog, id });
  }
});

logList.addEventListener('click', (e) => {
  const btn = e.target.closest('.delete-log');
  if (!btn) return;
  const ts = btn.dataset.ts;
  const id = btn.dataset.id;
  const data = loadData();
  const logs = data[activeDayKey] || [];
  const match = (log) => (id ? log.id === id : log.timestamp === ts);
  const remaining = logs.filter((log) => !match(log));
  const deleted = logs.find(match);
  data[activeDayKey] = remaining;
  saveData(data);
  if (token && deleted?.id) {
    apiFetch(`/logs/${deleted.id}`, { method: 'DELETE' }).catch((err) => console.error(err));
  }
  if (deleted) {
    lastDeleted = { day: activeDayKey, log: deleted };
    showToast();
  }
  renderLogs();
  renderMonth();
});

bookSelect.addEventListener('change', () => {
  const isCustom = bookSelect.value === '__custom__';
  bookInput.classList.toggle('hidden', !isCustom);
  if (isCustom) bookInput.focus();
});

addBookBtn.addEventListener('click', () => {
  const month = monthKey(currentMonth);
  const title = prompt('Add a book for this month:');
  if (!title) return;
  const books = loadBooks();
  const list = Array.from(new Set([...(books[month] || []), title.trim()])).filter(Boolean);
  books[month] = list;
  saveBooks(books);
  populateBookOptions();
  if (token) {
    apiFetch('/books', {
      method: 'POST',
      body: JSON.stringify({ month, title: title.trim() }),
    }).catch((err) => console.error(err));
  }
});

function populateBookOptions() {
  const books = loadBooks();
  const list = books[monthKey(currentMonth)] || [];
  bookSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a book';
  bookSelect.appendChild(placeholder);
  list.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    bookSelect.appendChild(opt);
  });
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = 'Other…';
  bookSelect.appendChild(customOpt);
  bookInput.classList.toggle('hidden', true);
}

modeRadios.forEach((r) =>
  r.addEventListener('change', () => {
    const mode = document.querySelector('input[name="log-mode"]:checked')?.value || 'amount';
    modeAmountRow.classList.toggle('hidden', mode !== 'amount');
    modeRangeRow.classList.toggle('hidden', mode !== 'range');
    if (mode === 'range') {
      pageStartInput.focus();
    } else {
      pagesInput.focus();
    }
  })
);

function stripTime(d) {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t;
}

function toggleAuthUI() {
  const isAuthed = Boolean(token);
  authScreen.classList.toggle('hidden', isAuthed);
  appShell.classList.toggle('hidden', !isAuthed);
  if (isAuthed) {
    authSession.classList.remove('hidden');
    authUserLabel.textContent = localStorage.getItem('rt_username') || 'Logged in';
  } else {
    authSession.classList.add('hidden');
    authPassword.value = '';
    // ensure overlays are closed
    closeDrawer();
    closeLeaderboard();
    lbBackdrop?.classList.add('hidden');
    document.querySelector('.page-wrap')?.classList.remove('blurred');
  }
}

async function apiFetch(path, options = {}) {
  if (!apiBase) throw new Error('API_BASE not set in config.js');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiBase}${path}`, { ...options, headers });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function syncFromRemote() {
  if (!token) {
    loadFromLocal();
    renderMonth();
    return;
  }
  try {
    const [logs, books] = await Promise.all([
      apiFetch('/logs'),
      apiFetch('/books'),
    ]);
    logsCache = {};
    logs.forEach((row) => {
      if (!logsCache[row.date]) logsCache[row.date] = [];
      logsCache[row.date].push({
        id: row.id,
        pages: row.pages,
        book: row.book,
        timestamp: row.created_at,
      });
    });
    booksCache = {};
    books.forEach((row) => {
      if (!booksCache[row.month]) booksCache[row.month] = [];
      booksCache[row.month].push(row.title);
    });
    saveLocal();
    renderMonth();
    if (activeDayKey) renderLogs();
  } catch (err) {
    console.error(err);
    loadFromLocal();
    renderMonth();
  }
}

function loadFromLocal() {
  const raw = localStorage.getItem('readingLogs2026');
  logsCache = raw ? JSON.parse(raw) : {};
  const braw = localStorage.getItem('readingBooks2026');
  booksCache = braw ? JSON.parse(braw) : {};
}

function saveLocal() {
  localStorage.setItem('readingLogs2026', JSON.stringify(logsCache));
  localStorage.setItem('readingBooks2026', JSON.stringify(booksCache));
}

function rememberToken(newToken, username) {
  token = newToken;
  if (token) {
    localStorage.setItem('rt_token', token);
    if (username) localStorage.setItem('rt_username', username);
  } else {
    localStorage.removeItem('rt_token');
    localStorage.removeItem('rt_username');
  }
}

function getBestDayKey(data, first, last) {
  let best = null;
  let max = -1;
  for (let day = 1; day <= last.getDate(); day++) {
    const key = keyForDate(new Date(first.getFullYear(), first.getMonth(), day));
    const total = totalForDay(data[key] || []);
    if (total > max) {
      max = total;
      best = key;
    }
  }
  return max > 0 ? best : null;
}

function getStreakSet(data) {
  const set = new Set();
  const todayDate = today();
  let cursor = new Date(todayDate);
  while (cursor >= startDate) {
    const key = keyForDate(cursor);
    const total = totalForDay(data[key] || []);
    if (total > 0) {
      set.add(key);
      cursor.setDate(cursor.getDate() - 1);
    } else {
      if (cursor < todayDate) break;
      cursor.setDate(cursor.getDate() - 1);
    }
  }
  return set;
}

function updateStreakChip(data) {
  const chip = document.getElementById('streak-chip');
  const todayDate = today();
  let streak = 0;
  const cursor = new Date(todayDate);
  while (cursor >= startDate) {
    const key = keyForDate(cursor);
    const total = totalForDay(data[key] || []);
    if (total > 0) streak += 1;
    else if (cursor < todayDate) break;
    cursor.setDate(cursor.getDate() - 1);
  }
  chip.textContent = `Streak: ${streak} day${streak === 1 ? '' : 's'}`;
}

function updateSummary(data, first, last) {
  let total = 0;
  let active = 0;
  const days = last.getDate();
  for (let day = 1; day <= days; day++) {
    const key = keyForDate(new Date(first.getFullYear(), first.getMonth(), day));
    const t = totalForDay(data[key] || []);
    total += t;
    if (t > 0) active += 1;
  }
  const avg = active ? Math.round((total / active) * 10) / 10 : 0;
  const el = document.getElementById('totals-row');
  el.textContent = `Total: ${total} · Avg/day: ${avg} · Active: ${active}`;
}

function showToast() {
  clearTimeout(toastTimer);
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>Log deleted</span><button type="button" id="undo-btn">Undo</button>`;
    document.body.appendChild(toast);
    toast.querySelector('#undo-btn').addEventListener('click', undoDelete);
  }
  toast.style.display = 'flex';
  toastTimer = setTimeout(() => {
    toast.style.display = 'none';
    lastDeleted = null;
  }, 4000);
}

function undoDelete() {
  if (!lastDeleted) return;
  const data = loadData();
  const logs = data[lastDeleted.day] || [];
  logs.push(lastDeleted.log);
  data[lastDeleted.day] = logs;
  saveData(data);
  if (token) {
    const log = lastDeleted.log;
    apiFetch('/logs', {
      method: 'POST',
      body: JSON.stringify({
        date: lastDeleted.day,
        pages: log.pages,
        book: log.book,
      }),
    }).catch((err) => console.error(err));
  }
  lastDeleted = null;
  document.querySelector('.toast').style.display = 'none';
  renderLogs();
  renderMonth();
}

async function renderLeaderboard() {
  leaderboardTable.innerHTML = 'Loading...';
  try {
    const month = monthKey(currentMonth);
    const rows = await apiFetch(`/leaderboard?month=${month}`);
    leaderboardTable.innerHTML = '';
    rows.forEach((row, idx) => {
      const div = document.createElement('div');
      div.className = 'lb-row';
      div.innerHTML = `
        <div class="lb-rank">#${idx + 1}</div>
        <div class="lb-name">${row.username}</div>
        <div class="lb-total">${row.total} pages</div>
        <div class="lb-streak">⚡ ${row.streak}</div>
      `;
      leaderboardTable.appendChild(div);
    });
    if (!rows.length) {
      leaderboardTable.textContent = 'No data yet.';
    }
  } catch (err) {
    leaderboardTable.textContent = err.message || 'Failed to load leaderboard';
  }
}

prevBtn.addEventListener('click', () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderMonth();
});

nextBtn.addEventListener('click', () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderMonth();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawer.classList.contains('open')) {
    closeDrawer();
  }
});

async function bootstrap() {
  loadFromLocal();
  const storedToken = localStorage.getItem('rt_token');
  if (storedToken) {
    token = storedToken;
  }
  toggleAuthUI();
  await syncFromRemote();
  renderMonth();
}

bootstrap();
