'use strict';
// ============================================================================
//  MODULE 7 : LAB ASSIGNMENTS 1-4  (exactly as listed in the syllabus)
//  Every question = { q: question text, sql: query }  or  { q, steps: [...] }
//  DML / DDL questions run inside a SAVEPOINT and are ROLLED BACK afterwards,
//  so the real college data is never damaged ("sandbox mode").
// ============================================================================
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db/connection');
const ui = require('../ui/term');
const { runMenu, friendlyError } = require('../ui/menu');

const ASSIGNMENTS = [
  {
    id: '1', title: 'Assignment 1 : Basic SQL statements', questions: [
      { q: 'List every student with roll no, full name, department and year.',
        sql: `SELECT roll_no, first_name || ' ' || last_name AS full_name, dept_id, year\nFROM student;` },
      { q: 'Show third-year students of Computer Engineering (dept CS).',
        sql: `SELECT roll_no, first_name, last_name\nFROM student\nWHERE dept_id = 'CS' AND year = 3;` },
      { q: 'Faculty earning more than 1,00,000 per month, highest first.',
        sql: `SELECT name, designation, salary\nFROM faculty\nWHERE salary > 100000\nORDER BY salary DESC;` },
      { q: "Students whose first name starts with 'A'.",
        sql: `SELECT roll_no, first_name, last_name\nFROM student\nWHERE first_name LIKE 'A%';` },
      { q: 'Students born in the first half of 2005.',
        sql: `SELECT roll_no, first_name, dob\nFROM student\nWHERE dob BETWEEN '2005-01-01' AND '2005-06-30'\nORDER BY dob;` },
      { q: 'Distinct cities our students come from.',
        sql: `SELECT DISTINCT city\nFROM student\nORDER BY city;` },
      { q: 'Students from Pune, Mumbai or Delhi.',
        sql: `SELECT roll_no, first_name, city\nFROM student\nWHERE city IN ('Pune', 'Mumbai', 'Delhi');` },
      { q: 'Semester-5 subjects that carry 4 credits.',
        sql: `SELECT subject_id, subject_name, dept_id\nFROM subject\nWHERE semester = 5 AND credits = 4;` },
      { q: 'Faculty name along with department name (join).',
        sql: `SELECT f.name, d.dept_name, d.building\nFROM faculty f\nJOIN department d ON d.dept_id = f.dept_id;` },
      { q: 'Annual salary and joining year of every faculty (arithmetic + alias).',
        sql: `SELECT name, salary * 12 AS annual_salary,\n       strftime('%Y', joining_date) AS joined_in\nFROM faculty;` },
      { q: 'Student names in UPPER case with length of their e-mail.',
        sql: `SELECT upper(first_name || ' ' || last_name) AS name_caps,\n       length(email) AS email_len\nFROM student\nLIMIT 8;` },
      { q: 'Exam records where the student was ABSENT (NULL marks).',
        sql: `SELECT roll_no, subject_id, exam_type\nFROM exam_result\nWHERE marks_obtained IS NULL;` },
      { q: 'Five youngest students.',
        sql: `SELECT roll_no, first_name, dob\nFROM student\nORDER BY dob DESC\nLIMIT 5;` },
    ],
  },
  {
    id: '2A', title: 'Assignment 2(a) : Aggregates, grouping & ordering', questions: [
      { q: 'Number of students in each department.',
        sql: `SELECT dept_id, COUNT(*) AS students\nFROM student\nGROUP BY dept_id\nORDER BY students DESC;` },
      { q: 'Average, minimum and maximum salary per department.',
        sql: `SELECT dept_id, ROUND(AVG(salary)) AS avg_sal, MIN(salary) AS min_sal, MAX(salary) AS max_sal\nFROM faculty\nGROUP BY dept_id\nORDER BY avg_sal DESC;` },
      { q: 'Departments having more than 4 students (HAVING).',
        sql: `SELECT dept_id, COUNT(*) AS students\nFROM student\nGROUP BY dept_id\nHAVING COUNT(*) > 4;` },
      { q: 'Sessions conducted per subject.',
        sql: `SELECT subject_id, COUNT(*) AS sessions, MIN(session_date) AS first, MAX(session_date) AS last\nFROM class_session\nGROUP BY subject_id\nORDER BY sessions DESC, subject_id;` },
      { q: 'Gender-wise count in each department (group by two columns).',
        sql: `SELECT dept_id, gender, COUNT(*) AS cnt\nFROM student\nGROUP BY dept_id, gender\nORDER BY dept_id, gender;` },
      { q: 'Total credits offered per department per semester.',
        sql: `SELECT dept_id, semester, SUM(credits) AS total_credits, COUNT(*) AS subjects\nFROM subject\nGROUP BY dept_id, semester;` },
      { q: 'Average marks per subject and exam type.',
        sql: `SELECT subject_id, exam_type, ROUND(AVG(marks_obtained), 2) AS avg_marks, MAX(max_marks) AS out_of\nFROM exam_result\nGROUP BY subject_id, exam_type\nORDER BY subject_id, out_of;` },
      { q: 'NULL handling: COUNT(*) vs COUNT(column) vs AVG.',
        sql: `SELECT COUNT(*)              AS all_rows,\n       COUNT(marks_obtained) AS non_null_marks,\n       COUNT(*) - COUNT(marks_obtained) AS absents,\n       ROUND(AVG(marks_obtained), 2) AS avg_ignores_null\nFROM exam_result;` },
      { q: 'Number of lectures held in each month.',
        sql: `SELECT strftime('%Y-%m', session_date) AS month, COUNT(*) AS sessions\nFROM class_session\nGROUP BY month\nORDER BY month;` },
      { q: 'DBMS (CS501) attendance % of every student, highest first.',
        sql: `SELECT a.roll_no,\n       COUNT(*) AS held,\n       SUM(a.status = 'P') AS attended,\n       ROUND(100.0 * SUM(a.status = 'P') / COUNT(*), 2) AS pct\nFROM attendance a\nJOIN class_session cs ON cs.session_id = a.session_id\nWHERE cs.subject_id = 'CS501'\nGROUP BY a.roll_no\nORDER BY pct DESC;` },
      { q: 'Designations whose average salary exceeds 80,000.',
        sql: `SELECT designation, COUNT(*) AS cnt, ROUND(AVG(salary)) AS avg_salary\nFROM faculty\nGROUP BY designation\nHAVING AVG(salary) > 80000\nORDER BY avg_salary DESC;` },
    ],
  },
  {
    id: '2B', title: 'Assignment 2(b) : Nested subqueries & SQL updates', questions: [
      { q: 'Faculty earning more than the average salary (scalar subquery).',
        sql: `SELECT name, salary\nFROM faculty\nWHERE salary > (SELECT AVG(salary) FROM faculty);` },
      { q: 'Students enrolled in any subject taught by Dr. Ramesh Sharma (IN).',
        sql: `SELECT DISTINCT roll_no\nFROM enrollment\nWHERE subject_id IN (SELECT t.subject_id FROM teaches t\n                     WHERE t.faculty_id = (SELECT faculty_id FROM faculty\n                                           WHERE name = 'Dr. Ramesh Sharma'));` },
      { q: 'Faculty who are not teaching any subject (NOT IN).',
        sql: `SELECT faculty_id, name\nFROM faculty\nWHERE faculty_id NOT IN (SELECT faculty_id FROM teaches);` },
      { q: 'Students who never missed a DBMS lecture (NOT EXISTS).',
        sql: `SELECT e.roll_no\nFROM enrollment e\nWHERE e.subject_id = 'CS501'\n  AND NOT EXISTS (SELECT 1 FROM attendance a\n                  JOIN class_session cs ON cs.session_id = a.session_id\n                  WHERE cs.subject_id = 'CS501'\n                    AND a.roll_no = e.roll_no AND a.status = 'A');` },
      { q: 'Department(s) with the maximum number of students.',
        sql: `SELECT dept_id, COUNT(*) AS students\nFROM student\nGROUP BY dept_id\nHAVING COUNT(*) = (SELECT MAX(cnt) FROM (SELECT COUNT(*) AS cnt\n                                         FROM student GROUP BY dept_id));` },
      { q: 'Highest MidSem scorer of each subject (correlated subquery).',
        sql: `SELECT r.subject_id, r.roll_no, r.marks_obtained\nFROM exam_result r\nWHERE r.exam_type = 'MidSem'\n  AND r.marks_obtained = (SELECT MAX(r2.marks_obtained) FROM exam_result r2\n                          WHERE r2.subject_id = r.subject_id AND r2.exam_type = 'MidSem')\nORDER BY r.subject_id;` },
      { q: 'Faculty paid more than ALL IT faculty  (> ALL  ==  > MAX).',
        sql: `-- SQLite has no ALL/SOME keyword; "> ALL (S)" is equivalent to "> (SELECT MAX ...)"\nSELECT name, dept_id, salary\nFROM faculty\nWHERE salary > (SELECT MAX(salary) FROM faculty WHERE dept_id = 'IT');` },
      { q: 'Students whose average attendance is above the college average (derived table).',
        sql: `SELECT t.roll_no, t.avg_pct\nFROM (SELECT roll_no, ROUND(AVG(adjusted_pct), 2) AS avg_pct\n      FROM v_attendance_summary GROUP BY roll_no) AS t\nWHERE t.avg_pct > (SELECT AVG(adjusted_pct) FROM v_attendance_summary)\nORDER BY t.avg_pct DESC;` },
      { q: 'Set operations: defaulters in BOTH CS501 and CS502 (INTERSECT).',
        sql: `SELECT roll_no FROM v_defaulters WHERE subject_id = 'CS501'\nINTERSECT\nSELECT roll_no FROM v_defaulters WHERE subject_id = 'CS502';` },
      { q: 'Set operations: CS students who are NOT defaulters anywhere (EXCEPT).',
        sql: `SELECT roll_no FROM student WHERE dept_id = 'CS'\nEXCEPT\nSELECT roll_no FROM v_defaulters;` },
      { q: 'Complex query (CTE + window): top 2 students per department by SGPA.',
        sql: `WITH sgpa AS (\n  SELECT r.roll_no, s.dept_id,\n         ROUND(SUM(r.credits * r.grade_point) * 1.0 / SUM(r.credits), 2) AS sgpa\n  FROM v_result_sheet r JOIN student s ON s.roll_no = r.roll_no\n  GROUP BY r.roll_no),\nranked AS (\n  SELECT *, RANK() OVER (PARTITION BY dept_id ORDER BY sgpa DESC) AS rnk FROM sgpa)\nSELECT dept_id, rnk, roll_no, sgpa FROM ranked WHERE rnk <= 2;` },
      { q: 'UPDATE: 10% raise for faculty of departments whose avg attendance < 75%.',
        steps: [
          `SELECT faculty_id, dept_id, salary FROM faculty\nWHERE dept_id IN (SELECT dept_id FROM v_dept_stats WHERE avg_attendance < 75);`,
          `UPDATE faculty\nSET salary = salary * 1.10\nWHERE dept_id IN (SELECT dept_id FROM v_dept_stats WHERE avg_attendance < 75);`,
          `SELECT faculty_id, dept_id, salary FROM faculty\nWHERE dept_id IN (SELECT dept_id FROM v_dept_stats WHERE avg_attendance < 75);`,
        ] },
      { q: 'UPDATE: +2 bonus Internal marks (capped at max) for students with >= 90% attendance in that subject.',
        steps: [
          `UPDATE exam_result\nSET marks_obtained = MIN(marks_obtained + 2, max_marks)\nWHERE exam_type = 'Internal'\n  AND (roll_no, subject_id) IN (SELECT roll_no, subject_id FROM v_attendance_summary\n                                WHERE adjusted_pct >= 90);`,
          `SELECT COUNT(*) AS audit_rows_written_by_trigger FROM audit_log WHERE table_name = 'exam_result';`,
        ] },
      { q: 'UPDATE with CASE: promote Assistant Professors with 5+ years of service.',
        steps: [
          `UPDATE faculty\nSET designation = CASE\n      WHEN designation = 'Assistant Professor'\n       AND julianday('now') - julianday(joining_date) > 5 * 365 THEN 'Associate Professor'\n      ELSE designation END;`,
          `SELECT name, designation, joining_date FROM faculty ORDER BY joining_date;`,
        ] },
      { q: 'DELETE with subquery: remove rejected leave requests of CS students.',
        steps: [
          `DELETE FROM leave_request\nWHERE status = 'Rejected'\n  AND roll_no IN (SELECT roll_no FROM student WHERE dept_id = 'CS');`,
          `SELECT leave_id, roll_no, status FROM leave_request;`,
        ] },
    ],
  },
  {
    id: '3', title: 'Assignment 3 : SQL DDL & DML (hostel management)', sandbox: true, questions: [
      { q: 'Create table HOSTEL.',
        steps: [`CREATE TABLE hostel (\n  hostel_id   VARCHAR(5) PRIMARY KEY,\n  name        VARCHAR(50) NOT NULL,\n  gender_type CHAR(1) CHECK (gender_type IN ('M', 'F')),\n  capacity    INTEGER\n);`] },
      { q: 'Create table ROOM referencing HOSTEL.',
        steps: [`CREATE TABLE room (\n  room_no   VARCHAR(6),\n  hostel_id VARCHAR(5) REFERENCES hostel(hostel_id),\n  beds      INTEGER DEFAULT 2,\n  PRIMARY KEY (hostel_id, room_no)\n);`] },
      { q: 'Insert hostels and rooms (multi-row INSERT).',
        steps: [
          `INSERT INTO hostel VALUES ('H1', 'Shivneri Boys Hostel', 'M', 120),\n                          ('H2', 'Sahyadri Girls Hostel', 'F', 90);`,
          `INSERT INTO room (room_no, hostel_id, beds) VALUES\n  ('101', 'H1', 2), ('102', 'H1', 3), ('103', 'H1', 2),\n  ('201', 'H2', 2), ('202', 'H2', 2);`,
          `SELECT * FROM room;`,
        ] },
      { q: 'ALTER TABLE: add a warden column, then fill it with UPDATE.',
        steps: [
          `ALTER TABLE hostel ADD COLUMN warden VARCHAR(50);`,
          `UPDATE hostel SET warden = CASE hostel_id WHEN 'H1' THEN 'Mr. Patil' ELSE 'Mrs. Kulkarni' END;`,
          `SELECT * FROM hostel;`,
        ] },
      { q: 'Create ALLOTMENT and fill it with INSERT ... SELECT (out-of-Pune students).',
        steps: [
          `CREATE TABLE allotment (\n  roll_no   VARCHAR(10) PRIMARY KEY REFERENCES student(roll_no),\n  hostel_id VARCHAR(5) NOT NULL,\n  room_no   VARCHAR(6) NOT NULL,\n  FOREIGN KEY (hostel_id, room_no) REFERENCES room(hostel_id, room_no)\n);`,
          `INSERT INTO allotment (roll_no, hostel_id, room_no)\nSELECT roll_no,\n       CASE gender WHEN 'F' THEN 'H2' ELSE 'H1' END,\n       CASE gender WHEN 'F' THEN '201' ELSE '101' END\nFROM student\nWHERE city <> 'Pune' AND year = 3 AND dept_id = 'CS';`,
          `SELECT a.roll_no, s.first_name, s.city, a.hostel_id, a.room_no\nFROM allotment a JOIN student s USING (roll_no);`,
        ] },
      { q: 'ALTER TABLE ... RENAME COLUMN and RENAME TO.',
        steps: [
          `ALTER TABLE room RENAME COLUMN beds TO bed_count;`,
          `ALTER TABLE allotment RENAME TO hostel_allotment;`,
          `SELECT name FROM sqlite_master WHERE name IN ('room', 'hostel_allotment', 'allotment');`,
        ] },
      { q: 'UPDATE and DELETE rows.',
        steps: [
          `UPDATE room SET bed_count = bed_count + 1 WHERE hostel_id = 'H1';`,
          `DELETE FROM hostel_allotment WHERE roll_no IN (SELECT roll_no FROM student WHERE city = 'Delhi');`,
          `SELECT * FROM room;`,
        ] },
      { q: 'CREATE VIEW for occupancy and query it.',
        steps: [
          `CREATE VIEW v_hostel_occupancy AS\nSELECT h.name, COUNT(a.roll_no) AS occupied,\n       (SELECT SUM(bed_count) FROM room r WHERE r.hostel_id = h.hostel_id) AS beds\nFROM hostel h LEFT JOIN hostel_allotment a ON a.hostel_id = h.hostel_id\nGROUP BY h.hostel_id;`,
          `SELECT * FROM v_hostel_occupancy;`,
        ] },
      { q: 'DROP the view and the tables (reverse dependency order).',
        steps: [`DROP VIEW v_hostel_occupancy;`, `DROP TABLE hostel_allotment;`, `DROP TABLE room;`, `DROP TABLE hostel;`] },
    ],
  },
  {
    id: '4', title: 'Assignment 4 : Schema creation & constraints (library)', sandbox: true, questions: [
      { q: 'Create LIB_BOOK with PRIMARY KEY, NOT NULL, CHECK and DEFAULT.',
        steps: [`CREATE TABLE lib_book (\n  isbn     CHAR(13)     PRIMARY KEY CHECK (length(isbn) = 13),\n  title    VARCHAR(150) NOT NULL,\n  author   VARCHAR(100) NOT NULL,\n  category VARCHAR(20)  DEFAULT 'General'\n           CHECK (category IN ('General', 'Database', 'OS', 'Networks', 'Maths')),\n  copies   INTEGER      NOT NULL DEFAULT 1 CHECK (copies >= 0)\n);`] },
      { q: 'Create LIB_MEMBER: FK to student with ON DELETE CASCADE + UNIQUE.',
        steps: [`CREATE TABLE lib_member (\n  member_id INTEGER PRIMARY KEY,\n  roll_no   VARCHAR(10) NOT NULL UNIQUE\n            REFERENCES student(roll_no) ON DELETE CASCADE,\n  max_books INTEGER NOT NULL DEFAULT 3 CHECK (max_books BETWEEN 1 AND 5),\n  joined_on DATE DEFAULT (date('now'))\n);`] },
      { q: 'Create LIB_ISSUE with table-level CHECKs and two FKs (CASCADE vs RESTRICT).',
        steps: [`CREATE TABLE lib_issue (\n  issue_id    INTEGER PRIMARY KEY AUTOINCREMENT,\n  member_id   INTEGER NOT NULL REFERENCES lib_member(member_id) ON DELETE CASCADE,\n  isbn        CHAR(13) NOT NULL REFERENCES lib_book(isbn) ON DELETE RESTRICT,\n  issue_date  DATE NOT NULL DEFAULT (date('now')),\n  due_date    DATE NOT NULL,\n  return_date DATE,\n  CHECK (due_date > issue_date),\n  CHECK (return_date IS NULL OR return_date >= issue_date)\n);`] },
      { q: 'Insert valid data (DEFAULT values get applied).',
        steps: [
          `INSERT INTO lib_book (isbn, title, author, category, copies) VALUES\n  ('9780073523323', 'Database System Concepts', 'Silberschatz', 'Database', 4),\n  ('9780072465631', 'Database Management Systems', 'Ramakrishnan', 'Database', 2),\n  ('9781118063330', 'Operating System Concepts', 'Galvin', 'OS', 3);`,
          `INSERT INTO lib_member (member_id, roll_no) VALUES (1, '23CS001'), (2, '23CS002'), (3, '23IT001');`,
          `INSERT INTO lib_issue (member_id, isbn, issue_date, due_date) VALUES\n  (1, '9780073523323', '2026-09-01', '2026-09-15'),\n  (1, '9781118063330', '2026-09-03', '2026-09-17'),\n  (2, '9780072465631', '2026-09-05', '2026-09-19');`,
          `SELECT * FROM lib_member;`,
        ] },
      { q: 'Constraint tests - each statement below MUST be rejected by the DBMS.',
        steps: [
          { sql: `INSERT INTO lib_book (isbn, title, author) VALUES ('9780073523323', 'Duplicate', 'X');`, expectError: 'PRIMARY KEY' },
          { sql: `INSERT INTO lib_book (isbn, title, author) VALUES ('12345', 'Short ISBN', 'X');`, expectError: 'CHECK length' },
          { sql: `INSERT INTO lib_book (isbn, title, author) VALUES ('9999999999999', NULL, 'X');`, expectError: 'NOT NULL' },
          { sql: `INSERT INTO lib_book (isbn, title, author, copies) VALUES ('9999999999999', 'T', 'X', -2);`, expectError: 'CHECK copies' },
          { sql: `INSERT INTO lib_book (isbn, title, author, category) VALUES ('9999999999999', 'T', 'X', 'Novels');`, expectError: 'CHECK IN list' },
          { sql: `INSERT INTO lib_member (member_id, roll_no) VALUES (9, '99XX999');`, expectError: 'FOREIGN KEY' },
          { sql: `INSERT INTO lib_member (member_id, roll_no) VALUES (9, '23CS001');`, expectError: 'UNIQUE' },
          { sql: `INSERT INTO lib_member (member_id, roll_no, max_books) VALUES (9, '23CS003', 10);`, expectError: 'CHECK range' },
          { sql: `INSERT INTO lib_issue (member_id, isbn, issue_date, due_date) VALUES (1, '9780073523323', '2026-09-10', '2026-09-01');`, expectError: 'table CHECK' },
          { sql: `DELETE FROM lib_book WHERE isbn = '9780073523323';`, expectError: 'ON DELETE RESTRICT' },
        ] },
      { q: 'Referential action ON DELETE CASCADE: delete member 1 -> issues vanish.',
        steps: [
          `SELECT COUNT(*) AS issues_of_member_1 FROM lib_issue WHERE member_id = 1;`,
          `DELETE FROM lib_member WHERE member_id = 1;`,
          `SELECT COUNT(*) AS issues_of_member_1 FROM lib_issue WHERE member_id = 1;`,
        ] },
      { q: 'Inspect the constraints stored in the catalog (data dictionary).',
        steps: [
          `SELECT "table", "from" AS column, "to" AS ref_column, on_update, on_delete\nFROM pragma_foreign_key_list('lib_issue');`,
          `SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('lib_book');`,
        ] },
    ],
  },
];

const isQuery = (sql) => /^\s*(--[^\n]*\n\s*)*(SELECT|WITH|PRAGMA|EXPLAIN|VALUES)\b/i.test(sql);

function runStatement(step) {
  const sql = typeof step === 'string' ? step : step.sql;
  const expectError = typeof step === 'object' ? step.expectError : null;
  ui.printSQL(sql);
  try {
    if (isQuery(sql)) {
      ui.table(db.all(sql), { limit: 25 });
    } else {
      const stmtCount = sql.split(';').filter((s) => s.trim()).length;
      if (stmtCount > 1) db.exec(sql);
      else {
        const r = db.run(sql);
        console.log(ui.c.gray(`    → ${r.changes} row(s) affected`));
      }
    }
    if (expectError) ui.warn(`Expected a ${expectError} violation but the statement succeeded!`);
  } catch (err) {
    if (expectError) ui.success(`Rejected as expected [${expectError}] → ${friendlyError(err)}`);
    else ui.error(friendlyError(err));
  }
}

async function runQuestion(a, idx) {
  const qn = a.questions[idx];
  console.log('\n  ' + ui.c.bgBlue(` Q${a.id}.${idx + 1} `) + ' ' + ui.c.bold(qn.q));
  if (qn.sql) runStatement(qn.sql);
  else {
    const own = !a.sandbox; // DML questions of 2B get their own sandbox
    if (own) db.exec('SAVEPOINT lab_q');
    try {
      for (const s of qn.steps) runStatement(s);
    } finally {
      if (own) { db.exec('ROLLBACK TO lab_q'); db.exec('RELEASE lab_q'); ui.note('↺ changes rolled back (sandbox) - real data untouched'); }
    }
  }
}

async function openAssignment(a) {
  ui.header(a.title, a.sandbox ? 'Runs inside SAVEPOINT -> everything is rolled back at the end' : `${a.questions.length} questions`);
  a.questions.forEach((q, i) => console.log(`   ${ui.c.cyan(String(i + 1).padStart(2))}. ${q.q}`));
  if (a.sandbox) {
    if (!(await ui.confirm('Run the whole assignment step by step?', true))) return;
    db.exec('SAVEPOINT lab_a');
    try {
      for (let i = 0; i < a.questions.length; i++) {
        await runQuestion(a, i);
        await ui.pause();
      }
    } finally {
      db.exec('ROLLBACK TO lab_a');
      db.exec('RELEASE lab_a');
      ui.note('↺ Assignment sandbox rolled back - schema and data restored.');
    }
    return;
  }
  const v = await ui.askText(`Question number (1-${a.questions.length}) or 'a' for all`, { def: 'a' });
  if (v.toLowerCase() === 'a') {
    for (let i = 0; i < a.questions.length; i++) await runQuestion(a, i);
  } else if (Number(v) >= 1 && Number(v) <= a.questions.length) {
    await runQuestion(a, Number(v) - 1);
  } else ui.error('Invalid question number');
}

function exportSql() {
  const out = ['-- ==========================================================================',
    '--  LAB ASSIGNMENTS 1-4  (auto-generated from src/modules/labAssignments.js)',
    '--  Run on the CAAMS database:  sqlite3 data/college.db < sql/lab_assignments.sql',
    '-- =========================================================================='];
  for (const a of ASSIGNMENTS) {
    out.push('', `-- ##########  ${a.title}  ##########`);
    if (a.sandbox) out.push('BEGIN;  -- sandbox: rolled back at the end');
    a.questions.forEach((q, i) => {
      out.push('', `-- Q${a.id}.${i + 1}  ${q.q}`);
      const steps = q.sql ? [q.sql] : q.steps;
      if (!q.sql && !a.sandbox) out.push('SAVEPOINT q;');
      for (const s of steps) {
        const sql = typeof s === 'string' ? s : s.sql;
        out.push(typeof s === 'object' ? `-- EXPECTED TO FAIL (${s.expectError}):\n-- ${sql.replace(/\n/g, '\n-- ')}` : sql);
      }
      if (!q.sql && !a.sandbox) out.push('ROLLBACK TO q; RELEASE q;');
    });
    if (a.sandbox) out.push('ROLLBACK;');
  }
  const file = path.join(db.SQL_DIR, 'lab_assignments.sql');
  fs.writeFileSync(file, out.join('\n') + '\n');
  return file;
}

module.exports = {
  ASSIGNMENTS,
  exportSql,
  menu: () => runMenu('LAB ASSIGNMENTS (Syllabus 1 - 4)', 'Every question shows the SQL and its live output', [
    ...ASSIGNMENTS.map((a) => ({ label: a.title, hint: `${a.questions.length} Qs${a.sandbox ? ', sandbox' : ''}`, action: () => openAssignment(a) })),
    { label: 'Export all lab queries to sql/lab_assignments.sql', hint: 'for printing / submission', action: () => ui.success(`Written ${exportSql()}`) },
  ]),
};
