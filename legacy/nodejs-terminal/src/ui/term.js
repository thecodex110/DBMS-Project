'use strict';
// ============================================================================
//  TERMINAL UI TOOLKIT  (zero dependencies)
//  colours, boxes, tables, bar charts, SQL highlighting and input prompts.
//  Input uses a line queue so the app also works with piped/scripted input:
//      printf "admin\nadmin@123\n0\n" | npm start
// ============================================================================
const readline = require('node:readline');

const TTY = !!process.stdout.isTTY;
const COLOR = TTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));

const c = {
  bold: paint('1'), dim: paint('2'), italic: paint('3'), under: paint('4'),
  red: paint('31'), green: paint('32'), yellow: paint('33'), blue: paint('34'),
  magenta: paint('35'), cyan: paint('36'), gray: paint('90'), white: paint('97'),
  bRed: paint('1;31'), bGreen: paint('1;32'), bYellow: paint('1;33'), bCyan: paint('1;36'), bMagenta: paint('1;35'),
  bgBlue: paint('44;97;1'), bgRed: paint('41;97;1'), bgGreen: paint('42;30;1'), bgYellow: paint('43;30;1'), bgMagenta: paint('45;97;1'),
};

const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
// emoji / wide symbols take 2 terminal columns
const WIDE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}]/u;
function width(s) {
  const chars = [...stripAnsi(s)];
  let w = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '‍') { i++; continue; } // zero-width joiner: joined emoji shares the cell
    if (ch === '️') continue;
    w += WIDE.test(ch) || chars[i + 1] === '️' ? 2 : 1;
  }
  return w;
}
const padEnd = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));
const padStart = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + s;
function truncate(s, n) {
  const plain = stripAnsi(s);
  return plain.length > n ? plain.slice(0, n - 1) + '…' : s;
}

// ---------------------------------------------------------------- input ----
class InputClosed extends Error {}
let rl = null;
const queue = [];
const waiters = [];
let closed = false;

function ensureReadline() {
  if (rl) return;
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  rl.on('line', (line) => (waiters.length ? waiters.shift()(line) : queue.push(line)));
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });
}

async function ask(prompt) {
  ensureReadline();
  rl.setPrompt(prompt);
  rl.prompt();
  let line;
  if (queue.length) line = queue.shift();
  else if (closed) line = null;
  else line = await new Promise((resolve) => waiters.push(resolve));
  if (line === null) throw new InputClosed('input closed');
  if (!process.stdin.isTTY) process.stdout.write(line + '\n'); // echo scripted input
  return line.trim();
}

async function askText(label, { def, required = false, validate } = {}) {
  for (;;) {
    const hint = def !== undefined && def !== null && def !== '' ? c.gray(` [${def}]`) : '';
    let v = await ask(`  ${c.cyan('›')} ${label}${hint}: `);
    if (v === '' && def !== undefined) v = String(def ?? '');
    if (required && v === '') { error('This field is required.'); continue; }
    if (validate && v !== '') {
      const msg = validate(v);
      if (msg) { error(msg); continue; }
    }
    return v;
  }
}

async function askInt(label, { min = -Infinity, max = Infinity, def } = {}) {
  for (;;) {
    const v = await askText(label, { def, required: def === undefined });
    const n = Number(v);
    if (Number.isInteger(n) && n >= min && n <= max) return n;
    error(`Enter a whole number${Number.isFinite(min) ? ` between ${min} and ${max}` : ''}.`);
  }
}

async function askNumber(label, { min = -Infinity, max = Infinity, def, allowBlank = false } = {}) {
  for (;;) {
    const v = await askText(label, { def });
    if (v === '' && allowBlank) return null;
    const n = Number(v);
    if (v !== '' && Number.isFinite(n) && n >= min && n <= max) return n;
    error(`Enter a number between ${min} and ${max}${allowBlank ? ' (or leave blank)' : ''}.`);
  }
}

async function confirm(label, def = false) {
  const v = (await ask(`  ${c.yellow('?')} ${label} ${c.gray(def ? '[Y/n]' : '[y/N]')}: `)).toLowerCase();
  if (v === '') return def;
  return v === 'y' || v === 'yes' || v === 'haan' || v === 'ha';
}

// pick one item from a list -> returns the item (or null for "back")
async function pick(title, items, render = (x) => String(x), { allowBack = true } = {}) {
  if (!items.length) { warn('Nothing to choose from.'); return null; }
  console.log('\n' + c.bold(title));
  items.forEach((it, i) => console.log(`   ${c.cyan(padStart(String(i + 1), 2))}. ${render(it)}`));
  if (allowBack) console.log(`   ${c.gray(' 0. Back')}`);
  const n = await askInt('Choose', { min: allowBack ? 0 : 1, max: items.length });
  return n === 0 ? null : items[n - 1];
}

async function pause() {
  if (!process.stdin.isTTY) return;
  await ask(c.gray('\n  Press Enter to continue...'));
}

function clear() {
  if (TTY) process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

// ---------------------------------------------------------------- output ---
const success = (m) => console.log(`  ${c.bGreen('[OK]')} ${c.green(m)}`);
const error = (m) => console.log(`  ${c.bRed('[ERROR]')} ${c.red(m)}`);
const warn = (m) => console.log(`  ${c.bYellow('[WARNING]')} ${c.yellow(m)}`);
const info = (m) => console.log(`  ${c.bCyan('[INFO]')} ${m}`);
const note = (m) => console.log(c.gray(`    ${m}`));

function box(title, lines = [], color = c.cyan) {
  const body = Array.isArray(lines) ? lines : [lines];
  const inner = Math.max(width(title) + 2, ...body.map((l) => width(l)), 40);
  console.log(color('  ╭' + '─'.repeat(inner + 2) + '╮'));
  console.log(color('  │ ') + c.bold(padEnd(title, inner)) + color(' │'));
  if (body.length) console.log(color('  ├' + '─'.repeat(inner + 2) + '┤'));
  for (const l of body) console.log(color('  │ ') + padEnd(l, inner) + color(' │'));
  console.log(color('  ╰' + '─'.repeat(inner + 2) + '╯'));
}

function header(title, subtitle) {
  clear();
  const line = '═'.repeat(Math.max(64, width(title) + 6));
  console.log(c.bCyan('\n  ' + line));
  console.log('   ' + c.bold(title));
  if (subtitle) console.log('   ' + c.gray(subtitle));
  console.log(c.bCyan('  ' + line));
}

function section(title) {
  console.log('\n  ' + c.bMagenta('▌ ') + c.bold(title));
}

function fmt(v) {
  if (v === null || v === undefined) return c.gray('NULL');
  if (typeof v === 'number' && !Number.isInteger(v)) return String(Math.round(v * 100) / 100);
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return c.gray(`<blob ${v.length}B>`);
  return String(v);
}

// rows: array of objects. opts: { columns, title, maxWidth, limit, color: {col: fn(value)->painted} }
function table(rows, opts = {}) {
  if (opts.title) section(opts.title);
  if (!rows || !rows.length) { console.log(c.gray('    (no rows)')); return; }
  const columns = opts.columns || Object.keys(rows[0]);
  const maxW = opts.maxWidth || 34;
  const limit = opts.limit || rows.length;
  const shown = rows.slice(0, limit);
  const cells = shown.map((r) => columns.map((col) => {
    const raw = r[col];
    let s = truncate(fmt(raw), maxW);
    if (opts.color && opts.color[col] && raw !== null && raw !== undefined) s = opts.color[col](raw, s);
    return s;
  }));
  const numeric = columns.map((col) => shown.every((r) => r[col] === null || typeof r[col] === 'number'));
  const widths = columns.map((col, i) => Math.max(width(col), ...cells.map((row) => width(row[i]))));
  const sep = (l, m, r) => c.gray('  ' + l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r);
  console.log(sep('┌', '┬', '┐'));
  console.log(c.gray('  │') + columns.map((col, i) => ' ' + c.bold(c.cyan(padEnd(col, widths[i]))) + ' ').join(c.gray('│')) + c.gray('│'));
  console.log(sep('├', '┼', '┤'));
  for (const row of cells) {
    console.log(c.gray('  │') + row.map((s, i) => ' ' + (numeric[i] ? padStart(s, widths[i]) : padEnd(s, widths[i])) + ' ').join(c.gray('│')) + c.gray('│'));
  }
  console.log(sep('└', '┴', '┘'));
  const more = rows.length > limit ? `, showing first ${limit}` : '';
  console.log(c.gray(`    ${rows.length} row${rows.length === 1 ? '' : 's'}${more}`));
}

function bar(pct, size = 20) {
  if (pct === null || pct === undefined) return c.gray('·'.repeat(size) + '   n/a');
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * size);
  const color = pct >= 75 ? c.green : pct >= 60 ? c.yellow : c.red;
  return color('█'.repeat(filled)) + c.gray('░'.repeat(size - filled)) + ' ' + color(padStart(pct.toFixed(1), 5) + '%');
}

function pctColor(v, s) {
  return v >= 75 ? c.green(s) : v >= 60 ? c.yellow(s) : c.red(s);
}

// horizontal bar chart: items [{label, value}]
function barChart(items, { max, unit = '', size = 30 } = {}) {
  const top = max || Math.max(1, ...items.map((i) => i.value || 0));
  const lw = Math.max(...items.map((i) => width(i.label)));
  for (const it of items) {
    const n = Math.round(((it.value || 0) / top) * size);
    console.log(`    ${padEnd(it.label, lw)} ${c.cyan('▇'.repeat(n))}${c.gray('▏')} ${fmt(it.value)}${unit}`);
  }
}

const KEYWORDS = /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|EXISTS|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|NATURAL|ON|USING|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AS|DISTINCT|UNION|ALL|INTERSECT|EXCEPT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|VIEW|INDEX|DROP|ALTER|ADD|COLUMN|RENAME|TO|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|CHECK|DEFAULT|NULL|IS|LIKE|BETWEEN|CASE|WHEN|THEN|ELSE|END|WITH|RECURSIVE|COUNT|SUM|AVG|MIN|MAX|ROUND|COALESCE|OVER|PARTITION|RANK|DENSE_RANK|ROW_NUMBER|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|TRANSACTION|CASCADE|RESTRICT|EXPLAIN|QUERY|PLAN|ASC|DESC|CONSTRAINT|IF|TRIGGER|INTEGER|VARCHAR|DATE|DECIMAL|TEXT|CHAR|NULLIF|IFNULL|ANALYZE|CONFLICT|DO|NOTHING|REPLACE|INDEXED)\b/gi;

function printSQL(sql) {
  const lines = sql.trim().split('\n');
  for (const l of lines) {
    const painted = COLOR
      ? l.replace(/('[^']*')|(--.*$)|\b(\d+(?:\.\d+)?)\b|([A-Za-z_]+)/g, (m, str, cmt, num, word) => {
        if (str) return c.green(str);
        if (cmt) return c.gray(cmt);
        if (num) return c.magenta(num);
        KEYWORDS.lastIndex = 0;
        return KEYWORDS.test(word) ? c.bold(c.blue(word.toUpperCase())) : word;
      })
      : l;
    console.log(c.gray('    │ ') + painted);
  }
}

function close() {
  if (rl) rl.close();
}

module.exports = {
  c, TTY, InputClosed, width, padEnd, padStart,
  ask, askText, askInt, askNumber, confirm, pick, pause, clear, close,
  success, error, warn, info, note, box, header, section, table, bar, pctColor, barChart, printSQL, fmt,
};
