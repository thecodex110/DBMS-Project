# ============================================================================
#  MODULE 7 : LAB ASSIGNMENTS 1-4  (exactly as listed in the syllabus)
#  Every question = {'q': question text, 'sql': query}  or  {'q', 'steps': [...]}
#  DML / DDL questions run inside a SAVEPOINT and are ROLLED BACK afterwards,
#  so the real college data is never damaged ("sandbox mode").
# ============================================================================
import os
import re

from ..db import connection as db
from ..ui import term as ui
from ..ui.menu import friendly_error, run_menu

ASSIGNMENTS = [
    {
        'id': '1', 'title': 'Assignment 1 : Basic SQL statements', 'questions': [
            {'q': 'List every student with roll no, full name, department and year.',
             'sql': """SELECT roll_no, first_name || ' ' || last_name AS full_name, dept_id, year
FROM student;"""},
            {'q': 'Show third-year students of Computer Engineering (dept CS).',
             'sql': """SELECT roll_no, first_name, last_name
FROM student
WHERE dept_id = 'CS' AND year = 3;"""},
            {'q': 'Faculty earning more than 1,00,000 per month, highest first.',
             'sql': """SELECT name, designation, salary
FROM faculty
WHERE salary > 100000
ORDER BY salary DESC;"""},
            {'q': "Students whose first name starts with 'A'.",
             'sql': """SELECT roll_no, first_name, last_name
FROM student
WHERE first_name LIKE 'A%';"""},
            {'q': 'Students born in the first half of 2005.',
             'sql': """SELECT roll_no, first_name, dob
FROM student
WHERE dob BETWEEN '2005-01-01' AND '2005-06-30'
ORDER BY dob;"""},
            {'q': 'Distinct cities our students come from.',
             'sql': """SELECT DISTINCT city
FROM student
ORDER BY city;"""},
            {'q': 'Students from Pune, Mumbai or Delhi.',
             'sql': """SELECT roll_no, first_name, city
FROM student
WHERE city IN ('Pune', 'Mumbai', 'Delhi');"""},
            {'q': 'Semester-5 subjects that carry 4 credits.',
             'sql': """SELECT subject_id, subject_name, dept_id
FROM subject
WHERE semester = 5 AND credits = 4;"""},
            {'q': 'Faculty name along with department name (join).',
             'sql': """SELECT f.name, d.dept_name, d.building
FROM faculty f
JOIN department d ON d.dept_id = f.dept_id;"""},
            {'q': 'Annual salary and joining year of every faculty (arithmetic + alias).',
             'sql': """SELECT name, salary * 12 AS annual_salary,
       strftime('%Y', joining_date) AS joined_in
FROM faculty;"""},
            {'q': 'Student names in UPPER case with length of their e-mail.',
             'sql': """SELECT upper(first_name || ' ' || last_name) AS name_caps,
       length(email) AS email_len
FROM student
LIMIT 8;"""},
            {'q': 'Exam records where the student was ABSENT (NULL marks).',
             'sql': """SELECT roll_no, subject_id, exam_type
FROM exam_result
WHERE marks_obtained IS NULL;"""},
            {'q': 'Five youngest students.',
             'sql': """SELECT roll_no, first_name, dob
FROM student
ORDER BY dob DESC
LIMIT 5;"""},
        ],
    },
    {
        'id': '2A', 'title': 'Assignment 2(a) : Aggregates, grouping & ordering', 'questions': [
            {'q': 'Number of students in each department.',
             'sql': """SELECT dept_id, COUNT(*) AS students
FROM student
GROUP BY dept_id
ORDER BY students DESC;"""},
            {'q': 'Average, minimum and maximum salary per department.',
             'sql': """SELECT dept_id, ROUND(AVG(salary)) AS avg_sal, MIN(salary) AS min_sal, MAX(salary) AS max_sal
FROM faculty
GROUP BY dept_id
ORDER BY avg_sal DESC;"""},
            {'q': 'Departments having more than 4 students (HAVING).',
             'sql': """SELECT dept_id, COUNT(*) AS students
FROM student
GROUP BY dept_id
HAVING COUNT(*) > 4;"""},
            {'q': 'Sessions conducted per subject.',
             'sql': """SELECT subject_id, COUNT(*) AS sessions, MIN(session_date) AS first, MAX(session_date) AS last
FROM class_session
GROUP BY subject_id
ORDER BY sessions DESC, subject_id;"""},
            {'q': 'Gender-wise count in each department (group by two columns).',
             'sql': """SELECT dept_id, gender, COUNT(*) AS cnt
FROM student
GROUP BY dept_id, gender
ORDER BY dept_id, gender;"""},
            {'q': 'Total credits offered per department per semester.',
             'sql': """SELECT dept_id, semester, SUM(credits) AS total_credits, COUNT(*) AS subjects
FROM subject
GROUP BY dept_id, semester;"""},
            {'q': 'Average marks per subject and exam type.',
             'sql': """SELECT subject_id, exam_type, ROUND(AVG(marks_obtained), 2) AS avg_marks, MAX(max_marks) AS out_of
FROM exam_result
GROUP BY subject_id, exam_type
ORDER BY subject_id, out_of;"""},
            {'q': 'NULL handling: COUNT(*) vs COUNT(column) vs AVG.',
             'sql': """SELECT COUNT(*)              AS all_rows,
       COUNT(marks_obtained) AS non_null_marks,
       COUNT(*) - COUNT(marks_obtained) AS absents,
       ROUND(AVG(marks_obtained), 2) AS avg_ignores_null
FROM exam_result;"""},
            {'q': 'Number of lectures held in each month.',
             'sql': """SELECT strftime('%Y-%m', session_date) AS month, COUNT(*) AS sessions
FROM class_session
GROUP BY month
ORDER BY month;"""},
            {'q': 'DBMS (CS501) attendance % of every student, highest first.',
             'sql': """SELECT a.roll_no,
       COUNT(*) AS held,
       SUM(a.status = 'P') AS attended,
       ROUND(100.0 * SUM(a.status = 'P') / COUNT(*), 2) AS pct
FROM attendance a
JOIN class_session cs ON cs.session_id = a.session_id
WHERE cs.subject_id = 'CS501'
GROUP BY a.roll_no
ORDER BY pct DESC;"""},
            {'q': 'Designations whose average salary exceeds 80,000.',
             'sql': """SELECT designation, COUNT(*) AS cnt, ROUND(AVG(salary)) AS avg_salary
FROM faculty
GROUP BY designation
HAVING AVG(salary) > 80000
ORDER BY avg_salary DESC;"""},
        ],
    },
    {
        'id': '2B', 'title': 'Assignment 2(b) : Nested subqueries & SQL updates', 'questions': [
            {'q': 'Faculty earning more than the average salary (scalar subquery).',
             'sql': """SELECT name, salary
FROM faculty
WHERE salary > (SELECT AVG(salary) FROM faculty);"""},
            {'q': 'Students enrolled in any subject taught by Dr. Ramesh Sharma (IN).',
             'sql': """SELECT DISTINCT roll_no
FROM enrollment
WHERE subject_id IN (SELECT t.subject_id FROM teaches t
                     WHERE t.faculty_id = (SELECT faculty_id FROM faculty
                                           WHERE name = 'Dr. Ramesh Sharma'));"""},
            {'q': 'Faculty who are not teaching any subject (NOT IN).',
             'sql': """SELECT faculty_id, name
FROM faculty
WHERE faculty_id NOT IN (SELECT faculty_id FROM teaches);"""},
            {'q': 'Students who never missed a DBMS lecture (NOT EXISTS).',
             'sql': """SELECT e.roll_no
FROM enrollment e
WHERE e.subject_id = 'CS501'
  AND NOT EXISTS (SELECT 1 FROM attendance a
                  JOIN class_session cs ON cs.session_id = a.session_id
                  WHERE cs.subject_id = 'CS501'
                    AND a.roll_no = e.roll_no AND a.status = 'A');"""},
            {'q': 'Department(s) with the maximum number of students.',
             'sql': """SELECT dept_id, COUNT(*) AS students
FROM student
GROUP BY dept_id
HAVING COUNT(*) = (SELECT MAX(cnt) FROM (SELECT COUNT(*) AS cnt
                                         FROM student GROUP BY dept_id));"""},
            {'q': 'Highest MidSem scorer of each subject (correlated subquery).',
             'sql': """SELECT r.subject_id, r.roll_no, r.marks_obtained
FROM exam_result r
WHERE r.exam_type = 'MidSem'
  AND r.marks_obtained = (SELECT MAX(r2.marks_obtained) FROM exam_result r2
                          WHERE r2.subject_id = r.subject_id AND r2.exam_type = 'MidSem')
ORDER BY r.subject_id;"""},
            {'q': 'Faculty paid more than ALL IT faculty  (> ALL  ==  > MAX).',
             'sql': """-- SQLite has no ALL/SOME keyword; "> ALL (S)" is equivalent to "> (SELECT MAX ...)"
SELECT name, dept_id, salary
FROM faculty
WHERE salary > (SELECT MAX(salary) FROM faculty WHERE dept_id = 'IT');"""},
            {'q': 'Students whose average attendance is above the college average (derived table).',
             'sql': """SELECT t.roll_no, t.avg_pct
FROM (SELECT roll_no, ROUND(AVG(adjusted_pct), 2) AS avg_pct
      FROM v_attendance_summary GROUP BY roll_no) AS t
WHERE t.avg_pct > (SELECT AVG(adjusted_pct) FROM v_attendance_summary)
ORDER BY t.avg_pct DESC;"""},
            {'q': 'Set operations: defaulters in BOTH CS501 and CS502 (INTERSECT).',
             'sql': """SELECT roll_no FROM v_defaulters WHERE subject_id = 'CS501'
INTERSECT
SELECT roll_no FROM v_defaulters WHERE subject_id = 'CS502';"""},
            {'q': 'Set operations: CS students who are NOT defaulters anywhere (EXCEPT).',
             'sql': """SELECT roll_no FROM student WHERE dept_id = 'CS'
EXCEPT
SELECT roll_no FROM v_defaulters;"""},
            {'q': 'Complex query (CTE + window): top 2 students per department by SGPA.',
             'sql': """WITH sgpa AS (
  SELECT r.roll_no, s.dept_id,
         ROUND(SUM(r.credits * r.grade_point) * 1.0 / SUM(r.credits), 2) AS sgpa
  FROM v_result_sheet r JOIN student s ON s.roll_no = r.roll_no
  GROUP BY r.roll_no),
ranked AS (
  SELECT *, RANK() OVER (PARTITION BY dept_id ORDER BY sgpa DESC) AS rnk FROM sgpa)
SELECT dept_id, rnk, roll_no, sgpa FROM ranked WHERE rnk <= 2;"""},
            {'q': 'UPDATE: 10% raise for faculty of departments whose avg attendance < 75%.',
             'steps': [
                 """SELECT faculty_id, dept_id, salary FROM faculty
WHERE dept_id IN (SELECT dept_id FROM v_dept_stats WHERE avg_attendance < 75);""",
                 """UPDATE faculty
SET salary = salary * 1.10
WHERE dept_id IN (SELECT dept_id FROM v_dept_stats WHERE avg_attendance < 75);""",
                 """SELECT faculty_id, dept_id, salary FROM faculty
WHERE dept_id IN (SELECT dept_id FROM v_dept_stats WHERE avg_attendance < 75);""",
             ]},
            {'q': 'UPDATE: +2 bonus Internal marks (capped at max) for students with >= 90% attendance in that subject.',
             'steps': [
                 """UPDATE exam_result
SET marks_obtained = MIN(marks_obtained + 2, max_marks)
WHERE exam_type = 'Internal'
  AND (roll_no, subject_id) IN (SELECT roll_no, subject_id FROM v_attendance_summary
                                WHERE adjusted_pct >= 90);""",
                 "SELECT COUNT(*) AS audit_rows_written_by_trigger FROM audit_log WHERE table_name = 'exam_result';",
             ]},
            {'q': 'UPDATE with CASE: promote Assistant Professors with 5+ years of service.',
             'steps': [
                 """UPDATE faculty
SET designation = CASE
      WHEN designation = 'Assistant Professor'
       AND julianday('now') - julianday(joining_date) > 5 * 365 THEN 'Associate Professor'
      ELSE designation END;""",
                 'SELECT name, designation, joining_date FROM faculty ORDER BY joining_date;',
             ]},
            {'q': 'DELETE with subquery: remove rejected leave requests of CS students.',
             'steps': [
                 """DELETE FROM leave_request
WHERE status = 'Rejected'
  AND roll_no IN (SELECT roll_no FROM student WHERE dept_id = 'CS');""",
                 'SELECT leave_id, roll_no, status FROM leave_request;',
             ]},
        ],
    },
    {
        'id': '3', 'title': 'Assignment 3 : SQL DDL & DML (hostel management)', 'sandbox': True, 'questions': [
            {'q': 'Create table HOSTEL.',
             'steps': [
                 """CREATE TABLE hostel (
  hostel_id   VARCHAR(5) PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  gender_type CHAR(1) CHECK (gender_type IN ('M', 'F')),
  capacity    INTEGER
);""",
             ]},
            {'q': 'Create table ROOM referencing HOSTEL.',
             'steps': [
                 """CREATE TABLE room (
  room_no   VARCHAR(6),
  hostel_id VARCHAR(5) REFERENCES hostel(hostel_id),
  beds      INTEGER DEFAULT 2,
  PRIMARY KEY (hostel_id, room_no)
);""",
             ]},
            {'q': 'Insert hostels and rooms (multi-row INSERT).',
             'steps': [
                 """INSERT INTO hostel VALUES ('H1', 'Shivneri Boys Hostel', 'M', 120),
                          ('H2', 'Sahyadri Girls Hostel', 'F', 90);""",
                 """INSERT INTO room (room_no, hostel_id, beds) VALUES
  ('101', 'H1', 2), ('102', 'H1', 3), ('103', 'H1', 2),
  ('201', 'H2', 2), ('202', 'H2', 2);""",
                 'SELECT * FROM room;',
             ]},
            {'q': 'ALTER TABLE: add a warden column, then fill it with UPDATE.',
             'steps': [
                 'ALTER TABLE hostel ADD COLUMN warden VARCHAR(50);',
                 "UPDATE hostel SET warden = CASE hostel_id WHEN 'H1' THEN 'Mr. Patil' ELSE 'Mrs. Kulkarni' END;",
                 'SELECT * FROM hostel;',
             ]},
            {'q': 'Create ALLOTMENT and fill it with INSERT ... SELECT (out-of-Pune students).',
             'steps': [
                 """CREATE TABLE allotment (
  roll_no   VARCHAR(10) PRIMARY KEY REFERENCES student(roll_no),
  hostel_id VARCHAR(5) NOT NULL,
  room_no   VARCHAR(6) NOT NULL,
  FOREIGN KEY (hostel_id, room_no) REFERENCES room(hostel_id, room_no)
);""",
                 """INSERT INTO allotment (roll_no, hostel_id, room_no)
SELECT roll_no,
       CASE gender WHEN 'F' THEN 'H2' ELSE 'H1' END,
       CASE gender WHEN 'F' THEN '201' ELSE '101' END
FROM student
WHERE city <> 'Pune' AND year = 3 AND dept_id = 'CS';""",
                 """SELECT a.roll_no, s.first_name, s.city, a.hostel_id, a.room_no
FROM allotment a JOIN student s USING (roll_no);""",
             ]},
            {'q': 'ALTER TABLE ... RENAME COLUMN and RENAME TO.',
             'steps': [
                 'ALTER TABLE room RENAME COLUMN beds TO bed_count;',
                 'ALTER TABLE allotment RENAME TO hostel_allotment;',
                 "SELECT name FROM sqlite_master WHERE name IN ('room', 'hostel_allotment', 'allotment');",
             ]},
            {'q': 'UPDATE and DELETE rows.',
             'steps': [
                 "UPDATE room SET bed_count = bed_count + 1 WHERE hostel_id = 'H1';",
                 "DELETE FROM hostel_allotment WHERE roll_no IN (SELECT roll_no FROM student WHERE city = 'Delhi');",
                 'SELECT * FROM room;',
             ]},
            {'q': 'CREATE VIEW for occupancy and query it.',
             'steps': [
                 """CREATE VIEW v_hostel_occupancy AS
SELECT h.name, COUNT(a.roll_no) AS occupied,
       (SELECT SUM(bed_count) FROM room r WHERE r.hostel_id = h.hostel_id) AS beds
FROM hostel h LEFT JOIN hostel_allotment a ON a.hostel_id = h.hostel_id
GROUP BY h.hostel_id;""",
                 'SELECT * FROM v_hostel_occupancy;',
             ]},
            {'q': 'DROP the view and the tables (reverse dependency order).',
             'steps': [
                 'DROP VIEW v_hostel_occupancy;',
                 'DROP TABLE hostel_allotment;',
                 'DROP TABLE room;',
                 'DROP TABLE hostel;',
             ]},
        ],
    },
    {
        'id': '4', 'title': 'Assignment 4 : Schema creation & constraints (library)', 'sandbox': True, 'questions': [
            {'q': 'Create LIB_BOOK with PRIMARY KEY, NOT NULL, CHECK and DEFAULT.',
             'steps': [
                 """CREATE TABLE lib_book (
  isbn     CHAR(13)     PRIMARY KEY CHECK (length(isbn) = 13),
  title    VARCHAR(150) NOT NULL,
  author   VARCHAR(100) NOT NULL,
  category VARCHAR(20)  DEFAULT 'General'
           CHECK (category IN ('General', 'Database', 'OS', 'Networks', 'Maths')),
  copies   INTEGER      NOT NULL DEFAULT 1 CHECK (copies >= 0)
);""",
             ]},
            {'q': 'Create LIB_MEMBER: FK to student with ON DELETE CASCADE + UNIQUE.',
             'steps': [
                 """CREATE TABLE lib_member (
  member_id INTEGER PRIMARY KEY,
  roll_no   VARCHAR(10) NOT NULL UNIQUE
            REFERENCES student(roll_no) ON DELETE CASCADE,
  max_books INTEGER NOT NULL DEFAULT 3 CHECK (max_books BETWEEN 1 AND 5),
  joined_on DATE DEFAULT (date('now'))
);""",
             ]},
            {'q': 'Create LIB_ISSUE with table-level CHECKs and two FKs (CASCADE vs RESTRICT).',
             'steps': [
                 """CREATE TABLE lib_issue (
  issue_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES lib_member(member_id) ON DELETE CASCADE,
  isbn        CHAR(13) NOT NULL REFERENCES lib_book(isbn) ON DELETE RESTRICT,
  issue_date  DATE NOT NULL DEFAULT (date('now')),
  due_date    DATE NOT NULL,
  return_date DATE,
  CHECK (due_date > issue_date),
  CHECK (return_date IS NULL OR return_date >= issue_date)
);""",
             ]},
            {'q': 'Insert valid data (DEFAULT values get applied).',
             'steps': [
                 """INSERT INTO lib_book (isbn, title, author, category, copies) VALUES
  ('9780073523323', 'Database System Concepts', 'Silberschatz', 'Database', 4),
  ('9780072465631', 'Database Management Systems', 'Ramakrishnan', 'Database', 2),
  ('9781118063330', 'Operating System Concepts', 'Galvin', 'OS', 3);""",
                 "INSERT INTO lib_member (member_id, roll_no) VALUES (1, '23CS001'), (2, '23CS002'), (3, '23IT001');",
                 """INSERT INTO lib_issue (member_id, isbn, issue_date, due_date) VALUES
  (1, '9780073523323', '2026-09-01', '2026-09-15'),
  (1, '9781118063330', '2026-09-03', '2026-09-17'),
  (2, '9780072465631', '2026-09-05', '2026-09-19');""",
                 'SELECT * FROM lib_member;',
             ]},
            {'q': 'Constraint tests - each statement below MUST be rejected by the DBMS.',
             'steps': [
                 {'sql': "INSERT INTO lib_book (isbn, title, author) VALUES ('9780073523323', 'Duplicate', 'X');", 'expect_error': 'PRIMARY KEY'},
                 {'sql': "INSERT INTO lib_book (isbn, title, author) VALUES ('12345', 'Short ISBN', 'X');", 'expect_error': 'CHECK length'},
                 {'sql': "INSERT INTO lib_book (isbn, title, author) VALUES ('9999999999999', NULL, 'X');", 'expect_error': 'NOT NULL'},
                 {'sql': "INSERT INTO lib_book (isbn, title, author, copies) VALUES ('9999999999999', 'T', 'X', -2);", 'expect_error': 'CHECK copies'},
                 {'sql': "INSERT INTO lib_book (isbn, title, author, category) VALUES ('9999999999999', 'T', 'X', 'Novels');", 'expect_error': 'CHECK IN list'},
                 {'sql': "INSERT INTO lib_member (member_id, roll_no) VALUES (9, '99XX999');", 'expect_error': 'FOREIGN KEY'},
                 {'sql': "INSERT INTO lib_member (member_id, roll_no) VALUES (9, '23CS001');", 'expect_error': 'UNIQUE'},
                 {'sql': "INSERT INTO lib_member (member_id, roll_no, max_books) VALUES (9, '23CS003', 10);", 'expect_error': 'CHECK range'},
                 {'sql': "INSERT INTO lib_issue (member_id, isbn, issue_date, due_date) VALUES (1, '9780073523323', '2026-09-10', '2026-09-01');", 'expect_error': 'table CHECK'},
                 {'sql': "DELETE FROM lib_book WHERE isbn = '9780073523323';", 'expect_error': 'ON DELETE RESTRICT'},
             ]},
            {'q': 'Referential action ON DELETE CASCADE: delete member 1 -> issues vanish.',
             'steps': [
                 'SELECT COUNT(*) AS issues_of_member_1 FROM lib_issue WHERE member_id = 1;',
                 'DELETE FROM lib_member WHERE member_id = 1;',
                 'SELECT COUNT(*) AS issues_of_member_1 FROM lib_issue WHERE member_id = 1;',
             ]},
            {'q': 'Inspect the constraints stored in the catalog (data dictionary).',
             'steps': [
                 """SELECT "table", "from" AS column, "to" AS ref_column, on_update, on_delete
FROM pragma_foreign_key_list('lib_issue');""",
                 'SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info(\'lib_book\');',
             ]},
        ],
    },
]

_QUERY_RE = re.compile(r'^\s*(--[^\n]*\n\s*)*(SELECT|WITH|PRAGMA|EXPLAIN|VALUES)\b', re.I)


def is_query(sql):
    return bool(_QUERY_RE.match(sql))


def run_statement(step):
    sql = step if isinstance(step, str) else step['sql']
    expect_error = None if isinstance(step, str) else step['expect_error']
    ui.print_sql(sql)
    try:
        if is_query(sql):
            ui.table(db.all_(sql), limit=25)
        elif len(db.split_statements(sql)) > 1:
            db.exec_(sql)
        else:
            r = db.run(sql)
            print(ui.c.gray('    → %d row(s) affected' % r.changes))
        if expect_error:
            ui.warn('Expected a %s violation but the statement succeeded!' % expect_error)
    except Exception as err:  # noqa: BLE001
        if expect_error:
            ui.success('Rejected as expected [%s] → %s' % (expect_error, friendly_error(err)))
        else:
            ui.error(friendly_error(err))


def run_question(a, idx):
    qn = a['questions'][idx]
    print('\n  ' + ui.c.bgBlue(' Q%s.%d ' % (a['id'], idx + 1)) + ' ' + ui.c.bold(qn['q']))
    if 'sql' in qn:
        run_statement(qn['sql'])
        return
    own = not a.get('sandbox')  # DML questions of 2B get their own sandbox
    if own:
        db.exec_('SAVEPOINT lab_q;')
    try:
        for s in qn['steps']:
            run_statement(s)
    finally:
        if own:
            db.exec_('ROLLBACK TO lab_q; RELEASE lab_q;')
            ui.note('↺ changes rolled back (sandbox) - real data untouched')


def open_assignment(a):
    ui.header(a['title'], 'Runs inside SAVEPOINT -> everything is rolled back at the end' if a.get('sandbox')
              else '%d questions' % len(a['questions']))
    for i, q in enumerate(a['questions']):
        print('   %s. %s' % (ui.c.cyan(str(i + 1).rjust(2)), q['q']))
    if a.get('sandbox'):
        if not ui.confirm('Run the whole assignment step by step?', True):
            return
        db.exec_('SAVEPOINT lab_a;')
        try:
            for i in range(len(a['questions'])):
                run_question(a, i)
                ui.pause()
        finally:
            db.exec_('ROLLBACK TO lab_a; RELEASE lab_a;')
            ui.note('↺ Assignment sandbox rolled back - schema and data restored.')
        return
    v = ui.ask_text("Question number (1-%d) or 'a' for all" % len(a['questions']), default='a')
    if v.lower() == 'a':
        for i in range(len(a['questions'])):
            run_question(a, i)
    elif v.isdigit() and 1 <= int(v) <= len(a['questions']):
        run_question(a, int(v) - 1)
    else:
        ui.error('Invalid question number')


def export_sql():
    out = ['-- ==========================================================================',
           '--  LAB ASSIGNMENTS 1-4  (auto-generated from caams/modules/lab_assignments.py)',
           '--  Run on the CAAMS database:  sqlite3 data/college.db < sql/lab_assignments.sql',
           '-- ==========================================================================']
    for a in ASSIGNMENTS:
        out += ['', '-- ##########  %s  ##########' % a['title']]
        if a.get('sandbox'):
            out.append('BEGIN;  -- sandbox: rolled back at the end')
        for i, q in enumerate(a['questions']):
            out += ['', '-- Q%s.%d  %s' % (a['id'], i + 1, q['q'])]
            steps = [q['sql']] if 'sql' in q else q['steps']
            if 'sql' not in q and not a.get('sandbox'):
                out.append('SAVEPOINT q;')
            for s in steps:
                if isinstance(s, str):
                    out.append(s)
                else:
                    out.append('-- EXPECTED TO FAIL (%s):\n-- %s' % (s['expect_error'], s['sql'].replace('\n', '\n-- ')))
            if 'sql' not in q and not a.get('sandbox'):
                out.append('ROLLBACK TO q; RELEASE q;')
        if a.get('sandbox'):
            out.append('ROLLBACK;')
    path = os.path.join(db.SQL_DIR, 'lab_assignments.sql')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out) + '\n')
    return path


def _opener(a):
    return lambda: open_assignment(a)


def menu():
    run_menu('LAB ASSIGNMENTS (Syllabus 1 - 4)', 'Every question shows the SQL and its live output', [
        {'label': a['title'], 'hint': '%d Qs%s' % (len(a['questions']), ', sandbox' if a.get('sandbox') else ''), 'action': _opener(a)}
        for a in ASSIGNMENTS
    ] + [
        {'label': 'Export all lab queries to sql/lab_assignments.sql', 'hint': 'for printing / submission',
         'action': lambda: ui.success('Written %s' % export_sql())},
    ])
