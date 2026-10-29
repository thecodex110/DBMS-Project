'use strict';
// ============================================================================
//  DATABASE INITIALISER
//  1. runs sql/01..05  (schema -> views -> triggers -> indexes -> base data)
//  2. generates realistic "live" data relative to TODAY:
//       class sessions (last 15 weeks), attendance, leaves, exam marks
//  3. creates login accounts (admin + one per faculty) with hashed passwords
//  Everything runs inside ONE transaction: either the whole DB is built or
//  nothing is (atomicity).
// ============================================================================
const db = require('./connection');
const { hashPassword } = require('./auth');

const SQL_FILES = ['01_schema.sql', '02_views.sql', '03_triggers.sql', '04_indexes.sql', '05_seed_base.sql'];

// Deterministic pseudo-random generator -> same data on every reset
function mulberry32(seed) {
  return function rand() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d) => d.toISOString().slice(0, 10);
function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

const TOPICS = {
  CS501: ['Purpose of DB systems', 'Views of data & DB languages', 'DBMS architecture', 'E-R model: entities & attributes',
    'E-R relationships & constraints', 'Relational model & keys', 'Integrity & referential constraints', 'Relational algebra: basic ops',
    'Relational algebra: extended ops', 'SQL basic structure', 'SQL aggregates & GROUP BY', 'Nested subqueries',
    'Functional dependencies', '1NF, 2NF, 3NF', 'BCNF decomposition', 'Ordered indices', 'B+ tree index files',
    'Static & dynamic hashing', 'Transaction concepts & ACID', 'Serializability', 'Recoverability', 'Lock-based protocols',
    'Timestamp-based protocols', 'Validation protocols', 'Deadlock handling', 'Log-based recovery', 'ARIES overview'],
  CS504: ['Basic SQL queries', 'Aggregates lab', 'Nested subqueries lab', 'DDL & DML lab', 'Constraints lab', 'Mini project review'],
};

function generateLiveData() {
  const rand = mulberry32(2026);
  const today = new Date(iso(new Date()) + 'T00:00:00Z');
  const start = addDays(today, -7 * 15);

  const teaches = db.all(`SELECT t.subject_id, t.faculty_id, s.subject_type
                            FROM teaches t JOIN subject s USING (subject_id)
                           ORDER BY t.subject_id`);
  const enrolled = db.all('SELECT roll_no, subject_id FROM enrollment');
  const bySubject = new Map();
  for (const e of enrolled) {
    if (!bySubject.has(e.subject_id)) bySubject.set(e.subject_id, []);
    bySubject.get(e.subject_id).push(e.roll_no);
  }

  // every student gets a "regularity" -> some are regular, some are defaulters
  const students = db.all('SELECT roll_no FROM student ORDER BY roll_no');
  const regularity = new Map();
  students.forEach((s, i) => {
    const weak = i % 5 === 2;
    regularity.set(s.roll_no, weak ? 0.5 + rand() * 0.2 : 0.74 + rand() * 0.24);
  });

  const insSession = db.getDb().prepare(
    'INSERT INTO class_session (subject_id, faculty_id, session_date, start_time, topic) VALUES (?, ?, ?, ?, ?)');
  const insAtt = db.getDb().prepare(
    "INSERT INTO attendance (session_id, roll_no, status, marked_at) VALUES (?, ?, ?, ? || ' ' || ?)");

  teaches.forEach((t, idx) => {
    // each subject meets on 2 fixed weekdays (labs once a week)
    const days = t.subject_type === 'Lab' ? [((idx + 3) % 5) + 1] : [(idx % 5) + 1, ((idx + 2) % 5) + 1];
    const time = ['09:00', '10:00', '11:15', '12:15', '14:00', '15:00'][idx % 6];
    const topics = TOPICS[t.subject_id] || [];
    const roster = bySubject.get(t.subject_id) || [];
    let lecture = 0;
    for (let d = start; d < today; d = addDays(d, 1)) {
      if (!days.includes(d.getUTCDay())) continue;
      lecture++;
      const topic = topics[(lecture - 1) % (topics.length || 1)] || `Lecture ${lecture}`;
      const date = iso(d);
      const { lastInsertRowid: sid } = insSession.run(t.subject_id, t.faculty_id, date, time, topic);
      for (const roll of roster) {
        const p = Math.min(0.99, regularity.get(roll) + (rand() - 0.5) * 0.12);
        insAtt.run(sid, roll, rand() < p ? 'P' : 'A', date, time + ':00');
      }
    }
  });

  // leaves (dates relative to today)
  const leaves = [
    ['23CS003', -40, -36, 'Medical', 'Viral fever - doctor certificate attached', 'Approved', 'FAC101'],
    ['23CS008', -25, -23, 'Sports', 'Inter-college cricket tournament', 'Approved', 'FAC103'],
    ['23IT002', -60, -55, 'Medical', 'Hospitalised for dengue', 'Approved', 'FAC102'],
    ['23EC002', -10, -9, 'Event', 'Paper presentation at IIT Bombay', 'Pending', null],
    ['23ME001', -5, -4, 'Personal', 'Sister\'s wedding', 'Pending', null],
    ['24CS103', -30, -29, 'Personal', 'Family function', 'Rejected', 'FAC106'],
    ['23CS010', -3, -2, 'Medical', 'Dental surgery', 'Pending', null],
  ];
  for (const [roll, f, t, type, reason, status, by] of leaves) {
    db.run(`INSERT INTO leave_request (roll_no, from_date, to_date, leave_type, reason, status, reviewed_by, applied_on)
            VALUES (?, ?, ?, ?, ?, 'Pending', NULL, ?)`,
      roll, iso(addDays(today, f)), iso(addDays(today, t)), type, reason, iso(addDays(today, f - 2)));
    if (status !== 'Pending') {
      db.run("UPDATE leave_request SET status = ?, reviewed_by = ? WHERE leave_id = last_insert_rowid()", status, by);
    }
  }

  // exam marks: Internal /20, MidSem /30, EndSem /50 ; NULL = absent
  const insMark = db.getDb().prepare(
    'INSERT INTO exam_result (roll_no, subject_id, exam_type, marks_obtained, max_marks) VALUES (?, ?, ?, ?, ?)');
  const exams = [['Internal', 20], ['MidSem', 30], ['EndSem', 50]];
  for (const e of enrolled) {
    const base = 0.35 + regularity.get(e.roll_no) * 0.55;
    for (const [type, max] of exams) {
      if (type === 'EndSem' && e.subject_id.startsWith('CS3')) continue; // 2nd-year EndSem not yet held
      if (rand() < 0.025) { insMark.run(e.roll_no, e.subject_id, type, null, max); continue; }
      const score = Math.max(0, Math.min(1, base + (rand() - 0.5) * 0.3));
      insMark.run(e.roll_no, e.subject_id, type, Math.round(score * max * 2) / 2, max);
    }
  }

  // login accounts
  db.run("INSERT INTO app_user (username, password_hash, salt, role) VALUES ('admin', ?, ?, 'admin')",
    ...hashPassword('admin@123'));
  for (const f of db.all('SELECT faculty_id FROM faculty')) {
    db.run("INSERT INTO app_user (username, password_hash, salt, role, faculty_id) VALUES (?, ?, ?, 'faculty', ?)",
      f.faculty_id.toLowerCase(), ...hashPassword(f.faculty_id.toLowerCase() + '@123'), f.faculty_id);
  }

  // seeding is not an "audit-worthy" activity -> start with a clean log
  db.run('DELETE FROM audit_log');
}

function initialize() {
  db.transaction(() => {
    for (const f of SQL_FILES) db.runSqlFile(f);
    generateLiveData();
  });
  db.exec('ANALYZE;'); // collect statistics for the query optimiser
}

function ensureDatabase() {
  if (!db.isInitialized()) {
    initialize();
    return true;
  }
  return false;
}

function resetDatabase() {
  db.deleteDatabaseFiles();
  initialize();
}

module.exports = { initialize, ensureDatabase, resetDatabase, SQL_FILES };
