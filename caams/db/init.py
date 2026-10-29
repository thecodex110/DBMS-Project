# ============================================================================
#  DATABASE INITIALISER
#  1. runs sql/01..05  (schema -> views -> triggers -> indexes -> base data)
#  2. generates realistic "live" data relative to TODAY:
#       class sessions (last 15 weeks), attendance, leaves, exam marks
#  3. creates login accounts (admin + one per faculty) with hashed passwords
#  Everything runs inside ONE transaction: either the whole DB is built or
#  nothing is (atomicity).
# ============================================================================
import math
from datetime import datetime, timedelta, timezone

from . import connection as db
from .auth import hash_password

SQL_FILES = ['01_schema.sql', '02_views.sql', '03_triggers.sql', '04_indexes.sql', '05_seed_base.sql']

M32 = 0xFFFFFFFF


def _imul(a, b):
    return (a * b) & M32


def mulberry32(seed):
    """Deterministic pseudo-random generator -> same data on every reset."""
    state = [seed & M32]

    def rand():
        s = (state[0] + 0x6D2B79F5) & M32
        state[0] = s
        t = _imul(s ^ (s >> 15), 1 | s)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return rand


def iso(d):
    return d.isoformat()


def js_weekday(d):
    # 0 = Sunday ... 6 = Saturday (same numbering as SQLite strftime('%w'))
    return (d.weekday() + 1) % 7


TOPICS = {
    'CS501': ['Purpose of DB systems', 'Views of data & DB languages', 'DBMS architecture', 'E-R model: entities & attributes',
              'E-R relationships & constraints', 'Relational model & keys', 'Integrity & referential constraints', 'Relational algebra: basic ops',
              'Relational algebra: extended ops', 'SQL basic structure', 'SQL aggregates & GROUP BY', 'Nested subqueries',
              'Functional dependencies', '1NF, 2NF, 3NF', 'BCNF decomposition', 'Ordered indices', 'B+ tree index files',
              'Static & dynamic hashing', 'Transaction concepts & ACID', 'Serializability', 'Recoverability', 'Lock-based protocols',
              'Timestamp-based protocols', 'Validation protocols', 'Deadlock handling', 'Log-based recovery', 'ARIES overview'],
    'CS504': ['Basic SQL queries', 'Aggregates lab', 'Nested subqueries lab', 'DDL & DML lab', 'Constraints lab', 'Mini project review'],
}


def generate_live_data():
    rand = mulberry32(2026)
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=7 * 15)

    teaches = db.all_("""SELECT t.subject_id, t.faculty_id, s.subject_type
                           FROM teaches t JOIN subject s USING (subject_id)
                          ORDER BY t.subject_id""")
    enrolled = db.all_('SELECT roll_no, subject_id FROM enrollment')
    by_subject = {}
    for e in enrolled:
        by_subject.setdefault(e['subject_id'], []).append(e['roll_no'])

    # every student gets a "regularity" -> some are regular, some are defaulters
    students = db.all_('SELECT roll_no FROM student ORDER BY roll_no')
    regularity = {}
    for i, s in enumerate(students):
        weak = i % 5 == 2
        regularity[s['roll_no']] = 0.5 + rand() * 0.2 if weak else 0.74 + rand() * 0.24

    conn = db.get_db()
    ins_session = 'INSERT INTO class_session (subject_id, faculty_id, session_date, start_time, topic) VALUES (?, ?, ?, ?, ?)'
    ins_att = "INSERT INTO attendance (session_id, roll_no, status, marked_at) VALUES (?, ?, ?, ? || ' ' || ?)"

    for idx, t in enumerate(teaches):
        # each subject meets on 2 fixed weekdays (labs once a week)
        days = [((idx + 3) % 5) + 1] if t['subject_type'] == 'Lab' else [(idx % 5) + 1, ((idx + 2) % 5) + 1]
        time = ['09:00', '10:00', '11:15', '12:15', '14:00', '15:00'][idx % 6]
        topics = TOPICS.get(t['subject_id'], [])
        roster = by_subject.get(t['subject_id'], [])
        lecture = 0
        d = start
        while d < today:
            if js_weekday(d) in days:
                lecture += 1
                topic = topics[(lecture - 1) % len(topics)] if topics else 'Lecture %d' % lecture
                date = iso(d)
                sid = conn.execute(ins_session, (t['subject_id'], t['faculty_id'], date, time, topic)).lastrowid
                for roll in roster:
                    p = min(0.99, regularity[roll] + (rand() - 0.5) * 0.12)
                    conn.execute(ins_att, (sid, roll, 'P' if rand() < p else 'A', date, time + ':00'))
            d += timedelta(days=1)

    # leaves (dates relative to today)
    leaves = [
        ('23CS003', -40, -36, 'Medical', 'Viral fever - doctor certificate attached', 'Approved', 'FAC101'),
        ('23CS008', -25, -23, 'Sports', 'Inter-college cricket tournament', 'Approved', 'FAC103'),
        ('23IT002', -60, -55, 'Medical', 'Hospitalised for dengue', 'Approved', 'FAC102'),
        ('23EC002', -10, -9, 'Event', 'Paper presentation at IIT Bombay', 'Pending', None),
        ('23ME001', -5, -4, 'Personal', "Sister's wedding", 'Pending', None),
        ('24CS103', -30, -29, 'Personal', 'Family function', 'Rejected', 'FAC106'),
        ('23CS010', -3, -2, 'Medical', 'Dental surgery', 'Pending', None),
    ]
    for roll, f, t, type_, reason, status, by in leaves:
        db.run("""INSERT INTO leave_request (roll_no, from_date, to_date, leave_type, reason, status, reviewed_by, applied_on)
                  VALUES (?, ?, ?, ?, ?, 'Pending', NULL, ?)""",
               roll, iso(today + timedelta(days=f)), iso(today + timedelta(days=t)), type_, reason,
               iso(today + timedelta(days=f - 2)))
        if status != 'Pending':
            db.run('UPDATE leave_request SET status = ?, reviewed_by = ? WHERE leave_id = last_insert_rowid()', status, by)

    # exam marks: Internal /20, MidSem /30, EndSem /50 ; NULL = absent
    ins_mark = 'INSERT INTO exam_result (roll_no, subject_id, exam_type, marks_obtained, max_marks) VALUES (?, ?, ?, ?, ?)'
    exams = [('Internal', 20), ('MidSem', 30), ('EndSem', 50)]
    for e in enrolled:
        base = 0.35 + regularity[e['roll_no']] * 0.55
        for type_, max_ in exams:
            if type_ == 'EndSem' and e['subject_id'].startswith('CS3'):
                continue  # 2nd-year EndSem not yet held
            if rand() < 0.025:
                conn.execute(ins_mark, (e['roll_no'], e['subject_id'], type_, None, max_))
                continue
            score = max(0, min(1, base + (rand() - 0.5) * 0.3))
            conn.execute(ins_mark, (e['roll_no'], e['subject_id'], type_, math.floor(score * max_ * 2 + 0.5) / 2, max_))

    # login accounts
    db.run("INSERT INTO app_user (username, password_hash, salt, role) VALUES ('admin', ?, ?, 'admin')",
           *hash_password('admin@123'))
    for f in db.all_('SELECT faculty_id FROM faculty'):
        user = f['faculty_id'].lower()
        db.run("INSERT INTO app_user (username, password_hash, salt, role, faculty_id) VALUES (?, ?, ?, 'faculty', ?)",
               user, *hash_password(user + '@123'), f['faculty_id'])

    # seeding is not an "audit-worthy" activity -> start with a clean log
    db.run('DELETE FROM audit_log')


def initialize():
    def build():
        for f in SQL_FILES:
            db.run_sql_file(f)
        generate_live_data()
    db.transaction(build)
    db.exec_('ANALYZE;')  # collect statistics for the query optimiser


def ensure_database():
    if not db.is_initialized():
        initialize()
        return True
    return False


def reset_database():
    db.delete_database_files()
    initialize()
