'use strict';
// ============================================================================
//  MODULE 6 : REPORTS & ANALYTICS DASHBOARD
//  Showcases aggregate functions, GROUP BY / HAVING, nested & correlated
//  subqueries, CTEs, window functions, date functions.
// ============================================================================
const db = require('../db/connection');
const ui = require('../ui/term');
const { runMenu } = require('../ui/menu');

async function dashboard() {
  const k = db.get(`SELECT
      (SELECT COUNT(*) FROM student)                        AS students,
      (SELECT COUNT(*) FROM faculty)                        AS faculty,
      (SELECT COUNT(*) FROM subject)                        AS subjects,
      (SELECT COUNT(*) FROM class_session)                  AS sessions,
      (SELECT COUNT(*) FROM attendance)                     AS attendance_rows,
      (SELECT ROUND(100.0 * SUM(status = 'P') / COUNT(*), 2) FROM attendance) AS overall_pct,
      (SELECT COUNT(DISTINCT roll_no) FROM v_defaulters)    AS defaulter_students,
      (SELECT COUNT(*) FROM leave_request WHERE status = 'Pending') AS pending_leaves`);
  ui.box('COLLEGE DASHBOARD', [
    `Students ${ui.c.bold(k.students)}   Faculty ${ui.c.bold(k.faculty)}   Subjects ${ui.c.bold(k.subjects)}`,
    `Sessions conducted ${ui.c.bold(k.sessions)}   Attendance rows ${ui.c.bold(k.attendance_rows)}`,
    `Overall attendance ${ui.bar(k.overall_pct, 24)}`,
    `Students with at least one defaulter subject : ${ui.c.bRed(k.defaulter_students)}`,
    `Pending leave requests : ${ui.c.bYellow(k.pending_leaves)}`,
  ]);
  ui.section('Department-wise average attendance');
  for (const d of db.all('SELECT dept_id, avg_attendance FROM v_dept_stats')) console.log(`    ${ui.padEnd(d.dept_id, 6)} ${ui.bar(d.avg_attendance, 30)}`);
  ui.section('Subject-wise average attendance');
  for (const s of db.all('SELECT subject_id, subject_name, avg_attendance FROM v_subject_report ORDER BY avg_attendance DESC')) {
    console.log(`    ${ui.padEnd(s.subject_id, 6)} ${ui.padEnd(s.subject_name, 30)} ${ui.bar(s.avg_attendance, 24)}`);
  }
}

async function weeklyTrend() {
  const sql = `SELECT strftime('%Y-W%W', cs.session_date)                  AS week,
                      COUNT(DISTINCT cs.session_id)                         AS sessions,
                      ROUND(100.0 * SUM(a.status = 'P') / COUNT(*), 2)      AS attendance_pct
                 FROM class_session cs JOIN attendance a ON a.session_id = cs.session_id
                GROUP BY week ORDER BY week`;
  ui.printSQL(sql);
  const rows = db.all(sql);
  ui.section('Weekly attendance trend');
  for (const r of rows) console.log(`    ${r.week}  ${ui.bar(r.attendance_pct, 36)}  ${ui.c.gray(r.sessions + ' sessions')}`);
}

async function weekdayAnalysis() {
  const sql = `SELECT CASE strftime('%w', cs.session_date)
                        WHEN '1' THEN 'Monday' WHEN '2' THEN 'Tuesday' WHEN '3' THEN 'Wednesday'
                        WHEN '4' THEN 'Thursday' WHEN '5' THEN 'Friday' ELSE 'Weekend' END  AS day,
                      COUNT(*)                                                         AS records,
                      ROUND(100.0 * SUM(a.status = 'P') / COUNT(*), 2)                 AS attendance_pct
                 FROM attendance a JOIN class_session cs ON cs.session_id = a.session_id
                GROUP BY strftime('%w', cs.session_date)
                ORDER BY strftime('%w', cs.session_date)`;
  ui.printSQL(sql);
  const rows = db.all(sql);
  ui.table(rows, { color: { attendance_pct: ui.pctColor } });
  ui.barChart(rows.map((r) => ({ label: r.day.padEnd(9), value: r.attendance_pct })), { max: 100, unit: '%' });
}

async function perfectAttendance() {
  const sql = `SELECT s.roll_no, s.first_name || ' ' || s.last_name AS name, sub.subject_id
                 FROM enrollment e
                 JOIN student s   ON s.roll_no = e.roll_no
                 JOIN subject sub ON sub.subject_id = e.subject_id
                WHERE NOT EXISTS (SELECT 1 FROM attendance a
                                    JOIN class_session cs ON cs.session_id = a.session_id
                                   WHERE a.roll_no = e.roll_no AND cs.subject_id = e.subject_id
                                     AND a.status = 'A')
                ORDER BY sub.subject_id`;
  ui.printSQL(sql);
  ui.table(db.all(sql), { title: 'Never absent in a subject (NOT EXISTS)' });
}

async function belowDeptAverage() {
  const sql = `SELECT v.roll_no, v.student_name, v.dept_id, ROUND(AVG(v.adjusted_pct), 2) AS my_avg,
                      (SELECT ROUND(AVG(v2.adjusted_pct), 2) FROM v_attendance_summary v2
                        WHERE v2.dept_id = v.dept_id)                       AS dept_avg
                 FROM v_attendance_summary v
                GROUP BY v.roll_no
               HAVING AVG(v.adjusted_pct) < (SELECT AVG(v3.adjusted_pct) FROM v_attendance_summary v3
                                              WHERE v3.dept_id = v.dept_id)   -- correlated subquery
                ORDER BY v.dept_id, my_avg`;
  ui.printSQL(sql);
  ui.table(db.all(sql), { title: 'Students below their department average', color: { my_avg: ui.pctColor } });
}

async function streaks() {
  // longest run of consecutive absences per student (gaps-and-islands with window functions)
  const sql = `WITH seq AS (
                 SELECT a.roll_no, cs.subject_id, cs.session_date, a.status,
                        ROW_NUMBER() OVER (PARTITION BY a.roll_no, cs.subject_id ORDER BY cs.session_date, cs.start_time)
                      - ROW_NUMBER() OVER (PARTITION BY a.roll_no, cs.subject_id, a.status ORDER BY cs.session_date, cs.start_time) AS grp
                   FROM attendance a JOIN class_session cs ON cs.session_id = a.session_id),
               runs AS (
                 SELECT roll_no, subject_id, COUNT(*) AS len, MIN(session_date) AS from_date, MAX(session_date) AS to_date
                   FROM seq WHERE status = 'A' GROUP BY roll_no, subject_id, grp)
               SELECT roll_no, subject_id, len AS consecutive_absences, from_date, to_date
                 FROM runs WHERE len >= 3 ORDER BY len DESC, roll_no LIMIT 15`;
  ui.printSQL(sql);
  ui.table(db.all(sql), { title: 'Longest absence streaks (window functions: gaps & islands)' });
}

async function cityGender() {
  const sql = `SELECT city,
                      SUM(gender = 'M') AS male, SUM(gender = 'F') AS female, COUNT(*) AS total
                 FROM student GROUP BY city HAVING COUNT(*) >= 2 ORDER BY total DESC`;
  ui.printSQL(sql);
  ui.table(db.all(sql), { title: 'Cities with 2+ students (GROUP BY + HAVING)' });
}

module.exports = {
  menu: () => runMenu('REPORTS & ANALYTICS', 'aggregates · subqueries · window functions · charts', [
    { label: 'College dashboard', hint: 'scalar subqueries', action: dashboard },
    { label: 'Weekly attendance trend', hint: 'strftime + GROUP BY', action: weeklyTrend },
    { label: 'Weekday analysis', hint: 'CASE + GROUP BY', action: weekdayAnalysis },
    { label: 'Perfect attendance', hint: 'NOT EXISTS', action: perfectAttendance },
    { label: 'Below department average', hint: 'correlated subquery', action: belowDeptAverage },
    { label: 'Absence streaks', hint: 'window functions', action: streaks },
    { label: 'City / gender distribution', hint: 'HAVING', action: cityGender },
  ]),
};
