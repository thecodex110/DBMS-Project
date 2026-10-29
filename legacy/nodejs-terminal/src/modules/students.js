'use strict';
// ============================================================================
//  MODULE 1 : STUDENT MANAGEMENT  (CRUD = Create, Read, Update, Delete)
//  Tables: student, student_phone, enrollment     Views: v_student_profile
// ============================================================================
const db = require('../db/connection');
const ui = require('../ui/term');
const { runMenu } = require('../ui/menu');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v) => (DATE_RE.test(v) && !Number.isNaN(Date.parse(v)) ? null : 'Use format YYYY-MM-DD');

async function pickDepartment(label = 'Department') {
  const depts = db.all('SELECT dept_id, dept_name FROM department ORDER BY dept_id');
  return ui.pick(label, depts, (d) => `${d.dept_id.padEnd(5)} ${d.dept_name}`);
}

async function findStudent() {
  const q = await ui.askText('Roll no or part of name', { required: true });
  const rows = db.all(`SELECT roll_no, full_name, dept_id, year FROM v_student_profile
                        WHERE roll_no = upper(?) OR full_name LIKE '%' || ? || '%'
                        ORDER BY roll_no`, q, q);
  if (!rows.length) { ui.warn('No student matches.'); return null; }
  if (rows.length === 1) return rows[0];
  return ui.pick('Multiple matches', rows, (r) => `${r.roll_no}  ${r.full_name} (${r.dept_id}, year ${r.year})`);
}

async function listStudents() {
  const dept = await ui.askText('Filter by dept (CS/IT/ENTC/MECH, blank = all)', { def: '' });
  const year = await ui.askText('Filter by year (1-4, blank = all)', { def: '' });
  const sql = `SELECT roll_no, full_name, gender AS g, age, city, year, dept_id, phones
                 FROM v_student_profile
                WHERE (? = '' OR dept_id = upper(?))
                  AND (? = '' OR year = CAST(? AS INTEGER))
                ORDER BY dept_id, year DESC, roll_no`;
  ui.printSQL(sql);
  ui.table(db.all(sql, dept, dept, year, year));
}

async function searchStudents() {
  const q = await ui.askText('Search text (name / city / email)', { required: true });
  const sql = `SELECT roll_no, full_name, city, email, dept_id
                 FROM v_student_profile
                WHERE full_name LIKE ? OR city LIKE ? OR email LIKE ?
                ORDER BY full_name`;
  ui.printSQL(sql);
  const like = `%${q}%`;
  ui.table(db.all(sql, like, like, like));
}

async function studentProfile() {
  const s = await findStudent();
  if (!s) return;
  const p = db.get('SELECT * FROM v_student_profile WHERE roll_no = ?', s.roll_no);
  ui.box(`${p.full_name}  (${p.roll_no})`, [
    `Department : ${p.dept_name} (${p.dept_id})      Year : ${p.year}`,
    `Gender     : ${p.gender}      DOB : ${p.dob}      Age (derived) : ${p.age}`,
    `Email      : ${p.email || '-'}`,
    `City       : ${p.city || '-'}`,
    `Phones     : ${p.phones || '-'}   ${ui.c.gray('(multivalued attribute)')}`,
  ]);
  ui.section('Attendance (from view v_attendance_summary)');
  const att = db.all('SELECT subject_id, subject_name, total_classes, present, on_leave, adjusted_pct, classes_needed FROM v_attendance_summary WHERE roll_no = ? ORDER BY subject_id', p.roll_no);
  for (const a of att) {
    const need = a.classes_needed > 0 ? ui.c.red(`  needs ${a.classes_needed} more classes`) : '';
    console.log(`    ${ui.padEnd(a.subject_id, 6)} ${ui.padEnd(a.subject_name, 30)} ${ui.bar(a.adjusted_pct)}  ${ui.c.gray(`${a.present}+${a.on_leave}/${a.total_classes}`)}${need}`);
  }
  ui.table(db.all(`SELECT subject_id, internal, midsem, endsem, total, out_of, percentage, grade
                     FROM v_result_sheet WHERE roll_no = ? ORDER BY subject_id`, p.roll_no), { title: 'Results (view v_result_sheet)' });
  const leaves = db.all('SELECT leave_id, from_date, to_date, leave_type, status FROM leave_request WHERE roll_no = ? ORDER BY from_date DESC', p.roll_no);
  if (leaves.length) ui.table(leaves, { title: 'Leave history' });
}

async function addStudent() {
  ui.info('All constraints (PK, UNIQUE, CHECK, FK) are enforced by the database itself.');
  const dept = await pickDepartment();
  if (!dept) return;
  const year = await ui.askInt('Year (1-4)', { min: 1, max: 4, def: 3 });
  const prefix = String(new Date().getFullYear() - year).slice(2) + (dept.dept_id === 'ENTC' ? 'EC' : dept.dept_id === 'MECH' ? 'ME' : dept.dept_id);
  const next = db.get(`SELECT COALESCE(MAX(CAST(substr(roll_no, 5) AS INTEGER)), 0) + 1 AS n
                         FROM student WHERE roll_no LIKE ? || '%'`, prefix).n;
  const suggested = prefix + String(next).padStart(3, '0');
  const roll = (await ui.askText('Roll no', { def: suggested })).toUpperCase();
  const first = await ui.askText('First name', { required: true });
  const last = await ui.askText('Last name', { required: true });
  const gender = (await ui.askText('Gender (M/F/O)', { required: true, validate: (v) => (/^[mfo]$/i.test(v) ? null : 'M, F or O') })).toUpperCase();
  const dob = await ui.askText('Date of birth (YYYY-MM-DD)', { required: true, validate: validDate });
  const city = await ui.askText('City', { def: '' });
  const email = await ui.askText('Email', { def: `${first.toLowerCase()}.${roll.toLowerCase()}@college.edu` });
  const phones = (await ui.askText('Phone numbers (comma separated, optional)', { def: '' }))
    .split(',').map((p) => p.trim()).filter(Boolean);

  // ONE transaction: student + phones + enrollments succeed or fail together
  const enrolled = db.transaction(() => {
    db.run(`INSERT INTO student (roll_no, first_name, last_name, gender, dob, email, city, year, dept_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, roll, first, last, gender, dob, email || null, city || null, year, dept.dept_id);
    for (const p of phones) db.run('INSERT INTO student_phone (roll_no, phone) VALUES (?, ?)', roll, p);
    return db.run(`INSERT INTO enrollment (roll_no, subject_id)
                   SELECT ?, subject_id FROM subject WHERE dept_id = ? AND semester = ? * 2 - 1`,
    roll, dept.dept_id, year).changes;
  });
  ui.success(`Student ${roll} added and auto-enrolled in ${enrolled} subject(s).`);
  ui.note('Trigger trg_audit_student_insert wrote an entry into audit_log.');
}

async function updateStudent() {
  const s = await findStudent();
  if (!s) return;
  const cur = db.get('SELECT * FROM student WHERE roll_no = ?', s.roll_no);
  ui.info('Press Enter to keep the current value.');
  const first = await ui.askText('First name', { def: cur.first_name });
  const last = await ui.askText('Last name', { def: cur.last_name });
  const city = await ui.askText('City', { def: cur.city || '' });
  const email = await ui.askText('Email', { def: cur.email || '' });
  const year = await ui.askInt('Year', { min: 1, max: 4, def: cur.year });
  const sql = `UPDATE student SET first_name = ?, last_name = ?, city = ?, email = ?, year = ? WHERE roll_no = ?`;
  ui.printSQL(sql);
  const r = db.run(sql, first, last, city || null, email || null, year, cur.roll_no);
  ui.success(`${r.changes} row updated.`);
  const ph = await ui.askText('Add a phone number (optional)', { def: '' });
  if (ph) { db.run('INSERT INTO student_phone VALUES (?, ?)', cur.roll_no, ph); ui.success('Phone added.'); }
}

async function deleteStudent() {
  const s = await findStudent();
  if (!s) return;
  // show what ON DELETE CASCADE will remove
  const impact = db.get(`SELECT
      (SELECT COUNT(*) FROM enrollment    WHERE roll_no = ?) AS enrollments,
      (SELECT COUNT(*) FROM attendance    WHERE roll_no = ?) AS attendance_rows,
      (SELECT COUNT(*) FROM exam_result   WHERE roll_no = ?) AS marks_rows,
      (SELECT COUNT(*) FROM student_phone WHERE roll_no = ?) AS phones,
      (SELECT COUNT(*) FROM leave_request WHERE roll_no = ?) AS leaves`, s.roll_no, s.roll_no, s.roll_no, s.roll_no, s.roll_no);
  ui.warn(`Deleting ${s.roll_no} (${s.full_name}) will CASCADE-delete these child rows:`);
  ui.table([impact]);
  if (!(await ui.confirm('Really delete?'))) return ui.info('Cancelled.');
  db.run('DELETE FROM student WHERE roll_no = ?', s.roll_no);
  ui.success('Deleted. Child rows removed automatically by ON DELETE CASCADE; audit_log updated by trigger.');
}

async function manageEnrollment() {
  const s = await findStudent();
  if (!s) return;
  ui.table(db.all(`SELECT e.subject_id, sub.subject_name, e.enrolled_on FROM enrollment e
                    JOIN subject sub USING (subject_id) WHERE e.roll_no = ?`, s.roll_no), { title: 'Current enrollments' });
  const others = db.all(`SELECT subject_id, subject_name, dept_id, semester FROM subject
                          WHERE subject_id NOT IN (SELECT subject_id FROM enrollment WHERE roll_no = ?)
                          ORDER BY dept_id, subject_id`, s.roll_no);
  const sub = await ui.pick('Enrol in another subject (elective)', others, (x) => `${x.subject_id} ${x.subject_name} (${x.dept_id}, sem ${x.semester})`);
  if (!sub) return;
  db.run('INSERT INTO enrollment (roll_no, subject_id) VALUES (?, ?)', s.roll_no, sub.subject_id);
  ui.success(`${s.roll_no} enrolled in ${sub.subject_id}.`);
}

module.exports = {
  findStudent,
  menu: () => runMenu('STUDENT MANAGEMENT', 'CRUD on student + student_phone + enrollment', [
    { label: 'List students (filter by dept / year)', hint: 'SELECT ... WHERE', action: listStudents },
    { label: 'Search students', hint: 'LIKE pattern', action: searchStudents },
    { label: 'Student full profile', hint: 'views + joins', action: studentProfile },
    { label: 'Add new student', hint: 'INSERT in a transaction', action: addStudent },
    { label: 'Update student', hint: 'UPDATE', action: updateStudent },
    { label: 'Enrol student in a subject', hint: 'M:N relationship', action: manageEnrollment },
    { label: 'Delete student', hint: 'DELETE + CASCADE', action: deleteStudent, adminOnly: true },
  ]),
};
