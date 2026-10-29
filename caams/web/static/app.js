'use strict';
// ===========================================================================
//  CAAMS web front end (no framework, no build step)
//  Every screen calls /api/... ; every answer also carries the SQL it ran,
//  which the "SQL" buttons reveal.
// ===========================================================================

const $ = (sel, el = document) => el.querySelector(sel);
const root = $('#root');
const state = { user: null, att: { subject: null, roster: [], absent: new Set() }, pending: null };

// ------------------------------------------------------------------ utils --
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round = (v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v);
const cell = (v) => (v == null ? '<span class="null">NULL</span>' : esc(round(v)));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function api(path, body) {
  const res = await fetch('/api/' + path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { headers: { Accept: 'application/json' } });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'The request failed.');
    err.status = res.status;
    err.sql = data.sql || [];
    throw err;
  }
  return data;
}

let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.innerHTML = `<span class="t-ic" aria-hidden="true">${bad ? '!' : '✓'}</span><span>${esc(msg)}</span>`;
  void t.offsetWidth; // restart the slide-in and the timer bar
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ------------------------------------------------------------- motion --
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
  attendance: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  register: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  leaves: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  students: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  results: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89L17 22l-5-3-5 3 1.52-9.11"/>',
  sql: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  audit: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  cap: '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
};
const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// numbers roll up from zero to their value
function countUp(el) {
  const raw = el.dataset.count;
  const to = parseFloat(raw);
  if (Number.isNaN(to)) return;
  const dec = (raw.split('.')[1] || '').length;
  const suf = el.dataset.suffix || '';
  if (REDUCED) { el.textContent = to.toFixed(dec) + suf; return; }
  const t0 = performance.now(), dur = 1200;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
    el.textContent = (to * e).toFixed(dec) + suf;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// headline words rise in one after another
function splitWords(h) {
  if (h.dataset.split) return;
  const text = h.textContent.trim();
  h.dataset.split = '1';
  h.setAttribute('aria-label', text);
  h.innerHTML = text.split(/\s+/).map((w, i) => `<span class="w" aria-hidden="true" style="--w:${i}">${esc(w)}</span>`).join(' ');
}

function enhance(scope) {
  [...scope.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 8)));
  scope.querySelectorAll('.page-head h1, .hello h1, .drawer-head h2').forEach(splitWords);
  scope.querySelectorAll('[data-count]').forEach(countUp);
}

const CONFETTI = ['#14c9a5', '#0ea5d0', '#5b4cf5', '#9a5cf6', '#ff4f73', '#ffb020'];
function confetti(el) {
  if (REDUCED) return;
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 36; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    const ang = Math.random() * Math.PI * 2, dist = 80 + Math.random() * 160;
    c.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;background:${CONFETTI[i % CONFETTI.length]};`
      + `--x:${Math.cos(ang) * dist}px;--y:${Math.sin(ang) * dist - 90}px;--r:${Math.random() * 720 - 360}deg;animation-delay:${Math.random() * 80}ms`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1300);
  }
}

// ink ripple from wherever a button is pressed
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn');
  if (!b || b.disabled || REDUCED) return;
  const r = b.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2.2;
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
  b.appendChild(s);
  setTimeout(() => s.remove(), 700);
});

const KW = /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|EXISTS|JOIN|LEFT|ON|USING|GROUP|BY|ORDER|HAVING|LIMIT|AS|DISTINCT|UNION|INTERSECT|EXCEPT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CASE|WHEN|THEN|ELSE|END|WITH|COUNT|SUM|AVG|MIN|MAX|ROUND|COALESCE|OVER|PARTITION|RANK|DENSE_RANK|BEGIN|COMMIT|ROLLBACK|IS|NULL|LIKE|BETWEEN|DESC|ASC|CONFLICT|DO|NOTHING|CAST|INTEGER|TRUE)\b/g;
function hl(sql) {
  return esc(sql)
    .replace(/(&#39;[^&]*?&#39;)/g, '<span class="str">$1</span>')
    .replace(KW, '<span class="kw">$1</span>');
}

let boxId = 0;
function sqlButton(sqls) {
  if (!sqls || !sqls.length) return { button: '', box: '' };
  const id = 'sql-' + (++boxId);
  return {
    button: `<button class="sql-toggle" aria-expanded="false" aria-controls="${id}" title="Show the SQL behind this">SQL</button>`,
    box: `<div id="${id}" class="sql-box" hidden>${sqls.map((s) => `<pre class="sql">${hl(s)}</pre>`).join('')}</div>`,
  };
}

function panel({ title, sub = '', body, sql, extra = '' }) {
  const s = sqlButton(sql);
  return `<section class="panel">
    <div class="panel-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
      <div style="display:flex;gap:8px;align-items:center">${extra}${s.button}</div></div>
    ${s.box}${body}</section>`;
}

function pageHead(title, desc, sql, actions = '', cls = '') {
  const s = sqlButton(sql);
  return `<div class="page-head${cls ? ' ' + cls : ''}"><div><h1>${title}</h1>${desc ? `<p>${desc}</p>` : ''}</div>
    <div style="display:flex;gap:10px;align-items:center">${actions}${s.button}</div></div>${s.box}`;
}

const strip = (s, max = 0, lg = false) => {
  const str = max ? (s || '').slice(-max) : (s || '');
  if (!str) return '<span class="faint">no classes yet</span>';
  return `<span class="strip${lg ? ' lg' : ''}" role="img" aria-label="${(str.match(/P/g) || []).length} present, ${(str.match(/A/g) || []).length} absent">${[...str].map((c, i) => `<i class="${c === 'A' ? 'a' : ''}" style="--i:${i}"></i>`).join('')}</span>`;
};

function pctPill(v) {
  if (v == null) return '<span class="pill grey">no classes</span>';
  const cls = v < 75 ? 'red' : v < 80 ? 'amber' : 'green';
  return `<span class="pill ${cls}">${round(v)}%</span>`;
}

const riskPill = (r) => `<span class="pill ${r === 'Moderate' ? 'amber' : 'red'}">${esc(r)}</span>`;
const gradePill = (g) => `<span class="pill ${g === 'F' ? 'red' : g === 'O' || g === 'A+' ? 'green' : 'grey'}">${esc(g)}</span>`;
const statusPill = (s) => `<span class="pill ${s === 'Approved' ? 'green' : s === 'Rejected' ? 'red' : 'amber'}">${esc(s)}</span>`;

function bars(items) {
  return `<div class="bars">${items.map((i, n) => {
    const v = i.value == null ? 0 : i.value;
    const cls = v < 75 ? 'low' : v < 80 ? 'mid' : '';
    return `<div class="bar-row"><span class="name" title="${esc(i.title || i.label)}">${esc(i.label)}</span>
      <span class="track"><span class="${cls}" style="width:${Math.max(0, Math.min(100, v))}%;--i:${n}"></span></span>
      <span class="v">${i.value == null ? '–' : round(i.value) + '%'}</span></div>`;
  }).join('')}</div>`;
}

function table(cols, rows, { onRow } = {}) {
  if (!rows.length) return '<div class="empty">Nothing to show here yet.</div>';
  return `<div class="table-wrap"><table class="t"><thead><tr>${cols.map((c) => `<th class="${c.n ? 'n' : ''}">${c.label}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr style="--r:${Math.min(i, 20)}"${onRow ? ` class="click" ${onRow(r)}` : ''}>${cols.map((c) => `<td class="${c.n ? 'n' : ''}">${c.render ? c.render(r) : cell(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function ring(pct, size = 84) {
  const r = 34, c = 2 * Math.PI * r, v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const low = pct != null && pct < 75;
  const a = 0.75 * 2 * Math.PI - Math.PI / 2;
  const tx1 = 42 + 27 * Math.cos(a), ty1 = 42 + 27 * Math.sin(a), tx2 = 42 + 41 * Math.cos(a), ty2 = 42 + 41 * Math.sin(a);
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 84 84" role="img" aria-label="${pct == null ? 'no classes' : round(pct) + ' percent'}">
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--rule-2)" stroke-width="8"/>
    <circle class="rv" cx="42" cy="42" r="${r}" fill="none" stroke="url(#${low ? 'gBad' : 'gOk'})" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${(v / 100) * c} ${c}" transform="rotate(-90 42 42)"/>
    <line x1="${tx1}" y1="${ty1}" x2="${tx2}" y2="${ty2}" stroke="var(--ink)" stroke-opacity=".4" stroke-width="2"/>
    <text x="42" y="47" text-anchor="middle" font-size="17" fill="${low ? 'var(--absent)' : 'var(--ink)'}"${pct == null ? '' : ` data-count="${Math.round(pct)}" data-suffix="%"`}>${pct == null ? '–' : Math.round(pct) + '%'}</text></svg>`;
}

function lineChart(points) {
  if (!points.length) return '<div class="empty">No lectures recorded yet.</div>';
  const W = 640, H = 230, L = 40, R = 14, T = 16, B = 30;
  const vals = points.map((p) => p.pct);
  const ymin = Math.min(60, Math.floor((Math.min(...vals) - 5) / 10) * 10), ymax = 100;
  const x = (i) => L + (points.length === 1 ? 0 : (i * (W - L - R)) / (points.length - 1));
  const y = (v) => T + ((ymax - v) * (H - T - B)) / (ymax - ymin);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(ymin)} L${x(0)},${y(ymin)} Z`;
  let grid = '';
  for (let v = ymin; v <= ymax; v += 10) {
    grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule-2)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${v}</text>`;
  }
  const labels = points.map((p, i) => (i % 3 === 0 || i === points.length - 1)
    ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--ink-3)">${day(p.starts)}</text>` : '').join('');
  const dots = points.map((p, i) => `<circle class="dot" style="--i:${i}" cx="${x(i)}" cy="${y(p.pct)}" r="4.5" stroke="#fff" stroke-width="2" fill="url(#${p.pct < 75 ? 'gBad' : 'gLine'})"><title>Week of ${day(p.starts)}: ${p.pct}%</title></circle>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly attendance percentage">
    ${grid}<path class="area" d="${area}" fill="url(#gArea)"/>
    <line class="rule75" x1="${L}" x2="${W - R}" y1="${y(75)}" y2="${y(75)}" stroke="var(--a-a)" stroke-width="1.5" stroke-dasharray="6 3"/>
    <text x="${W - R}" y="${y(75) - 6}" text-anchor="end" font-size="11" fill="var(--absent)" font-weight="700">75% rule</text>
    <path class="ln" pathLength="1" d="${line}" fill="none" stroke="url(#gLine)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg></div>`;
}

function hashParts() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, qs] = h.split('?');
  return { name: name || '', params: new URLSearchParams(qs || '') };
}
const go = (h) => { location.hash = h; };

// ------------------------------------------------------------------ login --
const DEMO = {
  staff: [
    { label: 'Admin', a: 'admin', b: 'admin@123' },
    { label: 'Dr. Ramesh Sharma (fac101)', a: 'fac101', b: 'fac101@123' },
  ],
  student: [
    { label: 'Aarav, 23CS001', a: '23CS001', b: '2005-03-14' },
    { label: 'Rohan, 23CS003 (defaulter)', a: '23CS003', b: '2004-11-02' },
  ],
};

const BRAND = '<div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>CAAMS</div>';

function loginBody(kind) {
  return `<form class="login-form" id="loginForm" novalidate>
      ${kind === 'staff' ? `
        <div class="field"><label for="a">Username</label><input class="input" id="a" autocomplete="username" required></div>
        <div class="field"><label for="b">Password</label><input class="input" id="b" type="password" autocomplete="current-password" required></div>`
      : `
        <div class="field"><label for="a">Roll number</label><input class="input" id="a" placeholder="23CS001" autocapitalize="characters" required></div>
        <div class="field"><label for="b">Date of birth</label><input class="input" id="b" type="date" required></div>`}
      <div class="form-error" id="loginErr" role="alert"></div>
      <button class="btn" type="submit">Sign in</button>
    </form>
    <div class="demo">Demo accounts (tap to fill in)
      <div class="demo-list">${DEMO[kind].map((d, i) => `<button class="chip" data-demo="${i}">${esc(d.label)}</button>`).join('')}</div>
    </div>`;
}

async function renderLogin(kind = 'staff') {
  $('.shell') && $('.shell').remove();
  root.innerHTML = `<div class="login">
    <section class="hero" aria-labelledby="hero">
      ${BRAND.replace('class="brand"', 'class="brand light"')}
      <h1 id="hero">The college register, kept live.</h1>
      <p class="lead">Teachers mark attendance, review leave and publish marks. Students see their own percentage the moment it changes. Every number on these screens comes from one SQLite database.</p>
      <div class="reg-card">
        <div class="reg-card-head"><span><b>DBMS (CS501)</b>, last 24 lectures</span><span class="live">Live from SQLite</span></div>
        <div class="reg-preview" id="preview" aria-label="Sample rows of the DBMS attendance register"></div>
        <div class="reg-legend"><span><i class="lp"></i>Present</span><span><i class="la"></i>Absent</span><span>Below 75% shows in coral</span></div>
      </div>
      <div class="float f1" id="f1" hidden><span class="dot">${icon('alert')}</span><span id="f1t"></span></div>
      <div class="float f2"><span class="dot">${icon('attendance')}</span><span>Approved leave counts as attended</span></div>
    </section>
    <section class="login-side"><div class="login-box">
      ${BRAND}
      <h2>Sign in</h2>
      <p class="muted" style="margin:0">College Academic &amp; Attendance Management System</p>
      <div class="tabs" role="tablist" data-kind="${kind}">
        <button role="tab" aria-selected="${kind === 'staff'}" data-kind="staff">Teacher or admin</button>
        <button role="tab" aria-selected="${kind === 'student'}" data-kind="student">Student</button>
      </div>
      <div class="login-body" id="loginBody"></div>
    </div></section></div>`;
  splitWords($('#hero'));

  const setKind = (k) => {
    kind = k;
    $('.tabs').dataset.kind = k;
    root.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.kind === k)));
    const body = $('#loginBody');
    body.innerHTML = loginBody(k);
    body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap');
    bindForm();
  };
  const bindForm = () => {
    root.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
      const d = DEMO[kind][Number(b.dataset.demo)];
      root.querySelectorAll('[data-demo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#a').value = d.a; $('#b').value = d.b;
      $('#loginForm button[type=submit]').focus();
    }));
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const a = $('#a').value.trim(), b = $('#b').value;
      const fail = (msg) => {
        $('#loginErr').textContent = msg;
        const box = $('.login-box');
        box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
      };
      if (!a || !b) { fail('Fill in both fields.'); return; }
      try {
        const body = kind === 'staff' ? { kind, username: a, password: b } : { kind, roll_no: a, dob: b };
        const { user } = await api('login', body);
        state.user = user;
        $('.login').classList.add('leaving');
        setTimeout(() => { go(user.role === 'student' ? '#/me' : '#/overview'); route(); }, REDUCED ? 0 : 380);
      } catch (err) {
        fail(err.message);
      }
    });
    $('#a').focus();
  };
  root.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.kind !== kind) setKind(b.dataset.kind); }));
  $('#loginBody').innerHTML = loginBody(kind);
  bindForm();

  try {
    const { rows } = await api('preview');
    let low = 0;
    $('#preview').innerHTML = rows.map((r, ri) => {
      const p = (r.strip.match(/P/g) || []).length;
      const pct = r.strip.length ? Math.round((100 * p) / r.strip.length) : 0;
      if (pct < 75) low++;
      return `<div class="reg-row"><span class="roll">${esc(r.roll_no)}</span>
        <span class="strip lg">${[...r.strip].map((c, i) => `<i class="${c === 'A' ? 'a' : ''}" style="--i:${ri * 3 + i}"></i>`).join('')}</span>
        <span class="pct${pct < 75 ? ' low' : ''}" data-count="${pct}" data-suffix="%">${pct}%</span></div>`;
    }).join('');
    $('#preview').querySelectorAll('[data-count]').forEach(countUp);
    if (low) { $('#f1t').textContent = `${low} of ${rows.length} students below 75%`; $('#f1').hidden = false; }
  } catch (_) { /* preview is decoration only */ }
}

// ------------------------------------------------------------------ shell --
const STAFF_NAV = [
  ['Daily work', [['overview', 'Overview', 'overview'], ['attendance', 'Take attendance', 'attendance'], ['register', 'Register', 'register'], ['leaves', 'Leave & defaulters', 'leaves']]],
  ['Records', [['students', 'Students', 'students'], ['results', 'Results', 'results']]],
  ['Database', [['sql', 'SQL console', 'sql'], ['audit', 'Audit log', 'audit']]],
];
const STUDENT_NAV = [['My record', [['me', 'My attendance', 'pulse'], ['me-results', 'My results', 'results'], ['me-leaves', 'Leave', 'leaves']]]];

const initials = (name) => name.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// The sidebar is drawn once per login and stays put; pages only swap <main>,
// so the active pill can slide from the old item to the new one.
function shell(active, content) {
  const u = state.user;
  const who = u.role + ':' + u.name;
  if (!$('.shell') || $('.shell').dataset.who !== who) {
    const nav = u.role === 'student' ? STUDENT_NAV : STAFF_NAV;
    const role = u.role === 'student' ? `Student, ${esc(u.roll_no)}` : u.role === 'admin' ? 'Full access' : `Faculty, ${esc(u.faculty_id)}`;
    let n = 0;
    root.innerHTML = `<div class="shell" data-who="${esc(who)}">
      <aside class="side">
        ${BRAND}
        <nav class="nav" aria-label="Main"><span class="nav-ind" aria-hidden="true"></span>${nav.map(([g, items]) => `<div class="nav-group">${g}</div>${items.map(([k, label, ic]) =>
          `<a href="#/${k}" data-k="${k}" style="--i:${n++}">${icon(ic)}<span>${label}</span></a>`).join('')}`).join('')}</nav>
        <div class="me"><span class="avatar" aria-hidden="true"><span>${esc(initials(u.name))}</span></span>
          <div class="who"><strong>${esc(u.name)}</strong><span class="role">${role}</span></div>
          <button class="icon-btn" id="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button></div>
      </aside>
      <main class="main" id="main"></main></div>`;
    $('#logout').addEventListener('click', async () => {
      await api('logout', {}).catch(() => {});
      state.user = null;
      history.replaceState(null, '', '/');
      renderLogin();
    });
  }
  root.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.k === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  setBadge();
  const cur = $('.nav a[aria-current]'), ind = $('.nav-ind');
  if (cur && ind) {
    ind.style.transform = `translateY(${cur.offsetTop}px)`;
    ind.style.height = cur.offsetHeight + 'px';
    ind.style.opacity = '1';
    requestAnimationFrame(() => ind.classList.add('ready'));
  }
  const main = $('#main');
  main.innerHTML = content;
  enhance(main);
}

function setBadge() {
  const link = $('.nav a[data-k="leaves"]');
  if (!link) return;
  let badge = $('.badge', link);
  if (!state.pending) { if (badge) badge.remove(); return; }
  if (!badge) { badge = document.createElement('span'); badge.className = 'badge'; link.appendChild(badge); }
  if (badge.textContent !== String(state.pending)) {
    badge.textContent = state.pending;
    badge.classList.remove('tick'); void badge.offsetWidth; badge.classList.add('tick');
  }
}

const loading = (active) => shell(active, '<div class="skel" aria-label="Loading"><i></i><div class="row"><i></i><i></i><i></i></div><i style="height:260px"></i></div>');

// --------------------------------------------------------------- overview --
async function pageOverview() {
  loading('overview');
  const d = await api('overview');
  const k = d.kpi;
  state.pending = k.pending_leaves;
  shell('overview', `
    ${pageHead(`Hello, ${esc(state.user.name.split(' ').slice(-1)[0] === 'Administrator' ? 'admin' : state.user.name)}`,
      'Where the college stands today: attendance against the 75% rule, who is at risk, and what needs a decision.', [d.sql[0]], '', 'hero-head')}
    <div class="kpis">${[
      ['', 'students', k.students, '', 'Students'],
      ['', 'cap', k.faculty, '', 'Faculty'],
      ['', 'book', k.sessions, '', 'Lectures held'],
      ['ok', 'pulse', k.overall_pct, '%', 'Overall attendance'],
      ['bad', 'alert', k.defaulters, '', 'Students below 75%'],
      ['warn', 'leaves', k.pending_leaves, '', 'Leave requests waiting'],
    ].map(([cls, ic, v, suf, l], i) => `<div class="kpi ${cls}" style="--k:${i}"><span class="ic">${icon(ic)}</span>
      <div class="v" data-count="${v}" data-suffix="${suf}">${v}${suf}</div><div class="l">${l}</div></div>`).join('')}
    </div>
    <div class="grid cols-3-2">
      ${panel({ title: 'Attendance week by week', sub: 'Share of students present, all subjects', body: lineChart(d.weekly), sql: [d.sql[1]] })}
      ${panel({ title: 'Subjects, weakest first', sub: 'Average adjusted attendance', body: bars(d.subjects.map((s) => ({ label: s.subject_id + ' ' + s.subject_name, title: s.faculty, value: s.avg_attendance }))), sql: [d.sql[3]] })}
    </div>
    <div class="grid cols-3-2" style="margin-top:20px">
      ${panel({ title: 'Students most at risk', sub: 'Lowest adjusted attendance in any subject. Open a row for the full record.',
        body: table([
          { label: 'Student', render: (r) => `<b>${esc(r.student_name)}</b><br><span class="faint">${esc(r.roll_no)}</span>` },
          { label: 'Subject', key: 'subject_id' },
          { label: 'Attendance', render: (r) => pctPill(r.adjusted_pct) },
          { label: 'Classes needed', n: true, key: 'classes_needed' },
          { label: 'Risk', render: (r) => riskPill(r.risk) },
        ], d.risk, { onRow: (r) => `data-student="${esc(r.roll_no)}"` }), sql: [d.sql[4]] })}
      ${panel({ title: 'Departments', sub: 'Average adjusted attendance per department', body: bars(d.depts.map((x) => ({ label: x.dept_name, value: x.avg_attendance }))) +
        `<p class="faint" style="margin:14px 0 0;font-size:14px">${d.depts.map((x) => `${esc(x.dept_id)}: ${x.students} students, ${x.defaulter_students} below 75%`).join('<br>')}</p>`, sql: [d.sql[2]] })}
    </div>`);
}

// -------------------------------------------------------- take attendance --
async function pageAttendance() {
  loading('attendance');
  const { subjects, sql } = await api('subjects');
  const att = state.att;
  if (att.subject && !subjects.some((s) => s.subject_id === att.subject)) att.subject = null;
  let rosterHtml = '';
  if (att.subject) {
    const r = await api('roster?subject=' + encodeURIComponent(att.subject));
    att.roster = r.roster;
    att.absent = new Set();
    rosterHtml = `
      <div class="session-form">
        <div class="field"><label for="sDate">Date</label><input class="input" id="sDate" type="date" value="${r.today}" max="${r.today}"></div>
        <div class="field"><label for="sTime">Start time</label><input class="input" id="sTime" type="time" value="10:00"></div>
        <div class="field"><label for="sTopic">Topic covered</label><input class="input" id="sTopic" placeholder="Lecture"></div>
      </div>
      ${panel({ title: `Roll call, ${esc(r.subject.subject_name)}`, sub: 'Everyone starts as present. Tap a student to mark them absent. The strip shows their last 12 classes.',
        body: `<div class="roster">${r.roster.map((s, i) => `
          <button class="tile" style="--i:${Math.min(i, 30)}" data-roll="${esc(s.roll_no)}" aria-pressed="false">
            <span class="who"><b>${esc(s.name)}</b></span>
            <span class="roll">${esc(s.roll_no)}</span>
            ${strip(s.strip)}
            <span class="faint" style="font-size:13px">Now ${s.adjusted_pct == null ? 'no classes' : round(s.adjusted_pct) + '%'}</span>
            <span class="mark" aria-hidden="true"></span><span class="stamp" aria-hidden="true">ABSENT</span>
          </button>`).join('')}</div>`, sql: r.sql })}
      <div class="savebar"><span class="count" id="count"></span>
        <button class="btn" id="saveAtt">Save attendance</button></div>
      <div id="saved"></div>`;
  }
  shell('attendance', `
    ${pageHead('Take attendance', 'Pick a subject, mark who is absent, save. The lecture and every student’s mark are written in one transaction, so either all of it is saved or none of it is.', sql)}
    <div class="subject-pick">${subjects.map((s, i) => `
      <button class="subject-card" style="--i:${i}" data-subject="${esc(s.subject_id)}" aria-pressed="${s.subject_id === att.subject}">
        <span class="code">${esc(s.subject_id)}</span><span>${esc(s.subject_name)}</span>
        <span class="meta">${esc(s.faculty)}, ${s.enrolled} students</span></button>`).join('')}</div>
    ${rosterHtml}`);

  root.querySelectorAll('[data-subject]').forEach((b) => b.addEventListener('click', () => { att.subject = b.dataset.subject; pageAttendance(); }));
  if (!att.subject) return;
  const updateCount = (bump) => {
    const a = att.absent.size, p = att.roster.length - a;
    $('#count').innerHTML = `<span><b class="${bump ? 'bump' : ''}">${p}</b> present</span><span class="a"><b class="${bump ? 'bump' : ''}">${a}</b> absent</span>`;
  };
  updateCount(false);
  root.querySelectorAll('.tile').forEach((t) => t.addEventListener('click', () => {
    const roll = t.dataset.roll;
    if (att.absent.has(roll)) att.absent.delete(roll); else att.absent.add(roll);
    const absent = att.absent.has(roll);
    t.classList.toggle('absent', absent);
    t.setAttribute('aria-pressed', String(absent));
    updateCount(true);
  }));
  $('#saveAtt').addEventListener('click', async () => {
    const btn = $('#saveAtt');
    btn.disabled = true;
    try {
      const res = await api('attendance', {
        subject_id: att.subject, date: $('#sDate').value, time: $('#sTime').value,
        topic: $('#sTopic').value.trim() || 'Lecture', absent: [...att.absent],
      });
      toast(`Attendance saved as lecture #${res.session_id}`);
      btn.textContent = 'Saved';
      confetti(btn);
      $('#saved').innerHTML = `<div style="margin-top:20px;animation:popIn .6s var(--spring)">${panel({
        title: `Saved lecture #${res.session_id}`,
        sub: `${res.present} present, ${res.absent} absent. Triggers checked that every student is enrolled and the date is not in the future.`,
        body: `<button class="btn ghost" data-href="#/register?subject=${esc(att.subject)}">Open the register</button>`, sql: res.sql })}</div>`;
      $('#saved').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      const s = sqlButton(err.sql);
      $('#saved').innerHTML = `<section class="panel" style="margin-top:20px;border-color:#efb3ad">
        <div class="panel-head"><div><h2 style="color:var(--margin)">Not saved</h2><p>${esc(err.message)}</p></div>${s.button}</div>${s.box}
        <p class="muted" style="margin:0;font-size:14px">Nothing was written: the transaction rolled back, so there is no half-saved lecture.</p></section>`;
      $('#saved').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      btn.disabled = false;
    }
  });
}

// --------------------------------------------------------------- register --
async function pageRegister(params) {
  loading('register');
  const { subjects } = await api('subjects');
  if (!subjects.length) { shell('register', pageHead('Register', 'You do not teach any subject yet.')); return; }
  const code = params.get('subject') || state.att.subject || subjects[0].subject_id;
  const d = await api('register?subject=' + encodeURIComponent(code));
  shell('register', `
    ${pageHead('Register', 'The attendance register for one subject: the last 16 lectures, one square per student per lecture. Open a row for the student’s full record.', null,
      `<label class="sr-only" for="regSub">Subject</label><select class="input" id="regSub" style="width:auto">${subjects.map((s) =>
        `<option value="${esc(s.subject_id)}"${s.subject_id === code ? ' selected' : ''}>${esc(s.subject_id)} ${esc(s.subject_name)}</option>`).join('')}</select>`)}
    ${panel({ title: esc(d.subject.subject_name), sub: `${d.students.length} students, ${d.sessions.length} most recent lectures shown`,
      extra: `<div class="legend"><span><i class="cell p"></i>Present</span><span><i class="cell a"></i>Absent</span></div>`,
      body: `<div class="table-wrap"><table class="register">
        <thead><tr><th style="text-align:left">Student</th>${d.sessions.map((s) => `<th class="d" title="${esc(s.topic || '')}">${day(s.session_date)}</th>`).join('')}<th style="text-align:left;padding-left:16px">Adjusted attendance</th></tr></thead>
        <tbody>${d.students.map((s, ri) => `<tr class="click" data-student="${esc(s.roll_no)}" style="cursor:pointer;--r:${Math.min(ri, 24)}">
          <td class="who"><b>${esc(s.student_name)}</b><small>${esc(s.roll_no)}</small></td>
          ${s.cells.map((c, i) => `<td><span class="cell ${c === 'P' ? 'p' : c === 'A' ? 'a' : ''}" style="--c:${i};--r:${Math.min(ri, 24)}" title="${day(d.sessions[i].session_date)}: ${c === 'P' ? 'present' : c === 'A' ? 'absent' : 'no mark'}"></span></td>`).join('')}
          <td class="pct">${pctPill(s.adjusted_pct)} ${s.classes_needed > 0 ? `<span class="faint" style="font-size:13px">needs ${s.classes_needed}</span>` : ''}</td></tr>`).join('')}</tbody>
      </table></div>`, sql: d.sql })}`);
  $('#regSub').addEventListener('change', (e) => go('#/register?subject=' + e.target.value));
}

// --------------------------------------------------------------- students --
async function pageStudents(params) {
  loading('students');
  const q = params.get('q') || '', dept = params.get('dept') || '', year = params.get('year') || '';
  const d = await api(`students?q=${encodeURIComponent(q)}&dept=${encodeURIComponent(dept)}&year=${encodeURIComponent(year)}`);
  shell('students', `
    ${pageHead('Students', 'Every student with department, year and phones. Search by name, roll number or city; open a row for attendance, marks and leave.')}
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:18px">
      <label class="sr-only" for="sq">Search</label>
      <input class="input" id="sq" type="search" placeholder="Search name, roll number or city" value="${esc(q)}" style="max-width:320px">
      <div class="demo-list" style="margin:0">
        <button class="chip" data-dept="" aria-pressed="${!dept}">All departments</button>
        ${d.depts.map((x) => `<button class="chip" data-dept="${esc(x.dept_id)}" aria-pressed="${x.dept_id === dept}" title="${esc(x.dept_name)}">${esc(x.dept_id)}</button>`).join('')}
      </div>
      <label class="sr-only" for="sy">Year</label>
      <select class="input" id="sy" style="width:auto"><option value="">All years</option>${[1, 2, 3, 4].map((y) => `<option value="${y}"${String(y) === year ? ' selected' : ''}>Year ${y}</option>`).join('')}</select>
    </div>
    ${panel({ title: `${d.students.length} student${d.students.length === 1 ? '' : 's'}`, sub: 'From the view v_student_profile: full name and age are worked out, phones are joined from student_phone.',
      body: table([
        { label: 'Roll no', key: 'roll_no' },
        { label: 'Name', render: (r) => `<b>${esc(r.full_name)}</b>` },
        { label: 'Dept', key: 'dept_id' },
        { label: 'Year', key: 'year', n: true },
        { label: 'Age', key: 'age', n: true },
        { label: 'City', key: 'city' },
        { label: 'Phones', key: 'phones' },
      ], d.students, { onRow: (r) => `data-student="${esc(r.roll_no)}"` }), sql: [d.sql[0]] })}`);

  const apply = (patch) => {
    const p = new URLSearchParams({ q, dept, year, ...patch });
    [...p.keys()].forEach((k) => { if (!p.get(k)) p.delete(k); });
    go('#/students' + (p.toString() ? '?' + p : ''));
  };
  let t;
  $('#sq').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => apply({ q: e.target.value.trim() }), 350); });
  root.querySelectorAll('[data-dept]').forEach((b) => b.addEventListener('click', () => apply({ dept: b.dataset.dept })));
  $('#sy').addEventListener('change', (e) => apply({ year: e.target.value }));
  if (q) { const el = $('#sq'); el.focus(); el.setSelectionRange(q.length, q.length); }
}

// ------------------------------------------------- student record pieces --
function advice(a) {
  if (!a.total_classes) return '<div class="advice">No lectures recorded yet.</div>';
  if (a.classes_needed === 1) return '<div class="advice bad">Attend the next class to reach 75%.</div>';
  if (a.classes_needed > 0) return `<div class="advice bad">Attend the next ${a.classes_needed} classes in a row to reach 75%.</div>`;
  const can = Math.floor((a.present + a.on_leave) / 0.75 - a.total_classes);
  return can > 0
    ? `<div class="advice">You can miss ${can} more class${can === 1 ? '' : 'es'} and stay above 75%.</div>`
    : '<div class="advice">You are right at 75%. Do not miss the next class.</div>';
}

function subjectCards(att) {
  return `<div class="subjects">${att.map((a, i) => `
    <article class="subj${a.adjusted_pct != null && a.adjusted_pct < 75 ? ' risk' : ''}" style="--i:${i}">
      <div class="subj-top">${ring(a.adjusted_pct)}
        <div><span class="code">${esc(a.subject_id)}</span><h3>${esc(a.subject_name)}</h3>
          <div class="muted" style="font-size:14px">${a.present} present${a.on_leave ? ` + ${a.on_leave} on approved leave` : ''} of ${a.total_classes} lectures</div></div></div>
      ${strip(a.strip, 0, true)}
      ${advice(a)}
    </article>`).join('')}</div>`;
}

function resultsTable(results) {
  return table([
    { label: 'Subject', render: (r) => `<b>${esc(r.subject_id)}</b> ${esc(r.subject_name)}` },
    { label: 'Credits', key: 'credits', n: true },
    { label: 'Internal /20', key: 'internal', n: true },
    { label: 'Mid-sem /30', key: 'midsem', n: true },
    { label: 'End-sem /50', key: 'endsem', n: true },
    { label: '%', key: 'percentage', n: true },
    { label: 'Grade', render: (r) => gradePill(r.grade) },
  ], results);
}

function leavesTable(leaves) {
  return table([
    { label: 'From', render: (r) => `<span style="white-space:nowrap">${day(r.from_date)}</span>` },
    { label: 'To', render: (r) => `<span style="white-space:nowrap">${day(r.to_date)}</span>` },
    { label: 'Type', key: 'leave_type' },
    { label: 'Reason', key: 'reason' },
    { label: 'Status', render: (r) => statusPill(r.status) },
    { label: 'Reviewed by', render: (r) => esc(r.reviewed_by || '–') },
  ], leaves);
}

async function openStudent(roll) {
  const drawer = $('#drawer');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  document.body.appendChild(scrim);
  drawer.hidden = false;
  drawer.innerHTML = '<div class="skel"><i></i><div class="row"><i></i><i></i></div><i style="height:220px"></i></div>';
  drawer.scrollTop = 0;
  requestAnimationFrame(() => requestAnimationFrame(() => { drawer.classList.add('open'); scrim.classList.add('open'); }));
  const close = () => {
    drawer.classList.remove('open'); scrim.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { if (!drawer.classList.contains('open')) drawer.hidden = true; scrim.remove(); }, REDUCED ? 0 : 500);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  try {
    const d = await api('students/' + encodeURIComponent(roll));
    const p = d.profile;
    const s = sqlButton(d.sql);
    drawer.innerHTML = `
      <div class="drawer-head"><div><h2>${esc(p.full_name)}</h2>
        <div class="facts"><span>${esc(p.roll_no)}</span><span>${esc(p.dept_name)}, year ${p.year}</span><span>Age ${p.age}</span>
        <span>${esc(p.city || '')}</span><span>${esc(p.email || '')}</span><span>${esc(p.phones || 'no phone on record')}</span></div></div>
        <div style="display:flex;gap:8px">${s.button}<button class="btn ghost" id="closeDrawer">Close</button></div></div>
      ${s.box}
      <h3 style="font-size:19px;margin:6px 0 12px">Attendance</h3>${subjectCards(d.attendance)}
      <div class="panel" style="margin-top:20px"><div class="panel-head"><h2>Marks</h2><div class="sgpa"><span class="muted">SGPA</span><b style="font-size:32px"${d.sgpa == null ? '' : ` data-count="${d.sgpa}"`}>${d.sgpa == null ? '–' : d.sgpa}</b></div></div>${resultsTable(d.results)}</div>
      <div class="panel" style="margin-top:20px"><div class="panel-head"><h2>Leave</h2></div>${leavesTable(d.leaves)}</div>`;
    enhance(drawer);
    $('#closeDrawer').addEventListener('click', close);
    $('#closeDrawer').focus();
  } catch (err) {
    drawer.innerHTML = `<p class="form-error">${esc(err.message)}</p><button class="btn ghost" id="closeDrawer">Close</button>`;
    $('#closeDrawer').addEventListener('click', close);
  }
}

// ---------------------------------------------------------------- results --
async function pageResults(params) {
  loading('results');
  const code = params.get('subject') || '';
  const d = await api('results' + (code ? '?subject=' + encodeURIComponent(code) : ''));
  const max = Math.max(1, ...d.dist.map((x) => x.n));
  shell('results', `
    ${pageHead('Results', 'Internal, mid-sem and end-sem marks combined into a percentage and grade. A blank mark means the student was absent for that exam.', null,
      `<label class="sr-only" for="resSub">Subject</label><select class="input" id="resSub" style="width:auto">${d.subjects.map((s) =>
        `<option value="${esc(s.subject_id)}"${s.subject_id === d.subject.subject_id ? ' selected' : ''}>${esc(s.subject_id)} ${esc(s.subject_name)}</option>`).join('')}</select>`)}
    <div class="grid cols-3-2">
      ${panel({ title: `Result sheet, ${esc(d.subject.subject_name)}`, sub: 'From the view v_result_sheet', body: table([
        { label: 'Student', render: (r) => `<b>${esc(r.student_name)}</b><br><span class="faint">${esc(r.roll_no)}</span>` },
        { label: 'Int.', key: 'internal', n: true }, { label: 'Mid', key: 'midsem', n: true }, { label: 'End', key: 'endsem', n: true },
        { label: 'Total', render: (r) => `${cell(r.total)} / ${r.out_of}`, n: true },
        { label: '%', key: 'percentage', n: true }, { label: 'Grade', render: (r) => gradePill(r.grade) },
      ], d.sheet, { onRow: (r) => `data-student="${esc(r.roll_no)}"` }), sql: [d.sql[1]] })}
      <div class="grid" style="align-content:start">
        ${panel({ title: 'Grade spread', body: `<div class="bars">${d.dist.map((g) => `<div class="bar-row" style="grid-template-columns:40px 1fr 40px">
          <span class="name">${gradePill(g.grade)}</span><span class="track"><span class="${g.grade === 'F' ? 'low' : ''}" style="width:${(100 * g.n) / max}%;--i:${d.dist.indexOf(g)}"></span></span><span class="v">${g.n}</span></div>`).join('')}</div>`, sql: [d.sql[2]] })}
        ${panel({ title: 'Top SGPA in college', body: table([
          { label: 'Student', render: (r) => esc(r.student_name) }, { label: 'SGPA', key: 'sgpa', n: true },
          { label: 'Backlogs', n: true, render: (r) => (r.backlogs ? `<span class="pill red">${r.backlogs}</span>` : '0') },
        ], d.ranking, { onRow: (r) => `data-student="${esc(r.roll_no)}"` }), sql: [d.sql[3]] })}
      </div>
    </div>`);
  root.querySelectorAll('.bars .track').forEach((t) => t.classList.add('plain'));
  $('#resSub').addEventListener('change', (e) => go('#/results?subject=' + e.target.value));
}

// ------------------------------------------------------- leave/defaulters --
async function pageLeaves() {
  loading('leaves');
  const d = await api('defaulters');
  state.pending = d.pending.length;
  shell('leaves', `
    ${pageHead('Leave & defaulters', 'Approved leave counts as attended. Approve a request and watch the student’s adjusted attendance change straight away, because the view recalculates it.')}
    <div class="grid cols-3-2">
      ${panel({ title: `Waiting for a decision (${d.pending.length})`, sub: 'A decision cannot be changed later: a trigger blocks it.',
        body: d.pending.length ? `<div class="leave-list">${d.pending.map((l, i) => `
          <div class="leave" style="--i:${i}" id="leave-${l.leave_id}">
            <div class="leave-top"><div><b>${esc(l.name)}</b> <span class="faint">${esc(l.roll_no)}</span></div><span class="pill amber">${esc(l.leave_type)}</span></div>
            <div>${day(l.from_date)} to ${day(l.to_date)}, applied ${day(l.applied_on)}</div>
            <div class="reason">${esc(l.reason)}</div>
            <div class="actions"><button class="btn ok" data-review="${l.leave_id}" data-decision="Approved">Approve</button>
              <button class="btn ghost" data-review="${l.leave_id}" data-decision="Rejected">Reject</button>
              <button class="linkish" data-student="${esc(l.roll_no)}">Open record</button></div>
          </div>`).join('')}</div>` : '<div class="empty">No leave requests are waiting.</div>', sql: [d.sql[1]] })}
      ${panel({ title: 'Recently decided', body: table([
        { label: 'Student', key: 'roll_no' }, { label: 'Dates', render: (r) => `<span style="white-space:nowrap">${day(r.from_date)} to ${day(r.to_date)}</span>` },
        { label: 'Status', render: (r) => statusPill(r.status) }, { label: 'By', render: (r) => esc(r.reviewed_by || '–') },
      ], d.history), sql: [d.sql[2]] })}
    </div>
    <div style="margin-top:20px">${panel({ title: `Below 75% (${d.defaulters.length} student-subject pairs)`, sub: 'From the view v_defaulters. Needs = classes in a row to get back to 75%, worked out as 3T − 4P.',
      extra: '<button class="btn ghost" id="issue">Issue notices for today</button>',
      body: table([
        { label: 'Student', render: (r) => `<b>${esc(r.student_name)}</b><br><span class="faint">${esc(r.roll_no)}</span>` },
        { label: 'Dept', key: 'dept_id' }, { label: 'Subject', key: 'subject_id' },
        { label: 'Attended', n: true, render: (r) => `${r.present}${r.on_leave ? ' + ' + r.on_leave : ''} / ${r.total_classes}` },
        { label: 'Raw', render: (r) => pctPill(r.raw_pct) }, { label: 'Adjusted', render: (r) => pctPill(r.adjusted_pct) },
        { label: 'Needs', n: true, key: 'classes_needed' }, { label: 'Risk', render: (r) => riskPill(r.risk) },
      ], d.defaulters, { onRow: (r) => `data-student="${esc(r.roll_no)}"` }), sql: [d.sql[0]] })}</div>`);

  root.querySelectorAll('[data-review]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.review, decision = b.dataset.decision;
    try {
      const r = await api(`leaves/${id}/review`, { decision });
      const box = $('#leave-' + id);
      const s = sqlButton(r.sql);
      $('.actions', box).outerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">${statusPill(decision)}${s.button}</div>${s.box}
        <div class="impact">${r.impact.map((x, i) => `<div style="--i:${i}"><b>${esc(x.subject_id)}</b><span>${round(x.before)}% → <span class="${x.after > x.before ? 'up' : ''}" data-count="${round(x.after)}" data-suffix="%">${round(x.after)}%</span></span></div>`).join('')}</div>`;
      box.classList.add(decision === 'Approved' ? 'done-ok' : 'done-no');
      box.querySelectorAll('[data-count]').forEach(countUp);
      if (decision === 'Approved') confetti(box);
      state.pending = Math.max(0, (state.pending || 1) - 1);
      setBadge();
      toast(`Leave ${decision.toLowerCase()} for ${r.roll_no}`);
    } catch (err) { toast(err.message, true); }
  }));
  $('#issue').addEventListener('click', async () => {
    try {
      const r = await api('notices', {});
      toast(r.issued ? `${r.issued} notices issued` : 'Every defaulter already has a notice for today');
    } catch (err) { toast(err.message, true); }
  });
}

// ------------------------------------------------------------ SQL console --
const EXAMPLES = [
  ['Students per department', 'SELECT dept_id, COUNT(*) AS students\nFROM student\nGROUP BY dept_id\nORDER BY students DESC;'],
  ['Defaulters in DBMS', "SELECT roll_no, student_name, adjusted_pct, classes_needed\nFROM v_defaulters\nWHERE subject_id = 'CS501';"],
  ['Top 3 per subject', 'WITH ranked AS (\n  SELECT subject_id, student_name, percentage,\n         DENSE_RANK() OVER (PARTITION BY subject_id ORDER BY percentage DESC) AS rnk\n  FROM v_result_sheet)\nSELECT * FROM ranked WHERE rnk <= 3;'],
  ['Is the index used?', "EXPLAIN QUERY PLAN\nSELECT * FROM attendance WHERE roll_no = '23CS001';"],
];

async function pageSql() {
  loading('sql');
  const { objects } = await api('schema');
  const admin = state.user.role === 'admin';
  const groups = ['table', 'view', 'trigger', 'index'].map((t) => [t, objects.filter((o) => o.type === t)]);
  shell('sql', `
    ${pageHead('SQL console', admin ? 'Run any SQL on the live database. Changes are saved for real.' : 'Run read-only queries (SELECT, WITH, PRAGMA, EXPLAIN) on the live database.')}
    <div class="grid cols-3-2">
      <div class="grid" style="align-content:start">
        <section class="panel console">
          <label class="sr-only" for="sqlIn">SQL</label>
          <textarea class="input" id="sqlIn" spellcheck="false">${esc(EXAMPLES[0][1])}</textarea>
          <div class="console-bar"><div class="examples">${EXAMPLES.map((e, i) => `<button class="chip" data-ex="${i}">${esc(e[0])}</button>`).join('')}</div>
            <button class="btn" id="runSql">Run query</button></div>
        </section>
        <div id="sqlOut"></div>
      </div>
      ${panel({ title: 'What is in the database', sub: `${objects.length} objects`, body: groups.map(([t, list]) =>
        `<h3 style="font-size:15px;margin:10px 0 6px;text-transform:capitalize">${t}s (${list.length})</h3><div class="objects">${list.map((o) => `<div>${esc(o.name)}</div>`).join('')}</div>`).join('') })}
    </div>`);
  const run = async () => {
    const out = $('#sqlOut');
    try {
      const r = await api('sql', { sql: $('#sqlIn').value });
      out.innerHTML = panel({
        title: r.message || `${r.count} row${r.count === 1 ? '' : 's'}`, sub: `${r.ms} ms${r.count > 200 ? ', first 200 shown' : ''}`,
        body: r.columns ? table(r.columns.map((c) => ({ label: esc(c), key: c })), r.rows) : '',
      });
    } catch (err) {
      out.innerHTML = `<section class="panel"><p class="form-error" style="margin:0">${esc(err.message)}</p></section>`;
    }
  };
  $('#runSql').addEventListener('click', run);
  $('#sqlIn').addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(); });
  root.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => { $('#sqlIn').value = EXAMPLES[Number(b.dataset.ex)][1]; run(); }));
  run();
}

async function pageAudit() {
  loading('audit');
  const d = await api('audit');
  shell('audit', `
    ${pageHead('Audit log', 'Nobody writes this table directly. Triggers add a row whenever attendance is corrected or deleted, a student is added, changed or removed, marks change, or a leave is decided.', d.sql)}
    ${panel({ title: 'Latest 40 changes', body: table([
      { label: '#', key: 'log_id', n: true }, { label: 'Table', key: 'table_name' },
      { label: 'Change', render: (r) => `<span class="pill ${r.operation === 'DELETE' ? 'red' : r.operation === 'INSERT' ? 'green' : 'amber'}">${esc(r.operation)}</span>` },
      { label: 'Row', key: 'row_key' }, { label: 'Before', key: 'old_value' }, { label: 'After', key: 'new_value' }, { label: 'When', key: 'changed_at' },
    ], d.log) })}`);
}

// ------------------------------------------------------- student portal --
let myCache = null;
async function myRecord(force) {
  if (!myCache || force) myCache = await api('my');
  return myCache;
}

async function pageMe() {
  loading('me');
  const d = await myRecord(true);
  const att = d.attendance;
  const total = att.reduce((s, a) => s + a.total_classes, 0);
  const got = att.reduce((s, a) => s + a.present + a.on_leave, 0);
  const overall = total ? Math.round((1000 * got) / total) / 10 : null;
  const risky = att.filter((a) => a.adjusted_pct != null && a.adjusted_pct < 75).length;
  const s = sqlButton(d.sql);
  shell('me', `
    <div class="hello"><div><h1>${esc(d.profile.full_name.split(' ')[0])}, ${risky ? `${risky} subject${risky === 1 ? ' needs' : 's need'} your attention` : 'you are above 75% everywhere'}</h1>
      <p class="muted" style="margin:8px 0 0">${esc(d.profile.roll_no)}, ${esc(d.profile.dept_name)}, year ${d.profile.year}. Approved leave is counted as attended.</p></div>
      <div class="overall"><div style="--k:0"><b class="${overall != null && overall < 75 ? 'low' : ''}"${overall == null ? '' : ` data-count="${overall}" data-suffix="%"`}>${overall == null ? '–' : overall + '%'}</b>Overall</div>
        <div style="--k:1"><b><span data-count="${got}">${got}</span>/${total}</b>Classes attended</div>
        <div style="--k:2"><b${d.sgpa == null ? '' : ` data-count="${d.sgpa}"`}>${d.sgpa == null ? '–' : d.sgpa}</b>SGPA</div></div></div>
    ${subjectCards(att)}
    <div style="margin-top:22px;display:flex;justify-content:flex-end">${s.button}</div>${s.box}`);
}

async function pageMyResults() {
  loading('me-results');
  const d = await myRecord();
  const credits = d.results.reduce((s, r) => s + r.credits, 0);
  shell('me-results', `
    ${pageHead('My results', 'Your marks so far. SGPA is the credit-weighted average of grade points: Σ(credits × grade point) ÷ Σ credits.', [d.sql[3], d.sql[4]])}
    <div class="grid cols-3-2">
      ${panel({ title: 'Marksheet', body: resultsTable(d.results) })}
      <section class="panel"><div class="panel-head"><h2>SGPA</h2></div>
        <div class="sgpa"><b${d.sgpa == null ? '' : ` data-count="${d.sgpa}"`}>${d.sgpa == null ? '–' : d.sgpa}</b><span class="muted">out of 10, over ${credits} credits</span></div>
        <div class="bars" style="margin-top:22px">${d.results.map((r, i) => `<div class="bar-row"><span class="name">${esc(r.subject_id)}</span>
          <span class="track"><span class="${r.percentage < 40 ? 'low' : ''}" style="width:${r.percentage}%;--i:${i}"></span></span><span class="v">${gradePill(r.grade)}</span></div>`).join('')}</div>
      </section>
    </div>`);
  root.querySelectorAll('.track').forEach((t) => t.classList.add('plain'));
}

async function pageMyLeaves() {
  loading('me-leaves');
  const d = await myRecord();
  shell('me-leaves', `
    ${pageHead('Leave', 'Ask for leave here. Once a teacher approves it, absences in those dates count as attended.')}
    <div class="grid cols-2">
      <section class="panel"><div class="panel-head"><h2>Ask for leave</h2></div>
        <form class="leave-form" id="leaveForm">
          <div class="field"><label for="lf">From</label><input class="input" id="lf" type="date" required></div>
          <div class="field"><label for="lt">To</label><input class="input" id="lt" type="date" required></div>
          <div class="field wide"><label for="ly">Type</label><select class="input" id="ly">${['Medical', 'Sports', 'Event', 'Personal'].map((t) => `<option>${t}</option>`).join('')}</select></div>
          <div class="field wide"><label for="lr">Reason</label><textarea class="input" id="lr" rows="3" required></textarea></div>
          <div class="form-error wide" id="leaveErr" role="alert"></div>
          <div class="wide"><button class="btn" type="submit">Send leave request</button></div>
        </form></section>
      ${panel({ title: 'My requests', body: leavesTable(d.leaves), sql: [d.sql[5]] })}
    </div>`);
  $('#leaveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { from_date: $('#lf').value, to_date: $('#lt').value || $('#lf').value, leave_type: $('#ly').value, reason: $('#lr').value };
    if (!body.from_date) { $('#leaveErr').textContent = 'Pick the first day of leave.'; return; }
    try {
      await api('my/leaves', body);
      toast('Leave request sent');
      await myRecord(true);
      pageMyLeaves();
    } catch (err) { $('#leaveErr').textContent = err.message; }
  });
}

// ----------------------------------------------------------------- router --
const STAFF_PAGES = { overview: pageOverview, attendance: pageAttendance, register: pageRegister, students: pageStudents, results: pageResults, leaves: pageLeaves, sql: pageSql, audit: pageAudit };
const STUDENT_PAGES = { me: pageMe, 'me-results': pageMyResults, 'me-leaves': pageMyLeaves };

async function route() {
  if (!state.user) return renderLogin();
  const { name, params } = hashParts();
  const pages = state.user.role === 'student' ? STUDENT_PAGES : STAFF_PAGES;
  const page = pages[name] || pages[state.user.role === 'student' ? 'me' : 'overview'];
  try {
    await page(params);
    window.scrollTo(0, 0);
  } catch (err) {
    if (err.status === 401) { state.user = null; return renderLogin(); }
    const main = $('#main') || root;
    main.innerHTML = `<div class="panel"><p class="form-error" style="margin:0">${esc(err.message)}</p></div>`;
  }
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('.sql-toggle');
  if (t) {
    const box = document.getElementById(t.getAttribute('aria-controls'));
    const open = t.getAttribute('aria-expanded') !== 'true';
    t.setAttribute('aria-expanded', String(open));
    box.hidden = !open;
    return;
  }
  const s = e.target.closest('[data-student]');
  if (s && !e.target.closest('[data-review]')) { openStudent(s.dataset.student); return; }
  const h = e.target.closest('[data-href]');
  if (h) go(h.dataset.href);
});
window.addEventListener('hashchange', route);

(async function boot() {
  try {
    state.user = (await api('me')).user;
  } catch (_) {
    state.user = null;
  }
  route();
})();
