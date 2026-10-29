# ============================================================================
#  MODULE 1 : STUDENT MANAGEMENT  (CRUD = Create, Read, Update, Delete)
#  Tables: student, student_phone, enrollment     Views: v_student_profile
# ============================================================================
import re
from datetime import date, datetime

from ..db import connection as db
from ..ui import term as ui
from ..ui.menu import run_menu

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def valid_date(v):
    try:
        if DATE_RE.match(v) and datetime.strptime(v, '%Y-%m-%d'):
            return None
    except ValueError:
        pass
    return 'Use format YYYY-MM-DD'


def pick_department(label='Department'):
    depts = db.all_('SELECT dept_id, dept_name FROM department ORDER BY dept_id')
    return ui.pick(label, depts, lambda d: '%s %s' % (d['dept_id'].ljust(5), d['dept_name']))


def find_student():
    q = ui.ask_text('Roll no or part of name', required=True)
    rows = db.all_("""SELECT roll_no, full_name, dept_id, year FROM v_student_profile
                       WHERE roll_no = upper(?) OR full_name LIKE '%' || ? || '%'
                       ORDER BY roll_no""", q, q)
    if not rows:
        ui.warn('No student matches.')
        return None
    if len(rows) == 1:
        return rows[0]
    return ui.pick('Multiple matches', rows, lambda r: '%s  %s (%s, year %s)' % (r['roll_no'], r['full_name'], r['dept_id'], r['year']))


def list_students():
    dept = ui.ask_text('Filter by dept (CS/IT/ENTC/MECH, blank = all)', default='')
    year = ui.ask_text('Filter by year (1-4, blank = all)', default='')
    sql = """SELECT roll_no, full_name, gender AS g, age, city, year, dept_id, phones
               FROM v_student_profile
              WHERE (? = '' OR dept_id = upper(?))
                AND (? = '' OR year = CAST(? AS INTEGER))
              ORDER BY dept_id, year DESC, roll_no"""
    ui.print_sql(sql)
    ui.table(db.all_(sql, dept, dept, year, year))


def search_students():
    q = ui.ask_text('Search text (name / city / email)', required=True)
    sql = """SELECT roll_no, full_name, city, email, dept_id
               FROM v_student_profile
              WHERE full_name LIKE ? OR city LIKE ? OR email LIKE ?
              ORDER BY full_name"""
    ui.print_sql(sql)
    like = '%' + q + '%'
    ui.table(db.all_(sql, like, like, like))


def student_profile():
    s = find_student()
    if not s:
        return
    p = db.get('SELECT * FROM v_student_profile WHERE roll_no = ?', s['roll_no'])
    ui.box('%s  (%s)' % (p['full_name'], p['roll_no']), [
        'Department : %s (%s)      Year : %s' % (p['dept_name'], p['dept_id'], p['year']),
        'Gender     : %s      DOB : %s      Age (derived) : %s' % (p['gender'], p['dob'], p['age']),
        'Email      : %s' % (p['email'] or '-'),
        'City       : %s' % (p['city'] or '-'),
        'Phones     : %s   %s' % (p['phones'] or '-', ui.c.gray('(multivalued attribute)')),
    ])
    ui.section('Attendance (from view v_attendance_summary)')
    att = db.all_("""SELECT subject_id, subject_name, total_classes, present, on_leave, adjusted_pct, classes_needed
                       FROM v_attendance_summary WHERE roll_no = ? ORDER BY subject_id""", p['roll_no'])
    for a in att:
        need = ui.c.red('  needs %s more classes' % a['classes_needed']) if a['classes_needed'] > 0 else ''
        print('    %s %s %s  %s%s' % (ui.pad_end(a['subject_id'], 6), ui.pad_end(a['subject_name'], 30), ui.bar(a['adjusted_pct']),
                                     ui.c.gray('%s+%s/%s' % (a['present'], a['on_leave'], a['total_classes'])), need))
    ui.table(db.all_("""SELECT subject_id, internal, midsem, endsem, total, out_of, percentage, grade
                          FROM v_result_sheet WHERE roll_no = ? ORDER BY subject_id""", p['roll_no']),
             title='Results (view v_result_sheet)')
    leaves = db.all_('SELECT leave_id, from_date, to_date, leave_type, status FROM leave_request WHERE roll_no = ? ORDER BY from_date DESC', p['roll_no'])
    if leaves:
        ui.table(leaves, title='Leave history')


def add_student():
    ui.info('All constraints (PK, UNIQUE, CHECK, FK) are enforced by the database itself.')
    dept = pick_department()
    if not dept:
        return
    year = ui.ask_int('Year (1-4)', min_=1, max_=4, default=3)
    code = {'ENTC': 'EC', 'MECH': 'ME'}.get(dept['dept_id'], dept['dept_id'])
    prefix = str(date.today().year - year)[2:] + code
    nxt = db.get("""SELECT COALESCE(MAX(CAST(substr(roll_no, 5) AS INTEGER)), 0) + 1 AS n
                      FROM student WHERE roll_no LIKE ? || '%'""", prefix)['n']
    suggested = prefix + str(nxt).zfill(3)
    roll = ui.ask_text('Roll no', default=suggested).upper()
    first = ui.ask_text('First name', required=True)
    last = ui.ask_text('Last name', required=True)
    gender = ui.ask_text('Gender (M/F/O)', required=True,
                         validate=lambda v: None if re.match(r'^[mfo]$', v, re.I) else 'M, F or O').upper()
    dob = ui.ask_text('Date of birth (YYYY-MM-DD)', required=True, validate=valid_date)
    city = ui.ask_text('City', default='')
    email = ui.ask_text('Email', default='%s.%s@college.edu' % (first.lower(), roll.lower()))
    phones = [p.strip() for p in ui.ask_text('Phone numbers (comma separated, optional)', default='').split(',') if p.strip()]

    # ONE transaction: student + phones + enrollments succeed or fail together
    def work():
        db.run("""INSERT INTO student (roll_no, first_name, last_name, gender, dob, email, city, year, dept_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""", roll, first, last, gender, dob, email or None, city or None, year, dept['dept_id'])
        for p in phones:
            db.run('INSERT INTO student_phone (roll_no, phone) VALUES (?, ?)', roll, p)
        return db.run("""INSERT INTO enrollment (roll_no, subject_id)
                         SELECT ?, subject_id FROM subject WHERE dept_id = ? AND semester = ? * 2 - 1""",
                      roll, dept['dept_id'], year).changes
    enrolled = db.transaction(work)
    ui.success('Student %s added and auto-enrolled in %d subject(s).' % (roll, enrolled))
    ui.note('Trigger trg_audit_student_insert wrote an entry into audit_log.')


def update_student():
    s = find_student()
    if not s:
        return
    cur = db.get('SELECT * FROM student WHERE roll_no = ?', s['roll_no'])
    ui.info('Press Enter to keep the current value.')
    first = ui.ask_text('First name', default=cur['first_name'])
    last = ui.ask_text('Last name', default=cur['last_name'])
    city = ui.ask_text('City', default=cur['city'] or '')
    email = ui.ask_text('Email', default=cur['email'] or '')
    year = ui.ask_int('Year', min_=1, max_=4, default=cur['year'])
    sql = 'UPDATE student SET first_name = ?, last_name = ?, city = ?, email = ?, year = ? WHERE roll_no = ?'
    ui.print_sql(sql)
    r = db.run(sql, first, last, city or None, email or None, year, cur['roll_no'])
    ui.success('%d row updated.' % r.changes)
    ph = ui.ask_text('Add a phone number (optional)', default='')
    if ph:
        db.run('INSERT INTO student_phone VALUES (?, ?)', cur['roll_no'], ph)
        ui.success('Phone added.')


def delete_student():
    s = find_student()
    if not s:
        return
    # show what ON DELETE CASCADE will remove
    r = s['roll_no']
    impact = db.get("""SELECT
        (SELECT COUNT(*) FROM enrollment    WHERE roll_no = ?) AS enrollments,
        (SELECT COUNT(*) FROM attendance    WHERE roll_no = ?) AS attendance_rows,
        (SELECT COUNT(*) FROM exam_result   WHERE roll_no = ?) AS marks_rows,
        (SELECT COUNT(*) FROM student_phone WHERE roll_no = ?) AS phones,
        (SELECT COUNT(*) FROM leave_request WHERE roll_no = ?) AS leaves""", r, r, r, r, r)
    ui.warn('Deleting %s (%s) will CASCADE-delete these child rows:' % (r, s['full_name']))
    ui.table([impact])
    if not ui.confirm('Really delete?'):
        return ui.info('Cancelled.')
    db.run('DELETE FROM student WHERE roll_no = ?', r)
    ui.success('Deleted. Child rows removed automatically by ON DELETE CASCADE; audit_log updated by trigger.')


def manage_enrollment():
    s = find_student()
    if not s:
        return
    ui.table(db.all_("""SELECT e.subject_id, sub.subject_name, e.enrolled_on FROM enrollment e
                         JOIN subject sub USING (subject_id) WHERE e.roll_no = ?""", s['roll_no']), title='Current enrollments')
    others = db.all_("""SELECT subject_id, subject_name, dept_id, semester FROM subject
                         WHERE subject_id NOT IN (SELECT subject_id FROM enrollment WHERE roll_no = ?)
                         ORDER BY dept_id, subject_id""", s['roll_no'])
    sub = ui.pick('Enrol in another subject (elective)', others,
                  lambda x: '%s %s (%s, sem %s)' % (x['subject_id'], x['subject_name'], x['dept_id'], x['semester']))
    if not sub:
        return
    db.run('INSERT INTO enrollment (roll_no, subject_id) VALUES (?, ?)', s['roll_no'], sub['subject_id'])
    ui.success('%s enrolled in %s.' % (s['roll_no'], sub['subject_id']))


def menu():
    run_menu('STUDENT MANAGEMENT', 'CRUD on student + student_phone + enrollment', [
        {'label': 'List students (filter by dept / year)', 'hint': 'SELECT ... WHERE', 'action': list_students},
        {'label': 'Search students', 'hint': 'LIKE pattern', 'action': search_students},
        {'label': 'Student full profile', 'hint': 'views + joins', 'action': student_profile},
        {'label': 'Add new student', 'hint': 'INSERT in a transaction', 'action': add_student},
        {'label': 'Update student', 'hint': 'UPDATE', 'action': update_student},
        {'label': 'Enrol student in a subject', 'hint': 'M:N relationship', 'action': manage_enrollment},
        {'label': 'Delete student', 'hint': 'DELETE + CASCADE', 'action': delete_student, 'admin_only': True},
    ])
