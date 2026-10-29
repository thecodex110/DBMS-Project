'use strict';
// ============================================================================
//  MODULE 13 : DATABASE ADMINISTRATION
//  ER diagram, data dictionary, table browser, audit log, CSV export,
//  backup (VACUUM INTO), integrity checks, statistics, reset.
// ============================================================================
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db/connection');
const init = require('../db/init');
const ui = require('../ui/term');
const session = require('../session');
const { runMenu } = require('../ui/menu');
const { hashPassword, verifyPassword } = require('../db/auth');

const ER_DIAGRAM = String.raw`
                                ┌─────────────────┐
             ┌──── works_in ───►│   DEPARTMENT    │◄─── offered_by ───┐
             │       N:1        │ PK dept_id      │        N:1        │
             │                  │    dept_name (U)│                   │
             │                  └────────▲────────┘                   │
             │                           │ belongs_to N:1             │
   ┌─────────┴───────┐          ┌────────┴────────┐          ┌────────┴────────┐
   │     FACULTY     │          │     STUDENT     │          │     SUBJECT     │
   │ PK faculty_id   │          │ PK roll_no      │          │ PK subject_id   │
   │    name, salary │          │ (first, last)   │          │    credits, sem │
   │    designation  │          │ dob ⇒ {age}     │          │    subject_type │
   └──┬───────────┬──┘          │ {phones}        │          └──┬──────────┬───┘
      │           │             └──┬───────────┬──┘             │          │
      │           └──────── ◇ TEACHES ◇ ───────┼────────────────┘          │
      │                   M:N (one per year)   │                           │
      │                            │           └──── ◇ ENROLLMENT ◇ ───────┘
      │ conducts 1:N               │ marked 1:N         M:N   │ 1:N
   ┌──▼──────────────┐  has 1:N ┌──▼──────────────┐  ┌────────▼────────┐
   │  CLASS_SESSION  ├─────────►│   ATTENDANCE    │  │   EXAM_RESULT   │
   │ PK session_id   │          │ PK(session_id,  │  │ PK(roll_no,     │
   │    date, topic  │          │    roll_no)     │  │  subject, exam) │
   │ FK subject_id   │          │    status P/A   │  │ marks (NULL ok) │
   └─────────────────┘          └─────────────────┘  └─────────────────┘
   Also: STUDENT_PHONE (multivalued {phones}), LEAVE_REQUEST (N:1 student, reviewed_by → faculty),
         DEFAULTER_NOTICE (FK → enrollment), APP_USER (1:1 faculty), AUDIT_LOG
   Legend: PK primary key · (U) unique · {x} derived / multivalued · ◇ relationship set
`;

async function showEr() {
  console.log(ui.c.cyan(ER_DIAGRAM));
  ui.section('Relationship cardinalities');
  ui.table([
    { relationship: 'student belongs_to department', type: 'N : 1', implemented_by: 'student.dept_id FK' },
    { relationship: 'faculty works_in department', type: 'N : 1', implemented_by: 'faculty.dept_id FK' },
    { relationship: 'subject offered_by department', type: 'N : 1', implemented_by: 'subject.dept_id FK' },
    { relationship: 'faculty teaches subject', type: 'M : N (1 per year)', implemented_by: 'teaches table' },
    { relationship: 'student enrolls in subject', type: 'M : N', implemented_by: 'enrollment table' },
    { relationship: 'session has attendance', type: '1 : N', implemented_by: 'attendance.session_id FK' },
    { relationship: 'student has phones', type: 'multivalued', implemented_by: 'student_phone table' },
    { relationship: 'enrollment has results', type: '1 : N', implemented_by: 'composite FK (roll_no, subject_id)' },
  ]);
}

function objects() {
  return db.all(`SELECT name, type FROM sqlite_master
                  WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`);
}

async function dataDictionary() {
  const t = await ui.pick('Table / view', objects(), (o) => `${ui.padEnd(o.name, 22)} ${ui.c.gray(o.type)}`);
  if (!t) return;
  ui.printSQL(db.get('SELECT sql FROM sqlite_master WHERE name = ?', t.name).sql);
  ui.table(db.all('SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info(?)', t.name), { title: 'Columns' });
  const fks = db.all('SELECT "from", "table", "to", on_update, on_delete FROM pragma_foreign_key_list(?)', t.name);
  if (fks.length) ui.table(fks, { title: 'Foreign keys' });
  const idx = db.all('SELECT name, "unique", origin FROM pragma_index_list(?)', t.name);
  if (idx.length) ui.table(idx, { title: 'Indexes  (origin: pk = primary key, u = unique, c = CREATE INDEX)' });
  const trg = db.all("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?", t.name);
  if (trg.length) ui.table(trg, { title: 'Triggers' });
}

async function browse() {
  const t = await ui.pick('Table / view', objects(), (o) => `${ui.padEnd(o.name, 22)} ${ui.c.gray(o.type)}`);
  if (!t) return;
  const total = db.get(`SELECT COUNT(*) AS n FROM "${t.name}"`).n;
  let offset = 0;
  for (;;) {
    ui.table(db.all(`SELECT * FROM "${t.name}" LIMIT 20 OFFSET ?`, offset), { title: `${t.name}  rows ${offset + 1}-${Math.min(offset + 20, total)} of ${total}` });
    if (offset + 20 >= total) break;
    if (!(await ui.confirm('Next page?', true))) break;
    offset += 20;
  }
}

async function auditLog() {
  ui.table(db.all('SELECT * FROM audit_log ORDER BY log_id DESC LIMIT 40'), { title: 'Audit trail (written only by triggers)', maxWidth: 60 });
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

async function exportCsv() {
  const t = await ui.pick('Export which table / view?', objects(), (o) => `${ui.padEnd(o.name, 22)} ${ui.c.gray(o.type)}`);
  if (!t) return;
  const dir = path.join(db.ROOT, 'exports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${t.name}_${new Date().toISOString().slice(0, 10)}.csv`);
  const rows = db.all(`SELECT * FROM "${t.name}"`);
  fs.writeFileSync(file, toCsv(rows));
  ui.success(`${rows.length} rows written to ${path.relative(db.ROOT, file)}`);
}

async function backup() {
  const dir = path.join(db.ROOT, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `college_${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.db`);
  db.run('VACUUM INTO ?', file); // consistent snapshot even while the DB is open
  ui.success(`Backup created: ${path.relative(db.ROOT, file)} (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);
  ui.note('Restore = copy the backup over data/college.db while the app is closed.');
}

async function stats() {
  const tables = db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const rows = tables.map((t) => ({ table: t.name, rows: db.get(`SELECT COUNT(*) AS n FROM "${t.name}"`).n }));
  ui.table(rows, { title: 'Row counts' });
  const p = db.get(`SELECT (SELECT page_count FROM pragma_page_count) AS pages, (SELECT page_size FROM pragma_page_size) AS page_size,
                           (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index') AS indexes,
                           (SELECT COUNT(*) FROM sqlite_master WHERE type = 'view') AS views,
                           (SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger') AS triggers,
                           sqlite_version() AS sqlite_version`);
  ui.box('Storage & catalog', [
    `File        : ${path.relative(db.ROOT, db.DB_PATH)}  (${((p.pages * p.page_size) / 1024).toFixed(1)} KB)`,
    `Pages       : ${p.pages} pages × ${p.page_size} bytes (every B-tree node = 1 page)`,
    `Objects     : ${rows.length} tables, ${p.views} views, ${p.indexes} indexes, ${p.triggers} triggers`,
    `Engine      : SQLite ${p.sqlite_version} via node:sqlite`,
  ]);
}

async function integrity() {
  const ic = db.all('PRAGMA integrity_check');
  ui.table(ic, { title: 'PRAGMA integrity_check (B-tree structure, page links, index consistency)' });
  const fk = db.all('PRAGMA foreign_key_check');
  fk.length ? ui.table(fk, { title: 'Foreign key violations' }) : ui.success('PRAGMA foreign_key_check → no referential-integrity violations.');
}

async function changePassword() {
  const u = db.get('SELECT * FROM app_user WHERE username = ?', session.user.username);
  const old = await ui.askText('Current password', { required: true });
  if (!verifyPassword(old, u.password_hash, u.salt)) return ui.error('Wrong password.');
  const next = await ui.askText('New password (min 6 chars)', { required: true, validate: (v) => (v.length >= 6 ? null : 'Too short') });
  const [hash, salt] = hashPassword(next);
  db.run('UPDATE app_user SET password_hash = ?, salt = ? WHERE username = ?', hash, salt, u.username);
  ui.success('Password changed (stored as salted scrypt hash).');
}

async function users() {
  ui.table(db.all(`SELECT u.username, u.role, f.name AS faculty, u.last_login, substr(u.password_hash, 1, 16) || '…' AS hash_prefix
                     FROM app_user u LEFT JOIN faculty f ON f.faculty_id = u.faculty_id ORDER BY u.role, u.username`), { title: 'Login accounts (passwords are hashed)' });
}

async function reset() {
  ui.warn('This deletes data/college.db and rebuilds it from sql/*.sql + generated data.');
  if (!(await ui.confirm('Reset the whole database?'))) return;
  init.resetDatabase();
  ui.success('Database rebuilt from scratch. Log in again if your password was changed.');
}

module.exports = {
  ER_DIAGRAM,
  menu: () => runMenu('DATABASE ADMINISTRATION', 'catalog · ER diagram · backup · integrity', [
    { label: 'ER diagram & cardinalities', hint: 'E-R model', action: showEr },
    { label: 'Data dictionary (schema of any table)', hint: 'sqlite_master + pragmas', action: dataDictionary },
    { label: 'Browse table / view rows', hint: 'LIMIT / OFFSET paging', action: browse },
    { label: 'Audit log', hint: 'trigger-generated', action: auditLog },
    { label: 'Export table to CSV', hint: 'output to exports/', action: exportCsv },
    { label: 'Backup database', hint: 'VACUUM INTO', action: backup },
    { label: 'Storage statistics', hint: 'pages, objects', action: stats },
    { label: 'Integrity check', hint: 'integrity + FK check', action: integrity },
    { label: 'Change my password', hint: 'scrypt hash', action: changePassword },
    { label: 'Login accounts', hint: 'app_user', action: users, adminOnly: true },
    { label: 'Reset database', hint: 'rebuild everything', action: reset, adminOnly: true },
  ]),
};
