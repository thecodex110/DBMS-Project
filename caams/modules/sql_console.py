# ============================================================================
#  MODULE 12 : INTERACTIVE SQL CONSOLE  (DDL / DML / DCL-like / queries)
#  Multi-line input ends with ';'. Dot-commands give quick catalog info.
# ============================================================================
import re
import time

from .. import session
from ..db import connection as db
from ..ui import term as ui
from ..ui.menu import friendly_error

HELP = [
    '.tables            list tables and views',
    '.schema <name>     show CREATE statement',
    '.desc <table>      column details (pragma table_info)',
    '.indexes [table]   list indexes',
    '.plan <query>      EXPLAIN QUERY PLAN for a query',
    '.begin / .commit / .rollback   manual transaction control',
    '.help              this help',
    '.exit              leave the console',
]


def run_sql(sql):
    started = time.perf_counter()
    is_query = re.match(r'^\s*(SELECT|WITH|PRAGMA|EXPLAIN|VALUES)\b', sql, re.I)
    if not session.is_admin() and not is_query:
        ui.warn('Faculty accounts have READ-ONLY console access (only SELECT / WITH / PRAGMA / EXPLAIN).')
        return
    if is_query:
        ui.table(db.all_(sql), limit=100)
    else:
        statements = len(db.split_statements(sql))
        if statements > 1:
            db.exec_(sql)
            ui.success('%d statements executed.' % statements)
        else:
            r = db.run(sql)
            ui.success('OK - %d row(s) affected%s.' % (r.changes, ', last rowid %d' % r.last_insert_rowid if r.last_insert_rowid else ''))
    ms = (time.perf_counter() - started) * 1000
    print(ui.c.gray('    (%.2f ms)' % ms))


def dot_command(line):
    parts = line.split()
    cmd, arg = parts[0], re.sub(r';$', '', ' '.join(parts[1:]))
    if cmd == '.help':
        for h in HELP:
            ui.note(h)
    elif cmd == '.tables':
        ui.table(db.all_("""SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view')
                             AND name NOT LIKE 'sqlite_%' ORDER BY type, name"""))
    elif cmd == '.schema':
        r = db.get('SELECT sql FROM sqlite_master WHERE name = ?', arg)
        ui.print_sql(r['sql']) if r and r['sql'] else ui.warn('No such object.')
    elif cmd == '.desc':
        ui.table(db.all_('SELECT cid, name, type, "notnull", dflt_value, pk FROM pragma_table_info(?)', arg))
    elif cmd == '.indexes':
        ui.table(db.all_("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND (? = '' OR tbl_name = ?) ORDER BY tbl_name", arg, arg))
    elif cmd == '.plan':
        ui.table(db.all_('EXPLAIN QUERY PLAN ' + arg), columns=['id', 'parent', 'detail'])
    elif cmd == '.begin':
        db.exec_('BEGIN;')
        ui.success('Transaction started - changes are pending until .commit')
    elif cmd == '.commit':
        db.exec_('COMMIT;')
        ui.success('Committed (durable).')
    elif cmd == '.rollback':
        db.exec_('ROLLBACK;')
        ui.success('Rolled back - all changes since .begin undone.')
    else:
        ui.error('Unknown command %s (try .help)' % cmd)


def console_loop():
    ui.header('SQL CONSOLE', 'Full access (admin)' if session.is_admin() else 'Read-only (faculty)')
    ui.info("Type SQL ending with ';'  ·  .help for commands  ·  .exit to leave")
    ui.note('Example:  SELECT dept_id, COUNT(*) FROM student GROUP BY dept_id;')
    buffer = ''
    while True:
        line = ui.ask(ui.c.gray('   ...> ') if buffer else ui.c.bCyan('  sql> '))
        if not buffer and line.startswith('.'):
            if line in ('.exit', '.quit'):
                break
            try:
                dot_command(line)
            except Exception as e:  # noqa: BLE001
                ui.error(friendly_error(e))
            continue
        buffer += ('\n' if buffer else '') + line
        if not buffer.strip().endswith(';'):
            continue
        sql = buffer.strip()
        buffer = ''
        try:
            run_sql(sql)
        except Exception as e:  # noqa: BLE001
            ui.error(friendly_error(e))
    if db.in_transaction():
        db.exec_('ROLLBACK;')
        ui.warn('Open transaction was rolled back on exit.')


menu = console_loop
