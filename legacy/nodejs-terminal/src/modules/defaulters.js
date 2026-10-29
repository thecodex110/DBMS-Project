'use strict';
// ============================================================================
//  MODULE 5 : DEFAULTERS & LEAVE MANAGEMENT
//  Views: v_defaulters, v_attendance_summary   Tables: defaulter_notice, leave_request
// ============================================================================
const db = require('../db/connection');
const ui = require('../ui/term');
const session = require('../session');
const { runMenu } = require('../ui/menu');
const { findStudent } = require('./students');

const riskColor = (v, s) => (v === 'Critical' ? ui.c.bRed(s) : v === 'High' ? ui.c.red(s) : ui.c.yellow(s));

async function viewDefaulters() {
  const dept = await ui.askText('Department filter (blank = all)', { def: '' });
  const sql = `SELECT roll_no, student_name, subject_id, present || '+' || on_leave || '/' || total_classes AS attended,
                      raw_pct, adjusted_pct, classes_needed, risk
                 FROM v_defaulters
                WHERE ? = '' OR dept_id = upper(?)
                ORDER BY adjusted_pct`;
  ui.printSQL(sql);
  ui.table(db.all(sql, dept, dept), { color: { risk: riskColor, adjusted_pct: ui.pctColor, raw_pct: ui.pctColor } });
  ui.note('adjusted_pct counts absences covered by APPROVED leave;  classes_needed = 3T - 4P  (to reach 75%)');
  const summary = db.all('SELECT risk, COUNT(*) AS n FROM v_defaulters GROUP BY risk ORDER BY MIN(adjusted_pct)');
  ui.section('Risk summary');
  ui.barChart(summary.map((r) => ({ label: r.risk.padEnd(8), value: r.n })), { unit: ' student-subjects' });
}

async function generateNotices() {
  const pending = db.get(`SELECT COUNT(*) AS n FROM v_defaulters d
                           WHERE NOT EXISTS (SELECT 1 FROM defaulter_notice n
                                              WHERE n.roll_no = d.roll_no AND n.subject_id = d.subject_id
                                                AND n.issued_on = date('now'))`).n;
  ui.info(`${pending} defaulter entries do not have a notice for today.`);
  if (!pending || !(await ui.confirm('Generate notices now (INSERT ... SELECT from view)?', true))) return;
  const sql = `INSERT INTO defaulter_notice (roll_no, subject_id, attendance_pct)
               SELECT roll_no, subject_id, adjusted_pct FROM v_defaulters WHERE true
               ON CONFLICT (roll_no, subject_id, issued_on) DO NOTHING`;
  ui.printSQL(sql);
  const n = db.transaction(() => db.run(sql).changes);
  ui.success(`${n} notices issued in one transaction.`);
}

async function manageNotices() {
  const rows = db.all(`SELECT n.notice_id, n.roll_no, s.first_name || ' ' || s.last_name AS name, n.subject_id,
                              n.attendance_pct, n.issued_on, n.status
                         FROM defaulter_notice n JOIN student s USING (roll_no)
                        ORDER BY n.issued_on DESC, n.notice_id`);
  ui.table(rows, { title: 'Defaulter notices' });
  if (!rows.length) return;
  const id = await ui.askInt('Notice id to update (0 = none)', { min: 0, def: 0 });
  if (!id) return;
  const st = await ui.pick('New status', ['Acknowledged', 'Cleared']);
  if (!st) return;
  const r = db.run('UPDATE defaulter_notice SET status = ? WHERE notice_id = ?', st, id);
  r.changes ? ui.success('Notice updated.') : ui.warn('No such notice.');
}

async function applyLeave() {
  const s = await findStudent();
  if (!s) return;
  const from = await ui.askText('From date (YYYY-MM-DD)', { required: true });
  const to = await ui.askText('To date (YYYY-MM-DD)', { def: from });
  const type = await ui.pick('Leave type', ['Medical', 'Sports', 'Event', 'Personal'], (x) => x, { allowBack: false });
  const reason = await ui.askText('Reason', { required: true });
  const r = db.run('INSERT INTO leave_request (roll_no, from_date, to_date, leave_type, reason) VALUES (?, ?, ?, ?, ?)',
    s.roll_no, from, to, type, reason);
  ui.success(`Leave request #${r.lastInsertRowid} submitted (status = Pending by DEFAULT).`);
  ui.note('CHECK (from_date <= to_date) guards the date range.');
}

async function reviewLeaves() {
  const rows = db.all(`SELECT l.leave_id, l.roll_no, s.first_name || ' ' || s.last_name AS name, l.from_date, l.to_date,
                              l.leave_type, l.reason
                         FROM leave_request l JOIN student s USING (roll_no)
                        WHERE l.status = 'Pending' ORDER BY l.applied_on`);
  const lv = await ui.pick('Pending leave requests', rows,
    (l) => `#${l.leave_id} ${l.roll_no} ${ui.padEnd(l.name, 18)} ${l.from_date}→${l.to_date} ${l.leave_type}: ${ui.c.gray(l.reason)}`);
  if (!lv) return;
  const before = db.all('SELECT subject_id, raw_pct, adjusted_pct FROM v_attendance_summary WHERE roll_no = ? ORDER BY subject_id', lv.roll_no);
  const decision = await ui.pick('Decision', ['Approved', 'Rejected']);
  if (!decision) return;
  const reviewer = session.facultyId() || 'FAC101';
  db.run('UPDATE leave_request SET status = ?, reviewed_by = ? WHERE leave_id = ?', decision, reviewer, lv.leave_id);
  ui.success(`Leave #${lv.leave_id} ${decision.toLowerCase()} by ${reviewer}.`);
  const after = db.all('SELECT subject_id, adjusted_pct FROM v_attendance_summary WHERE roll_no = ? ORDER BY subject_id', lv.roll_no);
  ui.table(before.map((b, i) => ({ subject: b.subject_id, raw_pct: b.raw_pct, adjusted_before: b.adjusted_pct, adjusted_after: after[i].adjusted_pct })),
    { title: 'Impact on adjusted attendance (view recomputes automatically)' });
  ui.note('Trigger trg_leave_review_once now blocks changing this decision again.');
}

async function leaveHistory() {
  ui.table(db.all(`SELECT l.leave_id, l.roll_no, l.from_date, l.to_date, l.leave_type, l.status,
                          COALESCE(f.name, '-') AS reviewed_by
                     FROM leave_request l LEFT JOIN faculty f ON f.faculty_id = l.reviewed_by
                    ORDER BY l.leave_id DESC`), {
    color: { status: (v, s) => (v === 'Approved' ? ui.c.green(s) : v === 'Rejected' ? ui.c.red(s) : ui.c.yellow(s)) },
  });
}

module.exports = {
  menu: () => runMenu('DEFAULTERS & LEAVES', '75% rule · notices · leave approval', [
    { label: 'View defaulter list (< 75%)', hint: 'view v_defaulters', action: viewDefaulters },
    { label: 'Generate defaulter notices', hint: 'INSERT..SELECT + ON CONFLICT', action: generateNotices },
    { label: 'View / update notices', hint: 'UPDATE', action: manageNotices },
    { label: 'Apply leave for a student', hint: 'INSERT + CHECK', action: applyLeave },
    { label: 'Approve / reject pending leaves', hint: 'UPDATE + trigger', action: reviewLeaves },
    { label: 'Leave history', hint: 'LEFT JOIN', action: leaveHistory },
  ]),
};
