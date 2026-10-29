# ============================================================================
#  MODULE 5 : DEFAULTERS & LEAVE MANAGEMENT
#  Views: v_defaulters, v_attendance_summary   Tables: defaulter_notice, leave_request
# ============================================================================
from .. import session
from ..db import connection as db
from ..ui import term as ui
from ..ui.menu import run_menu
from .students import find_student


def risk_color(v, s):
    return ui.c.bRed(s) if v == 'Critical' else ui.c.red(s) if v == 'High' else ui.c.yellow(s)


def view_defaulters():
    dept = ui.ask_text('Department filter (blank = all)', default='')
    sql = """SELECT roll_no, student_name, subject_id, present || '+' || on_leave || '/' || total_classes AS attended,
                    raw_pct, adjusted_pct, classes_needed, risk
               FROM v_defaulters
              WHERE ? = '' OR dept_id = upper(?)
              ORDER BY adjusted_pct"""
    ui.print_sql(sql)
    ui.table(db.all_(sql, dept, dept), color={'risk': risk_color, 'adjusted_pct': ui.pct_color, 'raw_pct': ui.pct_color})
    ui.note('adjusted_pct counts absences covered by APPROVED leave;  classes_needed = 3T - 4P  (to reach 75%)')
    summary = db.all_('SELECT risk, COUNT(*) AS n FROM v_defaulters GROUP BY risk ORDER BY MIN(adjusted_pct)')
    ui.section('Risk summary')
    ui.bar_chart([{'label': r['risk'].ljust(8), 'value': r['n']} for r in summary], unit=' student-subjects')


def generate_notices():
    pending = db.get("""SELECT COUNT(*) AS n FROM v_defaulters d
                         WHERE NOT EXISTS (SELECT 1 FROM defaulter_notice n
                                            WHERE n.roll_no = d.roll_no AND n.subject_id = d.subject_id
                                              AND n.issued_on = date('now'))""")['n']
    ui.info('%d defaulter entries do not have a notice for today.' % pending)
    if not pending or not ui.confirm('Generate notices now (INSERT ... SELECT from view)?', True):
        return
    sql = """INSERT INTO defaulter_notice (roll_no, subject_id, attendance_pct)
             SELECT roll_no, subject_id, adjusted_pct FROM v_defaulters WHERE true
             ON CONFLICT (roll_no, subject_id, issued_on) DO NOTHING"""
    ui.print_sql(sql)
    n = db.transaction(lambda: db.run(sql).changes)
    ui.success('%d notices issued in one transaction.' % n)


def manage_notices():
    rows = db.all_("""SELECT n.notice_id, n.roll_no, s.first_name || ' ' || s.last_name AS name, n.subject_id,
                             n.attendance_pct, n.issued_on, n.status
                        FROM defaulter_notice n JOIN student s USING (roll_no)
                       ORDER BY n.issued_on DESC, n.notice_id""")
    ui.table(rows, title='Defaulter notices')
    if not rows:
        return
    nid = ui.ask_int('Notice id to update (0 = none)', min_=0, default=0)
    if not nid:
        return
    st = ui.pick('New status', ['Acknowledged', 'Cleared'])
    if not st:
        return
    r = db.run('UPDATE defaulter_notice SET status = ? WHERE notice_id = ?', st, nid)
    ui.success('Notice updated.') if r.changes else ui.warn('No such notice.')


def apply_leave():
    s = find_student()
    if not s:
        return
    from_ = ui.ask_text('From date (YYYY-MM-DD)', required=True)
    to = ui.ask_text('To date (YYYY-MM-DD)', default=from_)
    type_ = ui.pick('Leave type', ['Medical', 'Sports', 'Event', 'Personal'], allow_back=False)
    reason = ui.ask_text('Reason', required=True)
    r = db.run('INSERT INTO leave_request (roll_no, from_date, to_date, leave_type, reason) VALUES (?, ?, ?, ?, ?)',
               s['roll_no'], from_, to, type_, reason)
    ui.success('Leave request #%d submitted (status = Pending by DEFAULT).' % r.last_insert_rowid)
    ui.note('CHECK (from_date <= to_date) guards the date range.')


def review_leaves():
    rows = db.all_("""SELECT l.leave_id, l.roll_no, s.first_name || ' ' || s.last_name AS name, l.from_date, l.to_date,
                             l.leave_type, l.reason
                        FROM leave_request l JOIN student s USING (roll_no)
                       WHERE l.status = 'Pending' ORDER BY l.applied_on""")
    lv = ui.pick('Pending leave requests', rows, lambda l: '#%s %s %s %s→%s %s: %s' % (
        l['leave_id'], l['roll_no'], ui.pad_end(l['name'], 18), l['from_date'], l['to_date'], l['leave_type'], ui.c.gray(l['reason'])))
    if not lv:
        return
    before = db.all_('SELECT subject_id, raw_pct, adjusted_pct FROM v_attendance_summary WHERE roll_no = ? ORDER BY subject_id', lv['roll_no'])
    decision = ui.pick('Decision', ['Approved', 'Rejected'])
    if not decision:
        return
    reviewer = session.faculty_id() or 'FAC101'
    db.run('UPDATE leave_request SET status = ?, reviewed_by = ? WHERE leave_id = ?', decision, reviewer, lv['leave_id'])
    ui.success('Leave #%s %s by %s.' % (lv['leave_id'], decision.lower(), reviewer))
    after = db.all_('SELECT subject_id, adjusted_pct FROM v_attendance_summary WHERE roll_no = ? ORDER BY subject_id', lv['roll_no'])
    ui.table([{'subject': b['subject_id'], 'raw_pct': b['raw_pct'], 'adjusted_before': b['adjusted_pct'],
               'adjusted_after': after[i]['adjusted_pct']} for i, b in enumerate(before)],
             title='Impact on adjusted attendance (view recomputes automatically)')
    ui.note('Trigger trg_leave_review_once now blocks changing this decision again.')


def leave_history():
    ui.table(db.all_("""SELECT l.leave_id, l.roll_no, l.from_date, l.to_date, l.leave_type, l.status,
                               COALESCE(f.name, '-') AS reviewed_by
                          FROM leave_request l LEFT JOIN faculty f ON f.faculty_id = l.reviewed_by
                         ORDER BY l.leave_id DESC"""),
             color={'status': lambda v, s: ui.c.green(s) if v == 'Approved' else ui.c.red(s) if v == 'Rejected' else ui.c.yellow(s)})


def menu():
    run_menu('DEFAULTERS & LEAVES', '75% rule · notices · leave approval', [
        {'label': 'View defaulter list (< 75%)', 'hint': 'view v_defaulters', 'action': view_defaulters},
        {'label': 'Generate defaulter notices', 'hint': 'INSERT..SELECT + ON CONFLICT', 'action': generate_notices},
        {'label': 'View / update notices', 'hint': 'UPDATE', 'action': manage_notices},
        {'label': 'Apply leave for a student', 'hint': 'INSERT + CHECK', 'action': apply_leave},
        {'label': 'Approve / reject pending leaves', 'hint': 'UPDATE + trigger', 'action': review_leaves},
        {'label': 'Leave history', 'hint': 'LEFT JOIN', 'action': leave_history},
    ])
