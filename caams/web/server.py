# ============================================================================
#  WEB FRONT END  -  python3 main.py --web   (then open http://127.0.0.1:8000)
#  A small JSON API on top of the SAME SQLite database, tables, views and
#  triggers the terminal app uses, plus the static files in ./static.
#  Every API answer carries the SQL it ran ("sql": [...]) so the browser can
#  show "what query is behind this screen".
#  Python standard library only (http.server) - nothing to install.
# ============================================================================
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import time
from datetime import date
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from ..db import auth, init
from ..db import connection as db
from ..ui.menu import friendly_error

STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
SESSIONS = {}          # token -> user dict  (in memory: restart = log in again)
COOKIE = 'caams_session'


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def tidy(sql):
    """Remove the Python indentation so the SQL reads well in the browser."""
    lines = sql.strip('\n').split('\n')
    first, rest = lines[0].strip(), lines[1:]
    pad = min([len(l) - len(l.lstrip()) for l in rest if l.strip()] or [0])
    return '\n'.join([first] + ['  ' + l[pad:] for l in rest]).strip()


class Q:
    """Runs queries through caams.db.connection and remembers them for the UI."""

    def __init__(self):
        self.sql = []

    def all(self, sql, *p):
        self.sql.append(tidy(sql))
        return db.all_(sql, *p)

    def get(self, sql, *p):
        self.sql.append(tidy(sql))
        return db.get(sql, *p)

    def run(self, sql, *p):
        self.sql.append(tidy(sql))
        return db.run(sql, *p)


# ------------------------------------------------------------- access checks --
def need(user, *roles):
    if not user:
        raise ApiError(401, 'Log in to continue.')
    if roles and user['role'] not in roles:
        raise ApiError(403, 'Your account cannot open this page.')


def faculty_filter(user):
    return user['faculty_id'] if user['role'] == 'faculty' else None


def check_subject(q, user, subject_id):
    row = q.get("""SELECT s.subject_id, s.subject_name, t.faculty_id
                     FROM subject s LEFT JOIN teaches t ON t.subject_id = s.subject_id
                    WHERE s.subject_id = ?""", subject_id)
    if not row:
        raise ApiError(404, 'No subject with code %s.' % subject_id)
    if user['role'] == 'faculty' and row['faculty_id'] != user['faculty_id']:
        raise ApiError(403, 'You can only open subjects you teach.')
    return row


def strips_for_subject(q, subject_id):
    """roll_no -> 'PPAPP…' in date order (the attendance strip)."""
    rows = q.all("""SELECT a.roll_no, a.status
                      FROM attendance a JOIN class_session cs ON cs.session_id = a.session_id
                     WHERE cs.subject_id = ?
                     ORDER BY cs.session_date, cs.start_time""", subject_id)
    out = {}
    for r in rows:
        out[r['roll_no']] = out.get(r['roll_no'], '') + r['status']
    return out


# -------------------------------------------------------------------- auth ---
def api_login(q, user, params, body):
    kind = body.get('kind')
    if kind == 'student':
        row = q.get("""SELECT roll_no, first_name || ' ' || last_name AS name, dept_id, year
                         FROM student WHERE roll_no = upper(?) AND dob = ?""",
                    str(body.get('roll_no', '')).strip(), str(body.get('dob', '')).strip())
        if not row:
            raise ApiError(401, 'Roll number and date of birth do not match.')
        u = {'role': 'student', 'name': row['name'], 'roll_no': row['roll_no'], 'faculty_id': None,
             'username': row['roll_no']}
    else:
        found = auth.login(body.get('username', ''), body.get('password', ''))
        if not found:
            raise ApiError(401, 'Username or password is wrong.')
        u = dict(found)
    token = secrets.token_urlsafe(24)
    SESSIONS[token] = u
    return {'user': u, '_set_cookie': token}


def api_logout(q, user, params, body):
    return {'ok': True, '_clear_cookie': True}


def api_me(q, user, params, body):
    need(user)
    return {'user': user}


def api_preview(q, user, params, body):
    """Public: a few real register rows for the login page."""
    rows = q.all("""SELECT a.roll_no, group_concat(a.status, '') AS strip
                      FROM (SELECT a.roll_no, a.status
                              FROM attendance a JOIN class_session cs ON cs.session_id = a.session_id
                             WHERE cs.subject_id = 'CS501'
                             ORDER BY cs.session_date, cs.start_time) a
                     GROUP BY a.roll_no ORDER BY a.roll_no LIMIT 9""")
    return {'rows': [{'roll_no': r['roll_no'], 'strip': (r['strip'] or '')[-24:]} for r in rows]}


# ---------------------------------------------------------------- overview ---
def api_overview(q, user, params, body):
    need(user, 'admin', 'faculty')
    k = q.get("""SELECT
        (SELECT COUNT(*) FROM student)                                  AS students,
        (SELECT COUNT(*) FROM faculty)                                  AS faculty,
        (SELECT COUNT(*) FROM class_session)                            AS sessions,
        (SELECT ROUND(100.0 * SUM(status = 'P') / COUNT(*), 1) FROM attendance) AS overall_pct,
        (SELECT COUNT(DISTINCT roll_no) FROM v_defaulters)              AS defaulters,
        (SELECT COUNT(*) FROM leave_request WHERE status = 'Pending')   AS pending_leaves""")
    weekly = q.all("""SELECT strftime('%Y-W%W', cs.session_date) AS week, MIN(cs.session_date) AS starts,
                             ROUND(100.0 * SUM(a.status = 'P') / COUNT(*), 1) AS pct
                        FROM class_session cs JOIN attendance a ON a.session_id = cs.session_id
                       GROUP BY week ORDER BY week""")
    depts = q.all('SELECT dept_id, dept_name, students, avg_attendance, defaulter_students FROM v_dept_stats')
    subjects = q.all("""SELECT subject_id, subject_name, faculty, avg_attendance, defaulters
                          FROM v_subject_report ORDER BY avg_attendance""")
    risk = q.all("""SELECT roll_no, student_name, subject_id, adjusted_pct, classes_needed, risk
                      FROM v_defaulters ORDER BY adjusted_pct LIMIT 8""")
    return {'kpi': k, 'weekly': weekly, 'depts': depts, 'subjects': subjects, 'risk': risk}


# -------------------------------------------------------------- attendance ---
def api_subjects(q, user, params, body):
    need(user, 'admin', 'faculty')
    fid = faculty_filter(user)
    rows = q.all("""SELECT sub.subject_id, sub.subject_name, sub.subject_type, t.faculty_id, f.name AS faculty,
                           (SELECT COUNT(*) FROM enrollment e WHERE e.subject_id = sub.subject_id) AS enrolled
                      FROM subject sub
                      JOIN teaches t ON t.subject_id = sub.subject_id
                      JOIN faculty f ON f.faculty_id = t.faculty_id
                     WHERE ? IS NULL OR t.faculty_id = ?
                     ORDER BY sub.subject_id""", fid, fid)
    return {'subjects': rows}


def api_roster(q, user, params, body):
    need(user, 'admin', 'faculty')
    sub = check_subject(q, user, params.get('subject', ''))
    rows = q.all("""SELECT e.roll_no, s.first_name || ' ' || s.last_name AS name, v.adjusted_pct, v.classes_needed
                      FROM enrollment e
                      JOIN student s ON s.roll_no = e.roll_no
                      LEFT JOIN v_attendance_summary v ON v.roll_no = e.roll_no AND v.subject_id = e.subject_id
                     WHERE e.subject_id = ? ORDER BY e.roll_no""", sub['subject_id'])
    strips = strips_for_subject(q, sub['subject_id'])
    for r in rows:
        r['strip'] = strips.get(r['roll_no'], '')[-12:]
    last = q.get('SELECT MAX(session_date) AS d FROM class_session WHERE subject_id = ?', sub['subject_id'])
    return {'subject': sub, 'roster': rows, 'last_session': last['d'], 'today': date.today().isoformat()}


def api_take_attendance(q, user, params, body):
    need(user, 'admin', 'faculty')
    sub = check_subject(q, user, body.get('subject_id', ''))
    d, t = str(body.get('date', '')), str(body.get('time', ''))
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', d) or not re.match(r'^\d{2}:\d{2}$', t):
        raise ApiError(400, 'Use a date like 2026-10-29 and a time like 10:00.')
    topic = str(body.get('topic') or 'Lecture')[:200]
    roster = [r['roll_no'] for r in q.all('SELECT roll_no FROM enrollment WHERE subject_id = ?', sub['subject_id'])]
    absent = set(body.get('absent') or [])
    if absent - set(roster):
        raise ApiError(400, 'Some absent roll numbers are not enrolled in this subject.')

    def work():
        sid = q.run('INSERT INTO class_session (subject_id, faculty_id, session_date, start_time, topic) VALUES (?, ?, ?, ?, ?)',
                    sub['subject_id'], sub['faculty_id'], d, t, topic).last_insert_rowid
        for roll in roster:
            q.run('INSERT INTO attendance (session_id, roll_no, status) VALUES (?, ?, ?)', sid, roll, 'A' if roll in absent else 'P')
        return sid
    try:
        sid = db.transaction(work)
    except sqlite3.IntegrityError as e:
        if 'class_session.subject_id' in str(e):
            raise ApiError(409, 'A %s lecture is already recorded on %s at %s. Pick another start time.' % (sub['subject_id'], d, t))
        raise
    q.sql =[q.sql[0], 'BEGIN;'] + q.sql[2:4] + (['… one INSERT per student (%d in total) …' % len(roster)] if len(roster) > 1 else []) + ['COMMIT;']
    return {'session_id': sid, 'present': len(roster) - len(absent), 'absent': len(absent)}


def api_register(q, user, params, body):
    need(user, 'admin', 'faculty')
    sub = check_subject(q, user, params.get('subject', ''))
    sessions = list(reversed(q.all("""SELECT session_id, session_date, start_time, topic FROM class_session
                                       WHERE subject_id = ? ORDER BY session_date DESC, start_time DESC LIMIT 16""",
                                   sub['subject_id'])))
    students = q.all("""SELECT roll_no, student_name, present, on_leave, total_classes, raw_pct, adjusted_pct, classes_needed
                          FROM v_attendance_summary WHERE subject_id = ? ORDER BY roll_no""", sub['subject_id'])
    marks = q.all("""SELECT a.session_id, a.roll_no, a.status FROM attendance a
                       JOIN class_session cs ON cs.session_id = a.session_id WHERE cs.subject_id = ?""", sub['subject_id'])
    grid = {(m['session_id'], m['roll_no']): m['status'] for m in marks}
    for s in students:
        s['cells'] = [grid.get((x['session_id'], s['roll_no'])) for x in sessions]
    return {'subject': sub, 'sessions': sessions, 'students': students}


# ---------------------------------------------------------------- students ---
def api_students(q, user, params, body):
    need(user, 'admin', 'faculty')
    dept, year, text = params.get('dept', ''), params.get('year', ''), params.get('q', '')
    rows = q.all("""SELECT roll_no, full_name, gender, age, city, year, dept_id, phones
                      FROM v_student_profile
                     WHERE (? = '' OR dept_id = ?)
                       AND (? = '' OR year = CAST(? AS INTEGER))
                       AND (? = '' OR full_name LIKE '%' || ? || '%' OR roll_no LIKE '%' || ? || '%' OR city LIKE '%' || ? || '%')
                     ORDER BY dept_id, year DESC, roll_no""", dept, dept, year, year, text, text, text, text)
    depts = q.all('SELECT dept_id, dept_name FROM department ORDER BY dept_id')
    return {'students': rows, 'depts': depts}


def student_profile(q, roll):
    p = q.get('SELECT * FROM v_student_profile WHERE roll_no = ?', roll)
    if not p:
        raise ApiError(404, 'No student with roll number %s.' % roll)
    att = q.all("""SELECT subject_id, subject_name, total_classes, present, on_leave, raw_pct, adjusted_pct, classes_needed
                     FROM v_attendance_summary WHERE roll_no = ? ORDER BY subject_id""", roll)
    seq = q.all("""SELECT cs.subject_id, a.status FROM attendance a
                     JOIN class_session cs ON cs.session_id = a.session_id
                    WHERE a.roll_no = ? ORDER BY cs.session_date, cs.start_time""", roll)
    strips = {}
    for r in seq:
        strips[r['subject_id']] = strips.get(r['subject_id'], '') + r['status']
    for a in att:
        a['strip'] = strips.get(a['subject_id'], '')
    results = q.all("""SELECT subject_id, subject_name, credits, internal, midsem, endsem, total, out_of, percentage, grade, grade_point
                         FROM v_result_sheet WHERE roll_no = ? ORDER BY subject_id""", roll)
    sgpa = q.get("""SELECT ROUND(SUM(credits * grade_point) * 1.0 / SUM(credits), 2) AS sgpa
                      FROM v_result_sheet WHERE roll_no = ?""", roll)['sgpa']
    leaves = q.all("""SELECT l.leave_id, l.from_date, l.to_date, l.leave_type, l.reason, l.status, l.applied_on,
                             COALESCE(f.name, '') AS reviewed_by
                        FROM leave_request l LEFT JOIN faculty f ON f.faculty_id = l.reviewed_by
                       WHERE l.roll_no = ? ORDER BY l.applied_on DESC""", roll)
    return {'profile': p, 'attendance': att, 'results': results, 'sgpa': sgpa, 'leaves': leaves}


def api_student(q, user, params, body, roll):
    need(user, 'admin', 'faculty')
    return student_profile(q, roll.upper())


def api_my(q, user, params, body):
    need(user, 'student')
    return student_profile(q, user['roll_no'])


def api_my_leave(q, user, params, body):
    need(user, 'student')
    f, t = str(body.get('from_date', '')), str(body.get('to_date', ''))
    kind, reason = body.get('leave_type'), str(body.get('reason', '')).strip()
    if not reason:
        raise ApiError(400, 'Write a reason for the leave.')
    r = q.run('INSERT INTO leave_request (roll_no, from_date, to_date, leave_type, reason) VALUES (?, ?, ?, ?, ?)',
              user['roll_no'], f, t or f, kind, reason)
    return {'leave_id': r.last_insert_rowid}


# ----------------------------------------------------------------- results ---
def api_results(q, user, params, body):
    need(user, 'admin', 'faculty')
    subjects = q.all('SELECT subject_id, subject_name FROM subject ORDER BY subject_id')
    wanted = params.get('subject', '').upper()
    sub = next((s for s in subjects if s['subject_id'] == wanted), subjects[0])
    sheet = q.all("""SELECT roll_no, student_name, internal, midsem, endsem, total, out_of, percentage, grade
                       FROM v_result_sheet WHERE subject_id = ? ORDER BY percentage DESC""", sub['subject_id'])
    dist = q.all("""SELECT grade, COUNT(*) AS n FROM v_result_sheet WHERE subject_id = ?
                     GROUP BY grade ORDER BY MIN(grade_point) DESC""", sub['subject_id'])
    ranking = q.all("""SELECT roll_no, student_name, ROUND(SUM(credits * grade_point) * 1.0 / SUM(credits), 2) AS sgpa,
                              SUM(grade = 'F') AS backlogs
                         FROM v_result_sheet GROUP BY roll_no ORDER BY sgpa DESC LIMIT 10""")
    return {'subject': sub, 'subjects': subjects, 'sheet': sheet, 'dist': dist, 'ranking': ranking}


# --------------------------------------------------------- defaulters/leave --
def api_defaulters(q, user, params, body):
    need(user, 'admin', 'faculty')
    rows = q.all("""SELECT roll_no, student_name, dept_id, subject_id, present, on_leave, total_classes,
                           raw_pct, adjusted_pct, classes_needed, risk
                      FROM v_defaulters ORDER BY adjusted_pct""")
    pending = q.all("""SELECT l.leave_id, l.roll_no, s.first_name || ' ' || s.last_name AS name, l.from_date, l.to_date,
                              l.leave_type, l.reason, l.applied_on
                         FROM leave_request l JOIN student s USING (roll_no)
                        WHERE l.status = 'Pending' ORDER BY l.applied_on""")
    history = q.all("""SELECT l.leave_id, l.roll_no, l.from_date, l.to_date, l.leave_type, l.status,
                              COALESCE(f.name, '') AS reviewed_by
                         FROM leave_request l LEFT JOIN faculty f ON f.faculty_id = l.reviewed_by
                        WHERE l.status <> 'Pending' ORDER BY l.leave_id DESC LIMIT 12""")
    return {'defaulters': rows, 'pending': pending, 'history': history}


def api_review_leave(q, user, params, body, leave_id):
    need(user, 'admin', 'faculty')
    decision = body.get('decision')
    if decision not in ('Approved', 'Rejected'):
        raise ApiError(400, 'Choose Approved or Rejected.')
    lv = q.get('SELECT leave_id, roll_no, status FROM leave_request WHERE leave_id = ?', int(leave_id))
    if not lv:
        raise ApiError(404, 'No leave request #%s.' % leave_id)
    before = q.all('SELECT subject_id, adjusted_pct FROM v_attendance_summary WHERE roll_no = ? ORDER BY subject_id', lv['roll_no'])
    reviewer = user['faculty_id'] or 'FAC101'
    q.run('UPDATE leave_request SET status = ?, reviewed_by = ? WHERE leave_id = ?', decision, reviewer, lv['leave_id'])
    after = q.all('SELECT subject_id, adjusted_pct FROM v_attendance_summary WHERE roll_no = ? ORDER BY subject_id', lv['roll_no'])
    return {'roll_no': lv['roll_no'], 'decision': decision,
            'impact': [{'subject_id': b['subject_id'], 'before': b['adjusted_pct'], 'after': a['adjusted_pct']}
                       for b, a in zip(before, after)]}


def api_notices(q, user, params, body):
    need(user, 'admin', 'faculty')
    n = db.transaction(lambda: q.run("""INSERT INTO defaulter_notice (roll_no, subject_id, attendance_pct)
                                        SELECT roll_no, subject_id, adjusted_pct FROM v_defaulters WHERE true
                                        ON CONFLICT (roll_no, subject_id, issued_on) DO NOTHING""").changes)
    return {'issued': n}


# ------------------------------------------------------------ admin tools ----
def api_audit(q, user, params, body):
    need(user, 'admin', 'faculty')
    return {'log': q.all('SELECT * FROM audit_log ORDER BY log_id DESC LIMIT 40')}


QUERY_RE = re.compile(r'^\s*(--[^\n]*\n\s*)*(SELECT|WITH|PRAGMA|EXPLAIN|VALUES)\b', re.I)


def api_sql(q, user, params, body):
    need(user, 'admin', 'faculty')
    sql = str(body.get('sql', '')).strip()
    if not sql:
        raise ApiError(400, 'Type a query first.')
    is_query = bool(QUERY_RE.match(sql))
    if user['role'] != 'admin' and not is_query:
        raise ApiError(403, 'Faculty accounts can only run SELECT, WITH, PRAGMA and EXPLAIN.')
    started = time.perf_counter()
    if is_query:
        rows = q.all(sql)
        out = {'columns': list(rows[0].keys()) if rows else [], 'rows': rows[:200], 'count': len(rows)}
    else:
        if len(db.split_statements(sql if sql.endswith(';') else sql + ';')) > 1:
            db.exec_(sql if sql.endswith(';') else sql + ';')
            out = {'message': 'Statements ran.'}
        else:
            r = q.run(sql)
            out = {'message': '%d row(s) changed.' % r.changes}
    out['ms'] = round((time.perf_counter() - started) * 1000, 2)
    return out


def api_schema(q, user, params, body):
    need(user, 'admin', 'faculty')
    objs = q.all("""SELECT type, name FROM sqlite_master
                     WHERE type IN ('table', 'view', 'trigger', 'index') AND name NOT LIKE 'sqlite_%'
                     ORDER BY type, name""")
    return {'objects': objs}


# ------------------------------------------------------------------ routes ---
ROUTES = [
    ('POST', r'/api/login', api_login),
    ('POST', r'/api/logout', api_logout),
    ('GET', r'/api/me', api_me),
    ('GET', r'/api/preview', api_preview),
    ('GET', r'/api/overview', api_overview),
    ('GET', r'/api/subjects', api_subjects),
    ('GET', r'/api/roster', api_roster),
    ('POST', r'/api/attendance', api_take_attendance),
    ('GET', r'/api/register', api_register),
    ('GET', r'/api/students', api_students),
    ('GET', r'/api/students/([A-Za-z0-9]+)', api_student),
    ('GET', r'/api/results', api_results),
    ('GET', r'/api/defaulters', api_defaulters),
    ('POST', r'/api/leaves/(\d+)/review', api_review_leave),
    ('POST', r'/api/notices', api_notices),
    ('GET', r'/api/audit', api_audit),
    ('POST', r'/api/sql', api_sql),
    ('GET', r'/api/schema', api_schema),
    ('GET', r'/api/my', api_my),
    ('POST', r'/api/my/leaves', api_my_leave),
]


class Handler(BaseHTTPRequestHandler):
    server_version = 'CAAMS/1.0'

    def log_message(self, fmt, *args):  # keep the terminal quiet
        pass

    def _user(self):
        c = SimpleCookie(self.headers.get('Cookie') or '')
        return SESSIONS.get(c[COOKIE].value) if COOKIE in c else None

    def _send(self, status, payload, headers=None):
        data = json.dumps(payload, default=str).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _api(self, method):
        url = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(url.query).items()}
        body = {}
        if method == 'POST':
            n = int(self.headers.get('Content-Length') or 0)
            try:
                body = json.loads(self.rfile.read(n) or b'{}')
            except ValueError:
                return self._send(400, {'error': 'Request body is not valid JSON.'})
        for m, pattern, fn in ROUTES:
            match = re.fullmatch(pattern, url.path)
            if m == method and match:
                q = Q()
                try:
                    out = fn(q, self._user(), params, body, *match.groups())
                except ApiError as e:
                    return self._send(e.status, {'error': str(e), 'sql': q.sql})
                except sqlite3.Error as e:
                    return self._send(400, {'error': friendly_error(e), 'sql': q.sql})
                headers = {}
                token = out.pop('_set_cookie', None)
                if token:
                    headers['Set-Cookie'] = '%s=%s; HttpOnly; SameSite=Strict; Path=/' % (COOKIE, token)
                if out.pop('_clear_cookie', None):
                    c = SimpleCookie(self.headers.get('Cookie') or '')
                    if COOKIE in c:
                        SESSIONS.pop(c[COOKIE].value, None)
                    headers['Set-Cookie'] = '%s=; Max-Age=0; Path=/' % COOKIE
                out['sql'] = q.sql
                return self._send(200, out, headers)
        self._send(404, {'error': 'Unknown address %s' % url.path})

    def _static(self):
        path = unquote(urlparse(self.path).path)
        rel = 'index.html' if path in ('/', '/index.html') else path.lstrip('/')
        full = os.path.normpath(os.path.join(STATIC, rel))
        if not full.startswith(STATIC) or not os.path.isfile(full):
            full = os.path.join(STATIC, 'index.html')
        with open(full, 'rb') as f:
            data = f.read()
        self.send_response(200)
        self.send_header('Content-Type', (mimetypes.guess_type(full)[0] or 'application/octet-stream') + '; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith('/api/'):
            return self._api('GET')
        self._static()

    def do_POST(self):
        if self.path.startswith('/api/'):
            return self._api('POST')
        self._send(404, {'error': 'Not found'})


def serve(port=8000, host='127.0.0.1'):
    if init.ensure_database():
        print('First run: database created.')
    httpd = HTTPServer((host, port), Handler)
    print('CAAMS web is running at http://%s:%d  (Ctrl+C to stop)' % (host, port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        db.close()
        print('\nStopped.')
