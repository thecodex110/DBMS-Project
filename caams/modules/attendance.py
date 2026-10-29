# ============================================================================
#  MODULE 3 : ATTENDANCE
#  Tables: class_session, attendance     Views: v_attendance_summary
#  Triggers involved: trg_attendance_must_be_enrolled, trg_session_not_in_future,
#                     trg_audit_attendance_update / _delete
# ============================================================================
import re
from datetime import datetime, timezone

from .. import session
from ..db import connection as db
from ..ui import term as ui
from ..ui.menu import run_menu


def my_subjects():
    """Faculty see only their own subjects, admin sees all."""
    return db.all_("""SELECT sub.subject_id, sub.subject_name, t.faculty_id, f.name AS faculty
                        FROM subject sub
                        JOIN teaches t ON t.subject_id = sub.subject_id
                        JOIN faculty f ON f.faculty_id = t.faculty_id
                       WHERE ? IS NULL OR t.faculty_id = ?
                       ORDER BY sub.subject_id""", session.faculty_id(), session.faculty_id())


def pick_subject():
    return ui.pick('Select subject', my_subjects(),
                   lambda s: '%s  %s %s' % (s['subject_id'], ui.pad_end(s['subject_name'], 30), ui.c.gray(s['faculty'])))


def take_attendance():
    sub = pick_subject()
    if not sub:
        return
    today = datetime.now(timezone.utc).date().isoformat()
    date = ui.ask_text('Date (YYYY-MM-DD)', default=today, validate=lambda v: None if re.match(r'^\d{4}-\d{2}-\d{2}$', v) else 'YYYY-MM-DD')
    time = ui.ask_text('Start time (HH:MM)', default='10:00', validate=lambda v: None if re.match(r'^\d{2}:\d{2}$', v) else 'HH:MM')
    topic = ui.ask_text('Topic covered', default='Lecture')

    roster = db.all_("""SELECT e.roll_no, s.first_name || ' ' || s.last_name AS name, v.adjusted_pct
                          FROM enrollment e
                          JOIN student s ON s.roll_no = e.roll_no
                          LEFT JOIN v_attendance_summary v ON v.roll_no = e.roll_no AND v.subject_id = e.subject_id
                         WHERE e.subject_id = ? ORDER BY e.roll_no""", sub['subject_id'])
    if not roster:
        return ui.warn('No students enrolled in this subject.')
    ui.section('Class roster - %s (%d students)' % (sub['subject_name'], len(roster)))
    for i, r in enumerate(roster):
        print('    %s. %s %s %s' % (ui.c.cyan(str(i + 1).rjust(2)), ui.pad_end(r['roll_no'], 9), ui.pad_end(r['name'], 22), ui.bar(r['adjusted_pct'], 12)))

    print()
    ui.info('Type the serial numbers / roll numbers of ABSENT students (comma separated).')
    ui.note("Leave blank = everyone present,  'each' = mark one by one.")
    inp = ui.ask_text('Absent', default='')
    status = {r['roll_no']: 'P' for r in roster}
    if inp.lower() == 'each':
        for r in roster:
            v = ui.ask_text('%s %s (P/A)' % (r['roll_no'], r['name']), default='P',
                            validate=lambda x: None if re.match(r'^[pa]$', x, re.I) else 'P or A')
            status[r['roll_no']] = v.upper()
    elif inp:
        for tok in [t for t in re.split(r'[\s,]+', inp) if t]:
            by_index = roster[int(tok) - 1] if re.match(r'^\d{1,2}$', tok) and 1 <= int(tok) <= len(roster) else None
            match = by_index or next((r for r in roster if r['roll_no'] == tok.upper() or r['roll_no'].endswith(tok.upper())), None)
            if not match:
                ui.warn('Ignoring unknown entry "%s"' % tok)
                continue
            status[match['roll_no']] = 'A'

    # ATOMIC: the session row and ALL attendance rows commit together
    def work():
        sid = db.run('INSERT INTO class_session (subject_id, faculty_id, session_date, start_time, topic) VALUES (?, ?, ?, ?, ?)',
                     sub['subject_id'], sub['faculty_id'], date, time, topic).last_insert_rowid
        for roll, st in status.items():
            db.run('INSERT INTO attendance (session_id, roll_no, status) VALUES (?, ?, ?)', sid, roll, st)
        return sid
    sid = db.transaction(work)
    absent = sum(1 for s in status.values() if s == 'A')
    ui.success('Session #%d saved: %d present, %d absent (1 transaction, %d INSERTs).' % (sid, len(roster) - absent, absent, len(roster) + 1))


def choose_session(sub):
    sessions = db.all_("""SELECT cs.session_id, cs.session_date, cs.start_time, cs.topic,
                                 SUM(a.status = 'P') AS present, COUNT(a.roll_no) AS total
                            FROM class_session cs LEFT JOIN attendance a ON a.session_id = cs.session_id
                           WHERE cs.subject_id = ?
                           GROUP BY cs.session_id ORDER BY cs.session_date DESC, cs.start_time DESC LIMIT 15""", sub['subject_id'])
    return ui.pick('Recent sessions', sessions, lambda s: '#%s %s %s  %s %s' % (
        str(s['session_id']).ljust(4), s['session_date'], s['start_time'], ui.pad_end(str(s['topic'] or ''), 30),
        ui.c.gray('%s/%s present' % (s['present'], s['total']))))


def view_session():
    sub = pick_subject()
    if not sub:
        return
    s = choose_session(sub)
    if not s:
        return
    ui.table(db.all_("""SELECT a.roll_no, st.first_name || ' ' || st.last_name AS name,
                               CASE a.status WHEN 'P' THEN 'Present' ELSE 'Absent' END AS status, a.marked_at
                          FROM attendance a JOIN student st ON st.roll_no = a.roll_no
                         WHERE a.session_id = ? ORDER BY a.roll_no""", s['session_id']),
             title='Session #%s - %s - %s' % (s['session_id'], s['session_date'], s['topic']),
             color={'status': lambda v, s_: ui.c.green(s_) if v == 'Present' else ui.c.red(s_)})


def register():
    sub = pick_subject()
    if not sub:
        return
    sessions = list(reversed(db.all_("""SELECT session_id, session_date FROM class_session WHERE subject_id = ?
                                         ORDER BY session_date DESC LIMIT 12""", sub['subject_id'])))
    students = db.all_('SELECT roll_no, raw_pct, adjusted_pct FROM v_attendance_summary WHERE subject_id = ? ORDER BY roll_no', sub['subject_id'])
    marks = {r['k']: r['status'] for r in db.all_("""SELECT a.session_id || '|' || a.roll_no AS k, a.status FROM attendance a
                                                      JOIN class_session cs ON cs.session_id = a.session_id WHERE cs.subject_id = ?""", sub['subject_id'])}
    ui.section('Attendance register - %s (last %d sessions)' % (sub['subject_name'], len(sessions)))
    print('    ' + ui.pad_end('Roll no', 9) + ' '.join(s['session_date'][5:].replace('-', '/', 1) for s in sessions) + '   overall')
    for st in students:
        cells = []
        for s in sessions:
            v = marks.get('%s|%s' % (s['session_id'], st['roll_no']))
            cells.append(ui.pad_end(ui.c.green('  P  ') if v == 'P' else ui.c.red('  A  ') if v == 'A' else ui.c.gray('  ·  '), 5))
        print('    ' + ui.pad_end(st['roll_no'], 9) + ' '.join(cells) + '  ' + ui.bar(st['adjusted_pct'], 10))


def edit_record():
    sub = pick_subject()
    if not sub:
        return
    s = choose_session(sub)
    if not s:
        return
    roll = ui.ask_text('Roll no to correct', required=True).upper()
    row = db.get('SELECT status FROM attendance WHERE session_id = ? AND roll_no = ?', s['session_id'], roll)
    if not row:
        return ui.warn('No such attendance record.')
    nxt = 'A' if row['status'] == 'P' else 'P'
    if not ui.confirm('Change %s from %s to %s?' % (roll, row['status'], nxt), True):
        return
    db.run("UPDATE attendance SET status = ?, marked_at = datetime('now', 'localtime') WHERE session_id = ? AND roll_no = ?", nxt, s['session_id'], roll)
    ui.success('Updated. Trigger trg_audit_attendance_update recorded the change:')
    ui.table(db.all_("SELECT * FROM audit_log WHERE table_name = 'attendance' ORDER BY log_id DESC LIMIT 1"))


def daily_report():
    date = ui.ask_text('Date (YYYY-MM-DD)', default=db.get('SELECT MAX(session_date) AS d FROM class_session')['d'])
    ui.table(db.all_("""SELECT cs.session_id, cs.start_time, cs.subject_id, f.name AS faculty, cs.topic,
                               SUM(a.status = 'P') AS present, SUM(a.status = 'A') AS absent,
                               ROUND(100.0 * SUM(a.status = 'P') / COUNT(*), 1) AS pct
                          FROM class_session cs
                          JOIN faculty f ON f.faculty_id = cs.faculty_id
                          LEFT JOIN attendance a ON a.session_id = cs.session_id
                         WHERE cs.session_date = ?
                         GROUP BY cs.session_id ORDER BY cs.start_time""", date),
             title='Sessions on %s' % date, color={'pct': ui.pct_color})


def delete_session():
    sub = pick_subject()
    if not sub:
        return
    s = choose_session(sub)
    if not s:
        return
    if not ui.confirm('Delete session #%s and its %s attendance rows?' % (s['session_id'], s['total'])):
        return
    db.run('DELETE FROM class_session WHERE session_id = ?', s['session_id'])
    ui.success('Session deleted - attendance rows removed by ON DELETE CASCADE and logged by trigger.')


def menu():
    run_menu('ATTENDANCE', 'class_session + attendance (P/A)', [
        {'label': 'Take attendance for a lecture', 'hint': 'transaction: 1 session + N rows', 'action': take_attendance},
        {'label': "View a session's attendance", 'hint': 'JOIN', 'action': view_session},
        {'label': 'Attendance register (grid)', 'hint': 'pivot view', 'action': register},
        {'label': 'Correct an attendance entry', 'hint': 'UPDATE + audit trigger', 'action': edit_record},
        {'label': 'Day-wise report', 'hint': 'GROUP BY session', 'action': daily_report},
        {'label': 'Delete a session', 'hint': 'ON DELETE CASCADE', 'action': delete_session, 'admin_only': True},
    ])
