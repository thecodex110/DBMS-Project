
import os
import sqlite3
from collections import namedtuple

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SQL_DIR = os.path.join(ROOT, 'sql')
DB_PATH = os.environ.get('CAAMS_DB') or os.path.join(ROOT, 'data', 'college.db')

Result = namedtuple('Result', ['changes', 'last_insert_rowid'])

_db = None


def dict_factory(cursor, row):
    return {d[0]: v for d, v in zip(cursor.description, row)}


def connect(path=DB_PATH, timeout=5.0):
    # isolation_level=None -> autocommit mode: WE decide when BEGIN / COMMIT happen
    conn = sqlite3.connect(path, timeout=timeout, isolation_level=None)
    conn.row_factory = dict_factory
    return conn


def open_():
    global _db
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    _db = connect(DB_PATH)
    # SQLite keeps foreign-key enforcement OFF by default -> switch it on per connection
    _db.execute('PRAGMA foreign_keys = ON')
    return _db


def get_db():
    return _db or open_()


def all_(sql, *params):
    return get_db().execute(sql, params).fetchall()


def get(sql, *params):
    return get_db().execute(sql, params).fetchone()


def run(sql, *params):
    cur = get_db().execute(sql, params)
    return Result(max(cur.rowcount, 0), cur.lastrowid)


def split_statements(script):
    """Split a script into complete statements (trigger bodies with ';' stay whole)."""
    out, buf = [], ''
    for piece in script.split(';')[:-1]:
        buf += piece + ';'
        if sqlite3.complete_statement(buf):
            out.append(buf.strip())
            buf = ''
    return out


def exec_(sql, conn=None):

    conn = conn or get_db()
    for stmt in split_statements(sql):
        conn.execute(stmt)


def in_transaction():
    return get_db().in_transaction


def transaction(fn):
    d = get_db()
    d.execute('BEGIN')
    try:
        result = fn()
        d.execute('COMMIT')
        return result
    except BaseException:
        d.execute('ROLLBACK')
        raise


def run_sql_file(file_name):
    with open(os.path.join(SQL_DIR, file_name), encoding='utf-8') as f:
        exec_(f.read())


def is_initialized():
    return get("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'student'") is not None


def close():
    global _db
    if _db is not None:
        _db.close()
        _db = None


def delete_database_files():
    close()
    for suffix in ('', '-journal', '-wal', '-shm'):
        try:
            os.remove(DB_PATH + suffix)
        except FileNotFoundError:
            pass
