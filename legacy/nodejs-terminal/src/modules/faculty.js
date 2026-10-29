'use strict';
// ============================================================================
//  MODULE 2 : FACULTY, SUBJECTS & DEPARTMENTS
//  Tables: department, faculty, subject, teaches
// ============================================================================
const db = require('../db/connection');
const ui = require('../ui/term');
const { runMenu } = require('../ui/menu');
const { hashPassword } = require('../db/auth');

async function listDepartments() {
  ui.table(db.all('SELECT * FROM v_dept_stats'), {
    title: 'Departments (view v_dept_stats)',
    color: { avg_attendance: ui.pctColor },
  });
}

async function listFaculty() {
  const sql = `SELECT f.faculty_id, f.name, f.designation, f.dept_id, f.salary,
                      group_concat(t.subject_id, ', ') AS teaches
                 FROM faculty f
                 LEFT JOIN teaches t ON t.faculty_id = f.faculty_id   -- LEFT JOIN keeps faculty with no subject
                GROUP BY f.faculty_id
                ORDER BY f.dept_id, f.salary DESC`;
  ui.printSQL(sql);
  ui.table(db.all(sql));
}

async function listSubjects() {
  ui.table(db.all(`SELECT subject_id, subject_name, dept_id, semester AS sem, faculty, enrolled, sessions,
                          avg_attendance, defaulters, avg_marks_pct
                     FROM v_subject_report ORDER BY dept_id, subject_id`), {
    title: 'Subjects (view v_subject_report)',
    color: { avg_attendance: ui.pctColor },
  });
}

async function addFaculty() {
  const dept = await ui.pick('Department', db.all('SELECT dept_id, dept_name FROM department'), (d) => `${d.dept_id} - ${d.dept_name}`);
  if (!dept) return;
  const next = db.get("SELECT 'FAC' || (MAX(CAST(substr(faculty_id, 4) AS INTEGER)) + 1) AS id FROM faculty").id;
  const id = (await ui.askText('Faculty ID', { def: next })).toUpperCase();
  const name = await ui.askText('Full name (with Dr./Prof.)', { required: true });
  const email = await ui.askText('Email', { required: true });
  const desig = await ui.pick('Designation', ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer'], (x) => x, { allowBack: false });
  const salary = await ui.askNumber('Monthly salary', { min: 1, def: 75000 });
  db.transaction(() => {
    db.run(`INSERT INTO faculty (faculty_id, name, email, designation, dept_id, joining_date, salary)
            VALUES (?, ?, ?, ?, ?, date('now'), ?)`, id, name, email, desig, dept.dept_id, salary);
    db.run("INSERT INTO app_user (username, password_hash, salt, role, faculty_id) VALUES (?, ?, ?, 'faculty', ?)",
      id.toLowerCase(), ...hashPassword(id.toLowerCase() + '@123'), id);
  });
  ui.success(`Faculty ${id} added. Login: ${id.toLowerCase()} / ${id.toLowerCase()}@123`);
}

async function addSubject() {
  const dept = await ui.pick('Offering department', db.all('SELECT dept_id, dept_name FROM department'), (d) => `${d.dept_id} - ${d.dept_name}`);
  if (!dept) return;
  const id = (await ui.askText('Subject code (e.g. CS505)', { required: true })).toUpperCase();
  const name = await ui.askText('Subject name', { required: true });
  const credits = await ui.askInt('Credits (1-6)', { min: 1, max: 6, def: 4 });
  const sem = await ui.askInt('Semester (1-8)', { min: 1, max: 8, def: 5 });
  const type = (await ui.confirm('Is it a Lab subject?')) ? 'Lab' : 'Theory';
  db.run('INSERT INTO subject (subject_id, subject_name, credits, semester, subject_type, dept_id) VALUES (?, ?, ?, ?, ?, ?)',
    id, name, credits, sem, type, dept.dept_id);
  ui.success(`Subject ${id} created.`);
  if (await ui.confirm('Auto-enrol matching students (same dept, matching semester)?', true)) {
    const n = db.run(`INSERT INTO enrollment (roll_no, subject_id)
                      SELECT roll_no, ? FROM student WHERE dept_id = ? AND year * 2 - 1 = ?`, id, dept.dept_id, sem).changes;
    ui.success(`${n} student(s) enrolled via INSERT ... SELECT.`);
  }
}

async function allocateSubject() {
  const sub = await ui.pick('Subject', db.all('SELECT subject_id, subject_name, faculty FROM v_subject_report ORDER BY subject_id'),
    (s) => `${s.subject_id} ${s.subject_name} ${ui.c.gray('→ ' + (s.faculty || 'unallocated'))}`);
  if (!sub) return;
  const fac = await ui.pick('Assign to faculty', db.all('SELECT faculty_id, name, dept_id FROM faculty ORDER BY faculty_id'),
    (f) => `${f.faculty_id} ${f.name} (${f.dept_id})`);
  if (!fac) return;
  // UPSERT: insert, or update the existing (subject, year) allocation
  const sql = `INSERT INTO teaches (subject_id, academic_year, faculty_id) VALUES (?, '2026-27', ?)
               ON CONFLICT (subject_id, academic_year) DO UPDATE SET faculty_id = excluded.faculty_id`;
  ui.printSQL(sql);
  db.run(sql, sub.subject_id, fac.faculty_id);
  ui.success(`${sub.subject_id} is now taught by ${fac.name}.`);
}

async function workload() {
  const sql = `SELECT f.name, f.dept_id,
                      COUNT(DISTINCT t.subject_id)                 AS subjects,
                      COUNT(cs.session_id)                         AS sessions_taken,
                      ROUND(COUNT(cs.session_id) / 15.0, 1)        AS per_week,
                      COALESCE(SUM(sub.credits), 0)                AS credit_load
                 FROM faculty f
                 LEFT JOIN teaches t        ON t.faculty_id = f.faculty_id
                 LEFT JOIN subject sub      ON sub.subject_id = t.subject_id
                 LEFT JOIN class_session cs ON cs.subject_id = t.subject_id AND cs.faculty_id = f.faculty_id
                GROUP BY f.faculty_id
                ORDER BY sessions_taken DESC`;
  ui.printSQL(sql);
  const rows = db.all(sql);
  ui.table(rows);
  ui.section('Sessions taken (bar chart)');
  ui.barChart(rows.map((r) => ({ label: r.name, value: r.sessions_taken })));
}

module.exports = {
  menu: () => runMenu('FACULTY, SUBJECTS & DEPARTMENTS', 'department · faculty · subject · teaches', [
    { label: 'Departments overview', hint: 'view v_dept_stats', action: listDepartments },
    { label: 'Faculty list with subjects', hint: 'LEFT JOIN + group_concat', action: listFaculty },
    { label: 'Subjects report', hint: 'view v_subject_report', action: listSubjects },
    { label: 'Faculty workload', hint: 'multi-table aggregate', action: workload },
    { label: 'Add faculty', hint: 'INSERT + login account', action: addFaculty, adminOnly: true },
    { label: 'Add subject', hint: 'INSERT + INSERT..SELECT', action: addSubject, adminOnly: true },
    { label: 'Allocate subject to faculty', hint: 'UPSERT', action: allocateSubject, adminOnly: true },
  ]),
};
