# ============================================================================
#  MODULE 13 : DATABASE ADMINISTRATION
#  ER diagram, data dictionary, table browser, audit log, CSV export,
#  backup (VACUUM INTO), integrity checks, statistics, reset.
# ============================================================================
import csv
import io
import os
from datetime import datetime, timezone

from .. import session
from ..db import connection as db
from ..db import init
from ..db.auth import hash_password, verify_password
from ..ui import term as ui
from ..ui.menu import run_menu

ER_DIAGRAM = r"""
                                ┌─────────────────┐
             ┌──── works_in ───►│   DEPARTMENT    │◄─── offered_by ───┐
             │       N:1        │ PK dept_id      │        N:1        │
             │                  │    dept_name (U)│                   │
             │                  └────────▲────────┘                   │
             │                           │ belongs_to N:1             │
   ┌─────────┴───────┐          ┌────────┴────────┐          ┌────────┴────────┐
   │     FACULTY     │          │     STUDENT     │          │     SUBJECT     │
   │ PK faculty_id   │          │ PK roll_no      │          │ PK subject_id   │
   │    name, salary │          │ (first, last)   │          │    credits, sem │
   │    designation  │          │ dob ⇒ {age}     │          │    subject_type │
   └──┬───────────┬──┘          │ {phones}        │          └──┬──────────┬───┘
      │           │             └──┬───────────┬──┘             │          │
      │           └──────── ◇ TEACHES ◇ ───────┼────────────────┘          │
      │                   M:N (one per year)   │                           │
      │                            │           └──── ◇ ENROLLMENT ◇ ───────┘
      │ conducts 1:N               │ marked 1:N         M:N   │ 1:N
   ┌──▼──────────────┐  has 1:N ┌──▼──────────────┐  ┌────────▼────────┐
   │  CLASS_SESSION  ├─────────►│   ATTENDANCE    │  │   EXAM_RESULT   │
   │ PK session_id   │          │ PK(session_id,  │  │ PK(roll_no,     │
   │    date, topic  │          │    roll_no)     │  │  subject, exam) │
   │ FK subject_id   │          │    status P/A   │  │ marks (NULL ok) │
   └─────────────────┘          └─────────────────┘  └─────────────────┘
   Also: STUDENT_PHONE (multivalued {phones}), LEAVE_REQUEST (N:1 student, reviewed_by → faculty),
         DEFAULTER_NOTICE (FK → enrollment), APP_USER (1:1 faculty), AUDIT_LOG
   Legend: PK primary key · (U) unique · {x} derived / multivalued · ◇ relationship set
"""


def show_er():
    print(ui.c.cyan(ER_DIAGRAM))
    ui.section('Relationship cardinalities')
    ui.table([
        {'relationship': 'student belongs_to department', 'type': 'N : 1', 'implemented_by': 'student.dept_id FK'},
        {'relationship': 'faculty works_in department', 'type': 'N : 1', 'implemented_by': 'faculty.dept_id FK'},
        {'relationship': 'subject offered_by department', 'type': 'N : 1', 'implemented_by': 'subject.dept_id FK'},
        {'relationship': 'faculty teaches subject', 'type': 'M : N (1 per year)', 'implemented_by': 'teaches table'},
        {'relationship': 'student enrolls in subject', 'type': 'M : N', 'implemented_by': 'enrollment table'},
        {'relationship': 'session has attendance', 'type': '1 : N', 'implemented_by': 'attendance.session_id FK'},
        {'relationship': 'student has phones', 'type': 'multivalued', 'implemented_by': 'student_phone table'},
        {'relationship': 'enrollment has results', 'type': '1 : N', 'implemented_by': 'composite FK (roll_no, subject_id)'},
    ])


def objects():
    return db.all_("""SELECT name, type FROM sqlite_master
                       WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name""")


def _render_obj(o):
    return '%s %s' % (ui.pad_end(o['name'], 22), ui.c.gray(o['type']))


def data_dictionary():
    t = ui.pick('Table / view', objects(), _render_obj)
    if not t:
        return
    ui.print_sql(db.get('SELECT sql FROM sqlite_master WHERE name = ?', t['name'])['sql'])
    ui.table(db.all_('SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info(?)', t['name']), title='Columns')
    fks = db.all_('SELECT "from", "table", "to", on_update, on_delete FROM pragma_foreign_key_list(?)', t['name'])
    if fks:
        ui.table(fks, title='Foreign keys')
    idx = db.all_('SELECT name, "unique", origin FROM pragma_index_list(?)', t['name'])
    if idx:
        ui.table(idx, title='Indexes  (origin: pk = primary key, u = unique, c = CREATE INDEX)')
    trg = db.all_("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?", t['name'])
    if trg:
        ui.table(trg, title='Triggers')


def browse():
    t = ui.pick('Table / view', objects(), _render_obj)
    if not t:
        return
    total = db.get('SELECT COUNT(*) AS n FROM "%s"' % t['name'])['n']
    offset = 0
    while True:
        ui.table(db.all_('SELECT * FROM "%s" LIMIT 20 OFFSET ?' % t['name'], offset),
                 title='%s  rows %d-%d of %d' % (t['name'], offset + 1, min(offset + 20, total), total))
        if offset + 20 >= total:
            break
        if not ui.confirm('Next page?', True):
            break
        offset += 20


def audit_log():
    ui.table(db.all_('SELECT * FROM audit_log ORDER BY log_id DESC LIMIT 40'), title='Audit trail (written only by triggers)', max_width=60)


def to_csv(rows):
    if not rows:
        return ''
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator='\n')
    cols = list(rows[0].keys())
    w.writerow(cols)
    for r in rows:
        w.writerow(['' if r[c] is None else ui.num_str(r[c]) for c in cols])
    return buf.getvalue()


def _utc_now():
    return datetime.now(timezone.utc)


def export_csv():
    t = ui.pick('Export which table / view?', objects(), _render_obj)
    if not t:
        return
    out_dir = os.path.join(db.ROOT, 'exports')
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, '%s_%s.csv' % (t['name'], _utc_now().strftime('%Y-%m-%d')))
    rows = db.all_('SELECT * FROM "%s"' % t['name'])
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(to_csv(rows))
    ui.success('%d rows written to %s' % (len(rows), os.path.relpath(path, db.ROOT)))


def backup():
    out_dir = os.path.join(db.ROOT, 'backups')
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, 'college_%s.db' % _utc_now().strftime('%Y-%m-%d-%H-%M-%S'))
    db.run('VACUUM INTO ?', path)  # consistent snapshot even while the DB is open
    ui.success('Backup created: %s (%.1f KB)' % (os.path.relpath(path, db.ROOT), os.path.getsize(path) / 1024))
    ui.note('Restore = copy the backup over data/college.db while the app is closed.')


def stats():
    import sqlite3
    tables = db.all_("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    rows = [{'table': t['name'], 'rows': db.get('SELECT COUNT(*) AS n FROM "%s"' % t['name'])['n']} for t in tables]
    ui.table(rows, title='Row counts')
    p = db.get("""SELECT (SELECT page_count FROM pragma_page_count) AS pages, (SELECT page_size FROM pragma_page_size) AS page_size,
                         (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index') AS indexes,
                         (SELECT COUNT(*) FROM sqlite_master WHERE type = 'view') AS views,
                         (SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger') AS triggers,
                         sqlite_version() AS sqlite_version""")
    ui.box('Storage & catalog', [
        'File        : %s  (%.1f KB)' % (os.path.relpath(db.DB_PATH, db.ROOT), p['pages'] * p['page_size'] / 1024),
        'Pages       : %d pages × %d bytes (every B-tree node = 1 page)' % (p['pages'], p['page_size']),
        'Objects     : %d tables, %d views, %d indexes, %d triggers' % (len(rows), p['views'], p['indexes'], p['triggers']),
        'Engine      : SQLite %s via Python sqlite3 (module %s)' % (p['sqlite_version'], sqlite3.version),
    ])


def integrity():
    ui.table(db.all_('PRAGMA integrity_check'), title='PRAGMA integrity_check (B-tree structure, page links, index consistency)')
    fk = db.all_('PRAGMA foreign_key_check')
    if fk:
        ui.table(fk, title='Foreign key violations')
    else:
        ui.success('PRAGMA foreign_key_check → no referential-integrity violations.')


def change_password():
    u = db.get('SELECT * FROM app_user WHERE username = ?', session.user['username'])
    old = ui.ask_text('Current password', required=True)
    if not verify_password(old, u['password_hash'], u['salt']):
        return ui.error('Wrong password.')
    nxt = ui.ask_text('New password (min 6 chars)', required=True, validate=lambda v: None if len(v) >= 6 else 'Too short')
    hash_, salt = hash_password(nxt)
    db.run('UPDATE app_user SET password_hash = ?, salt = ? WHERE username = ?', hash_, salt, u['username'])
    ui.success('Password changed (stored as salted PBKDF2-SHA256 hash).')


def users():
    ui.table(db.all_("""SELECT u.username, u.role, f.name AS faculty, u.last_login, substr(u.password_hash, 1, 16) || '…' AS hash_prefix
                          FROM app_user u LEFT JOIN faculty f ON f.faculty_id = u.faculty_id ORDER BY u.role, u.username"""),
             title='Login accounts (passwords are hashed)')


def reset():
    ui.warn('This deletes data/college.db and rebuilds it from sql/*.sql + generated data.')
    if not ui.confirm('Reset the whole database?'):
        return
    init.reset_database()
    ui.success('Database rebuilt from scratch. Log in again if your password was changed.')


def menu():
    run_menu('DATABASE ADMINISTRATION', 'catalog · ER diagram · backup · integrity', [
        {'label': 'ER diagram & cardinalities', 'hint': 'E-R model', 'action': show_er},
        {'label': 'Data dictionary (schema of any table)', 'hint': 'sqlite_master + pragmas', 'action': data_dictionary},
        {'label': 'Browse table / view rows', 'hint': 'LIMIT / OFFSET paging', 'action': browse},
        {'label': 'Audit log', 'hint': 'trigger-generated', 'action': audit_log},
        {'label': 'Export table to CSV', 'hint': 'output to exports/', 'action': export_csv},
        {'label': 'Backup database', 'hint': 'VACUUM INTO', 'action': backup},
        {'label': 'Storage statistics', 'hint': 'pages, objects', 'action': stats},
        {'label': 'Integrity check', 'hint': 'integrity + FK check', 'action': integrity},
        {'label': 'Change my password', 'hint': 'PBKDF2 hash', 'action': change_password},
        {'label': 'Login accounts', 'hint': 'app_user', 'action': users, 'admin_only': True},
        {'label': 'Reset database', 'hint': 'rebuild everything', 'action': reset, 'admin_only': True},
    ])
