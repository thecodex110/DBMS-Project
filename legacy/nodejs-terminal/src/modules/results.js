'use strict';
// ============================================================================
//  MODULE 4 : EXAMS & RESULTS
//  Table: exam_result (NULL marks = absent)   View: v_result_sheet
// ============================================================================
const db = require('../db/connection');
const ui = require('../ui/term');
const session = require('../session');
const { runMenu } = require('../ui/menu');
const { findStudent } = require('./students');

const EXAMS = { Internal: 20, MidSem: 30, EndSem: 50 };
const gradeColor = (g, s) => (g === 'F' ? ui.c.red(s) : g === 'O' || g === 'A+' ? ui.c.green(s) : s);

function subjects() {
  return db.all(`SELECT sub.subject_id, sub.subject_name FROM subject sub
                   JOIN teaches t ON t.subject_id = sub.subject_id
                  WHERE ? IS NULL OR t.faculty_id = ? ORDER BY sub.subject_id`, session.facultyId(), session.facultyId());
}

async function enterMarks() {
  const sub = await ui.pick('Subject', subjects(), (s) => `${s.subject_id} ${s.subject_name}`);
  if (!sub) return;
  const exam = await ui.pick('Exam', Object.keys(EXAMS), (e) => `${e} (out of ${EXAMS[e]})`);
  if (!exam) return;
  const max = EXAMS[exam];
  const rows = db.all(`SELECT e.roll_no, s.first_name || ' ' || s.last_name AS name, r.marks_obtained, r.roll_no IS NOT NULL AS has_row
                         FROM enrollment e JOIN student s ON s.roll_no = e.roll_no
                         LEFT JOIN exam_result r ON r.roll_no = e.roll_no AND r.subject_id = e.subject_id AND r.exam_type = ?
                        WHERE e.subject_id = ? ORDER BY e.roll_no`, exam, sub.subject_id);
  ui.info(`Enter marks out of ${max}. Enter = keep current, 'ab' = absent (stored as NULL).`);
  const changes = [];
  for (const r of rows) {
    const cur = r.has_row ? (r.marks_obtained === null ? 'ab' : String(r.marks_obtained)) : '';
    const v = await ui.askText(`${r.roll_no} ${ui.padEnd(r.name, 20)}`, {
      def: cur,
      validate: (x) => (x.toLowerCase() === 'ab' || (Number(x) >= 0 && Number(x) <= max) ? null : `0-${max} or ab`),
    });
    if (v === '' || v === cur) continue;
    changes.push([r.roll_no, v.toLowerCase() === 'ab' ? null : Number(v)]);
  }
  // UPSERT every changed mark in one transaction
  const sql = `INSERT INTO exam_result (roll_no, subject_id, exam_type, marks_obtained, max_marks) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (roll_no, subject_id, exam_type) DO UPDATE SET marks_obtained = excluded.marks_obtained`;
  db.transaction(() => changes.forEach(([roll, m]) => db.run(sql, roll, sub.subject_id, exam, m, max)));
  ui.success(`${changes.length} mark(s) saved (UPSERT inside one transaction). Changed marks are audited by trigger.`);
}

async function resultSheet() {
  const sub = await ui.pick('Subject', db.all('SELECT subject_id, subject_name FROM subject ORDER BY subject_id'), (s) => `${s.subject_id} ${s.subject_name}`);
  if (!sub) return;
  ui.table(db.all(`SELECT roll_no, student_name, internal, midsem, endsem, total, out_of, percentage, grade
                     FROM v_result_sheet WHERE subject_id = ? ORDER BY percentage DESC`, sub.subject_id), {
    title: `Result sheet - ${sub.subject_name}  (NULL = absent)`,
    color: { grade: gradeColor },
  });
  const dist = db.all(`SELECT grade, COUNT(*) AS n FROM v_result_sheet WHERE subject_id = ? GROUP BY grade
                        ORDER BY MIN(grade_point) DESC`, sub.subject_id);
  ui.section('Grade distribution');
  ui.barChart(dist.map((d) => ({ label: d.grade.padEnd(2), value: d.n })), { unit: ' students' });
}

async function marksheet() {
  const s = await findStudent();
  if (!s) return;
  const rows = db.all(`SELECT subject_id, subject_name, credits, internal, midsem, endsem, total, out_of, grade, grade_point
                         FROM v_result_sheet WHERE roll_no = ? ORDER BY subject_id`, s.roll_no);
  ui.table(rows, { title: `Marksheet - ${s.full_name} (${s.roll_no})`, color: { grade: gradeColor } });
  // SGPA = Σ(credits × grade point) / Σ credits
  const sgpa = db.get(`SELECT ROUND(SUM(credits * grade_point) * 1.0 / SUM(credits), 2) AS sgpa
                         FROM v_result_sheet WHERE roll_no = ?`, s.roll_no).sgpa;
  ui.box('SGPA = Σ(credits × grade point) / Σ credits', [`SGPA : ${ui.c.bold(String(sgpa ?? '-'))}`], ui.c.green);
}

async function toppers() {
  const sql = `WITH ranked AS (
                 SELECT subject_id, roll_no, student_name, percentage,
                        DENSE_RANK() OVER (PARTITION BY subject_id ORDER BY percentage DESC) AS rnk
                   FROM v_result_sheet)
               SELECT subject_id, rnk, roll_no, student_name, percentage
                 FROM ranked WHERE rnk <= 3 ORDER BY subject_id, rnk`;
  ui.printSQL(sql);
  ui.table(db.all(sql), { title: 'Top 3 per subject (window function DENSE_RANK)' });
}

async function sgpaRanking() {
  const sql = `SELECT roll_no, student_name,
                      ROUND(SUM(credits * grade_point) * 1.0 / SUM(credits), 2) AS sgpa,
                      SUM(grade = 'F') AS backlogs
                 FROM v_result_sheet
                GROUP BY roll_no
                ORDER BY sgpa DESC`;
  ui.printSQL(sql);
  ui.table(db.all(sql), { title: 'Class ranking by SGPA', color: { backlogs: (v, s) => (v > 0 ? ui.c.red(s) : s) } });
}

async function attendanceVsMarks() {
  const sql = `SELECT CASE WHEN v.adjusted_pct >= 75 THEN 'Regular (>= 75%)' ELSE 'Defaulter (< 75%)' END AS category,
                      COUNT(*)                     AS records,
                      ROUND(AVG(r.percentage), 2)  AS avg_marks_pct,
                      SUM(r.grade = 'F')           AS fails
                 FROM v_attendance_summary v
                 JOIN v_result_sheet r ON r.roll_no = v.roll_no AND r.subject_id = v.subject_id
                GROUP BY category`;
  ui.printSQL(sql);
  const rows = db.all(sql);
  ui.table(rows, { title: 'Does attendance affect marks?' });
  ui.barChart(rows.map((r) => ({ label: r.category, value: r.avg_marks_pct })), { max: 100, unit: '%' });
}

module.exports = {
  menu: () => runMenu('EXAMS & RESULTS', 'exam_result + v_result_sheet (grades, SGPA)', [
    { label: 'Enter / update marks', hint: 'UPSERT, NULL = absent', action: enterMarks },
    { label: 'Subject result sheet + grades', hint: 'pivot view + CASE', action: resultSheet },
    { label: 'Student marksheet + SGPA', hint: 'weighted average', action: marksheet },
    { label: 'Subject toppers', hint: 'DENSE_RANK() window', action: toppers },
    { label: 'Class SGPA ranking', hint: 'GROUP BY + ORDER BY', action: sgpaRanking },
    { label: 'Attendance vs marks analysis', hint: 'join two views', action: attendanceVsMarks },
  ]),
};
