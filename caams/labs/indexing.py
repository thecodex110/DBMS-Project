# ============================================================================
#  LAB 10 : INDEXING & HASHING (Unit 5)
#  Visual B+ tree, static hashing, extendible (dynamic) hashing, bitmap
#  indices, plus REAL index experiments on SQLite (EXPLAIN QUERY PLAN +
#  benchmark on 200,000 rows).
# ============================================================================
import math
import re
import time

from ..db import connection as db
from ..ui import term as ui
from ..ui.menu import run_menu
from .algorithms.index_structures import BPlusTree, ExtendibleHash, StaticHash, bitmap_index, hash_key


def parse_keys(text):
    toks = [t for t in re.split(r'[\s,]+', text) if t]
    return [int(t) for t in toks] if all(re.match(r'^-?\d+$', t) for t in toks) else toks


def _keys(keys):
    return '|'.join(str(k) for k in keys)


def draw_tree(tree):
    levels = tree.levels()
    for i, lvl in enumerate(levels):
        leaf = i == len(levels) - 1
        paint = ui.c.green if leaf else ui.c.cyan
        nodes = [paint('[%s]' % _keys(keys)) for keys in lvl]
        label = 'root ' if i == 0 else 'leaf ' if leaf else 'L%d   ' % i
        print('    %s %s' % (ui.c.gray(label), (ui.c.gray(' → ') if leaf else '  ').join(nodes)))


def bplus():
    n = ui.ask_int('Order n (max pointers per node, 3-6)', min_=3, max_=6, default=4)
    src = ui.pick('Keys to insert', ['Type my own keys', 'Silberschatz example (instructor names)',
                                     'Roll numbers from the student table', 'Numbers 1..20 in random order'])
    if not src:
        return
    if src.startswith('Type'):
        keys = parse_keys(ui.ask_text('Keys (comma separated)', default='10, 20, 5, 6, 12, 30, 7, 17, 3, 25'))
    elif src.startswith('Silberschatz'):
        keys = ['Srinivasan', 'Wu', 'Mozart', 'Einstein', 'El Said', 'Gold', 'Katz', 'Califieri', 'Singh', 'Crick', 'Brandt', 'Kim']
    elif src.startswith('Roll'):
        keys = [r['roll_no'] for r in db.all_('SELECT roll_no FROM student ORDER BY random() LIMIT 14')]
    else:
        keys = [7, 14, 2, 19, 11, 4, 16, 1, 9, 20, 5, 13, 18, 3, 10, 6, 15, 8, 12, 17]
    tree = BPlusTree(n)
    ui.info('Order n = %d:  leaf holds ≤ %d keys,  internal node ≤ %d children,  every node (except root) ≥ half full' % (n, n - 1, n))
    for k in keys:
        tree.insert(k)
        print('\n  ' + ui.c.bYellow('insert %s' % k))
        for e in tree.events:
            ui.note(e)
        tree.events.clear()
        draw_tree(tree)
    ui.success('Final height = %d for %d keys (all leaves at the same depth → balanced).' % (tree.height(), len(keys)))
    while True:
        q = ui.ask_text('Search key, or range "lo..hi" (blank = done)', default='')
        if not q:
            break
        if '..' in q:
            lo, hi = (parse_keys(q.replace('..', ' ', 1)) + [None, None])[:2]
            r = tree.range(lo, hi)
            ui.info('Range [%s, %s] → %s   (walked %d leaf node(s) using next-leaf pointers)' % (
                lo, hi, ', '.join(map(str, r['keys'])) or '(none)', r['leaves_visited']))
        else:
            k = parse_keys(q)[0]
            r = tree.search(k)
            ui.info('Path: %s   %s   (%d node reads = height)' % (' → '.join(r['path']),
                                                                ui.c.green('FOUND') if r['found'] else ui.c.red('NOT FOUND'), len(r['path'])))


def static_hash():
    N = ui.ask_int('Number of buckets N', min_=2, max_=12, default=5)
    cap = ui.ask_int('Bucket capacity (records per page)', min_=1, max_=5, default=2)
    keys = parse_keys(ui.ask_text('Keys', default='15, 22, 7, 31, 40, 5, 12, 27, 33, 10, 20, 45'))
    h = StaticHash(N, cap)
    for k in keys:
        h.insert(k)
    ui.section('h(K) = K mod %d' % N)
    for e in h.events:
        ui.note(e)
    ui.section('Bucket layout (primary page → overflow chain)')
    for b, pages in enumerate(h.table):
        cells = [(ui.c.cyan if i == 0 else ui.c.yellow)('[%s]' % ', '.join(map(str, p)).ljust(cap * 4)) for i, p in enumerate(pages)]
        print('    bucket %s: %s' % (str(b).rjust(2), ui.c.gray(' → ').join(cells)))
    longest = max(len(p) for p in h.table)
    ui.note('Longest chain = %d page(s). Static hashing cannot grow N, so chains get long as data grows → dynamic hashing.' % longest)
    k = ui.ask_text('Search a key (blank = skip)', default='')
    if k:
        r = h.search(parse_keys(k)[0])
        ui.info('bucket %d, pages read = %d, %s' % (r['bucket'], r['pages_read'], 'found' if r['found'] else 'not found'))


def extendible():
    cap = ui.ask_int('Bucket capacity', min_=1, max_=4, default=2)
    keys = parse_keys(ui.ask_text('Keys (integers → hash = value itself, easy to follow in binary)', default='4, 12, 32, 16, 1, 5, 21, 13, 10, 15, 7, 19'))
    h = ExtendibleHash(cap)
    for k in keys:
        h.insert(k)
        print('\n  ' + ui.c.bYellow('insert %s' % k) + ui.c.gray('  (binary %s)' % format(hash_key(k), 'b')))
        for e in h.events:
            ui.note(e)
        h.events.clear()
    ui.section('Final directory  (global depth = %d, %d entries)' % (h.global_, len(h.dir)))
    seen = set()
    for i, b in enumerate(h.dir):
        first = b.id not in seen
        seen.add(b.id)
        bits = format(i, 'b').rjust(h.global_, '0') if h.global_ else '-'
        print('    %s → %s %s %s' % (ui.c.cyan(bits.rjust(max(h.global_, 1))), b.id, ui.c.gray('(local depth %d)' % b.local),
                                  '[%s]' % ', '.join(map(str, b.keys)) if first else ui.c.gray('(shared)')))
    ui.note('Several directory entries can share one bucket when local depth < global depth.')


def bitmap():
    rows = db.all_('SELECT roll_no, gender, year, dept_id FROM student ORDER BY roll_no')
    g = bitmap_index(rows, 'gender')
    y = bitmap_index(rows, 'year')
    d = bitmap_index(rows, 'dept_id')

    def bits_str(bits):
        return ''.join(ui.c.green('1') if b else ui.c.gray('0') for b in bits)
    ui.section('Bitmap index on student (%d records, record i = bit i)' % len(rows))
    for name, m in (('gender', g), ('year', y), ('dept_id', d)):
        for v in m:
            print('    %s %s' % (ui.pad_end('%s=%s' % (name, v), 14), bits_str(m[v])))
    zeros = [0] * len(rows)
    result = [a & b & c for a, b, c in zip(g.get('F', zeros), y.get(3, zeros), d.get('CS', zeros))]
    ui.section("Query:  gender = 'F' AND year = 3 AND dept_id = 'CS'   →  bitwise AND")
    print('    %s %s' % (ui.pad_end('result', 14), bits_str(result)))
    hits = [r['roll_no'] for r, bit in zip(rows, result) if bit]
    ui.success('%d match(es): %s' % (len(hits), ', '.join(hits)))
    ui.note('Bitmaps shine on low-cardinality columns (gender, year): tiny, and AND/OR are single CPU instructions per 64 rows.')


def explain_plans():
    roll = db.get('SELECT roll_no FROM student LIMIT 1 OFFSET 2')['roll_no']
    cases = [
        ('Primary-key lookup', "SELECT * FROM student WHERE roll_no = '%s'" % roll),
        ('Secondary index (idx_attendance_roll)', "SELECT * FROM attendance WHERE roll_no = '%s'" % roll),
        ('Same query with index DISABLED', "SELECT * FROM attendance NOT INDEXED WHERE roll_no = '%s'" % roll),
        ('Composite index prefix (dept_id, year)', "SELECT roll_no FROM student WHERE dept_id = 'CS' AND year = 3"),
        ('Index cannot help: function on column', "SELECT * FROM student WHERE lower(dept_id) = 'cs'"),
        ('Range scan on (subject_id, session_date)', "SELECT * FROM class_session WHERE subject_id = 'CS501' AND session_date BETWEEN '2026-08-01' AND '2026-09-01'"),
    ]
    conn = db.get_db()
    for title, sql in cases:
        runs = 300
        t0 = time.perf_counter()
        for _ in range(runs):
            conn.execute(sql).fetchall()
        us = (time.perf_counter() - t0) * 1e6 / runs
        plan = '  |  '.join(p['detail'] for p in db.all_('EXPLAIN QUERY PLAN ' + sql))
        print('\n  ' + ui.c.bold(title))
        ui.print_sql(sql)
        scan = plan.startswith('SCAN')
        print('    %s: %s' % (ui.c.red('PLAN') if scan else ui.c.green('PLAN'), plan))
        print(ui.c.gray('    avg %.1f µs per query (%d runs)' % (us, runs)))
    ui.note('SEARCH = B-tree lookup (log n)   ·   SCAN = read every row (n)   ·   COVERING INDEX = answered from the index alone')


def benchmark():
    n = ui.ask_int('Rows to generate', min_=10000, max_=1000000, default=200000)
    ui.info('Creating TEMP table bench(id, roll_no, score) with a recursive CTE…')
    db.exec_('DROP TABLE IF EXISTS temp.bench;')
    db.exec_('CREATE TEMP TABLE bench (id INTEGER PRIMARY KEY, roll_no TEXT, score INTEGER);')
    t = time.perf_counter()
    db.run("""WITH RECURSIVE seq(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < ?)
              INSERT INTO bench SELECT i, 'R' || (abs(random()) % 50000), abs(random()) % 100 FROM seq""", n)
    ui.success('%s rows inserted in %d ms' % ('{:,}'.format(n), (time.perf_counter() - t) * 1000))
    sql = "SELECT COUNT(*) AS c FROM bench WHERE roll_no = 'R4242'"

    def timed():
        s = time.perf_counter()
        for _ in range(20):
            db.get(sql)
        return (time.perf_counter() - s) * 1000 / 20

    def plan():
        return ' | '.join(p['detail'] for p in db.all_('EXPLAIN QUERY PLAN ' + sql))
    before = timed()
    print('    without index : %s   plan: %s' % (ui.c.red('%.3f ms' % before), plan()))
    t = time.perf_counter()
    db.exec_('CREATE INDEX temp.idx_bench_roll ON bench(roll_no);')
    ui.info('CREATE INDEX took %d ms (sorting %s keys into a B+ tree)' % ((time.perf_counter() - t) * 1000, '{:,}'.format(n)))
    after = timed()
    print('    with index    : %s   plan: %s' % (ui.c.green('%.3f ms' % after), plan()))
    ui.box('Result', ['Speed-up ≈ %s' % ui.c.bold('%.0f×' % (before / max(after, 0.0001))),
                      'B+ tree height ≈ log_fanout(%s) ≈ %d levels (fan-out ~100)' % ('{:,}'.format(n), math.ceil(math.log(n) / math.log(100))),
                      'Trade-off: every INSERT/UPDATE must now also update the index.'], ui.c.green)
    db.exec_('DROP TABLE temp.bench;')


def list_indexes():
    ui.table(db.all_("""SELECT m.tbl_name AS "table", il.name AS index_name, il."unique",
                               CASE il.origin WHEN 'pk' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE' ELSE 'CREATE INDEX' END AS created_by,
                               (SELECT group_concat(name, ', ') FROM pragma_index_info(il.name)) AS columns
                          FROM sqlite_master m, pragma_index_list(m.name) il
                         WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
                         ORDER BY m.tbl_name"""), title='All indexes in the database')
    ui.note('PRIMARY KEY / UNIQUE indexes are created automatically. Tables themselves are B+ trees keyed by rowid (clustered).')


def menu():
    run_menu('INDEXING & HASHING LAB', 'B+ tree · static & extendible hashing · bitmap · real query plans', [
        {'label': 'B+ tree: insert, split, search, range', 'hint': 'ordered index', 'action': bplus},
        {'label': 'Static hashing with overflow chains', 'hint': 'h(K) = K mod N', 'action': static_hash},
        {'label': 'Extendible (dynamic) hashing', 'hint': 'directory doubling', 'action': extendible},
        {'label': 'Bitmap index on student table', 'hint': 'self-study', 'action': bitmap},
        {'label': 'EXPLAIN QUERY PLAN: index vs scan', 'hint': 'real SQLite', 'action': explain_plans},
        {'label': 'Benchmark: index vs full scan', 'hint': 'real speed-up', 'action': benchmark},
        {'label': 'List every index in our database', 'hint': 'catalog', 'action': list_indexes},
    ])
