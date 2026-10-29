# ============================================================================
#  LAB 0 : DBMS CONCEPTS TOUR (Unit 1 - Introduction + self-study models)
#  Explains each concept USING this project's own database.
# ============================================================================
from ..db import connection as db
from ..ui import term as ui
from ..ui.menu import run_menu


def purpose():
    ui.box('Why a DBMS instead of plain files?', [
        'Problem with files            How CAAMS solves it with a DBMS',
        '─────────────────────────────  ─────────────────────────────────────────────',
        'Data redundancy/inconsistency  Normalised BCNF tables, name stored once',
        'Difficult data access          SQL: any question = one query',
        'Integrity problems             CHECK / NOT NULL / FK constraints in schema',
        'Atomicity problems             BEGIN … COMMIT / ROLLBACK',
        'Concurrent-access anomalies    Locking (serializable transactions)',
        'Security problems              Login + roles (admin / faculty, read-only SQL)',
        'Data isolation (many formats)  One catalog, one file, CSV export on demand',
    ])


def levels():
    page = db.get('SELECT (SELECT page_count FROM pragma_page_count) AS pages, (SELECT page_size FROM pragma_page_size) AS size')
    ui.box('Three levels of abstraction (view of data)', [
        '%s      v_student_profile, v_defaulters, v_result_sheet …' % ui.c.bold('VIEW level'),
        '                  (each user sees only what they need)',
        '%s   14 tables: student, faculty, subject, attendance …' % ui.c.bold('LOGICAL level'),
        '                  (what data is stored and the relationships)',
        '%s  data/college.db = %d pages × %d bytes, B-tree per table/index' % (ui.c.bold('PHYSICAL level'), page['pages'], page['size']),
        '                  (how data is stored)',
        '',
        'Physical data independence: we added 7 indexes without changing any query.',
        'Logical data independence : views hide schema changes from the app.',
    ])
    ui.section('Same data, three levels')
    ui.print_sql('SELECT * FROM v_student_profile LIMIT 2;   -- view level')
    ui.table(db.all_('SELECT roll_no, full_name, age, dept_name, phones FROM v_student_profile LIMIT 2'))
    ui.print_sql('SELECT * FROM student LIMIT 2;              -- logical level')
    ui.table(db.all_('SELECT roll_no, first_name, last_name, dob, dept_id FROM student LIMIT 2'))
    ui.print_sql("SELECT name, rootpage FROM sqlite_master WHERE tbl_name = 'student'; -- physical")
    ui.table(db.all_("SELECT type, name, rootpage AS btree_root_page FROM sqlite_master WHERE tbl_name = 'student'"))


def languages():
    rows = [
        {'language': 'DDL', 'meaning': 'Data Definition', 'example': 'CREATE TABLE / ALTER / DROP / CREATE INDEX', 'where_in_project': 'sql/01_schema.sql, 04_indexes.sql'},
        {'language': 'DML', 'meaning': 'Data Manipulation', 'example': 'SELECT / INSERT / UPDATE / DELETE', 'where_in_project': 'every module, sql/05_seed_base.sql'},
        {'language': 'TCL', 'meaning': 'Transaction Control', 'example': 'BEGIN / COMMIT / ROLLBACK / SAVEPOINT', 'where_in_project': 'connection.transaction(), Transactions lab'},
        {'language': 'DCL*', 'meaning': 'Data Control', 'example': 'GRANT / REVOKE', 'where_in_project': 'emulated by app_user roles (SQLite has no GRANT)'},
    ]
    ui.table(rows, max_width=50)
    ui.note('Procedural DML = how to get data (Python loops in Relational Algebra lab); Declarative DML = what data (SQL).')


def architecture():
    print(ui.c.cyan(r"""
   ┌─────────────────────────── USERS ───────────────────────────┐
   │  Faculty (menus)      Admin (menus + SQL console)   Student │
   └──────────────┬───────────────────────────────┬──────────────┘
                  │  application program          │ ad-hoc SQL
   ┌──────────────▼───────────────────────────────▼──────────────┐
   │ APPLICATION  main.py → caams/modules/*.py → caams/labs/*.py │
   └──────────────────────────────┬──────────────────────────────┘
                                  │  db.all_ / get / run / transaction
   ┌──────────────────────────────▼──────────────────────────────┐
   │ QUERY PROCESSOR (SQLite)                                    │
   │   DDL interpreter · DML compiler → query plan (EXPLAIN)     │
   │   query evaluation engine (VDBE byte-code)                  │
   ├─────────────────────────────────────────────────────────────┤
   │ STORAGE MANAGER                                             │
   │   authorization & integrity (constraints, triggers)         │
   │   transaction manager (locks, journal) · buffer (page cache)│
   │   file manager (pages)                                      │
   └──────────────────────────────┬──────────────────────────────┘
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ DISK:  data/college.db  = data files + indices + data       │
   │        dictionary (sqlite_master) + statistics (ANALYZE)    │
   └─────────────────────────────────────────────────────────────┘"""))
    ui.table(db.all_('SELECT tbl, idx, stat FROM sqlite_stat1 LIMIT 8'), title='Statistical data (sqlite_stat1, used by the optimiser)')


def db_types():
    ui.table([
        {'type': 'Relational', 'model': 'tables + keys', 'example': 'SQLite (this project), MySQL, PostgreSQL, Oracle'},
        {'type': 'Hierarchical', 'model': 'tree (parent-child)', 'example': 'IBM IMS, Windows registry, XML'},
        {'type': 'Network', 'model': 'graph of records + sets', 'example': 'IDMS, CODASYL DBTG (see next option)'},
        {'type': 'Object-oriented', 'model': 'objects, classes', 'example': 'db4o, ObjectDB'},
        {'type': 'Document (NoSQL)', 'model': 'JSON documents', 'example': 'MongoDB, Firestore'},
        {'type': 'Key-value', 'model': 'key → value', 'example': 'Redis, DynamoDB'},
        {'type': 'Column-family', 'model': 'wide columns', 'example': 'Cassandra, HBase'},
        {'type': 'Graph', 'model': 'nodes + edges', 'example': 'Neo4j'},
        {'type': 'Distributed / Cloud', 'model': 'data split over sites', 'example': 'Google Spanner, CockroachDB'},
        {'type': 'Embedded', 'model': 'library inside the app', 'example': 'SQLite (no server process!)'},
    ], max_width=50)


def network_model():
    print(ui.c.cyan(r"""
   NETWORK MODEL (CODASYL) view of part of our data   - records linked by pointers

     ┌────────────┐  owner        set: DEPT_STUDENTS       member  ┌───────────┐
     │ DEPARTMENT │ ──────────────────────────────────────────────► │  STUDENT  │
     │  CS        │                                                 │ 23CS001   │──┐
     └────────────┘                                                 └───────────┘  │ next
                                                                    ┌───────────┐  │
                                                                    │ 23CS002   │◄─┘
                                                                    └───────────┘
     M:N (student subject) needs a LINK record:
       STUDENT ──set S_ENR──► [ENROLL link] ◄──set SUB_ENR── SUBJECT

   Relational model replaces these physical pointers with VALUES (foreign keys):
       enrollment(roll_no → student, subject_id → subject)"""))
    ui.note('Navigational access (FIND NEXT …) vs declarative SQL - why the relational model won.')


def menu():
    run_menu('DBMS CONCEPTS TOUR', 'Unit 1 explained with this project', [
        {'label': 'Purpose of database systems', 'hint': 'file system vs DBMS', 'action': purpose},
        {'label': 'Views of data & data independence', 'hint': 'view / logical / physical', 'action': levels},
        {'label': 'Database languages', 'hint': 'DDL DML TCL DCL', 'action': languages},
        {'label': 'DBMS architecture & components', 'hint': 'query processor, storage mgr', 'action': architecture},
        {'label': 'Types of databases', 'hint': 'relational, NoSQL …', 'action': db_types},
        {'label': 'Network model', 'hint': 'self-study', 'action': network_model},
    ])
