# ============================================================================
#  MODULE 4 : EXAMS & RESULTS
#  Table: exam_result (NULL marks = absent)   View: v_result_sheet
# ============================================================================
from .. import session
from ..db import connection as db
from ..ui import term as ui
from ..ui.menu import run_menu
from .students import find_student

EXAMS = {'Internal': 20, 'MidSem': 30, 'EndSem': 50}


def grade_color(g, s):
    return ui.c.red(s) if g == 'F' else ui.c.green(s) if g in ('O', 'A+') else s


def subjects():
    return db.all_("""SELECT sub.subject_id, sub.subject_name FROM subject sub
                        JOIN teaches t ON t.subject_id = sub.subject_id
                       WHERE ? IS NULL OR t.faculty_id = ? ORDER BY sub.subject_id""", session.faculty_id(), session.faculty_id())


def _valid_mark(x, max_):
    if x.lower() == 'ab':
        return None
    try:
        if 0 <= float(x) <= max_:
            return None
    except ValueError:
        pass
    return '0-%d or ab' % max_


def enter_marks():
    sub = ui.pick('Subject', subjects(), lambda s: '%s %s' % (s['subject_id'], s['subject_name']))
    if not sub:
        return
    exam = ui.pick('Exam', list(EXAMS), lambda e: '%s (out of %d)' % (e, EXAMS[e]))
    if not exam:
        return
    max_ = EXAMS[exam]
    rows = db.all_("""SELECT e.roll_no, s.first_name || ' ' || s.last_name AS name, r.marks_obtained, r.roll_no IS NOT NULL AS has_row
                        FROM enrollment e JOIN student s ON s.roll_no = e.roll_no
                        LEFT JOIN exam_result r ON r.roll_no = e.roll_no AND r.subject_id = e.subject_id AND r.exam_type = ?
                       WHERE e.subject_id = ? ORDER BY e.roll_no""", exam, sub['subject_id'])
    ui.info("Enter marks out of %d. Enter = keep current, 'ab' = absent (stored as NULL)." % max_)
    changes = []
    for r in rows:
        cur = ('ab' if r['marks_obtained'] is None else ui.num_str(r['marks_obtained'])) if r['has_row'] else ''
        v = ui.ask_text('%s %s' % (r['roll_no'], ui.pad_end(r['name'], 20)), default=cur, validate=lambda x: _valid_mark(x, max_))
        if v == '' or v == cur:
            continue
        changes.append((r['roll_no'], None if v.lower() == 'ab' else float(v)))
    # UPSERT every changed mark in one transaction
    sql = """INSERT INTO exam_result (roll_no, subject_id, exam_type, marks_obtained, max_marks) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (roll_no, subject_id, exam_type) DO UPDATE SET marks_obtained = excluded.marks_obtained"""

    def work():
        for roll, m in changes:
            db.run(sql, roll, sub['subject_id'], exam, m, max_)
    db.transaction(work)
    ui.success('%d mark(s) saved (UPSERT inside one transaction). Changed marks are audited by trigger.' % len(changes))


def result_sheet():
    sub = ui.pick('Subject', db.all_('SELECT subject_id, subject_name FROM subject ORDER BY subject_id'),
                  lambda s: '%s %s' % (s['subject_id'], s['subject_name']))
    if not sub:
        return
    ui.table(db.all_("""SELECT roll_no, student_name, internal, midsem, endsem, total, out_of, percentage, grade
                          FROM v_result_sheet WHERE subject_id = ? ORDER BY percentage DESC""", sub['subject_id']),
             title='Result sheet - %s  (NULL = absent)' % sub['subject_name'], color={'grade': grade_color})
    dist = db.all_("""SELECT grade, COUNT(*) AS n FROM v_result_sheet WHERE subject_id = ? GROUP BY grade
                       ORDER BY MIN(grade_point) DESC""", sub['subject_id'])
    ui.section('Grade distribution')
    ui.bar_chart([{'label': d['grade'].ljust(2), 'value': d['n']} for d in dist], unit=' students')


def marksheet():
    s = find_student()
    if not s:
        return
    rows = db.all_("""SELECT subject_id, subject_name, credits, internal, midsem, endsem, total, out_of, grade, grade_point
                        FROM v_result_sheet WHERE roll_no = ? ORDER BY subject_id""", s['roll_no'])
    ui.table(rows, title='Marksheet - %s (%s)' % (s['full_name'], s['roll_no']), color={'grade': grade_color})
    # SGPA = Σ(credits × grade point) / Σ credits
    sgpa = db.get("""SELECT ROUND(SUM(credits * grade_point) * 1.0 / SUM(credits), 2) AS sgpa
                       FROM v_result_sheet WHERE roll_no = ?""", s['roll_no'])['sgpa']
    ui.box('SGPA = Σ(credits × grade point) / Σ credits', ['SGPA : %s' % ui.c.bold('-' if sgpa is None else ui.num_str(sgpa))], ui.c.green)


def toppers():
    sql = """WITH ranked AS (
               SELECT subject_id, roll_no, student_name, percentage,
                      DENSE_RANK() OVER (PARTITION BY subject_id ORDER BY percentage DESC) AS rnk
                 FROM v_result_sheet)
             SELECT subject_id, rnk, roll_no, student_name, percentage
               FROM ranked WHERE rnk <= 3 ORDER BY subject_id, rnk"""
    ui.print_sql(sql)
    ui.table(db.all_(sql), title='Top 3 per subject (window function DENSE_RANK)')


def sgpa_ranking():
    sql = """SELECT roll_no, student_name,
                    ROUND(SUM(credits * grade_point) * 1.0 / SUM(credits), 2) AS sgpa,
                    SUM(grade = 'F') AS backlogs
               FROM v_result_sheet
              GROUP BY roll_no
              ORDER BY sgpa DESC"""
    ui.print_sql(sql)
    ui.table(db.all_(sql), title='Class ranking by SGPA', color={'backlogs': lambda v, s: ui.c.red(s) if v > 0 else s})


def attendance_vs_marks():
    sql = """SELECT CASE WHEN v.adjusted_pct >= 75 THEN 'Regular (>= 75%)' ELSE 'Defaulter (< 75%)' END AS category,
                    COUNT(*)                     AS records,
                    ROUND(AVG(r.percentage), 2)  AS avg_marks_pct,
                    SUM(r.grade = 'F')           AS fails
               FROM v_attendance_summary v
               JOIN v_result_sheet r ON r.roll_no = v.roll_no AND r.subject_id = v.subject_id
              GROUP BY category"""
    ui.print_sql(sql)
    rows = db.all_(sql)
    ui.table(rows, title='Does attendance affect marks?')
    ui.bar_chart([{'label': r['category'], 'value': r['avg_marks_pct']} for r in rows], max_=100, unit='%')


def menu():
    run_menu('EXAMS & RESULTS', 'exam_result + v_result_sheet (grades, SGPA)', [
        {'label': 'Enter / update marks', 'hint': 'UPSERT, NULL = absent', 'action': enter_marks},
        {'label': 'Subject result sheet + grades', 'hint': 'pivot view + CASE', 'action': result_sheet},
        {'label': 'Student marksheet + SGPA', 'hint': 'weighted average', 'action': marksheet},
        {'label': 'Subject toppers', 'hint': 'DENSE_RANK() window', 'action': toppers},
        {'label': 'Class SGPA ranking', 'hint': 'GROUP BY + ORDER BY', 'action': sgpa_ranking},
        {'label': 'Attendance vs marks analysis', 'hint': 'join two views', 'action': attendance_vs_marks},
    ])
