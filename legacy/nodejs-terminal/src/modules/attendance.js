'use strict';
// ============================================================================
//  MODULE 3 : ATTENDANCE
//  Tables: class_session, attendance     Views: v_attendance_summary
//  Triggers involved: trg_attendance_must_be_enrolled, trg_session_not_in_future,
//                     trg_audit_attendance_update / _delete
// ============================================================================
const db = require('../db/connection');
const ui = require('../ui/term');
const session = require('../session');
const { runMenu } = require('../ui/menu');

// faculty see only their own subjects, admin sees all
function mySubjects() {
  return db.all(`SELECT sub.subject_id, sub.subject_name, t.faculty_id, f.name AS faculty
                   FROM subject sub
                   JOIN teaches t ON t.subject_id = sub.subject_id
                   JOIN faculty f ON f.faculty_id = t.faculty_id
                  WHERE ? IS NULL OR t.faculty_id = ?
                  ORDER BY sub.subject_id`, session.facultyId(), session.facultyId());
}

const pickSubject = () => ui.pick('Select subject', mySubjects(), (s) => `${s.subject_id}  ${ui.padEnd(s.subject_name, 30)} ${ui.c.gray(s.faculty)}`);

async function takeAttendance() {
  const sub = await pickSubject();
  if (!sub) return;
  const today = new Date().toISOString().slice(0, 10);
  const date = await ui.askText('Date (YYYY-MM-DD)', { def: today, validate: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'YYYY-MM-DD') });
  const time = await ui.askText('Start time (HH:MM)', { def: '10:00', validate: (v) => (/^\d{2}:\d{2}$/.test(v) ? null : 'HH:MM') });
  const topic = await ui.askText('Topic covered', { def: 'Lecture' });

  const roster = db.all(`SELECT e.roll_no, s.first_name || ' ' || s.last_name AS name, v.adjusted_pct
                           FROM enrollment e
                           JOIN student s ON s.roll_no = e.roll_no
                           LEFT JOIN v_attendance_summary v ON v.roll_no = e.roll_no AND v.subject_id = e.subject_id
                          WHERE e.subject_id = ? ORDER BY e.roll_no`, sub.subject_id);
  if (!roster.length) return ui.warn('No students enrolled in this subject.');
  ui.section(`Class roster - ${sub.subject_name} (${roster.length} students)`);
  roster.forEach((r, i) => console.log(`    ${ui.c.cyan(String(i + 1).padStart(2))}. ${ui.padEnd(r.roll_no, 9)} ${ui.padEnd(r.name, 22)} ${ui.bar(r.adjusted_pct, 12)}`));

  console.log();
  ui.info('Type the serial numbers / roll numbers of ABSENT students (comma separated).');
  ui.note("Leave blank = everyone present,  'each' = mark one by one.");
  const input = await ui.askText('Absent', { def: '' });
  const status = new Map(roster.map((r) => [r.roll_no, 'P']));
  if (input.toLowerCase() === 'each') {
    for (const r of roster) {
      const v = await ui.askText(`${r.roll_no} ${r.name} (P/A)`, { def: 'P', validate: (x) => (/^[pa]$/i.test(x) ? null : 'P or A') });
      status.set(r.roll_no, v.toUpperCase());
    }
  } else if (input) {
    for (const tok of input.split(/[\s,]+/).filter(Boolean)) {
      const byIndex = /^\d{1,2}$/.test(tok) ? roster[Number(tok) - 1] : null;
      const match = byIndex || roster.find((r) => r.roll_no === tok.toUpperCase() || r.roll_no.endsWith(tok.toUpperCase()));
      if (!match) { ui.warn(`Ignoring unknown entry "${tok}"`); continue; }
      status.set(match.roll_no, 'A');
    }
  }

  // ATOMIC: the session row and ALL attendance rows commit together
  const sid = db.transaction(() => {
    const { lastInsertRowid } = db.run(
      'INSERT INTO class_session (subject_id, faculty_id, session_date, start_time, topic) VALUES (?, ?, ?, ?, ?)',
      sub.subject_id, sub.faculty_id, date, time, topic);
    for (const [roll, st] of status) {
      db.run('INSERT INTO attendance (session_id, roll_no, status) VALUES (?, ?, ?)', lastInsertRowid, roll, st);
    }
    return lastInsertRowid;
  });
  const absent = [...status.values()].filter((s) => s === 'A').length;
  ui.success(`Session #${sid} saved: ${roster.length - absent} present, ${absent} absent (1 transaction, ${roster.length + 1} INSERTs).`);
}

async function chooseSession(sub) {
  const sessions = db.all(`SELECT cs.session_id, cs.session_date, cs.start_time, cs.topic,
                                  SUM(a.status = 'P') AS present, COUNT(a.roll_no) AS total
                             FROM class_session cs LEFT JOIN attendance a ON a.session_id = cs.session_id
                            WHERE cs.subject_id = ?
                            GROUP BY cs.session_id ORDER BY cs.session_date DESC, cs.start_time DESC LIMIT 15`, sub.subject_id);
  return ui.pick('Recent sessions', sessions,
    (s) => `#${String(s.session_id).padEnd(4)} ${s.session_date} ${s.start_time}  ${ui.padEnd(String(s.topic || ''), 30)} ${ui.c.gray(`${s.present}/${s.total} present`)}`);
}

async function viewSession() {
  const sub = await pickSubject();
  if (!sub) return;
  const s = await chooseSession(sub);
  if (!s) return;
  ui.table(db.all(`SELECT a.roll_no, st.first_name || ' ' || st.last_name AS name,
                          CASE a.status WHEN 'P' THEN 'Present' ELSE 'Absent' END AS status, a.marked_at
                     FROM attendance a JOIN student st ON st.roll_no = a.roll_no
                    WHERE a.session_id = ? ORDER BY a.roll_no`, s.session_id), {
    title: `Session #${s.session_id} - ${s.session_date} - ${s.topic}`,
    color: { status: (v, str) => (v === 'Present' ? ui.c.green(str) : ui.c.red(str)) },
  });
}

async function register() {
  const sub = await pickSubject();
  if (!sub) return;
  const sessions = db.all(`SELECT session_id, session_date FROM class_session WHERE subject_id = ?
                            ORDER BY session_date DESC LIMIT 12`, sub.subject_id).reverse();
  const students = db.all(`SELECT roll_no, raw_pct, adjusted_pct FROM v_attendance_summary WHERE subject_id = ? ORDER BY roll_no`, sub.subject_id);
  const marks = new Map(db.all(`SELECT a.session_id || '|' || a.roll_no AS k, a.status FROM attendance a
                                 JOIN class_session cs ON cs.session_id = a.session_id WHERE cs.subject_id = ?`, sub.subject_id)
    .map((r) => [r.k, r.status]));
  ui.section(`Attendance register - ${sub.subject_name} (last ${sessions.length} sessions)`);
  console.log('    ' + ui.padEnd('Roll no', 9) + sessions.map((s) => s.session_date.slice(5).replace('-', '/')).join(' ') + '   overall');
  for (const st of students) {
    const cells = sessions.map((s) => {
      const v = marks.get(`${s.session_id}|${st.roll_no}`);
      return ui.padEnd(v === 'P' ? ui.c.green('  P  ') : v === 'A' ? ui.c.red('  A  ') : ui.c.gray('  ·  '), 5);
    });
    console.log('    ' + ui.padEnd(st.roll_no, 9) + cells.join(' ') + '  ' + ui.bar(st.adjusted_pct, 10));
  }
}

async function editRecord() {
  const sub = await pickSubject();
  if (!sub) return;
  const s = await chooseSession(sub);
  if (!s) return;
  const roll = (await ui.askText('Roll no to correct', { required: true })).toUpperCase();
  const row = db.get('SELECT status FROM attendance WHERE session_id = ? AND roll_no = ?', s.session_id, roll);
  if (!row) return ui.warn('No such attendance record.');
  const next = row.status === 'P' ? 'A' : 'P';
  if (!(await ui.confirm(`Change ${roll} from ${row.status} to ${next}?`, true))) return;
  db.run('UPDATE attendance SET status = ?, marked_at = datetime(\'now\', \'localtime\') WHERE session_id = ? AND roll_no = ?', next, s.session_id, roll);
  ui.success('Updated. Trigger trg_audit_attendance_update recorded the change:');
  ui.table(db.all("SELECT * FROM audit_log WHERE table_name = 'attendance' ORDER BY log_id DESC LIMIT 1"));
}

async function dailyReport() {
  const date = await ui.askText('Date (YYYY-MM-DD)', { def: db.get('SELECT MAX(session_date) AS d FROM class_session').d });
  ui.table(db.all(`SELECT cs.session_id, cs.start_time, cs.subject_id, f.name AS faculty, cs.topic,
                          SUM(a.status = 'P') AS present, SUM(a.status = 'A') AS absent,
                          ROUND(100.0 * SUM(a.status = 'P') / COUNT(*), 1) AS pct
                     FROM class_session cs
                     JOIN faculty f ON f.faculty_id = cs.faculty_id
                     LEFT JOIN attendance a ON a.session_id = cs.session_id
                    WHERE cs.session_date = ?
                    GROUP BY cs.session_id ORDER BY cs.start_time`, date), { title: `Sessions on ${date}`, color: { pct: ui.pctColor } });
}

async function deleteSession() {
  const sub = await pickSubject();
  if (!sub) return;
  const s = await chooseSession(sub);
  if (!s) return;
  if (!(await ui.confirm(`Delete session #${s.session_id} and its ${s.total} attendance rows?`))) return;
  db.run('DELETE FROM class_session WHERE session_id = ?', s.session_id);
  ui.success('Session deleted - attendance rows removed by ON DELETE CASCADE and logged by trigger.');
}

module.exports = {
  menu: () => runMenu('ATTENDANCE', 'class_session + attendance (P/A)', [
    { label: 'Take attendance for a lecture', hint: 'transaction: 1 session + N rows', action: takeAttendance },
    { label: 'View a session\'s attendance', hint: 'JOIN', action: viewSession },
    { label: 'Attendance register (grid)', hint: 'pivot view', action: register },
    { label: 'Correct an attendance entry', hint: 'UPDATE + audit trigger', action: editRecord },
    { label: 'Day-wise report', hint: 'GROUP BY session', action: dailyReport },
    { label: 'Delete a session', hint: 'ON DELETE CASCADE', action: deleteSession, adminOnly: true },
  ]),
};
