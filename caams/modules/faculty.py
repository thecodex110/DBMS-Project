# ============================================================================
#  MODULE 2 : FACULTY, SUBJECTS & DEPARTMENTS
#  Tables: department, faculty, subject, teaches
# ============================================================================
from ..db import connection as db
from ..db.auth import hash_password
from ..ui import term as ui
from ..ui.menu import run_menu


def list_departments():
    ui.table(db.all_('SELECT * FROM v_dept_stats'), title='Departments (view v_dept_stats)',
             color={'avg_attendance': ui.pct_color})


def list_faculty():
    sql = """SELECT f.faculty_id, f.name, f.designation, f.dept_id, f.salary,
                    group_concat(t.subject_id, ', ') AS teaches
               FROM faculty f
               LEFT JOIN teaches t ON t.faculty_id = f.faculty_id   -- LEFT JOIN keeps faculty with no subject
              GROUP BY f.faculty_id
              ORDER BY f.dept_id, f.salary DESC"""
    ui.print_sql(sql)
    ui.table(db.all_(sql))


def list_subjects():
    ui.table(db.all_("""SELECT subject_id, subject_name, dept_id, semester AS sem, faculty, enrolled, sessions,
                               avg_attendance, defaulters, avg_marks_pct
                          FROM v_subject_report ORDER BY dept_id, subject_id"""),
             title='Subjects (view v_subject_report)', color={'avg_attendance': ui.pct_color})


def add_faculty():
    dept = ui.pick('Department', db.all_('SELECT dept_id, dept_name FROM department'), lambda d: '%s - %s' % (d['dept_id'], d['dept_name']))
    if not dept:
        return
    nxt = db.get("SELECT 'FAC' || (MAX(CAST(substr(faculty_id, 4) AS INTEGER)) + 1) AS id FROM faculty")['id']
    fid = ui.ask_text('Faculty ID', default=nxt).upper()
    name = ui.ask_text('Full name (with Dr./Prof.)', required=True)
    email = ui.ask_text('Email', required=True)
    desig = ui.pick('Designation', ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer'], allow_back=False)
    salary = ui.ask_number('Monthly salary', min_=1, default=75000)

    def work():
        db.run("""INSERT INTO faculty (faculty_id, name, email, designation, dept_id, joining_date, salary)
                  VALUES (?, ?, ?, ?, ?, date('now'), ?)""", fid, name, email, desig, dept['dept_id'], salary)
        db.run("INSERT INTO app_user (username, password_hash, salt, role, faculty_id) VALUES (?, ?, ?, 'faculty', ?)",
               fid.lower(), *hash_password(fid.lower() + '@123'), fid)
    db.transaction(work)
    ui.success('Faculty %s added. Login: %s / %s@123' % (fid, fid.lower(), fid.lower()))


def add_subject():
    dept = ui.pick('Offering department', db.all_('SELECT dept_id, dept_name FROM department'), lambda d: '%s - %s' % (d['dept_id'], d['dept_name']))
    if not dept:
        return
    sid = ui.ask_text('Subject code (e.g. CS505)', required=True).upper()
    name = ui.ask_text('Subject name', required=True)
    credits = ui.ask_int('Credits (1-6)', min_=1, max_=6, default=4)
    sem = ui.ask_int('Semester (1-8)', min_=1, max_=8, default=5)
    type_ = 'Lab' if ui.confirm('Is it a Lab subject?') else 'Theory'
    db.run('INSERT INTO subject (subject_id, subject_name, credits, semester, subject_type, dept_id) VALUES (?, ?, ?, ?, ?, ?)',
           sid, name, credits, sem, type_, dept['dept_id'])
    ui.success('Subject %s created.' % sid)
    if ui.confirm('Auto-enrol matching students (same dept, matching semester)?', True):
        n = db.run("""INSERT INTO enrollment (roll_no, subject_id)
                      SELECT roll_no, ? FROM student WHERE dept_id = ? AND year * 2 - 1 = ?""", sid, dept['dept_id'], sem).changes
        ui.success('%d student(s) enrolled via INSERT ... SELECT.' % n)


def allocate_subject():
    sub = ui.pick('Subject', db.all_('SELECT subject_id, subject_name, faculty FROM v_subject_report ORDER BY subject_id'),
                  lambda s: '%s %s %s' % (s['subject_id'], s['subject_name'], ui.c.gray('→ ' + (s['faculty'] or 'unallocated'))))
    if not sub:
        return
    fac = ui.pick('Assign to faculty', db.all_('SELECT faculty_id, name, dept_id FROM faculty ORDER BY faculty_id'),
                  lambda f: '%s %s (%s)' % (f['faculty_id'], f['name'], f['dept_id']))
    if not fac:
        return
    # UPSERT: insert, or update the existing (subject, year) allocation
    sql = """INSERT INTO teaches (subject_id, academic_year, faculty_id) VALUES (?, '2026-27', ?)
             ON CONFLICT (subject_id, academic_year) DO UPDATE SET faculty_id = excluded.faculty_id"""
    ui.print_sql(sql)
    db.run(sql, sub['subject_id'], fac['faculty_id'])
    ui.success('%s is now taught by %s.' % (sub['subject_id'], fac['name']))


def workload():
    sql = """SELECT f.name, f.dept_id,
                    COUNT(DISTINCT t.subject_id)                 AS subjects,
                    COUNT(cs.session_id)                         AS sessions_taken,
                    ROUND(COUNT(cs.session_id) / 15.0, 1)        AS per_week,
                    COALESCE(SUM(sub.credits), 0)                AS credit_load
               FROM faculty f
               LEFT JOIN teaches t        ON t.faculty_id = f.faculty_id
               LEFT JOIN subject sub      ON sub.subject_id = t.subject_id
               LEFT JOIN class_session cs ON cs.subject_id = t.subject_id AND cs.faculty_id = f.faculty_id
              GROUP BY f.faculty_id
              ORDER BY sessions_taken DESC"""
    ui.print_sql(sql)
    rows = db.all_(sql)
    ui.table(rows)
    ui.section('Sessions taken (bar chart)')
    ui.bar_chart([{'label': r['name'], 'value': r['sessions_taken']} for r in rows])


def menu():
    run_menu('FACULTY, SUBJECTS & DEPARTMENTS', 'department · faculty · subject · teaches', [
        {'label': 'Departments overview', 'hint': 'view v_dept_stats', 'action': list_departments},
        {'label': 'Faculty list with subjects', 'hint': 'LEFT JOIN + group_concat', 'action': list_faculty},
        {'label': 'Subjects report', 'hint': 'view v_subject_report', 'action': list_subjects},
        {'label': 'Faculty workload', 'hint': 'multi-table aggregate', 'action': workload},
        {'label': 'Add faculty', 'hint': 'INSERT + login account', 'action': add_faculty, 'admin_only': True},
        {'label': 'Add subject', 'hint': 'INSERT + INSERT..SELECT', 'action': add_subject, 'admin_only': True},
        {'label': 'Allocate subject to faculty', 'hint': 'UPSERT', 'action': allocate_subject, 'admin_only': True},
    ])
