
import os
import sys
import traceback

from . import session
from .db import auth, init
from .db import connection as db
from .modules import (admin, attendance, defaulters, faculty, lab_assignments, reports, results,
                      sql_console, students)
from .ui import term as ui
from .ui.menu import run_menu


def login():
    ui.clear()
    print('\n   ' + ui.c.bold('CAAMS - College Academic & Attendance Management System'))
    print(ui.c.gray('   DBMS mini project (Python + SQLite)\n'))
    ui.note('Login: admin / admin@123   or   fac101 / fac101@123 (fac101 to fac110)')
    for attempt in range(1, 4):
        user = ui.ask('\n  %s: ' % ui.c.cyan('Username'))
        pw = ui.ask('  %s: ' % ui.c.cyan('Password'))
        u = auth.login(user, pw)
        if u:
            session.set_user(u)
            ui.success('Welcome, %s (%s)' % (u['name'], u['role']))
            return True
        ui.error('Invalid username or password (%d attempt(s) left)' % (3 - attempt))
    return False


def status_bar():
    s = db.get("""SELECT (SELECT COUNT(*) FROM student) AS st, (SELECT COUNT(*) FROM class_session) AS se,
                         (SELECT COUNT(DISTINCT roll_no) FROM v_defaulters) AS df,
                         (SELECT COUNT(*) FROM leave_request WHERE status = 'Pending') AS pl""")
    u = session.user
    print(ui.c.gray('   Logged in: %s (%s)  |  Students: %s  |  Sessions: %s  |  ' % (u['name'], u['role'], s['st'], s['se']))
          + ui.c.red('Defaulters: %s' % s['df']) + ui.c.gray('  |  ') + ui.c.yellow('Pending leaves: %s' % s['pl']))


def main_menu():
    run_menu('CAAMS - MAIN MENU', 'College Academic & Attendance Management System', [
        {'divider': 'APPLICATION'},
        {'label': 'Student management', 'hint': 'CRUD', 'action': students.menu},
        {'label': 'Faculty, subjects & departments', 'hint': 'master data', 'action': faculty.menu},
        {'label': 'Attendance', 'hint': 'take / view / correct', 'action': attendance.menu},
        {'label': 'Exams & results', 'hint': 'marks, grades, SGPA', 'action': results.menu},
        {'label': 'Defaulters & leaves', 'hint': '75% rule', 'action': defaulters.menu},
        {'label': 'Reports & analytics', 'hint': 'dashboard', 'action': reports.menu},
        {'divider': 'TOOLS'},
        {'label': 'SQL console', 'hint': 'run any SQL', 'action': sql_console.menu},
        {'label': 'Database administration', 'hint': 'ER, backup, export', 'action': admin.menu},
    ], banner=status_bar)


def run():
    try:
        if init.ensure_database():
            ui.success('First run: database created from sql/*.sql and sample data generated.')
            lab_assignments.export_sql()
        if login():
            main_menu()
    except (ui.InputClosed, KeyboardInterrupt):
        pass
    except Exception:  
        print(ui.c.red('\nFatal error: ' + traceback.format_exc()))
        return 1
    finally:
        print(ui.c.gray('\n  Exiting. Database closed.\n'))
        db.close()
    return 0


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if '--reset' in argv:
        init.reset_database()
        db.close()
        inside = os.path.abspath(db.DB_PATH).startswith(db.ROOT + os.sep)
        print('Database rebuilt: %s' % (os.path.relpath(db.DB_PATH, db.ROOT) if inside else db.DB_PATH))
        return 0
    if '--export-sql' in argv:
        print('Written', lab_assignments.export_sql())
        return 0
    if '--web' in argv:
        from .web.server import serve
        port = int(argv[argv.index('--port') + 1]) if '--port' in argv else 8000
        serve(port)
        return 0
    if '-h' in argv or '--help' in argv:
        print('usage: python3 main.py [--reset | --export-sql | --web [--port 8000]]')
        return 0
    return run()
