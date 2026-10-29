# ============================================================================
#  LAB 8 : RELATIONAL ALGEBRA  (Unit 3)
#  Every operator is implemented HERE in Python on tuples loaded from the
#  database, then the equivalent SQL is executed and the two results are
#  compared -> proves that SQL is built on relational algebra.
# ============================================================================
import math
import re

from ..db import connection as db
from ..ui import term as ui
from ..ui.menu import run_menu


# ---------- relation helpers:  relation = {'name', 'cols': [...], 'rows': [{}]} --
def load(name, sql=None):
    rows = [dict(r) for r in db.all_(sql or 'SELECT * FROM %s' % name)]
    return {'name': name, 'cols': list(rows[0].keys()) if rows else [], 'rows': rows}


def key(row, cols):
    return tuple(row.get(c) for c in cols)


def distinct(rows, cols):
    seen, out = set(), []
    for r in rows:
        k = key(r, cols)
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def _round2(v):
    return math.floor(v * 100 + 0.5) / 100


class RA:
    @staticmethod
    def select(r, pred):
        return dict(r, rows=[t for t in r['rows'] if pred(t)])

    @staticmethod
    def project(r, cols):
        return {'name': r['name'], 'cols': cols, 'rows': distinct([{c: t.get(c) for c in cols} for t in r['rows']], cols)}

    @staticmethod
    def rename(r, new_name, mapping=None):
        mapping = mapping or {}
        cols = [mapping.get(c) or '%s.%s' % (new_name, c.split('.')[-1]) for c in r['cols']]
        return {'name': new_name, 'cols': cols, 'rows': [{cols[i]: t.get(c) for i, c in enumerate(r['cols'])} for t in r['rows']]}

    @staticmethod
    def union(a, b):
        return {'name': 'union', 'cols': a['cols'], 'rows': distinct(a['rows'] + b['rows'], a['cols'])}

    @staticmethod
    def intersect(a, b):
        kb = {key(t, b['cols']) for t in b['rows']}
        return {'name': 'intersect', 'cols': a['cols'], 'rows': [t for t in a['rows'] if key(t, a['cols']) in kb]}

    @staticmethod
    def minus(a, b):
        kb = {key(t, b['cols']) for t in b['rows']}
        return {'name': 'minus', 'cols': a['cols'], 'rows': [t for t in a['rows'] if key(t, a['cols']) not in kb]}

    @staticmethod
    def product(a, b):
        pa, pb = RA.rename(a, a['name']), RA.rename(b, b['name'])
        return {'name': '%s×%s' % (a['name'], b['name']), 'cols': pa['cols'] + pb['cols'],
                'rows': [dict(x, **y) for x in pa['rows'] for y in pb['rows']]}

    @staticmethod
    def natural_join(a, b):
        common = [c for c in a['cols'] if c in b['cols']]
        cols = a['cols'] + [c for c in b['cols'] if c not in common]
        rows = [dict(y, **x) for x in a['rows'] for y in b['rows'] if all(x[c] == y[c] for c in common)]
        return {'name': '%s⋈%s' % (a['name'], b['name']), 'cols': cols, 'common': common, 'rows': rows}

    @staticmethod
    def theta_join(a, b, theta):
        return RA.select(RA.product(a, b), theta)

    @staticmethod
    def left_outer_join(a, b):
        nj = RA.natural_join(a, b)
        extra = [c for c in b['cols'] if c not in a['cols']]
        matched = {key(t, a['cols']) for t in nj['rows']}
        padded = [dict(t, **{c: None for c in extra}) for t in a['rows'] if key(t, a['cols']) not in matched]
        return dict(nj, name='%s⟕%s' % (a['name'], b['name']), rows=nj['rows'] + padded)

    @staticmethod
    def divide(r, s):
        """r ÷ s : tuples t over (R - S) such that for EVERY u in s, (t,u) is in r"""
        rest_cols = [c for c in r['cols'] if c not in s['cols']]
        have = {key(t, r['cols']) for t in r['rows']}
        cand = RA.project(r, rest_cols)
        return {'name': 'quotient', 'cols': rest_cols,
                'rows': [t for t in cand['rows'] if all(key(dict(t, **u), r['cols']) in have for u in s['rows'])]}

    @staticmethod
    def aggregate(r, group_cols, aggs):
        """grouping attrs  𝒢  aggregate functions"""
        groups = {}
        for t in r['rows']:
            groups.setdefault(key(t, group_cols), []).append(t)
        fns = {
            'count': len,
            'sum': sum,
            'avg': lambda v: _round2(sum(v) / len(v)) if v else None,
            'min': lambda v: min(v) if v else None,
            'max': lambda v: max(v) if v else None,
        }
        cols = group_cols + ['%s(%s)' % (f, c) for f, c in aggs]
        rows = []
        for g in groups.values():
            row = {c: g[0][c] for c in group_cols}
            for f, c in aggs:
                row['%s(%s)' % (f, c)] = fns[f]([t[c] for t in g if t[c] is not None])
            rows.append(row)
        return {'name': 'aggregate', 'cols': cols, 'rows': rows}


def show(expr, rel, sql=None, limit=15):
    print('\n  ' + ui.c.bgMagenta(' RA ') + ' ' + ui.c.bold(ui.c.magenta(expr)))
    ui.table(rel['rows'], columns=rel['cols'], limit=limit)
    if sql:
        print('  ' + ui.c.bgBlue(' SQL ') + ' equivalent:')
        ui.print_sql(sql)
        n = len(db.all_(sql))
        if n == len(rel['rows']):
            ui.success('SQL returned the same %d tuple(s) as the algebra expression.' % n)
        else:
            ui.warn('SQL returned %d rows vs %d tuples (SQL keeps duplicates unless DISTINCT).' % (n, len(rel['rows'])))


# ------------------------------------------------------------ predicates --
def _coerce(v, val):
    """Compare like SQL / JavaScript would: '3' and 3 are equal, NULL behaves as 0 in < >."""
    if v is None:
        return 0, val
    if isinstance(val, (int, float)) and isinstance(v, str):
        try:
            return float(v), val
        except ValueError:
            return v, str(val)
    if isinstance(v, (int, float)) and isinstance(val, str):
        return str(v), val
    return v, val


def _compare(v, op, val):
    if op in ('=', '!='):
        same = v is not None and _coerce(v, val)[0] == _coerce(v, val)[1]
        return same if op == '=' else not same
    a, b = _coerce(v, val)
    if op == '<':
        return a < b
    if op == '>':
        return a > b
    if op == '<=':
        return a <= b
    return a >= b


def parse_predicate(text):
    parts = []
    for p in re.split(r'\s+and\s+', text, flags=re.I):
        m = re.match(r"^([\w.]+)\s*(=|!=|<>|<=|>=|<|>)\s*'?([^']*?)'?$", p.strip())
        if not m:
            raise ValueError('Cannot parse condition "%s". Use: column op value  (e.g. year = 3 AND dept_id = CS)' % p)
        raw = m.group(3)
        try:
            val = float(raw) if raw.strip() != '' else raw
            val = int(val) if isinstance(val, float) and val == int(val) else val
        except ValueError:
            val = raw
        parts.append({'col': m.group(1), 'op': '!=' if m.group(2) == '<>' else m.group(2), 'val': val})

    def test(t):
        return all(_compare(t.get(p['col']), p['op'], p['val']) for p in parts)

    def lit(v, quote):
        return str(v) if isinstance(v, (int, float)) else "'%s'" % (v.replace("'", "''") if quote else v)
    sql = ' AND '.join('%s %s %s' % (p['col'], '<>' if p['op'] == '!=' else p['op'], lit(p['val'], True)) for p in parts)
    ra = ' ∧ '.join('%s%s%s' % (p['col'], '≠' if p['op'] == '!=' else p['op'], lit(p['val'], False)) for p in parts)
    return {'test': test, 'sql': sql, 'ra': ra, 'cols': [p['col'] for p in parts]}


TABLES = ['student', 'faculty', 'subject', 'department', 'exam_result', 'leave_request']


def selection():
    t = ui.pick('Relation', TABLES)
    if not t:
        return
    r = load(t)
    ui.note('Attributes: %s' % ', '.join(r['cols']))
    default = "year = 3 AND dept_id = 'CS'" if t == 'student' else 'salary > 100000' if t == 'faculty' else ''
    cond = ui.ask_text('Condition', default=default, required=True)
    p = parse_predicate(cond)
    for c in p['cols']:
        if c not in r['cols']:
            raise ValueError('Unknown attribute %s' % c)
    show('σ %s (%s)' % (p['ra'], t), RA.select(r, p['test']), 'SELECT * FROM %s WHERE %s;' % (t, p['sql']))


def projection():
    t = ui.pick('Relation', TABLES)
    if not t:
        return
    r = load(t)
    ui.note('Attributes: %s' % ', '.join(r['cols']))
    cols = [s.strip() for s in ui.ask_text('Attributes to keep (comma separated)',
                                           default='city' if t == 'student' else ','.join(r['cols'][1:3])).split(',') if s.strip()]
    for c in cols:
        if c not in r['cols']:
            raise ValueError('Unknown attribute %s' % c)
    show('π %s (%s)' % (', '.join(cols), t), RA.project(r, cols), 'SELECT DISTINCT %s FROM %s;' % (', '.join(cols), t))
    ui.note('%d tuples in → %d out: projection removes duplicates (it is a SET operation).' % (len(r['rows']), len(RA.project(r, cols)['rows'])))


def set_ops():
    A = load('A', "SELECT roll_no FROM student WHERE dept_id = 'CS' AND year = 3")
    B = load('B', 'SELECT DISTINCT roll_no FROM v_defaulters')
    ui.info("A = π roll_no (σ dept_id='CS' ∧ year=3 (student))      B = π roll_no (defaulters)")
    ui.note('Both have the same schema (roll_no) → they are UNION-COMPATIBLE.')
    show('A ∪ B   (CS-3rd-year OR defaulter)', RA.union(A, B),
         "SELECT roll_no FROM student WHERE dept_id = 'CS' AND year = 3\nUNION\nSELECT roll_no FROM v_defaulters;", 8)
    show('A ∩ B   (CS-3rd-year AND defaulter)', RA.intersect(A, B),
         "SELECT roll_no FROM student WHERE dept_id = 'CS' AND year = 3\nINTERSECT\nSELECT roll_no FROM v_defaulters;")
    show('A − B   (CS-3rd-year but NOT defaulter)', RA.minus(A, B),
         "SELECT roll_no FROM student WHERE dept_id = 'CS' AND year = 3\nEXCEPT\nSELECT roll_no FROM v_defaulters;")
    ui.note('Identity:  A ∩ B = A − (A − B)')


def product():
    d = load('department', 'SELECT dept_id, dept_name FROM department')
    s = load('subject', 'SELECT subject_id, dept_id FROM subject WHERE semester = 5')
    p = RA.product(d, s)
    ui.info('|department| = %d,  |subject| = %d  ⇒  |department × subject| = %d' % (len(d['rows']), len(s['rows']), len(p['rows'])))
    show('department × subject', p, 'SELECT * FROM department CROSS JOIN subject WHERE subject.semester = 5;', 6)
    eqj = RA.select(p, lambda t: t['department.dept_id'] == t['subject.dept_id'])
    show('σ department.dept_id = subject.dept_id (department × subject)   ← this IS a join', eqj,
         'SELECT * FROM department d JOIN subject s ON d.dept_id = s.dept_id WHERE s.semester = 5;', 10)


def joins():
    f = load('faculty', 'SELECT faculty_id, name, dept_id FROM faculty')
    d = load('department', 'SELECT dept_id, dept_name, building FROM department')
    nj = RA.natural_join(f, d)
    ui.info('Common attribute(s): %s → matched automatically' % ', '.join(nj['common']))
    show('faculty ⋈ department', nj, 'SELECT * FROM faculty NATURAL JOIN department;', 10)

    t = load('teaches', 'SELECT faculty_id, subject_id FROM teaches')
    loj = RA.left_outer_join(f, t)
    show('faculty ⟕ teaches   (left outer join - faculty without subjects get NULL)', loj,
         'SELECT f.faculty_id, f.name, f.dept_id, t.subject_id FROM faculty f LEFT JOIN teaches t ON t.faculty_id = f.faculty_id;', 20)
    ui.note('NULL subject_id → that faculty teaches nothing. A plain ⋈ would silently drop this tuple.')


def theta_rename():
    f = load('faculty', 'SELECT faculty_id, name, dept_id, salary FROM faculty')
    f1 = RA.rename(f, 'F1')
    f2 = RA.rename(f, 'F2')
    ui.info('Self-join needs RENAME:  ρ F1(faculty),  ρ F2(faculty)')
    joined = RA.theta_join(f1, f2, lambda t: t['F1.dept_id'] == t['F2.dept_id'] and t['F1.salary'] < t['F2.salary'])
    res = RA.project(joined, ['F1.name', 'F1.salary', 'F2.name', 'F2.salary', 'F1.dept_id'])
    show('π F1.name, F2.name (ρF1(faculty) ⋈ F1.dept_id = F2.dept_id ∧ F1.salary < F2.salary  ρF2(faculty))', res,
         'SELECT F1.name, F1.salary, F2.name, F2.salary, F1.dept_id\nFROM faculty F1 JOIN faculty F2\n  ON F1.dept_id = F2.dept_id AND F1.salary < F2.salary;')


def division():
    r = load('r', """SELECT DISTINCT a.roll_no, a.session_id FROM attendance a
                       JOIN class_session cs ON cs.session_id = a.session_id
                      WHERE cs.subject_id = 'CS501' AND a.status = 'P'""")
    s = load('s', "SELECT session_id FROM class_session WHERE subject_id = 'CS501'")
    ui.info('r(roll_no, session_id) = present-records in DBMS (%d tuples)' % len(r['rows']))
    ui.info('s(session_id)          = all DBMS sessions (%d tuples)' % len(s['rows']))
    q = RA.divide(r, s)
    show('r ÷ s   = students present in EVERY DBMS lecture', q,
         """SELECT DISTINCT e.roll_no FROM enrollment e
WHERE e.subject_id = 'CS501'
  AND NOT EXISTS (SELECT cs.session_id FROM class_session cs WHERE cs.subject_id = 'CS501'
                  AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.session_id = cs.session_id
                                  AND a.roll_no = e.roll_no AND a.status = 'P'));""")
    ui.note('SQL has no ÷ operator → we write it as "NOT EXISTS ... NOT EXISTS" (for-all = not-exists-not).')
    if not q['rows']:
        ui.note('Empty result is valid: nobody attended every single lecture.')
    r2 = load('r2', "SELECT DISTINCT roll_no, exam_type FROM exam_result WHERE subject_id = 'CS501' AND marks_obtained IS NOT NULL")
    s2 = load('s2', 'SELECT DISTINCT exam_type FROM exam_result')
    show('π roll_no,exam_type(σ subject=CS501 ∧ marks≠NULL (exam_result)) ÷ π exam_type(exam_result)  = appeared in ALL exams', RA.divide(r2, s2),
         """SELECT roll_no FROM exam_result WHERE subject_id = 'CS501' AND marks_obtained IS NOT NULL
GROUP BY roll_no HAVING COUNT(DISTINCT exam_type) = (SELECT COUNT(DISTINCT exam_type) FROM exam_result);""")


def aggregation():
    f = load('faculty', 'SELECT faculty_id, dept_id, salary FROM faculty')
    show('dept_id 𝒢 count(faculty_id), avg(salary), max(salary) (faculty)',
         RA.aggregate(f, ['dept_id'], [('count', 'faculty_id'), ('avg', 'salary'), ('max', 'salary')]),
         'SELECT dept_id, COUNT(faculty_id), ROUND(AVG(salary), 2), MAX(salary) FROM faculty GROUP BY dept_id;')
    gp = {'name': 'gp', 'cols': ['name', 'annual_salary'],
          'rows': [{'name': t['name'], 'annual_salary': t['salary'] * 12} for t in load('faculty')['rows']]}
    show('Generalised projection:  π name, salary*12 → annual_salary (faculty)', gp, 'SELECT name, salary * 12 AS annual_salary FROM faculty;')
    e = load('exam_result', "SELECT roll_no, marks_obtained FROM exam_result WHERE subject_id = 'CS501' AND exam_type = 'MidSem'")
    show('𝒢 count(marks_obtained), avg(marks_obtained) (σ CS501 MidSem)  - NULLs are ignored',
         RA.aggregate(e, [], [('count', 'marks_obtained'), ('avg', 'marks_obtained')]),
         "SELECT COUNT(marks_obtained), ROUND(AVG(marks_obtained), 2) FROM exam_result WHERE subject_id = 'CS501' AND exam_type = 'MidSem';")


def modification():
    d = load('department')
    ui.info('Database modification in relational algebra is expressed with assignment (←). Shown on an in-memory copy.')
    ins = {'name': 'E', 'cols': d['cols'], 'rows': [{'dept_id': 'CIVIL', 'dept_name': 'Civil Engineering', 'building': 'E-Block', 'established_year': 2005}]}
    d = RA.union(d, ins)
    show("INSERT:  department ← department ∪ {('CIVIL', 'Civil Engineering', 'E-Block', 2005)}", d)
    d = RA.minus(d, RA.select(d, lambda t: t['established_year'] < 1995))
    show('DELETE:  department ← department − σ established_year < 1995 (department)', d)
    d = dict(d, rows=[dict(t, building=t['building'].replace('Block', 'Wing', 1)) for t in d['rows']])
    show("UPDATE:  department ← π dept_id, dept_name, replace(building,'Block','Wing'), established_year (department)", d)
    ui.note('SQL equivalents: INSERT INTO ... VALUES / DELETE FROM ... WHERE / UPDATE ... SET (see Lab Assignment 3).')


def nulls():
    ui.info('Three-valued logic: comparisons with NULL give UNKNOWN, and σ keeps only TRUE tuples.')
    ui.table(db.all_("""SELECT NULL = NULL AS "NULL = NULL", NULL IS NULL AS "NULL IS NULL", 5 + NULL AS "5 + NULL",
                               (NULL AND 0) AS "unknown AND false", (NULL OR 1) AS "unknown OR true", COALESCE(NULL, 'x') AS "COALESCE(NULL,'x')\""""))
    ui.table(db.all_("""SELECT (SELECT COUNT(*) FROM exam_result WHERE marks_obtained > 10)          AS "marks > 10",
                               (SELECT COUNT(*) FROM exam_result WHERE NOT (marks_obtained > 10))    AS "NOT (marks > 10)",
                               (SELECT COUNT(*) FROM exam_result WHERE marks_obtained IS NULL)       AS "marks IS NULL",
                               (SELECT COUNT(*) FROM exam_result)                                     AS "total\""""),
             title='Why the counts do not add up')
    ui.note('marks > 10  +  NOT(marks > 10)  ≠  total, because NULL rows are UNKNOWN in both.')


def menu():
    run_menu('RELATIONAL ALGEBRA LAB', 'operators implemented in Python · verified against SQL', [
        {'label': 'σ  Selection (your own condition)', 'hint': 'σ p (r)', 'action': selection},
        {'label': 'π  Projection (duplicate removal)', 'hint': 'π A (r)', 'action': projection},
        {'label': '∪ ∩ −  Set operations', 'hint': 'union-compatible', 'action': set_ops},
        {'label': '×  Cartesian product → join', 'hint': 'r × s', 'action': product},
        {'label': '⋈ ⟕  Natural & outer joins', 'hint': 'r ⋈ s', 'action': joins},
        {'label': 'ρ  Rename + θ-join (self join)', 'hint': 'ρ x (E)', 'action': theta_rename},
        {'label': '÷  Division ("for all" queries)', 'hint': 'r ÷ s', 'action': division},
        {'label': '𝒢  Aggregation & generalised projection', 'hint': 'extended RA', 'action': aggregation},
        {'label': '←  Modification of the database', 'hint': 'insert / delete / update', 'action': modification},
        {'label': '∅  NULL values & 3-valued logic', 'hint': 'unknown', 'action': nulls},
    ])
